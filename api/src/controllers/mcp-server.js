const { buildCrud } = require("./_factory");
const McpServer = require("../models/mcp-server");

module.exports = buildCrud(McpServer, {
  searchFields: ["name", "url"],
  filterFields: ["organization_id", "status", "transport"],
});
