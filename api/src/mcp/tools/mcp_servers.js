const { z } = require("zod");
const McpServer = require("../../models/mcp-server");
const { registerCrudTools } = require("./_crud");

function registerMcpServerTools(server) {
  registerCrudTools(server, {
    name: "mcp_server",
    namePlural: "mcp_servers",
    Model: McpServer,
    searchFields: ["name", "url"],
    extraFilters: {
      transport: { type: z.enum(["http", "sse", "stdio"]), field: "transport" },
      status: { type: z.enum(["connected", "disconnected", "error"]), field: "status" },
    },
    createShape: {
      name: z.string(),
      url: z.string(),
      transport: z.enum(["http", "sse", "stdio"]).optional(),
    },
    updateShape: {
      name: z.string().optional(),
      url: z.string().optional(),
      transport: z.enum(["http", "sse", "stdio"]).optional(),
      status: z.enum(["connected", "disconnected", "error"]).optional(),
    },
  });
}

module.exports = { registerMcpServerTools };
