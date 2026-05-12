const gmail = require("./gmail");
const google_calendar = require("./google_calendar");
const web = require("./web");

const DRIVERS = {
  gmail,
  google_calendar,
  web,
};

function getDriver(kind) {
  return DRIVERS[kind] || null;
}

function hasDriver(kind) {
  return Boolean(DRIVERS[kind]);
}

function listKinds() {
  return Object.keys(DRIVERS);
}

function listTools(kind) {
  const d = getDriver(kind);
  if (!d || !d.tools) return [];
  return d.tools.map((t) => ({ name: t.name, description: t.description, schema: t.schema }));
}

module.exports = { getDriver, hasDriver, listKinds, listTools, DRIVERS };
