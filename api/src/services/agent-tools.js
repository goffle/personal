/*
 * Internal tools exposed to agents during a chat. Each tool has an Anthropic-style
 * definition (name + description + input_schema) and an in-process handler that
 * runs against the local Mongo models. Connector-backed tools (Gmail, Calendar)
 * are layered on top of this set based on the agent's linked connectors.
 */

const Task = require("../models/task");
const Skill = require("../models/skill");
const Agent = require("../models/agent");
const Chat = require("../models/chat");
const Connector = require("../models/connector");
const { getDriver } = require("../connectors");

const ENTITIES = ["walego", "selego", "jobego", "tirana", "tochet", "admin", "other"];
const STATUSES = ["todo", "doing", "waiting", "done"];

const INTERNAL_TOOLS = [
  {
    name: "read_skill",
    description:
      "Load a skill's full instructions by name. Skills are listed in your system context — call this BEFORE executing one so you have the complete instructions.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
    async handler(input, ctx, agent) {
      const q = { organization_id: ctx.organization_id, name: input.name };
      if (agent?._id) q.agent_id = agent._id.toString();
      const skill = await Skill.findOne(q).lean();
      if (!skill) throw new Error(`skill "${input.name}" not found`);
      return { name: skill.name, description: skill.description || "", body_md: skill.body_md || "" };
    },
  },
  {
    name: "search_tasks",
    description: "Search tasks in the workspace. Filter by entity, status, sprint, or free-text title.",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Free-text match on task title." },
        entity: { type: "string", enum: ENTITIES },
        status: { type: "string", enum: STATUSES },
        sprint: { type: "string" },
        external_id: { type: "string", description: "Exact match on external_id, e.g. 'gmail:<thread_id>'." },
        limit: { type: "number", default: 25 },
      },
    },
    async handler(input, ctx) {
      const q = { organization_id: ctx.organization_id };
      if (input.search) q.title = { $regex: input.search, $options: "i" };
      if (input.entity) q.entity = input.entity;
      if (input.status) q.status = input.status;
      if (input.sprint) q.sprint = input.sprint;
      if (input.external_id) q.external_id = input.external_id;
      const items = await Task.find(q).sort({ created_at: -1 }).limit(Math.min(input.limit || 25, 100)).lean();
      return { count: items.length, tasks: items };
    },
  },
  {
    name: "create_task",
    description:
      "Create a task. Use external_id (e.g. 'gmail:<thread_id>') to make creation idempotent — if a task with that external_id already exists, no duplicate is created.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        entity: { type: "string", enum: ENTITIES },
        status: { type: "string", enum: STATUSES, default: "todo" },
        priority: { type: "string", enum: ["low", "medium", "high"], default: "medium" },
        due_at: { type: "string", description: "ISO 8601 date." },
        external_id: { type: "string" },
        sprint: { type: "string" },
      },
      required: ["title"],
    },
    async handler(input, ctx) {
      if (input.external_id) {
        const existing = await Task.findOne({ organization_id: ctx.organization_id, external_id: input.external_id }).lean();
        if (existing) return { created: false, reason: "external_id already exists", task: existing };
      }
      const payload = {
        title: input.title,
        description: input.description || "",
        entity: input.entity,
        status: input.status || "todo",
        priority: input.priority || "medium",
        external_id: input.external_id,
        sprint: input.sprint,
        organization_id: ctx.organization_id,
        created_by: ctx.created_by || null,
      };
      if (input.due_at) payload.due_at = new Date(input.due_at);
      const task = await Task.create(payload);
      return { created: true, task: task.toObject() };
    },
  },
  {
    name: "update_task",
    description: "Update fields of an existing task by id.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        fields: {
          type: "object",
          description: "Fields to update — title, description, entity, status, priority, due_at, sprint.",
        },
      },
      required: ["id", "fields"],
    },
    async handler(input, ctx) {
      const task = await Task.findOne({ _id: input.id, organization_id: ctx.organization_id });
      if (!task) throw new Error("task not found");
      Object.assign(task, input.fields || {});
      await task.save();
      return { updated: true, task: task.toObject() };
    },
  },
  {
    name: "search_skills",
    description: "Search skills available in the workspace (optionally scoped to the current agent).",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string" },
        agent_id: { type: "string", description: "Restrict to skills attached to this agent." },
      },
    },
    async handler(input, ctx) {
      const q = { organization_id: ctx.organization_id };
      if (input.search) q.$or = [{ name: { $regex: input.search, $options: "i" } }, { description: { $regex: input.search, $options: "i" } }];
      if (input.agent_id) q.agent_id = input.agent_id;
      const items = await Skill.find(q).sort({ name: 1 }).limit(50).lean();
      return { count: items.length, skills: items };
    },
  },
];

/**
 * Build the Anthropic-format tools array for a given agent.
 * Includes the internal set plus tools from each linked connector driver.
 */
async function buildToolsForAgent(agent) {
  const tools = INTERNAL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  const connectorIds = (agent.connectors || []).map((c) => c.id).filter(Boolean);
  if (connectorIds.length) {
    const connectors = await Connector.find({ _id: { $in: connectorIds } });
    for (const conn of connectors) {
      const driver = getDriver(conn.kind);
      if (!driver?.tools?.length) continue;
      for (const t of driver.tools) {
        tools.push({
          name: `${conn.name}__${t.name.replace(/\./g, "_")}`,
          description: t.description,
          input_schema: t.schema,
        });
      }
    }
  }
  return tools;
}

/**
 * Execute a tool by name. Tries internal tools first, then connector-prefixed tools.
 * Returns the JSON-serializable result, or throws.
 */
async function runTool({ name, input, agent, ctx }) {
  const internal = INTERNAL_TOOLS.find((t) => t.name === name);
  if (internal) return await internal.handler(input || {}, ctx, agent);

  // Connector tool format: "<connectorName>__<toolNameWithUnderscores>"
  const sep = name.indexOf("__");
  if (sep > 0) {
    const connectorName = name.slice(0, sep);
    const toolSuffix = name.slice(sep + 2);
    const conn = await Connector.findOne({
      _id: { $in: (agent.connectors || []).map((c) => c.id) },
      name: connectorName,
    });
    if (!conn) throw new Error(`connector "${connectorName}" not linked to agent`);
    const driver = getDriver(conn.kind);
    if (!driver?.tools?.length) throw new Error(`no driver tools for kind "${conn.kind}"`);
    const def = driver.tools.find((t) => t.name.replace(/\./g, "_") === toolSuffix);
    if (!def) throw new Error(`tool "${toolSuffix}" not found on connector "${connectorName}"`);
    return await def.handler(conn, input || {});
  }

  throw new Error(`unknown tool: ${name}`);
}

module.exports = { INTERNAL_TOOLS, buildToolsForAgent, runTool };
