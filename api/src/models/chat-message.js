const mongoose = require("mongoose");

const ChatMessageSchema = new mongoose.Schema(
  {
    chat_id: { type: String, index: true, required: true },
    organization_id: { type: String, index: true },
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    content: { type: String, default: "" },
    content_blocks: { type: mongoose.Schema.Types.Mixed, default: null },
    streaming: { type: Boolean, default: false },
    model: { type: String, default: null },
    tokens_in: { type: Number, default: 0 },
    tokens_out: { type: Number, default: 0 },
    tokens_cache_read: { type: Number, default: 0 },
    tokens_cache_write: { type: Number, default: 0 },
    cost_usd: { type: Number, default: 0 },
  },
  // minimize:false keeps empty subobjects like a tool_use's `input: {}` — Anthropic's API
  // requires the `input` field even when the tool was called with no arguments.
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" }, minimize: false },
);

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
