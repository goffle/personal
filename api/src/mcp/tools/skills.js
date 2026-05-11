const { z } = require("zod");
const Skill = require("../../models/skill");
const { registerCrudTools } = require("./_crud");

function registerSkillTools(server) {
  registerCrudTools(server, {
    name: "skill",
    namePlural: "skills",
    Model: Skill,
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

module.exports = { registerSkillTools };
