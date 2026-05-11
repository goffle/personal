const { randomUUID } = require("crypto");
const OAuthClient = require("../models/oauth-client");
const OAuthToken = require("../models/oauth-token");
const { APP_URL } = require("../config");

class MongoClientsStore {
  async getClient(clientId) {
    const doc = await OAuthClient.findOne({ client_id: clientId }).lean();
    if (!doc) return undefined;
    return {
      client_id: doc.client_id,
      client_secret: doc.client_secret,
      client_id_issued_at: doc.client_id_issued_at,
      client_secret_expires_at: doc.client_secret_expires_at,
      redirect_uris: doc.redirect_uris,
      token_endpoint_auth_method: doc.token_endpoint_auth_method,
      grant_types: doc.grant_types,
      response_types: doc.response_types,
      client_name: doc.client_name,
      client_uri: doc.client_uri,
      logo_uri: doc.logo_uri,
      scope: doc.scope,
      contacts: doc.contacts,
      tos_uri: doc.tos_uri,
      policy_uri: doc.policy_uri,
      software_id: doc.software_id,
      software_version: doc.software_version,
    };
  }

  async registerClient(clientMetadata) {
    await OAuthClient.create(clientMetadata);
    return clientMetadata;
  }
}

class MongoOAuthProvider {
  constructor() {
    this.clientsStore = new MongoClientsStore();
  }

  async authorize(client, params, res) {
    const consentUrl = new URL(`${APP_URL}/oauth/authorize`);
    consentUrl.searchParams.set("client_id", client.client_id);
    consentUrl.searchParams.set("redirect_uri", params.redirectUri);
    consentUrl.searchParams.set("response_type", "code");
    consentUrl.searchParams.set("code_challenge", params.codeChallenge);
    consentUrl.searchParams.set("code_challenge_method", "S256");
    if (params.state) consentUrl.searchParams.set("state", params.state);
    if (params.scopes?.length) consentUrl.searchParams.set("scope", params.scopes.join(" "));
    if (params.resource?.href) consentUrl.searchParams.set("resource", params.resource.href);
    res.redirect(consentUrl.toString());
  }

  async challengeForAuthorizationCode(client, authorizationCode) {
    const doc = await OAuthToken.findOne({
      token: authorizationCode,
      type: "authorization_code",
      client_id: client.client_id,
    });
    if (!doc) throw new Error("Invalid authorization code");
    return doc.code_challenge;
  }

  async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, _redirectUri, resource) {
    const codeDoc = await OAuthToken.findOne({
      token: authorizationCode,
      type: "authorization_code",
      client_id: client.client_id,
    });
    if (!codeDoc) throw new Error("Invalid authorization code");
    if (codeDoc.expires_at < new Date()) throw new Error("Authorization code expired");

    if (codeDoc.used) {
      await OAuthToken.deleteMany({
        type: { $in: ["refresh_token", "access_token"] },
        user_id: codeDoc.user_id,
        client_id: client.client_id,
      });
      throw new Error("Authorization code replay detected");
    }

    codeDoc.used = true;
    await codeDoc.save();

    const accessToken = randomUUID();
    const refreshToken = randomUUID();

    await OAuthToken.insertMany([
      {
        type: "access_token",
        token: accessToken,
        client_id: client.client_id,
        user_id: codeDoc.user_id,
        scopes: codeDoc.scopes,
        expires_at: new Date(Date.now() + 3600 * 1000),
        resource: resource?.href,
        client_name: client.client_name,
      },
      {
        type: "refresh_token",
        token: refreshToken,
        client_id: client.client_id,
        user_id: codeDoc.user_id,
        scopes: codeDoc.scopes,
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        resource: resource?.href,
        client_name: client.client_name,
      },
    ]);

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: (codeDoc.scopes || []).join(" "),
    };
  }

  async exchangeRefreshToken(client, refreshToken, scopes, resource) {
    const refreshDoc = await OAuthToken.findOneAndDelete({
      token: refreshToken,
      type: "refresh_token",
      client_id: client.client_id,
    });
    if (!refreshDoc) throw new Error("Invalid refresh token");
    if (refreshDoc.expires_at < new Date()) throw new Error("Refresh token expired");

    const effectiveScopes = scopes || refreshDoc.scopes;
    const newAccessToken = randomUUID();
    const newRefreshToken = randomUUID();

    await OAuthToken.insertMany([
      {
        type: "access_token",
        token: newAccessToken,
        client_id: client.client_id,
        user_id: refreshDoc.user_id,
        scopes: effectiveScopes,
        expires_at: new Date(Date.now() + 3600 * 1000),
        resource: resource?.href,
        client_name: refreshDoc.client_name || client.client_name,
      },
      {
        type: "refresh_token",
        token: newRefreshToken,
        client_id: client.client_id,
        user_id: refreshDoc.user_id,
        scopes: effectiveScopes,
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        resource: resource?.href,
        client_name: refreshDoc.client_name || client.client_name,
        last_used_at: new Date(),
      },
    ]);

    return {
      access_token: newAccessToken,
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: newRefreshToken,
      scope: (effectiveScopes || []).join(" "),
    };
  }

  async verifyAccessToken(token) {
    const doc = await OAuthToken.findOne({ token, type: "access_token" });
    if (!doc) throw new Error("Invalid access token");
    if (doc.expires_at < new Date()) throw new Error("Token expired");

    return {
      token: doc.token,
      clientId: doc.client_id,
      scopes: doc.scopes || [],
      expiresAt: Math.floor(doc.expires_at.getTime() / 1000),
      resource: doc.resource ? new URL(doc.resource) : undefined,
      user_id: doc.user_id,
    };
  }

  async revokeToken(client, request) {
    await OAuthToken.deleteOne({ token: request.token, client_id: client.client_id });
  }
}

module.exports = { MongoOAuthProvider };
