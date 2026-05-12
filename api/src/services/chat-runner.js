const ChatMessage = require("../models/chat-message");
const Chat = require("../models/chat");
const Organization = require("../models/organization");
const Skill = require("../models/skill");
const { singleTurn, extractText, extractToolUses } = require("./anthropic");
const { buildToolsForAgent, runTool } = require("./agent-tools");
const { computeCost } = require("./pricing");

const MAX_TOOL_LOOPS = 6;

async function buildSkillsIndex(agent) {
  const skills = await Skill.find({ agent_id: agent._id.toString() }).sort({ name: 1 }).lean();
  if (!skills.length) return "";
  const lines = skills.map((s) => `- ${s.name}${s.description ? `: ${s.description}` : ""}`);
  return `Skills available — call \`read_skill(name)\` to load full instructions before executing one:\n${lines.join("\n")}`;
}

function buildConnectorsBlock(connectors) {
  if (!connectors?.length) return "";
  const lines = connectors.map((c) => {
    if (!c.has_driver) {
      return `- ${c.name} (${c.kind}) ⚠️ driver not implemented — no tools exposed for this connector`;
    }
    const status = c.status === "connected" ? "✓ connected" : `⚠️ ${c.status || "unknown"}`;
    return `- ${c.name} (${c.kind}) ${status} — tools prefixed with \`${c.name}__\``;
  });
  return `Connectors linked to you:\n${lines.join("\n")}\n\nIf a user asks for a capability tied to a kind you don't see above (or marked "driver not implemented"), say so honestly rather than guessing.`;
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
  const { tools, connectors } = await buildToolsForAgent(agent);
  const skillsIndex = await buildSkillsIndex(agent);
  const connectorsBlock = buildConnectorsBlock(connectors);
  const assistantMessages = [];
  let turnCostUsd = 0;

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    const history = await ChatMessage.find({ chat_id: chat._id.toString() }).sort({ created_at: 1 }).lean();

    const result = await singleTurn({ agent, history, tools, onDelta, skillsIndex, connectorsBlock });

    const text = extractText(result);
    const toolUses = extractToolUses(result);
    const { usd, tokens } = computeCost(result.model, result.usage);
    turnCostUsd += usd;

    const assistantMsg = await ChatMessage.create({
      chat_id: chat._id.toString(),
      organization_id: chat.organization_id,
      role: "assistant",
      content: text,
      content_blocks: result.content,
      streaming: false,
      model: result.model,
      tokens_in: tokens.tokens_in,
      tokens_out: tokens.tokens_out,
      tokens_cache_read: tokens.tokens_cache_read,
      tokens_cache_write: tokens.tokens_cache_write,
      cost_usd: usd,
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

      // Tools can opt into rich tool_result content (e.g. mixed image+text blocks)
      // by returning an object with `_content: [...]`. Otherwise we stringify.
      let toolResultContent;
      if (output && typeof output === "object" && Array.isArray(output._content)) {
        toolResultContent = output._content;
      } else if (typeof output === "string") {
        toolResultContent = output;
      } else {
        toolResultContent = JSON.stringify(output);
      }

      // Don't blast huge base64 payloads back to the chat UI via SSE — replace _content
      // with a tiny summary for display only. The model still sees the full blocks.
      const displayOutput =
        output && typeof output === "object" && Array.isArray(output._content)
          ? { ...output, _content: `[${output._content.length} blocks: ${output._content.map((b) => b.type).join(", ")}]` }
          : output;
      onToolEvent?.({ tool: use.name, status: "end", output: displayOutput, error: isError });

      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: toolResultContent,
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

  let orgCostUsd = null;
  if (turnCostUsd > 0 && chat.organization_id) {
    const updated = await Organization.findByIdAndUpdate(
      chat.organization_id,
      { $inc: { cost_usd: turnCostUsd } },
      { new: true, select: "cost_usd" },
    );
    orgCostUsd = updated?.cost_usd ?? null;
  }

  return { assistantMessages, turnCostUsd, orgCostUsd };
}

module.exports = { runAgentTurn };
