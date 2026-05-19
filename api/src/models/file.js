const mongoose = require("mongoose");

// A File is either:
//   - a node in the workspace tree (parent_id points at a parent folder File, or
//     null for root). skill_id is null.
//   - owned by a skill (skill_id is set, parent_id is null). The file's `name`
//     plays the role of a relative path inside the skill, e.g. "SKILL.md" or
//     "reference/example.md".
//
// The two cases are mutually exclusive — enforced by the pre('validate') hook.
const FileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    kind: { type: String, enum: ["file", "folder"], required: true },
    parent_id: { type: String, default: null },
    skill_id: { type: String, default: null, index: true },
    content_md: { type: String, default: "" },
    organization_id: { type: String, index: true },
    created_by: { type: String },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

FileSchema.pre("validate", async function () {
  if (this.skill_id && this.parent_id) {
    throw new Error("File cannot have both skill_id and parent_id");
  }
  if (this.skill_id) {
    const Skill = mongoose.model("Skill");
    const exists = await Skill.exists({ _id: this.skill_id });
    if (!exists) throw new Error(`skill_id ${this.skill_id} does not match any skill`);
  }
  if (this.parent_id) {
    const Self = mongoose.model("File");
    const folder = await Self.findById(this.parent_id, { kind: 1 }).lean();
    if (!folder) throw new Error(`parent_id ${this.parent_id} does not match any file`);
    if (folder.kind !== "folder") throw new Error(`parent_id ${this.parent_id} is not a folder`);
  }
});

FileSchema.index({ skill_id: 1, name: 1 });

module.exports = mongoose.model("File", FileSchema);
