const express = require("express");
const passport = require("passport");
const { randomUUID } = require("crypto");

const OAuthClient = require("../models/oauth-client");
const OAuthToken = require("../models/oauth-token");

const router = express.Router();
const userAuth = passport.authenticate(["user", "admin"], { session: false });

router.get("/authorize/client", userAuth, async (req, res) => {
  try {
    const { client_id } = req.query;
    if (!client_id) return res.status(400).send({ ok: false, code: "client_id_required" });

    const client = await OAuthClient.findOne({ client_id }).lean();
    if (!client) return res.status(404).send({ ok: false, code: "client_not_found" });

    return res.status(200).send({
      ok: true,
      client_id: client.client_id,
      client_name: client.client_name,
      logo_uri: client.logo_uri,
      client_uri: client.client_uri,
      scope: client.scope,
      organisations: (req.user.organisations || []).map((o) => ({ id: o.id, name: o.name, role: o.role })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: "server_error" });
  }
});

router.post("/authorize/grant", userAuth, async (req, res) => {
  try {
    const { client_id, redirect_uri, code_challenge, code_challenge_method, state, scope, resource, response_type, organization_id } = req.body;

    if (response_type && response_type !== "code") return res.status(400).send({ ok: false, code: "unsupported_response_type" });
    if (code_challenge_method && code_challenge_method !== "S256") return res.status(400).send({ ok: false, code: "invalid_code_challenge_method" });
    if (!client_id || !redirect_uri || !code_challenge) return res.status(400).send({ ok: false, code: "missing_params" });

    const client = await OAuthClient.findOne({ client_id }).lean();
    if (!client) return res.status(404).send({ ok: false, code: "client_not_found" });
    if (!client.redirect_uris?.includes(redirect_uri)) return res.status(400).send({ ok: false, code: "redirect_uri_mismatch" });

    const orgs = req.user.organisations || [];
    if (!orgs.length) return res.status(400).send({ ok: false, code: "no_organisation" });
    let pickedOrgId = organization_id || null;
    if (pickedOrgId && !orgs.some((o) => o.id === pickedOrgId)) {
      return res.status(400).send({ ok: false, code: "organisation_not_member" });
    }
    if (!pickedOrgId) pickedOrgId = orgs[0].id;

    const code = randomUUID();
    const scopes = scope ? scope.split(" ").filter(Boolean) : [];

    await OAuthToken.create({
      type: "authorization_code",
      token: code,
      client_id,
      user_id: req.user._id.toString(),
      organization_id: pickedOrgId,
      scopes,
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
      code_challenge,
      redirect_uri,
      state,
      resource,
    });

    const target = new URL(redirect_uri);
    target.searchParams.set("code", code);
    if (state) target.searchParams.set("state", state);
    return res.status(200).send({ ok: true, redirect_url: target.toString() });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: "server_error" });
  }
});

router.post("/authorize/deny", userAuth, async (req, res) => {
  try {
    const { redirect_uri, state } = req.body;
    if (!redirect_uri) return res.status(400).send({ ok: false, code: "missing_params" });
    const target = new URL(redirect_uri);
    target.searchParams.set("error", "access_denied");
    if (state) target.searchParams.set("state", state);
    return res.status(200).send({ ok: true, redirect_url: target.toString() });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: "server_error" });
  }
});

router.get("/grants", userAuth, async (req, res) => {
  try {
    const tokens = await OAuthToken.find({
      type: "refresh_token",
      user_id: req.user._id.toString(),
    })
      .sort({ created_at: -1 })
      .lean();

    const clientIds = [...new Set(tokens.map((t) => t.client_id))];
    const clients = await OAuthClient.find({ client_id: { $in: clientIds } }).lean();
    const clientMap = Object.fromEntries(clients.map((c) => [c.client_id, c]));

    const grants = tokens.map((t) => {
      const c = clientMap[t.client_id] || {};
      return {
        _id: t._id,
        client_id: t.client_id,
        client_name: t.client_name || c.client_name || t.client_id,
        logo_uri: c.logo_uri,
        scopes: t.scopes,
        created_at: t.created_at,
        last_used_at: t.last_used_at,
        expires_at: t.expires_at,
      };
    });

    return res.status(200).send({ ok: true, data: grants });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: "server_error" });
  }
});

router.delete("/grants/:id", userAuth, async (req, res) => {
  try {
    const token = await OAuthToken.findOne({
      _id: req.params.id,
      type: "refresh_token",
      user_id: req.user._id.toString(),
    });
    if (!token) return res.status(404).send({ ok: false, code: "not_found" });

    await OAuthToken.deleteMany({
      user_id: req.user._id.toString(),
      client_id: token.client_id,
      type: { $in: ["refresh_token", "access_token"] },
    });

    return res.status(200).send({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: "server_error" });
  }
});

module.exports = router;
