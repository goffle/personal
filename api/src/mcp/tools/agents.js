const { z } = require("zod");
const Agent = require("../../models/agent");
const { registerCrudTools } = require("./_crud");

function registerAgentTools(server) {
  registerCrudTools(server, {
    name: "agent",
    namePlural: "agents",
    Model: Agent,
    searchFields: ["name", "reference"],
    createShape: {
      name: z.string(),
      reference: z.string().optional(),
      sound_url: z.string().optional(),
      system_prompt: z.string().optional(),
      model: z.string().optional(),
    },
    updateShape: {
      name: z.string().optional(),
      reference: z.string().optional(),
      sound_url: z.string().optional(),
      system_prompt: z.string().optional(),
      model: z.string().optional(),
    },
  });
}

module.exports = { registerAgentTools };
