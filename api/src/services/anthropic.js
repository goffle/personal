const Anthropic = require("@anthropic-ai/sdk");
const { ANTHROPIC_API_KEY, DEFAULT_MODEL } = require("../config");

let client = null;
function getClient() {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!client) client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return client;
}

function buildTemporalContext(tz = "Europe/Paris") {
  const now = new Date();
  // Day-granular only — keeps the prompt-cache stable for a whole day (one cache miss/day instead of one/minute).
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return `Contexte temporel : aujourd'hui c'est ${fmt.format(now)} (${iso}, ${tz}). Utilise cette date comme ancre — ne devine jamais "cette semaine" / "demain" à partir de tes connaissances internes.`;
}

function buildSystem(agent, { skillsIndex, connectorsBlock } = {}) {
  const blocks = [];
  blocks.push({ type: "text", text: buildTemporalContext() });
  if (agent.system_prompt) blocks.push({ type: "text", text: agent.system_prompt });
  for (const f of agent.files || []) {
    if (f.content_md) blocks.push({ type: "text", text: `\n# ${f.name}\n\n${f.content_md}` });
  }
  if (connectorsBlock) blocks.push({ type: "text", text: connectorsBlock });
  if (skillsIndex) blocks.push({ type: "text", text: skillsIndex });
  // Mark the last block ephemeral so the whole prefix is cached.
  blocks[blocks.length - 1].cache_control = { type: "ephemeral" };
  return blocks;
}

// The Anthropic API rejects unknown fields and requires specific shapes per block type.
// Persisted blocks can drift from spec: e.g. Mongoose strips `input: {}` (fixed via minimize:false
// going forward, but old data still has the gap), and SDK responses include extra metadata like
// `caller` that the API doesn't accept on input. This whitelists what we send.
function sanitizeBlock(b) {
  if (!b || typeof b !== "object") return null;
  switch (b.type) {
    case "text":
      return { type: "text", text: b.text || "", ...(b.cache_control ? { cache_control: b.cache_control } : {}) };
    case "tool_use":
      return {
        type: "tool_use",
        id: b.id,
        name: b.name,
        input: b.input && typeof b.input === "object" ? b.input : {},
      };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: b.tool_use_id,
        content: b.content ?? "",
        ...(b.is_error ? { is_error: true } : {}),
      };
    default:
      return null;
  }
}

function messageToAnthropic(m) {
  if (Array.isArray(m.content_blocks) && m.content_blocks.length) {
    const blocks = m.content_blocks.map(sanitizeBlock).filter(Boolean);
    return { role: m.role, content: blocks };
  }
  return { role: m.role, content: m.content || "" };
}

function historyToAnthropicMessages(messages) {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map(messageToAnthropic)
    .filter((m) => (typeof m.content === "string" ? m.content.length > 0 : m.content.length > 0));
}

function extractText(message) {
  return (message.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function extractToolUses(message) {
  return (message.content || []).filter((b) => b.type === "tool_use");
}

/**
 * Run one model turn: stream output text via onDelta, return the full final message.
 * Caller decides whether the loop continues (i.e. tool_use blocks present).
 *
 * @returns {Promise<Anthropic.Messages.Message>}
 */
async function singleTurn({ agent, history, tools, onDelta, skillsIndex, connectorsBlock }) {
  const c = getClient();
  const params = {
    model: agent.model || DEFAULT_MODEL,
    max_tokens: 8192,
    messages: historyToAnthropicMessages(history),
  };
  const system = buildSystem(agent, { skillsIndex, connectorsBlock });
  if (system) params.system = system;
  if (tools && tools.length) params.tools = tools;

  const stream = c.messages.stream(params);
  if (onDelta) {
    stream.on("text", (delta) => onDelta(delta));
  }
  return await stream.finalMessage();
}

module.exports = {
  singleTurn,
  extractText,
  extractToolUses,
};
