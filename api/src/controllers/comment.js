const express = require("express");
const passport = require("passport");
const router = express.Router();

const Comment = require("../models/comment");
const Task = require("../models/task");

const SERVER_ERROR = "SERVER_ERROR";
const NOT_FOUND = "NOT_FOUND";
const auth = passport.authenticate(["user", "admin"], { session: false });

router.post("/search", auth, async (req, res) => {
  try {
    const limit = parseInt(req.body.limit) || 100;
    const page = parseInt(req.body.page) || 1;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.body.task_id) query.task_id = req.body.task_id;
    if (req.body.organization_id) query.organization_id = req.body.organization_id;

    const [data, total] = await Promise.all([Comment.find(query).sort({ created_at: 1 }).skip(skip).limit(limit), Comment.countDocuments(query)]);
    return res.status(200).send({ ok: true, data, total, page, limit });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const payload = {
      ...req.body,
      author_id: req.user._id.toString(),
      author_name: `${req.user.firstname || ""} ${req.user.lastname || ""}`.trim() || req.user.email,
    };
    const data = await Comment.create(payload);
    if (data.task_id) await Task.findByIdAndUpdate(data.task_id, { $inc: { comment_count: 1 } });
    return res.status(200).send({ ok: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const data = await Comment.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).send({ ok: false, code: NOT_FOUND });
    if (data.task_id) await Task.findByIdAndUpdate(data.task_id, { $inc: { comment_count: -1 } });
    return res.status(200).send({ ok: true });
  } catch (err) {
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

module.exports = router;
