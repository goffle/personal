const { z } = require("zod");
const User = require("../../models/user");
const { sanitizeSearch, formatResult, formatError, resolveCaller } = require("./_shared");

const USER_PROJECTION = {
  password: 0,
  __v: 0,
};

function registerUserTools(server) {
  server.tool(
    "search_users",
    "Search users in the caller's workspace (read-only).",
    {
      search: z.string().optional().describe("Text search on firstname/lastname/email"),
      limit: z.number().min(1).max(200).default(50).optional(),
      offset: z.number().min(0).default(0).optional(),
    },
    async (params, extra) => {
      try {
        const { organizationId } = await resolveCaller(extra);
        const query = { "organisations.id": organizationId };
        if (params.search) {
          const re = { $regex: sanitizeSearch(params.search), $options: "i" };
          query.$or = [{ firstname: re }, { lastname: re }, { email: re }];
        }
        const [total, users] = await Promise.all([
          User.countDocuments(query),
          User.find(query).select(USER_PROJECTION).sort("-created_at").skip(params.offset || 0).limit(params.limit || 50).lean(),
        ]);
        return formatResult({ total, count: users.length, users });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "get_user",
    "Get a single user by ID (read-only).",
    { id: z.string() },
    async (params, extra) => {
      try {
        await resolveCaller(extra);
        const user = await User.findById(params.id).select(USER_PROJECTION).lean();
        if (!user) return formatError("User not found");
        return formatResult({ user });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );
}

module.exports = { registerUserTools };
