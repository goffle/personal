const { z } = require("zod");
const Skill = require("../../models/skill");
const { registerCrudTools } = require("./_crud");

function registerSkillTools(server) {
  registerCrudTools(server, {
    name: "skill",
    namePlural: "skills",
    Model: Skill,
    searchFields: ["name", "description"],
    extraFilters: {
      agent_id: { type: z.string(), field: "agent_id" },
    },
    createShape: {
      name: z.string(),
      description: z.string().optional(),
      body_md: z.string().optional(),
      agent_id: z.string().optional().describe("ID of the agent this skill belongs to"),
    },
    updateShape: {
      name: z.string().optional(),
      description: z.string().optional(),
      body_md: z.string().optional(),
      agent_id: z.string().optional(),
    },
  });
}

module.exports = { registerSkillTools };
