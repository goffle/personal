const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    chat_id: { type: String, index: true, required: true },
    organization_id: { type: String, index: true },
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    content: { type: String, default: "" },
    streaming: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("Message", MessageSchema);
