const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, API_URL } = require("../config");
const { encrypt, decrypt } = require("../utils/crypto");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://gmail.googleapis.com/gmail/v1";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

function redirectUri() {
  return `${API_URL}/connector/oauth/google/callback`;
}

function buildAuthUrl(state) {
  if (!GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID is not set");
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error(`token exchange failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error(`token refresh failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function fetchUserEmail(accessToken) {
  const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) return null;
  const j = await r.json();
  return j.email || null;
}

function persistTokens(connector, tokenResp, accountEmail) {
  const now = Date.now();
  const cfg = connector.config || {};
  const next = {
    ...cfg,
    account_email: accountEmail || cfg.account_email,
    access_token: tokenResp.access_token ? encrypt(tokenResp.access_token) : cfg.access_token,
    expires_at: tokenResp.expires_in ? now + tokenResp.expires_in * 1000 - 60_000 : cfg.expires_at,
    scope: tokenResp.scope || cfg.scope,
  };
  if (tokenResp.refresh_token) next.refresh_token = encrypt(tokenResp.refresh_token);
  connector.config = next;
}

async function getAccessToken(connector) {
  const cfg = connector.config || {};
  if (!cfg.refresh_token) throw new Error("connector not connected");
  if (cfg.access_token && cfg.expires_at && cfg.expires_at > Date.now()) {
    return decrypt(cfg.access_token);
  }
  const refresh = decrypt(cfg.refresh_token);
  const tok = await refreshAccessToken(refresh);
  persistTokens(connector, tok);
  await connector.save();
  return decrypt(connector.config.access_token);
}

async function test(connector) {
  const token = await getAccessToken(connector);
  const r = await fetch(`${API_BASE}/users/me/profile`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`gmail profile failed: ${r.status}`);
  return r.json();
}

const tools = [
  {
    name: "gmail.search_threads",
    description: "Search Gmail threads using Gmail query syntax (e.g. 'is:unread newer_than:1d').",
    schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query." },
        max_results: { type: "integer", default: 20, minimum: 1, maximum: 100 },
      },
      required: ["query"],
    },
    async handler(connector, args) {
      const token = await getAccessToken(connector);
      const u = new URL(`${API_BASE}/users/me/threads`);
      u.searchParams.set("q", args.query || "");
      u.searchParams.set("maxResults", String(args.max_results || 20));
      const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`gmail search failed: ${r.status} ${await r.text()}`);
      return r.json();
    },
  },
];

module.exports = {
  kind: "gmail",
  scopes: SCOPES,
  buildAuthUrl,
  exchangeCode,
  fetchUserEmail,
  persistTokens,
  getAccessToken,
  test,
  tools,
};
