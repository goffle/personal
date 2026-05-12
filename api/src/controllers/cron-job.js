const express = require("express");
const passport = require("passport");

const { buildCrud } = require("./_factory");
const CronJob = require("../models/cron-job");
const scheduler = require("../services/scheduler");

const router = express.Router();
const auth = passport.authenticate(["user", "admin"], { session: false });

router.post("/:id/run", auth, async (req, res) => {
  try {
    const job = await CronJob.findById(req.params.id);
    if (!job) return res.status(404).send({ ok: false, code: "NOT_FOUND" });
    const result = await scheduler.runJob(req.params.id);
    if (!result.ok) return res.status(500).send({ ok: false, code: "RUN_FAILED", message: result.error });
    return res.status(200).send({ ok: true, data: result });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: "SERVER_ERROR", message: err.message });
  }
});

const crud = buildCrud(CronJob, {
  searchFields: ["name", "schedule", "skill_name"],
  filterFields: ["organization_id", "agent_id", "enabled"],
  afterCreate: (doc) => scheduler.register(doc),
  afterUpdate: (doc) => scheduler.register(doc),
  afterDelete: (id) => scheduler.unregister(id),
});

router.use(crud);

module.exports = router;
