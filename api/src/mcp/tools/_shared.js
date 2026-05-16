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
 * Returns { user, organizationId } — organizationId defaults to the user's first org.
 */
async function resolveCaller(extra) {
  const user_id = extra?.authInfo?.user_id;
  if (!user_id) throw new Error("Unauthenticated");
  const user = await User.findById(user_id).lean();
  if (!user) throw new Error("User not found");
  const organizationId = user.organisations?.[0]?.id || null;
  return { user, organizationId };
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
