const { buildCrud } = require("./_factory");
const CronJob = require("../models/cron-job");

module.exports = buildCrud(CronJob, {
  searchFields: ["name", "schedule", "skill_name"],
  filterFields: ["organization_id", "enabled"],
});
