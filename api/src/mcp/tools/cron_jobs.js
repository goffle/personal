const { z } = require("zod");
const CronJob = require("../../models/cron-job");
const { registerCrudTools } = require("./_crud");
const { formatResult, formatError, resolveCaller } = require("./_shared");
const scheduler = require("../../services/scheduler");

function registerCronJobTools(server) {
  registerCrudTools(server, {
    name: "cron_job",
    namePlural: "cron_jobs",
    Model: CronJob,
    searchFields: ["name", "schedule", "skill_name"],
    extraFilters: {
      enabled: { type: z.boolean(), field: "enabled" },
      agent_id: { type: z.string(), field: "agent_id" },
    },
    createShape: {
      name: z.string(),
      schedule: z.string().describe("Cron expression, e.g. '0 9 * * *'"),
      skill_id: z.string().optional(),
      skill_name: z.string().optional(),
      agent_id: z.string().optional().describe("ID of the agent this schedule runs against"),
      params: z.record(z.any()).optional(),
      enabled: z.boolean().optional(),
    },
    updateShape: {
      name: z.string().optional(),
      schedule: z.string().optional(),
      skill_id: z.string().optional(),
      skill_name: z.string().optional(),
      agent_id: z.string().optional(),
      params: z.record(z.any()).optional(),
      enabled: z.boolean().optional(),
    },
  });

  server.tool(
    "run_cron_job",
    "Trigger a cron job immediately (out-of-schedule manual run). Creates a chat with the linked agent and posts the skill body as a user message.",
    { id: z.string() },
    async (params, extra) => {
      try {
        const { organizationId } = await resolveCaller(extra);
        const job = await CronJob.findById(params.id);
        if (!job) return formatError("cron_job not found");
        if (job.organization_id && job.organization_id !== organizationId) return formatError("cron_job not in caller's workspace");
        const result = await scheduler.runJob(params.id);
        if (!result.ok) return formatError(result.error || "run failed");
        return formatResult({ ran: true, chat_id: result.chat_id });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );
}

module.exports = { registerCronJobTools };
