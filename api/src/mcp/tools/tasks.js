const { z } = require("zod");
const Task = require("../../models/task");
const Comment = require("../../models/comment");
const { sanitizeSearch, formatResult, formatError, resolveCaller, taskUrl } = require("./_shared");

const ENTITIES = ["walego", "selego", "jobego", "tirana", "tochet", "admin"];
const STATUSES = ["todo", "doing", "waiting", "done"];

function registerTaskTools(server) {
  server.tool(
    "search_tasks",
    "Search tasks in the caller's workspace. Filters: search (text on title/description), status, assignee_id, assignee_type ('user' or 'agent'), priority, entity, sprint, reference, external_id. Returns: id, reference, title, status, priority, entity, sprint, due_at, assignee_id, assignee_type, comment_count, created_at. Examples: {status:'doing', entity:'selego'} → in-progress on Selego. {assignee_type:'agent'} → all tasks delegated to an agent.",
    {
      search: z.string().optional().describe("Text search on title or description"),
      status: z.enum(STATUSES).optional(),
      assignee_id: z.string().optional(),
      assignee_type: z.enum(["user", "agent"]).optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      entity: z.enum(ENTITIES).optional(),
      sprint: z.string().optional().describe("Exact match. Use ISO week format like '2026-W19' (current sprint) or 'Backlog'. Call get_current_sprint or list_sprints to discover valid names."),
      reference: z.string().optional().describe("Exact reference match, e.g. 'TASK-12'"),
      external_id: z.string().optional().describe("Exact external_id match (e.g. 'notion:abc123')"),
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
        if (params.assignee_id) query.assignee_id = params.assignee_id;
        if (params.assignee_type) query.assignee_type = params.assignee_type;
        if (params.priority) query.priority = params.priority;
        if (params.entity) query.entity = params.entity;
        if (params.sprint) query.sprint = params.sprint;
        if (params.reference) query.reference = params.reference;
        if (params.external_id) query.external_id = params.external_id;

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
    "Get a single task by ID with its comments. Returns the full task (reference, entity, sprint, external_id, ...) plus an array of comments. Example: {id:'67abc...'}.",
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
    "Create a task in the caller's workspace. A human-readable reference (e.g. TASK-12) is assigned automatically. Sprint convention: ISO week names like '2026-W19' (Monday → Sunday) or 'Backlog'. When external_id is provided, behaves as find-or-create: if a task with that external_id already exists in the workspace, the existing task is returned with created:false (no duplicate, no update). Use external_id to make migrations idempotent and rerunnable. All params are snake_case. Example: {title:'Fix login bug', entity:'selego', sprint:'2026-W19', priority:'high', external_id:'notion:abc123'}.",
    {
      title: z.string().describe("Required"),
      description: z.string().optional(),
      status: z.enum(STATUSES).default("todo").optional(),
      priority: z.enum(["low", "medium", "high"]).default("medium").optional(),
      assignee_id: z.string().optional().describe("Defaults to the calling user if omitted"),
      assignee_name: z.string().optional(),
      assignee_type: z.enum(["user", "agent"]).optional().describe("'user' or 'agent'. Defaults to 'user' when assignee_id is omitted."),
      entity: z.enum(ENTITIES).optional().describe("walego, selego, jobego, tirana, tochet, or admin"),
      sprint: z.string().optional().describe("Sprint name as ISO week (e.g. '2026-W19') or 'Backlog'. Call get_current_sprint to get the current week."),
      due_at: z.string().optional().describe("ISO date string"),
      external_id: z
        .string()
        .optional()
        .describe("Stable id from an external source (e.g. 'notion:abc123'). Makes create_task idempotent."),
    },
    async (params, extra) => {
      try {
        const { user, organizationId } = await resolveCaller(extra);

        if (params.external_id) {
          const existing = await Task.findOne({
            organization_id: organizationId,
            external_id: params.external_id,
          }).lean();
          if (existing) {
            return formatResult({ created: false, task: { ...existing, url: taskUrl(existing._id) } });
          }
        }

        const payload = {
          title: params.title,
          description: params.description || "",
          status: params.status || "todo",
          priority: params.priority || "medium",
          organization_id: organizationId,
          created_by: user._id.toString(),
        };
        if (params.assignee_id) {
          payload.assignee_id = params.assignee_id;
          if (params.assignee_name) payload.assignee_name = params.assignee_name;
          if (params.assignee_type) payload.assignee_type = params.assignee_type;
        } else {
          payload.assignee_id = user._id.toString();
          payload.assignee_name = `${user.firstname || ""} ${user.lastname || ""}`.trim() || user.email;
          payload.assignee_type = "user";
        }
        if (params.entity) payload.entity = params.entity;
        if (params.sprint) payload.sprint = params.sprint;
        if (params.due_at) payload.due_at = new Date(params.due_at);
        if (params.external_id) payload.external_id = params.external_id;

        const task = await Task.create(payload);
        return formatResult({ created: true, task: { ...task.toObject(), url: taskUrl(task._id) } });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "update_task",
    "Update task fields by ID. All fields are flat snake_case (no fields:{} wrapper). The reference and external_id are immutable. At least one updatable field must be provided. Example: {id:'67abc...', status:'done', sprint:'Backlog'}.",
    {
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(STATUSES).optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      assignee_id: z.string().nullable().optional(),
      assignee_name: z.string().nullable().optional(),
      assignee_type: z.enum(["user", "agent"]).nullable().optional(),
      entity: z.enum(ENTITIES).optional(),
      sprint: z.string().nullable().optional(),
      due_at: z.string().nullable().optional(),
    },
    async (params, extra) => {
      try {
        await resolveCaller(extra);
        const { id, ...rest } = params;
        const update = {};
        for (const [key, value] of Object.entries(rest)) {
          if (value !== undefined) update[key] = value;
        }
        if (Object.keys(update).length === 0) return formatError("No fields provided to update");
        if (update.due_at) update.due_at = new Date(update.due_at);
        const task = await Task.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
        if (!task) return formatError("Task not found");
        return formatResult({ updated: true, task: { ...task, url: taskUrl(task._id) } });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "delete_task",
    "Delete a task and all its comments. Irreversible.",
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
    "Add a comment to a task. Author is the authenticated user. Example: {task_id:'67abc...', content:'Blocked on review'}.",
    {
      task_id: z.string(),
      content: z.string().min(1),
    },
    async (params, extra) => {
      try {
        const { user, organizationId } = await resolveCaller(extra);
        const comment = await Comment.create({
          task_id: params.task_id,
          organization_id: organizationId,
          author_id: user._id.toString(),
          author_name: `${user.firstname || ""} ${user.lastname || ""}`.trim() || user.email,
          content: params.content,
        });
        await Task.findByIdAndUpdate(params.task_id, { $inc: { comment_count: 1 } });
        return formatResult({ created: true, comment });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );
}

module.exports = { registerTaskTools };
