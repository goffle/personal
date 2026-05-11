const mongoose = require("mongoose");

const ENTITIES = ["walego", "selego", "jobego", "tirana", "tochet", "admin"];
const STATUSES = ["todo", "doing", "waiting", "done"];

const TaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    status: { type: String, enum: STATUSES, default: "todo", index: true },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    assignee_id: { type: String, index: true },
    assignee_name: { type: String },
    organization_id: { type: String, index: true },
    entity: { type: String, enum: ENTITIES, index: true },
    sprint: { type: String, index: true },
    reference: { type: String, required: true, index: true },
    due_at: { type: Date },
    created_by: { type: String },
    comment_count: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

TaskSchema.index({ organization_id: 1, reference: 1 }, { unique: true });

TaskSchema.pre("validate", async function () {
  if (this.isNew && !this.reference && this.organization_id) {
    const count = await mongoose.model("Task").countDocuments({ organization_id: this.organization_id });
    this.reference = `TASK-${count + 1}`;
  }
});

module.exports = mongoose.model("Task", TaskSchema);
