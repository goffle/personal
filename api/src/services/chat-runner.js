const ChatMessage = require("../models/chat-message");
const Chat = require("../models/chat");
const Skill = require("../models/skill");
const { singleTurn, extractText, extractToolUses } = require("./anthropic");
const { buildToolsForAgent, runTool } = require("./agent-tools");

const MAX_TOOL_LOOPS = 6;

async function buildSkillsIndex(agent) {
  const skills = await Skill.find({ agent_id: agent._id.toString() }).sort({ name: 1 }).lean();
  if (!skills.length) return "";
  const lines = skills.map((s) => `- ${s.name}${s.description ? `: ${s.description}` : ""}`);
  return `Skills available — call \`read_skill(name)\` to load full instructions before executing one:\n${lines.join("\n")}`;
}

/**
 * Run an agent turn (or sequence of tool-use loops) inside a chat. Streams
 * text via callbacks, persists every produced assistant + tool_result message.
 *
 * The caller is responsible for having already persisted the user message
 * that initiated this turn.
 *
 * @param {object}   opts
 * @param {Document} opts.chat           Chat document
 * @param {Document} opts.agent          Agent document with .connectors and .files populated
 * @param {object}   opts.ctx            { organization_id, created_by? } passed into tool handlers
 * @param {function} [opts.onDelta]      (text) => void, called for each streamed text chunk
 * @param {function} [opts.onAssistant]  (chatMessage) => void, called after each assistant message is saved
 * @param {function} [opts.onToolEvent]  ({ tool, status, input?, output? }) => void
 * @returns {Promise<{ assistantMessages: Document[] }>}
 */
async function runAgentTurn({ chat, agent, ctx, onDelta, onAssistant, onToolEvent }) {
  const tools = await buildToolsForAgent(agent);
  const skillsIndex = await buildSkillsIndex(agent);
  const assistantMessages = [];

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    const history = await ChatMessage.find({ chat_id: chat._id.toString() }).sort({ created_at: 1 }).lean();

    const result = await singleTurn({ agent, history, tools, onDelta, skillsIndex });

    const text = extractText(result);
    const toolUses = extractToolUses(result);

    const assistantMsg = await ChatMessage.create({
      chat_id: chat._id.toString(),
      organization_id: chat.organization_id,
      role: "assistant",
      content: text,
      content_blocks: result.content,
      streaming: false,
    });
    assistantMessages.push(assistantMsg);
    onAssistant?.(assistantMsg);

    if (result.stop_reason !== "tool_use" || toolUses.length === 0) {
      break;
    }

    const toolResultBlocks = [];
    for (const use of toolUses) {
      onToolEvent?.({ tool: use.name, status: "start", input: use.input });
      let output;
      let isError = false;
      try {
        output = await runTool({ name: use.name, input: use.input, agent, ctx });
      } catch (err) {
        output = { error: err.message };
        isError = true;
      }
      onToolEvent?.({ tool: use.name, status: "end", output, error: isError });
      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: typeof output === "string" ? output : JSON.stringify(output),
        ...(isError ? { is_error: true } : {}),
      });
    }

    await ChatMessage.create({
      chat_id: chat._id.toString(),
      organization_id: chat.organization_id,
      role: "user",
      content: "",
      content_blocks: toolResultBlocks,
    });
  }

  await Chat.findByIdAndUpdate(chat._id, { last_message_at: new Date() });

  return { assistantMessages };
}

module.exports = { runAgentTurn };
