const mongoose = require("mongoose");

const McpServerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    transport: { type: String, enum: ["http", "sse", "stdio"], default: "http" },
    status: { type: String, enum: ["connected", "disconnected", "error"], default: "disconnected" },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    organization_id: { type: String, index: true },
    created_by: { type: String },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("McpServer", McpServerSchema);
