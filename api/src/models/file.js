const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    kind: { type: String, enum: ["file", "folder"], required: true },
    parent_kind: { type: String, default: null },
    parent_id: { type: String, default: null },
    content_md: { type: String, default: "" },
    organization_id: { type: String, index: true },
    created_by: { type: String },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

FileSchema.index({ parent_kind: 1, parent_id: 1 });

module.exports = mongoose.model("File", FileSchema);
