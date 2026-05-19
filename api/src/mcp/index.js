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
const { registerConnectorActionTools } = require("./tools/connector_actions");

const INSTRUCTIONS = `Jeeve — personal task manager and agent orchestrator. Multi-entity work across: walego, selego, jobego, tirana, tochet, admin, other.

Sprints are ISO weeks (Mon→Sun, e.g. "2026-W19") or "Backlog". Tasks can be assigned to users OR agents — agents are first-class assignees. Agents own skills (markdown playbooks) and run inside chats; cron_jobs trigger agent chats on a schedule.

Call \`whoami\` first to get the active organization_id, entities, current_sprint, and the full list of organisations the user belongs to. The active workspace is pinned on the access token at consent time — every tool operates on it. If the user has multiple workspaces and wants to act on a different one, call \`set_active_organization\` (discover ids via \`list_my_organizations\` or the \`organisations\` array on \`whoami\`). Use \`external_id\` on create_task for idempotent migrations from Notion/Linear/etc.

Connector actions: if a \`gmail\` connector is connected to the workspace, use the \`gmail_*\` tools (search_threads, get_thread, create_draft, update_draft, send_draft, delete_draft, mark_read) to read and compose mail. If a \`google_calendar\` connector is connected, use \`calendar_*\` (list_calendars, list_events, get_event, create_event, update_event, delete_event). When multiple connectors of the same kind exist in the workspace, pass \`account_email\` to disambiguate. NEVER chain \`gmail_create_draft\` + \`gmail_send_draft\` in the same turn — always show the draft to the user and wait for explicit confirmation before sending.`;

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
  registerConnectorActionTools(server);

  return server;
}

module.exports = { createMcpServer };
