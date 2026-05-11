const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const http = require("http");

require("./services/mongo");
const { PORT, APP_URL, API_URL, ENVIRONMENT } = require("./config");

const app = express();
require("./services/passport")(app);

const origin = [APP_URL].filter(Boolean);
if (ENVIRONMENT === "development") {
  origin.push("http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000");
}
// Allow Claude.ai's MCP UI to call the OAuth + MCP endpoints
origin.push("https://claude.ai", "https://claude.com");

app.use(morgan("tiny"));
app.use(cors({ credentials: true, origin }));
app.use(bodyParser.json({ limit: "20mb" }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// MCP OAuth 2.1 routes — must be mounted at root for /.well-known/*, /authorize, /token, /register
const { mcpAuthRouter } = require("@modelcontextprotocol/sdk/server/auth/router.js");
const { MongoOAuthProvider } = require("./mcp/oauth-provider");
app.use(
  mcpAuthRouter({
    provider: new MongoOAuthProvider(),
    issuerUrl: new URL(API_URL),
    resourceServerUrl: new URL("/mcp", API_URL),
    scopesSupported: ["mcp:tools"],
    resourceName: "Console MCP Server",
  }),
);

app.use("/user", require("./controllers/user"));
app.use("/oauth", require("./controllers/oauth"));
app.use("/mcp", require("./controllers/mcp"));
app.use("/organization", require("./controllers/organization"));
app.use("/chat", require("./controllers/chat"));
app.use("/message", require("./controllers/message"));
app.use("/agent", require("./controllers/agent"));
app.use("/task", require("./controllers/task"));
app.use("/comment", require("./controllers/comment"));
app.use("/file", require("./controllers/file"));
app.use("/cron-job", require("./controllers/cron-job"));
app.use("/skill", require("./controllers/skill"));
app.use("/connector", require("./controllers/connector"));
app.use("/mcp-server", require("./controllers/mcp-server"));
app.use("/tool", require("./controllers/tool"));

app.get("/", (_req, res) => res.status(200).send("Console API · " + new Date().toLocaleString()));

const server = http.createServer(app);
server.listen(PORT, () => console.log("Listening on port " + PORT));
