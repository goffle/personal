const { z } = require("zod");
const Connector = require("../../models/connector");
const { registerCrudTools } = require("./_crud");

function registerConnectorTools(server) {
  registerCrudTools(server, {
    name: "connector",
    namePlural: "connectors",
    Model: Connector,
    searchFields: ["name", "kind"],
    extraFilters: {
      kind: { type: z.string(), field: "kind" },
      status: { type: z.enum(["connected", "disconnected", "error"]), field: "status" },
    },
    createShape: {
      name: z.string(),
      kind: z.string().optional(),
    },
    updateShape: {
      name: z.string().optional(),
      kind: z.string().optional(),
      status: z.enum(["connected", "disconnected", "error"]).optional(),
    },
  });
}

module.exports = { registerConnectorTools };
