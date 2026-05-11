const { buildCrud } = require("./_factory");
const Tool = require("../models/tool");

module.exports = buildCrud(Tool, {
  searchFields: ["name", "description"],
  filterFields: ["organization_id"],
});
