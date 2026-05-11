const { z } = require("zod");
const Tool = require("../../models/tool");
const { registerCrudTools } = require("./_crud");

function registerToolTools(server) {
  registerCrudTools(server, {
    name: "tool",
    namePlural: "tools",
    Model: Tool,
    searchFields: ["name", "description"],
    createShape: {
      name: z.string(),
      description: z.string().optional(),
      body_md: z.string().optional(),
    },
    updateShape: {
      name: z.string().optional(),
      description: z.string().optional(),
      body_md: z.string().optional(),
    },
  });
}

module.exports = { registerToolTools };
