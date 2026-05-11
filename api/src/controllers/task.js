const express = require("express");
const passport = require("passport");
const router = express.Router();

const Task = require("../models/task");
const Comment = require("../models/comment");

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
    if (req.body.status) query.status = req.body.status;
    if (req.body.assignee_id) query.assignee_id = req.body.assignee_id;
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
    const data = await Task.create({ ...req.body, created_by: req.user._id.toString() });
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
