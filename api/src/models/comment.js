const mongoose = require("mongoose");

const CommentSchema = new mongoose.Schema(
  {
    task_id: { type: String, index: true, required: true },
    organization_id: { type: String, index: true },
    author_id: { type: String, required: true },
    author_name: { type: String, default: "" },
    content: { type: String, required: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("Comment", CommentSchema);
