const { z } = require("zod");
const Chat = require("../../models/chat");
const Message = require("../../models/message");
const { sanitizeSearch, formatResult, formatError, resolveCaller, chatUrl } = require("./_shared");

function registerChatTools(server) {
  server.tool(
    "search_chats",
    "List chats in the caller's workspace, most-recent first.",
    {
      search: z.string().optional().describe("Text search on title"),
      limit: z.number().min(1).max(200).default(50).optional(),
      offset: z.number().min(0).default(0).optional(),
    },
    async (params, extra) => {
      try {
        const { organizationId } = await resolveCaller(extra);
        const query = { organization_id: organizationId };
        if (params.search) query.title = { $regex: sanitizeSearch(params.search), $options: "i" };
        const [total, chats] = await Promise.all([
          Chat.countDocuments(query),
          Chat.find(query).sort("-last_message_at").skip(params.offset || 0).limit(params.limit || 50).lean(),
        ]);
        return formatResult({ total, count: chats.length, chats: chats.map((c) => ({ ...c, url: chatUrl(c._id) })) });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "get_chat",
    "Get a chat and its full message history.",
    { id: z.string() },
    async (params, extra) => {
      try {
        await resolveCaller(extra);
        const chat = await Chat.findById(params.id).lean();
        if (!chat) return formatError("Chat not found");
        const messages = await Message.find({ chat_id: params.id }).sort({ created_at: 1 }).lean();
        return formatResult({ chat: { ...chat, url: chatUrl(chat._id) }, messages });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "create_chat",
    "Create a new chat in the workspace. Optionally bind to an agent.",
    {
      title: z.string().default("New chat").optional(),
      agentId: z.string().optional(),
    },
    async (params, extra) => {
      try {
        const { user, organizationId } = await resolveCaller(extra);
        const chat = await Chat.create({
          title: params.title || "New chat",
          organization_id: organizationId,
          created_by: user._id.toString(),
          agent_id: params.agentId,
        });
        return formatResult({ created: true, chat: { ...chat.toObject(), url: chatUrl(chat._id) } });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "send_message",
    "Send a user message to a chat and synchronously receive the assistant reply (echo placeholder until an LLM client is wired). Persists both messages.",
    {
      chatId: z.string(),
      content: z.string().min(1),
    },
    async (params, extra) => {
      try {
        await resolveCaller(extra);
        const chat = await Chat.findById(params.chatId);
        if (!chat) return formatError("Chat not found");

        await Message.create({
          chat_id: chat._id.toString(),
          organization_id: chat.organization_id,
          role: "user",
          content: params.content,
        });

        const reply = `You said: "${params.content}". This is a placeholder echo until the LLM client is wired in.`;
        const assistantMsg = await Message.create({
          chat_id: chat._id.toString(),
          organization_id: chat.organization_id,
          role: "assistant",
          content: reply,
          streaming: false,
        });

        chat.last_message_at = new Date();
        await chat.save();

        return formatResult({ message_id: assistantMsg._id, role: "assistant", content: reply });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );
}

module.exports = { registerChatTools };
