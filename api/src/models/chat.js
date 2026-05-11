const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema(
  {
    title: { type: String, default: "New chat" },
    organization_id: { type: String, index: true },
    created_by: { type: String },
    agent_id: { type: String },
    last_message_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("Chat", ChatSchema);
