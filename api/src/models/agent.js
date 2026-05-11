const mongoose = require("mongoose");

const AgentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    reference: { type: String },
    sound_url: { type: String },
    system_prompt: { type: String, default: "" },
    model: { type: String, default: "claude-sonnet-4-6" },
    organization_id: { type: String, index: true },
    created_by: { type: String },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("Agent", AgentSchema);
