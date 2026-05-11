const { buildCrud } = require("./_factory");
const Agent = require("../models/agent");

module.exports = buildCrud(Agent, {
  searchFields: ["name", "reference"],
  filterFields: ["organization_id"],
});
