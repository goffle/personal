const express = require("express");
const passport = require("passport");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { requireBearerAuth } = require("@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js");
const { createMcpServer } = require("../mcp");
const { MongoOAuthProvider } = require("../mcp/oauth-provider");
const OAuthToken = require("../models/oauth-token");
const OAuthClient = require("../models/oauth-client");

const router = express.Router();

const bearerAuth = requireBearerAuth({ verifier: new MongoOAuthProvider() });
const legacyAuth = passport.authenticate(["user", "admin"], { session: false });

const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) return bearerAuth(req, res, next);
  return legacyAuth(req, res, next);
};

router.post("/", auth, async (req, res) => {
  try {
    // When using legacyAuth (JWT), populate the authInfo that tools expect.
    if (!req.auth && req.user) {
      req.auth = { user_id: req.user._id.toString(), scopes: [], clientId: "legacy" };
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/connected-apps", legacyAuth, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const tokens = await OAuthToken.find({
      user_id: userId,
      type: { $in: ["access_token", "refresh_token"] },
      expires_at: { $gt: new Date() },
    }).lean();

    const byClient = new Map();
    for (const t of tokens) {
      const entry = byClient.get(t.client_id) || {
        client_id: t.client_id,
        client_name: t.client_name || null,
        connected_at: t.created_at,
        last_used_at: t.last_used_at || t.created_at,
        scopes: new Set(),
      };
      if (t.created_at < entry.connected_at) entry.connected_at = t.created_at;
      const lu = t.last_used_at || t.created_at;
      if (lu > entry.last_used_at) entry.last_used_at = lu;
      for (const s of t.scopes || []) entry.scopes.add(s);
      byClient.set(t.client_id, entry);
    }

    const clientIds = [...byClient.keys()];
    const clients = await OAuthClient.find({ client_id: { $in: clientIds } }).lean();
    const clientMeta = Object.fromEntries(clients.map((c) => [c.client_id, c]));

    const data = [...byClient.values()].map((e) => {
      const meta = clientMeta[e.client_id] || {};
      return {
        client_id: e.client_id,
        client_name: e.client_name || meta.client_name || e.client_id,
        client_uri: meta.client_uri || null,
        logo_uri: meta.logo_uri || null,
        connected_at: e.connected_at,
        last_used_at: e.last_used_at,
        scopes: [...e.scopes],
      };
    });
    data.sort((a, b) => new Date(b.last_used_at) - new Date(a.last_used_at));

    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete("/connected-apps/:clientId", legacyAuth, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const r = await OAuthToken.deleteMany({ user_id: userId, client_id: req.params.clientId });
    res.json({ ok: true, deleted: r.deletedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/manifest", legacyAuth, (_req, res) => {
  const server = createMcpServer();
  const tools = Object.entries(server._registeredTools || {}).map(([name, t]) => ({
    name,
    description: t.description || "",
  }));
  tools.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ ok: true, data: tools });
});

router.get("/", auth, (_req, res) => res.status(405).json({ error: "SSE not supported in stateless mode" }));
router.delete("/", auth, (_req, res) => res.status(405).json({ error: "Session management not supported" }));

module.exports = router;
