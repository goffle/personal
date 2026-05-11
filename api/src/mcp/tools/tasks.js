const { z } = require("zod");
const Task = require("../../models/task");
const Comment = require("../../models/comment");
const { sanitizeSearch, formatResult, formatError, resolveCaller, taskUrl } = require("./_shared");

const ENTITIES = ["walego", "selego", "jobego", "tirana", "tochet", "admin"];
const STATUSES = ["todo", "doing", "waiting", "done"];

function registerTaskTools(server) {
  server.tool(
    "search_tasks",
    "Search tasks in the caller's workspace. Filters by text, status, assignee, priority, entity, sprint, reference. Returns id, reference, title, status, priority, entity, sprint, due_at, assignee, comment_count, created_at.",
    {
      search: z.string().optional().describe("Text search on title or description"),
      status: z.enum(STATUSES).optional(),
      assigneeId: z.string().optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      entity: z.enum(ENTITIES).optional(),
      sprint: z.string().optional().describe("Exact match, e.g. 'Sprint 20' or 'Backlog'"),
      reference: z.string().optional().describe("Exact reference match, e.g. 'TASK-12'"),
      limit: z.number().min(1).max(200).default(50).optional(),
      offset: z.number().min(0).default(0).optional(),
      sort: z.string().default("-created_at").optional(),
    },
    async (params, extra) => {
      try {
        const { organizationId } = await resolveCaller(extra);
        const query = { organization_id: organizationId };
        if (params.search) {
          const re = { $regex: sanitizeSearch(params.search), $options: "i" };
          query.$or = [{ title: re }, { description: re }];
        }
        if (params.status) query.status = params.status;
        if (params.assigneeId) query.assignee_id = params.assigneeId;
        if (params.priority) query.priority = params.priority;
        if (params.entity) query.entity = params.entity;
        if (params.sprint) query.sprint = params.sprint;
        if (params.reference) query.reference = params.reference;

        const [total, items] = await Promise.all([
          Task.countDocuments(query),
          Task.find(query)
            .sort(params.sort || "-created_at")
            .skip(params.offset || 0)
            .limit(params.limit || 50)
            .lean(),
        ]);

        return formatResult({ total, count: items.length, tasks: items.map((t) => ({ ...t, url: taskUrl(t._id) })) });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "get_task",
    "Get a single task by ID, with its comments. Returned task includes reference, entity, sprint.",
    { id: z.string().describe("MongoDB ObjectId of the task") },
    async (params, extra) => {
      try {
        await resolveCaller(extra);
        const task = await Task.findById(params.id).lean();
        if (!task) return formatError("Task not found");
        const comments = await Comment.find({ task_id: params.id }).sort({ created_at: 1 }).lean();
        return formatResult({ task: { ...task, url: taskUrl(task._id) }, comments });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "create_task",
    "Create a task in the caller's workspace. A human-readable reference (e.g. TASK-12) is assigned automatically and returned on the task.",
    {
      title: z.string().describe("Required"),
      description: z.string().optional(),
      status: z.enum(STATUSES).default("todo").optional(),
      priority: z.enum(["low", "medium", "high"]).default("medium").optional(),
      assigneeId: z.string().optional(),
      assigneeName: z.string().optional(),
      entity: z.enum(ENTITIES).optional().describe("walego, selego, jobego, tirana, tochet, or admin"),
      sprint: z.string().optional().describe("Free string, e.g. 'Sprint 20' or 'Backlog'"),
      dueAt: z.string().optional().describe("ISO date string"),
    },
    async (params, extra) => {
      try {
        const { user, organizationId } = await resolveCaller(extra);
        const payload = {
          title: params.title,
          description: params.description || "",
          status: params.status || "todo",
          priority: params.priority || "medium",
          organization_id: organizationId,
          created_by: user._id.toString(),
        };
        if (params.assigneeId) payload.assignee_id = params.assigneeId;
        if (params.assigneeName) payload.assignee_name = params.assigneeName;
        if (params.entity) payload.entity = params.entity;
        if (params.sprint) payload.sprint = params.sprint;
        if (params.dueAt) payload.due_at = new Date(params.dueAt);
        const task = await Task.create(payload);
        return formatResult({ created: true, task: { ...task.toObject(), url: taskUrl(task._id) } });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "update_task",
    "Update task fields. The reference is immutable and cannot be changed.",
    {
      id: z.string(),
      fields: z
        .object({
          title: z.string().optional(),
          description: z.string().optional(),
          status: z.enum(STATUSES).optional(),
          priority: z.enum(["low", "medium", "high"]).optional(),
          assignee_id: z.string().optional(),
          assignee_name: z.string().optional(),
          entity: z.enum(ENTITIES).optional(),
          sprint: z.string().nullable().optional(),
          due_at: z.string().nullable().optional(),
        })
        .describe("Fields to update (snake_case)"),
    },
    async (params, extra) => {
      try {
        await resolveCaller(extra);
        const update = { ...params.fields };
        if (update.due_at) update.due_at = new Date(update.due_at);
        const task = await Task.findByIdAndUpdate(params.id, { $set: update }, { new: true }).lean();
        if (!task) return formatError("Task not found");
        return formatResult({ updated: true, task: { ...task, url: taskUrl(task._id) } });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "delete_task",
    "Delete a task and all its comments.",
    { id: z.string() },
    async (params, extra) => {
      try {
        await resolveCaller(extra);
        const task = await Task.findByIdAndDelete(params.id);
        if (!task) return formatError("Task not found");
        await Comment.deleteMany({ task_id: params.id });
        return formatResult({ deleted: true });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "add_comment_to_task",
    "Add a comment to a task (author is the authenticated user).",
    {
      taskId: z.string(),
      content: z.string().min(1),
    },
    async (params, extra) => {
      try {
        const { user, organizationId } = await resolveCaller(extra);
        const comment = await Comment.create({
          task_id: params.taskId,
          organization_id: organizationId,
          author_id: user._id.toString(),
          author_name: `${user.firstname || ""} ${user.lastname || ""}`.trim() || user.email,
          content: params.content,
        });
        await Task.findByIdAndUpdate(params.taskId, { $inc: { comment_count: 1 } });
        return formatResult({ created: true, comment });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );
}

module.exports = { registerTaskTools };
