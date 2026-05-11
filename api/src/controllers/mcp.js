const express = require("express");
const passport = require("passport");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { requireBearerAuth } = require("@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js");
const { createMcpServer } = require("../mcp");
const { MongoOAuthProvider } = require("../mcp/oauth-provider");

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

router.get("/", auth, (_req, res) => res.status(405).json({ error: "SSE not supported in stateless mode" }));
router.delete("/", auth, (_req, res) => res.status(405).json({ error: "Session management not supported" }));

module.exports = router;
