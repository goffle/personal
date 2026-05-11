const { buildCrud } = require("./_factory");
const Skill = require("../models/skill");

module.exports = buildCrud(Skill, {
  searchFields: ["name", "description"],
  filterFields: ["organization_id"],
});
