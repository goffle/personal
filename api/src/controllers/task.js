const express = require("express");
const passport = require("passport");
const router = express.Router();

const Task = require("../models/task");
const Comment = require("../models/comment");
const Agent = require("../models/agent");
const Chat = require("../models/chat");
const ChatMessage = require("../models/chat-message");
const { runAgentTurn } = require("../services/chat-runner");

const SERVER_ERROR = "SERVER_ERROR";
const NOT_FOUND = "NOT_FOUND";
const auth = passport.authenticate(["user", "admin"], { session: false });

router.post("/search", auth, async (req, res) => {
  try {
    const limit = parseInt(req.body.limit) || 50;
    const page = parseInt(req.body.page) || 1;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.body.search) {
      const re = { $regex: req.body.search, $options: "i" };
      query.$or = [{ title: re }, { description: re }];
    }
    if (req.body.organization_id) query.organization_id = req.body.organization_id;
    if (Array.isArray(req.body.status)) {
      if (req.body.status.length) query.status = { $in: req.body.status };
    } else if (req.body.status) {
      query.status = req.body.status;
    }
    if (req.body.assignee_id) query.assignee_id = req.body.assignee_id;
    if (req.body.assignee_type) query.assignee_type = req.body.assignee_type;
    if (req.body.priority) query.priority = req.body.priority;
    if (req.body.entity) query.entity = req.body.entity;
    if (req.body.sprint) query.sprint = req.body.sprint;
    if (req.body.reference) query.reference = req.body.reference;

    const sort = req.body.sort || { created_at: -1 };
    const [data, total] = await Promise.all([Task.find(query).sort(sort).skip(skip).limit(limit), Task.countDocuments(query)]);
    return res.status(200).send({ ok: true, data, total, page, limit });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.get("/:id", auth, async (req, res) => {
  try {
    const data = await Task.findById(req.params.id);
    if (!data) return res.status(404).send({ ok: false, code: NOT_FOUND });
    return res.status(200).send({ ok: true, data });
  } catch (err) {
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const payload = { ...req.body, created_by: req.user._id.toString() };
    if (!payload.assignee_id) {
      payload.assignee_id = req.user._id.toString();
      payload.assignee_name = `${req.user.firstname || ""} ${req.user.lastname || ""}`.trim() || req.user.email;
      payload.assignee_type = "user";
    }
    const data = await Task.create(payload);
    return res.status(200).send({ ok: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR, message: err.message });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const data = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!data) return res.status(404).send({ ok: false, code: NOT_FOUND });
    return res.status(200).send({ ok: true, data });
  } catch (err) {
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.post("/:id/run-with-agent", auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).send({ ok: false, code: NOT_FOUND });
    if (task.assignee_type !== "agent" || !task.assignee_id) {
      return res.status(400).send({ ok: false, code: "NO_AGENT_ASSIGNEE", message: "Task must be assigned to an agent." });
    }
    const agent = await Agent.findById(task.assignee_id);
    if (!agent) return res.status(404).send({ ok: false, code: "AGENT_NOT_FOUND" });

    const chat = await Chat.create({
      title: `${task.reference} · ${task.title}`,
      organization_id: task.organization_id,
      agent_id: agent._id.toString(),
      created_by: req.user._id.toString(),
    });

    const checklistBlock = (task.checklist || []).length
      ? `\nChecklist:\n${task.checklist.map((it) => `- [${it.done ? "x" : " "}] ${it.text}`).join("\n")}`
      : null;

    const userContent = [
      `Task ${task.reference}: ${task.title}`,
      task.entity ? `Entity: ${task.entity}` : null,
      task.description ? `\n${task.description}` : null,
      checklistBlock,
      "\nPick the most relevant skill from your index (use `read_skill` to load it) and handle this task. Create sub-tasks or proposals as needed; do not take irreversible actions without confirmation. If a checklist is present, mark items done via update_task as you complete them.",
    ].filter(Boolean).join("\n");

    await ChatMessage.create({
      chat_id: chat._id.toString(),
      organization_id: chat.organization_id,
      role: "user",
      content: userContent,
    });

    // Fire-and-forget — UI navigates to the chat and polls.
    runAgentTurn({
      chat,
      agent,
      ctx: { organization_id: task.organization_id, created_by: req.user._id.toString() },
    }).catch((err) => console.error(`[task ${task.reference}] agent run failed:`, err.message));

    return res.status(200).send({ ok: true, data: { chat_id: chat._id.toString() } });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR, message: err.message });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const data = await Task.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).send({ ok: false, code: NOT_FOUND });
    await Comment.deleteMany({ task_id: req.params.id });
    return res.status(200).send({ ok: true });
  } catch (err) {
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

module.exports = router;
