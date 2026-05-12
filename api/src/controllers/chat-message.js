const { buildCrud } = require("./_factory");
const ChatMessage = require("../models/chat-message");

module.exports = buildCrud(ChatMessage, {
  searchFields: ["content"],
  filterFields: ["organization_id", "chat_id", "role"],
  defaultSort: { created_at: 1 },
});
