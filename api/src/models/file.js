const mongoose = require("mongoose");

// A File is a node in the workspace tree: parent_id points at a parent folder
// File, or null for root. Files owned by a Skill live in the same tree, under
// the folder pointed to by Skill.folder_id — there is no separate ownership
// field on File itself.
const FileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    kind: { type: String, enum: ["file", "folder"], required: true },
    parent_id: { type: String, default: null },
    content_md: { type: String, default: "" },
    organization_id: { type: String, index: true },
    created_by: { type: String },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

FileSchema.pre("validate", async function () {
  if (this.parent_id) {
    const Self = mongoose.model("File");
    const folder = await Self.findById(this.parent_id, { kind: 1 }).lean();
    if (!folder) throw new Error(`parent_id ${this.parent_id} does not match any file`);
    if (folder.kind !== "folder") throw new Error(`parent_id ${this.parent_id} is not a folder`);
  }
});

module.exports = mongoose.model("File", FileSchema);
