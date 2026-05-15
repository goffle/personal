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

const INSTRUCTIONS = `Jeeve — personal task manager and agent orchestrator. Multi-entity work across: walego, selego, jobego, tirana, tochet, admin, other.

Sprints are ISO weeks (Mon→Sun, e.g. "2026-W19") or "Backlog". Tasks can be assigned to users OR agents — agents are first-class assignees. Agents own skills (markdown playbooks) and run inside chats; cron_jobs trigger agent chats on a schedule.

Call \`whoami\` first to get organization_id, entities, and current_sprint. Use \`external_id\` on create_task for idempotent migrations from Notion/Linear/etc.`;

function createMcpServer() {
  const server = new McpServer({ name: "jeeve", version: "1.0.0" }, { instructions: INSTRUCTIONS });

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
