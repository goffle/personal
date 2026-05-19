const { z } = require("zod");
const Task = require("../../models/task");
const OAuthToken = require("../../models/oauth-token");
const { formatResult, formatError, resolveCaller } = require("./_shared");

const ENTITIES = ["walego", "selego", "jobego", "tirana", "tochet", "admin", "other"];

// --- ISO 8601 week helpers (Monday → Sunday) ---

function toUtcMidnight(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function isoWeekParts(date) {
  const d = toUtcMidnight(date);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function isoWeekName(date) {
  const { year, week } = isoWeekParts(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function isoWeekToMonday(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

function weekBoundariesFromName(name) {
  const [yearStr, weekStr] = name.split("-W");
  const year = Number(yearStr);
  const week = Number(weekStr);
  const monday = isoWeekToMonday(year, week);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  return { start_at: monday.toISOString(), end_at: sunday.toISOString() };
}

function shiftWeek(date, offset) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + offset * 7);
  return d;
}

function sprintFromDate(date) {
  const name = isoWeekName(date);
  return { name, ...weekBoundariesFromName(name) };
}

// --- Tools ---

function registerWorkspaceTools(server) {
  server.tool(
    "whoami",
    "Return the authenticated user and the active workspace context. Call first to discover organization_id, available entities, current_sprint, and the user's identity. The active organization_id is pinned on the access token at consent time; all other tools operate on this workspace. Returns: user_id, email, firstname, lastname, organization_id (active), organization_name, role, organisations (full list user belongs to with active flag), entities_available, current_sprint. To switch workspaces, call set_active_organization.",
    {},
    async (_params, extra) => {
      try {
        const { user, organizationId } = await resolveCaller(extra);
        const org = user.organisations?.find((o) => o.id === organizationId) || null;
        return formatResult({
          user_id: user._id.toString(),
          email: user.email,
          firstname: user.firstname,
          lastname: user.lastname,
          organization_id: organizationId,
          organization_name: org?.name || null,
          role: org?.role || null,
          organisations: (user.organisations || []).map((o) => ({
            id: o.id,
            name: o.name,
            role: o.role,
            active: o.id === organizationId,
          })),
          entities_available: ENTITIES,
          current_sprint: sprintFromDate(new Date()),
        });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "list_my_organizations",
    "List every organisation the calling user belongs to. Use this to discover candidate organization_ids before calling set_active_organization. Returns array of { id, name, role, active }.",
    {},
    async (_params, extra) => {
      try {
        const { user, organizationId } = await resolveCaller(extra);
        return formatResult({
          organisations: (user.organisations || []).map((o) => ({
            id: o.id,
            name: o.name,
            role: o.role,
            active: o.id === organizationId,
          })),
        });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "set_active_organization",
    "Switch the workspace this MCP session operates on. Pins organization_id onto the caller's access token and matching refresh token; subsequent tool calls (search_tasks, create_chat, etc.) will route to the new workspace. The caller must be a member of the target organisation. Example: {organization_id:'org_abc123'}.",
    { organization_id: z.string().describe("Target organisation id. Use list_my_organizations to discover valid ids.") },
    async (params, extra) => {
      try {
        const { user, accessToken } = await resolveCaller(extra);
        if (!accessToken) return formatError("No access token in context");
        const orgs = user.organisations || [];
        const target = orgs.find((o) => o.id === params.organization_id);
        if (!target) return formatError(`Not a member of organisation ${params.organization_id}. Call list_my_organizations.`);

        const current = await OAuthToken.findOne({ token: accessToken, type: "access_token" }).lean();
        if (!current) return formatError("Access token not found");

        await OAuthToken.updateMany(
          {
            user_id: user._id.toString(),
            client_id: current.client_id,
            type: { $in: ["access_token", "refresh_token"] },
          },
          { $set: { organization_id: target.id } },
        );

        return formatResult({
          switched: true,
          organization_id: target.id,
          organization_name: target.name,
          role: target.role,
        });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "get_current_sprint",
    "Return the current sprint as an ISO 8601 week (Monday → Sunday), computed from today. Returns { name: '2026-W19', start_at, end_at }. Example: call with no args.",
    {},
    async (_params, extra) => {
      try {
        await resolveCaller(extra);
        return formatResult(sprintFromDate(new Date()));
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "get_sprint",
    "Return a sprint by week offset from current. offset:0 = current, -1 = previous, +1 = next, -4 = four weeks ago. Returns { name, start_at, end_at }. Example: {offset:-1} for last week.",
    { offset: z.number().int().default(0).optional() },
    async ({ offset = 0 }, extra) => {
      try {
        await resolveCaller(extra);
        return formatResult(sprintFromDate(shiftWeek(new Date(), offset)));
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "list_sprints",
    "List ISO-week sprints over a range with task counts. Range is defined by week offsets from current (from_offset is past, to_offset is future). Always includes a 'Backlog' bucket if non-empty. Filter by entity to count only tasks of that entity. Returns array of { name, start_at?, end_at?, count }. Example: {from_offset:-4, to_offset:1, entity:'selego'} → last 4 weeks + next week, Selego only.",
    {
      from_offset: z
        .number()
        .int()
        .default(-4)
        .optional()
        .describe("Past offset from current week (e.g. -4 = four weeks ago). Default -4."),
      to_offset: z
        .number()
        .int()
        .default(1)
        .optional()
        .describe("Future offset from current week (e.g. +1 = next week). Default +1."),
      entity: z.enum(ENTITIES).optional(),
    },
    async ({ from_offset = -4, to_offset = 1, entity }, extra) => {
      try {
        const { organizationId } = await resolveCaller(extra);
        const now = new Date();
        const names = [];
        for (let off = from_offset; off <= to_offset; off++) {
          names.push(isoWeekName(shiftWeek(now, off)));
        }

        const match = { organization_id: organizationId };
        if (entity) match.entity = entity;

        const aggregated = await Task.aggregate([
          { $match: match },
          { $group: { _id: "$sprint", count: { $sum: 1 } } },
        ]);
        const counts = Object.fromEntries(aggregated.map((r) => [r._id || "Backlog", r.count]));

        const sprints = names.map((name) => ({ name, ...weekBoundariesFromName(name), count: counts[name] || 0 }));
        if (counts.Backlog) sprints.push({ name: "Backlog", count: counts.Backlog });
        return formatResult({ sprints });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );
}

module.exports = { registerWorkspaceTools };
