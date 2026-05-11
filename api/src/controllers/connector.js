const { buildCrud } = require("./_factory");
const Connector = require("../models/connector");

module.exports = buildCrud(Connector, {
  searchFields: ["name", "kind"],
  filterFields: ["organization_id", "status", "kind"],
});
