const mongoose = require("mongoose");

const CronJobSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    schedule: { type: String, required: true },
    agent_id: { type: String, index: true },
    skill_id: { type: String },
    skill_name: { type: String },
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
    enabled: { type: Boolean, default: true },
    last_run_at: { type: Date },
    last_run_status: { type: String },
    last_run_chat_id: { type: String },
    organization_id: { type: String, index: true },
    created_by: { type: String },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("CronJob", CronJobSchema);
