const { z } = require("zod");
const CronJob = require("../../models/cron-job");
const { registerCrudTools } = require("./_crud");

function registerCronJobTools(server) {
  registerCrudTools(server, {
    name: "cron_job",
    namePlural: "cron_jobs",
    Model: CronJob,
    searchFields: ["name", "schedule", "skill_name"],
    extraFilters: {
      enabled: { type: z.boolean(), field: "enabled" },
    },
    createShape: {
      name: z.string(),
      schedule: z.string().describe("Cron expression, e.g. '0 9 * * *'"),
      skill_id: z.string().optional(),
      skill_name: z.string().optional(),
      params: z.record(z.any()).optional(),
      enabled: z.boolean().optional(),
    },
    updateShape: {
      name: z.string().optional(),
      schedule: z.string().optional(),
      skill_id: z.string().optional(),
      skill_name: z.string().optional(),
      params: z.record(z.any()).optional(),
      enabled: z.boolean().optional(),
    },
  });
}

module.exports = { registerCronJobTools };
