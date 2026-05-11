const mongoose = require("mongoose");

const TaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    status: { type: String, enum: ["todo", "doing", "done"], default: "todo", index: true },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    assignee_id: { type: String, index: true },
    assignee_name: { type: String },
    organization_id: { type: String, index: true },
    due_at: { type: Date },
    created_by: { type: String },
    comment_count: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("Task", TaskSchema);
