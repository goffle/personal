const cron = require("node-cron");

const CronJob = require("../models/cron-job");
const Skill = require("../models/skill");
const File = require("../models/file");
const Agent = require("../models/agent");
const Chat = require("../models/chat");
const ChatMessage = require("../models/chat-message");
const { runAgentTurn } = require("./chat-runner");

const SKILL_ENTRYPOINT = "SKILL.md";

const tasks = new Map();

async function runJob(jobId) {
  const job = await CronJob.findById(jobId);
  if (!job) return { ok: false, error: "job_not_found" };

  const result = { chat_id: null };

  try {
    const skill = job.skill_id ? await Skill.findById(job.skill_id) : null;
    if (!skill) throw new Error(`skill ${job.skill_id} not found`);

    const agent = job.agent_id ? await Agent.findById(job.agent_id) : null;
    if (!agent) throw new Error(`agent ${job.agent_id} not found`);

    const chat = await Chat.create({
      title: `${job.name} · ${new Date().toLocaleString()}`,
      organization_id: job.organization_id,
      agent_id: agent._id.toString(),
      created_by: job.created_by,
    });
    result.chat_id = chat._id.toString();

    const entryFile = skill.folder_id
      ? await File.findOne({ parent_id: skill.folder_id, name: SKILL_ENTRYPOINT }).lean()
      : null;
    await ChatMessage.create({
      chat_id: chat._id.toString(),
      organization_id: job.organization_id,
      role: "user",
      content: entryFile?.content_md || skill.description || skill.name,
    });

    await runAgentTurn({
      chat,
      agent,
      ctx: { organization_id: job.organization_id, created_by: job.created_by },
    });

    job.last_run_at = new Date();
    job.last_run_status = "ok";
    job.last_run_chat_id = result.chat_id;
    await job.save();

    console.log(`[scheduler] ran cron ${job._id} (${job.name}) → chat ${result.chat_id}`);
    return { ok: true, chat_id: result.chat_id };
  } catch (err) {
    console.error(`[scheduler] cron ${job._id} (${job.name}) failed:`, err.message);
    job.last_run_at = new Date();
    job.last_run_status = `error: ${err.message}`;
    job.last_run_chat_id = result.chat_id || null;
    await job.save();
    return { ok: false, error: err.message };
  }
}

function register(job) {
  unregister(job._id.toString());
  if (!job.enabled) return;
  if (!cron.validate(job.schedule)) {
    console.warn(`[scheduler] invalid cron expression for job ${job._id}: ${job.schedule}`);
    return;
  }
  const task = cron.schedule(job.schedule, () => runJob(job._id.toString()), { timezone: process.env.TZ || "Europe/Paris" });
  tasks.set(job._id.toString(), task);
  console.log(`[scheduler] registered cron ${job._id} (${job.name}) on "${job.schedule}"`);
}

function unregister(jobId) {
  const existing = tasks.get(jobId);
  if (!existing) return;
  existing.stop();
  tasks.delete(jobId);
}

async function init() {
  const jobs = await CronJob.find({ enabled: true });
  for (const job of jobs) register(job);
  console.log(`[scheduler] initialized with ${jobs.length} job(s)`);
}

module.exports = { init, register, unregister, runJob };
