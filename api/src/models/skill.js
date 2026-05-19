const mongoose = require("mongoose");

const SkillFileSchema = new mongoose.Schema(
  {
    path: { type: String, required: true },
    body_md: { type: String, default: "" },
  },
  { _id: false },
);

const SkillSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    category: { type: String, default: "", index: true },
    body_md: { type: String, default: "" },
    files: { type: [SkillFileSchema], default: undefined },
    agent_id: { type: String, index: true },
    organization_id: { type: String, index: true },
    created_by: { type: String },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("Skill", SkillSchema);
