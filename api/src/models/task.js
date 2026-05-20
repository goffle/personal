const mongoose = require("mongoose");

const ENTITIES = ["walego", "selego", "jobego", "tirana", "tochet", "admin", "other"];
const STATUSES = ["todo", "doing", "waiting", "done"];

const ChecklistItemSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    done: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

const TaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    status: { type: String, enum: STATUSES, default: "todo", index: true },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    assignee_id: { type: String, index: true },
    assignee_name: { type: String },
    assignee_type: { type: String, enum: ["user", "agent"], index: true },
    organization_id: { type: String, index: true },
    entity: { type: String, enum: ENTITIES, index: true },
    sprint: { type: String, index: true },
    reference: { type: String, required: true, index: true },
    external_id: { type: String, index: true },
    due_at: { type: Date },
    finished_at: { type: Date },
    created_by: { type: String },
    comment_count: { type: Number, default: 0 },
    checklist: { type: [ChecklistItemSchema], default: [] },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

TaskSchema.index({ organization_id: 1, reference: 1 }, { unique: true });
TaskSchema.index(
  { organization_id: 1, external_id: 1 },
  { unique: true, partialFilterExpression: { external_id: { $type: "string" } } },
);

TaskSchema.pre("validate", async function () {
  if (this.isNew && !this.reference && this.organization_id) {
    const docs = await mongoose
      .model("Task")
      .find({ organization_id: this.organization_id, reference: { $regex: /^TASK-\d+$/ } })
      .select("reference")
      .lean();
    const max = docs.reduce((m, d) => {
      const n = parseInt(d.reference.slice(5), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    this.reference = `TASK-${max + 1}`;
  }
});

module.exports = mongoose.model("Task", TaskSchema);
