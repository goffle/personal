const { z } = require("zod");
const { sanitizeSearch, formatResult, formatError, resolveCaller, withEntityUrl } = require("./_shared");

/**
 * Register search/get/create/update CRUD tools for an org-scoped resource.
 *
 * @param {object} server                   MCP server
 * @param {object} opts
 * @param {string}        opts.name         singular name, e.g. "agent"
 * @param {string}        opts.namePlural   plural for list responses, e.g. "agents"
 * @param {mongoose.Model} opts.Model
 * @param {string[]}      opts.searchFields fields scanned for regex search
 * @param {object}        opts.createShape  zod object literal (keys -> z schemas) used for create
 * @param {object}        opts.updateShape  zod object literal used for update (snake_case)
 * @param {object}        [opts.extraFilters] map of filter name -> { type, field } applied if present
 * @param {(params, ctx) => Promise<object|void>} [opts.beforeCreate]
 *   Hook run before Model.create. Receives the raw params and { organizationId }.
 *   May return a (possibly mutated) params object, or throw to reject.
 * @param {(args, ctx) => Promise<object|void>} [opts.beforeUpdate]
 *   Hook run before findByIdAndUpdate. Receives { id, fields } and { organizationId }.
 *   May return { id, fields } with adjusted values, or throw to reject.
 */
function registerCrudTools(server, opts) {
  const {
    name,
    namePlural,
    Model,
    searchFields = ["name"],
    createShape,
    updateShape,
    extraFilters = {},
    beforeCreate,
    beforeUpdate,
  } = opts;

  const searchParams = {
    search: z.string().optional().describe(`Text search on ${searchFields.join(", ")}`),
    limit: z.number().min(1).max(200).default(50).optional(),
    offset: z.number().min(0).default(0).optional(),
    sort: z.string().default("-created_at").optional(),
  };
  for (const [key, cfg] of Object.entries(extraFilters)) {
    searchParams[key] = cfg.type.optional();
  }

  server.tool(
    `search_${namePlural}`,
    `Search ${namePlural} in the caller's workspace.`,
    searchParams,
    async (params, extra) => {
      try {
        const { organizationId } = await resolveCaller(extra);
        const query = { organization_id: organizationId };
        if (params.search && searchFields.length) {
          const re = { $regex: sanitizeSearch(params.search), $options: "i" };
          query.$or = searchFields.map((f) => ({ [f]: re }));
        }
        for (const [key, cfg] of Object.entries(extraFilters)) {
          if (params[key] !== undefined && params[key] !== "") query[cfg.field || key] = params[key];
        }
        const [total, items] = await Promise.all([
          Model.countDocuments(query),
          Model.find(query)
            .sort(params.sort || "-created_at")
            .skip(params.offset || 0)
            .limit(params.limit || 50)
            .lean(),
        ]);
        return formatResult({ total, count: items.length, [namePlural]: items.map((i) => withEntityUrl(name, i)) });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    `get_${name}`,
    `Get a ${name} by ID.`,
    { id: z.string() },
    async (params, extra) => {
      try {
        await resolveCaller(extra);
        const item = await Model.findById(params.id).lean();
        if (!item) return formatError(`${name} not found`);
        return formatResult({ [name]: withEntityUrl(name, item) });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  if (createShape) {
    server.tool(
      `create_${name}`,
      `Create a ${name} in the caller's workspace.`,
      createShape,
      async (params, extra) => {
        try {
          const { user, organizationId } = await resolveCaller(extra);
          let payload = params;
          if (beforeCreate) {
            const next = await beforeCreate(payload, { organizationId });
            if (next) payload = next;
          }
          const item = await Model.create({ ...payload, organization_id: organizationId, created_by: user._id.toString() });
          return formatResult({ created: true, [name]: withEntityUrl(name, item.toObject()) });
        } catch (err) {
          return formatError(err.message);
        }
      },
    );
  }

  if (updateShape) {
    server.tool(
      `update_${name}`,
      `Update fields of a ${name}.`,
      { id: z.string(), fields: z.object(updateShape).describe("Fields to update (snake_case)") },
      async (params, extra) => {
        try {
          const { organizationId } = await resolveCaller(extra);
          let args = params;
          if (beforeUpdate) {
            const next = await beforeUpdate(args, { organizationId });
            if (next) args = next;
          }
          const item = await Model.findByIdAndUpdate(args.id, { $set: args.fields }, { new: true }).lean();
          if (!item) return formatError(`${name} not found`);
          return formatResult({ updated: true, [name]: withEntityUrl(name, item) });
        } catch (err) {
          return formatError(err.message);
        }
      },
    );
  }
}

module.exports = { registerCrudTools };
