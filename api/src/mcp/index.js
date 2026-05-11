const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");

const { registerWorkspaceTools } = require("./tools/workspace");
const { registerTaskTools } = require("./tools/tasks");
const { registerChatTools } = require("./tools/chats");
const { registerAgentTools } = require("./tools/agents");
const { registerSkillTools } = require("./tools/skills");
const { registerFileTools } = require("./tools/files");
const { registerCronJobTools } = require("./tools/cron_jobs");
const { registerConnectorTools } = require("./tools/connectors");
const { registerMcpServerTools } = require("./tools/mcp_servers");
const { registerToolTools } = require("./tools/tools");
const { registerUserTools } = require("./tools/users");

function createMcpServer() {
  const server = new McpServer({ name: "jeeve", version: "1.0.0" });

  registerWorkspaceTools(server);
  registerTaskTools(server);
  registerChatTools(server);
  registerAgentTools(server);
  registerSkillTools(server);
  registerFileTools(server);
  registerCronJobTools(server);
  registerConnectorTools(server);
  registerMcpServerTools(server);
  registerToolTools(server);
  registerUserTools(server);

  return server;
}

module.exports = { createMcpServer };
