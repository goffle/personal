const { buildCrud } = require("./_factory");
const File = require("../models/file");

module.exports = buildCrud(File, {
  searchFields: ["name", "content_md"],
  filterFields: ["organization_id", "parent_id", "kind"],
  defaultSort: { kind: 1, name: 1 },
});
