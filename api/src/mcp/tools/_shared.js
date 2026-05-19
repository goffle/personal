const User = require("../../models/user");
const { APP_URL } = require("../../config");

function sanitizeSearch(str) {
  return (str || "").replace(/[#-.]|[[-^]|[?|{}]/g, "\\$&");
}

function formatResult(data) {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function formatError(message) {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
}

/**
 * Resolve the authenticated user from the MCP `extra.authInfo` payload.
 * Returns { user, organizationId, accessToken } — organizationId is pinned on the
 * access token at consent time and can be switched with `set_active_organization`.
 * Legacy tokens issued before multi-org pinning fall back to the user's first org.
 */
async function resolveCaller(extra) {
  const user_id = extra?.authInfo?.user_id;
  if (!user_id) throw new Error("Unauthenticated");
  const user = await User.findById(user_id).lean();
  if (!user) throw new Error("User not found");

  const orgs = user.organisations || [];
  if (!orgs.length) throw new Error("User has no organisation");

  const pinned = extra?.authInfo?.organization_id || null;
  let organizationId = pinned;
  if (organizationId && !orgs.some((o) => o.id === organizationId)) {
    throw new Error(`User is no longer a member of organisation ${organizationId}. Call list_my_organizations and set_active_organization to choose another.`);
  }
  if (!organizationId) organizationId = orgs[0].id;

  return { user, organizationId, accessToken: extra?.authInfo?.token || null };
}

const ENTITY_URL_BUILDERS = {
  task: (id) => `${APP_URL}/tasks/${id}`,
  chat: (id) => `${APP_URL}/chat?id=${id}`,
  file: (id) => `${APP_URL}/data-room/${id}`,
  agent: (id) => `${APP_URL}/agents/${id}`,
};

function entityUrl(name, id) {
  if (!id) return null;
  const build = ENTITY_URL_BUILDERS[name];
  return build ? build(id) : null;
}

function withEntityUrl(name, item) {
  if (!item) return item;
  const url = entityUrl(name, item._id);
  return url ? { ...item, url } : item;
}

const taskUrl = (id) => entityUrl("task", id);
const chatUrl = (id) => entityUrl("chat", id);

module.exports = {
  sanitizeSearch,
  formatResult,
  formatError,
  resolveCaller,
  entityUrl,
  withEntityUrl,
  taskUrl,
  chatUrl,
};
