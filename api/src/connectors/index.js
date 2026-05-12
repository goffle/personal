const gmail = require("./gmail");
const web = require("./web");

const DRIVERS = {
  gmail,
  web,
};

function getDriver(kind) {
  return DRIVERS[kind] || null;
}

function listTools(kind) {
  const d = getDriver(kind);
  if (!d || !d.tools) return [];
  return d.tools.map((t) => ({ name: t.name, description: t.description, schema: t.schema }));
}

module.exports = { getDriver, listTools, DRIVERS };
