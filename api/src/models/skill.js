const mongoose = require("mongoose");

// A skill's content lives in File documents with skill_id=<this._id>.
// The entrypoint is the File named "SKILL.md"; everything else is reference
// material that the entrypoint can link to.
const SkillSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    category: { type: String, default: "", index: true },
    agent_id: { type: String, index: true },
    organization_id: { type: String, index: true },
    created_by: { type: String },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("Skill", SkillSchema);
