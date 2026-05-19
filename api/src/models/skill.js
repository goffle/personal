const mongoose = require("mongoose");

// A skill's content lives in File documents under the folder pointed to by
// folder_id. The entrypoint is the File named "SKILL.md" directly inside that
// folder; everything else is reference material the entrypoint can link to.
// Sub-folders are allowed and become real File docs of kind "folder".
const SkillSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    category: { type: String, default: "", index: true },
    agent_id: { type: String, index: true },
    folder_id: { type: String, index: true },
    organization_id: { type: String, index: true },
    created_by: { type: String },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("Skill", SkillSchema);
