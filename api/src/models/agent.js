const mongoose = require("mongoose");

const AgentFileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    content_md: { type: String, default: "" },
  },
  { _id: true, timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

const AgentConnectorSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
  },
  { _id: false },
);

const AgentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    reference: { type: String },
    sound_url: { type: String },
    system_prompt: { type: String, default: "" },
    model: { type: String, default: "claude-sonnet-4-6" },
    files: { type: [AgentFileSchema], default: [] },
    connectors: { type: [AgentConnectorSchema], default: [] },
    organization_id: { type: String, index: true },
    created_by: { type: String },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("Agent", AgentSchema);
