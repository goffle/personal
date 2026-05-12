const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const router = express.Router();

const Chat = require("../models/chat");
const ChatMessage = require("../models/chat-message");
const Agent = require("../models/agent");
const config = require("../config");
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
    if (req.body.organization_id) query.organization_id = req.body.organization_id;
    if (req.body.search) query.title = { $regex: req.body.search, $options: "i" };

    const sort = req.body.sort || { last_message_at: -1 };
    const [data, total] = await Promise.all([Chat.find(query).sort(sort).skip(skip).limit(limit), Chat.countDocuments(query)]);
    return res.status(200).send({ ok: true, data, total, page, limit });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.get("/:id", auth, async (req, res) => {
  try {
    const data = await Chat.findById(req.params.id);
    if (!data) return res.status(404).send({ ok: false, code: NOT_FOUND });
    return res.status(200).send({ ok: true, data });
  } catch (err) {
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const data = await Chat.create({ ...req.body, created_by: req.user._id.toString() });
    return res.status(200).send({ ok: true, data });
  } catch (err) {
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const data = await Chat.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return res.status(200).send({ ok: true, data });
  } catch (err) {
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    await Chat.findByIdAndDelete(req.params.id);
    await ChatMessage.deleteMany({ chat_id: req.params.id });
    return res.status(200).send({ ok: true });
  } catch (err) {
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

// SSE: POST /chat/:id/stream  body { content }
// Authenticates manually (passport-jwt + cookies/header), persists the user message,
// then drives the agent turn loop (Anthropic + tools), streaming text deltas to the client.
router.post("/:id/stream", async (req, res) => {
  let user = null;
  try {
    const authHeader = req.headers.authorization || "";
    const headerToken = authHeader.startsWith("JWT ") ? authHeader.slice(4) : null;
    const token = headerToken || req.cookies?.jwt;
    if (!token) return res.status(401).send({ ok: false, code: "UNAUTHORIZED" });

    const payload = jwt.verify(token, config.JWT_SECRET);
    const User = require("../models/user");
    user = await User.findById(payload._id);
    if (!user) return res.status(401).send({ ok: false, code: "UNAUTHORIZED" });
  } catch (err) {
    return res.status(401).send({ ok: false, code: "UNAUTHORIZED" });
  }

  let sseStarted = false;
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).send({ ok: false, code: NOT_FOUND });

    const content = (req.body?.content || "").trim();
    if (!content) return res.status(400).send({ ok: false, code: "INVALID_BODY" });

    if (!chat.agent_id) return res.status(400).send({ ok: false, code: "NO_AGENT", message: "Chat has no agent bound" });
    const agent = await Agent.findById(chat.agent_id);
    if (!agent) return res.status(404).send({ ok: false, code: "AGENT_NOT_FOUND" });

    await ChatMessage.create({
      chat_id: chat._id.toString(),
      organization_id: chat.organization_id,
      role: "user",
      content,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    sseStarted = true;

    const send = (event, data) => {
      if (event) res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let aborted = false;
    req.on("close", () => { aborted = true; });

    const { assistantMessages } = await runAgentTurn({
      chat,
      agent,
      ctx: { organization_id: chat.organization_id, created_by: user._id.toString() },
      onDelta: (text) => { if (!aborted) send(null, { delta: text }); },
      onAssistant: (msg) => { if (!aborted) send("assistant_saved", { message_id: msg._id }); },
      onToolEvent: (evt) => { if (!aborted) send("tool_event", evt); },
    });

    if (!aborted) {
      const last = assistantMessages[assistantMessages.length - 1];
      send("done", { message_id: last?._id });
      res.end();
    }
  } catch (err) {
    console.error("[chat/stream]", err);
    if (!sseStarted && !res.headersSent) return res.status(500).send({ ok: false, code: SERVER_ERROR, message: err.message });
    res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    res.end();
  }
});

module.exports = router;
