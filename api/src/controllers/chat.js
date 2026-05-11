const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const router = express.Router();

const Chat = require("../models/chat");
const Message = require("../models/message");
const config = require("../config");

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
    await Message.deleteMany({ chat_id: req.params.id });
    return res.status(200).send({ ok: true });
  } catch (err) {
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

// SSE: POST /chat/:id/stream  body { content }
// Authenticates manually (passport-jwt + cookies/header), persists the user message,
// then streams an echo response token-by-token.
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

  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).send({ ok: false, code: NOT_FOUND });

    const content = (req.body?.content || "").trim();
    if (!content) return res.status(400).send({ ok: false, code: "INVALID_BODY" });

    await Message.create({
      chat_id: chat._id.toString(),
      organization_id: chat.organization_id,
      role: "user",
      content,
    });

    const assistantMsg = await Message.create({
      chat_id: chat._id.toString(),
      organization_id: chat.organization_id,
      role: "assistant",
      content: "",
      streaming: true,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const reply = `You said: "${content}". This is a placeholder echo until the LLM client is wired in.`;
    const tokens = reply.split(/(\s+)/);

    let full = "";
    let i = 0;
    const interval = setInterval(async () => {
      if (i >= tokens.length) {
        clearInterval(interval);
        assistantMsg.content = full;
        assistantMsg.streaming = false;
        await assistantMsg.save();
        await Chat.findByIdAndUpdate(chat._id, { last_message_at: new Date() });
        res.write(`event: done\ndata: ${JSON.stringify({ message_id: assistantMsg._id })}\n\n`);
        res.end();
        return;
      }
      const delta = tokens[i++];
      full += delta;
      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    }, 40);

    req.on("close", () => clearInterval(interval));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) return res.status(500).send({ ok: false, code: SERVER_ERROR });
    res.end();
  }
});

module.exports = router;
