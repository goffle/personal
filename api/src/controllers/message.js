const { buildCrud } = require("./_factory");
const Message = require("../models/message");

module.exports = buildCrud(Message, {
  searchFields: ["content"],
  filterFields: ["organization_id", "chat_id", "role"],
  defaultSort: { created_at: 1 },
});
