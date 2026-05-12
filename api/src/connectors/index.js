const gmail = require("./gmail");
const google_calendar = require("./google_calendar");
const web = require("./web");
// Browser driver disabled until playwright is reinstalled — keeping source files
// (./browser.js, ../services/browser-session.js, ../../scripts/browser-login.js)
// dormant. To re-enable: `npm install playwright && npx playwright install chromium`
// then uncomment the require + DRIVERS entry below.
// const browser = require("./browser");

const DRIVERS = {
  gmail,
  google_calendar,
  web,
  // browser,
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
