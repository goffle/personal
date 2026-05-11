const { buildCrud } = require("./_factory");
const Organization = require("../models/organization");

module.exports = buildCrud(Organization, {
  searchFields: ["name"],
  filterFields: [],
});
