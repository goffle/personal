const mongoose = require("mongoose");

const ConnectorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    kind: { type: String, default: "generic" },
    status: { type: String, enum: ["connected", "disconnected", "error"], default: "disconnected" },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    organization_id: { type: String, index: true },
    created_by: { type: String },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("Connector", ConnectorSchema);
