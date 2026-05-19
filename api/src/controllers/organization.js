const express = require("express");
const passport = require("passport");

const Organization = require("../models/organization");
const User = require("../models/user");
const { slugify } = require("../utils");

const SERVER_ERROR = "SERVER_ERROR";
const NOT_FOUND = "NOT_FOUND";
const FORBIDDEN = "FORBIDDEN";

const router = express.Router();
const auth = passport.authenticate(["user", "admin"], { session: false });

function membership(req, orgId) {
  return (req.user.organisations || []).find((o) => o.id === orgId);
}

router.post("/search", auth, async (req, res) => {
  try {
    const ids = (req.user.organisations || []).map((o) => o.id);
    const query = { _id: { $in: ids } };
    if (req.body.search) query.name = { $regex: req.body.search, $options: "i" };

    const limit = parseInt(req.body.limit) || 25;
    const page = parseInt(req.body.page) || 1;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Organization.find(query).sort({ created_at: -1 }).skip(skip).limit(limit),
      Organization.countDocuments(query),
    ]);
    return res.status(200).send({ ok: true, data, total, page, limit });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.get("/:id", auth, async (req, res) => {
  try {
    if (!membership(req, req.params.id)) return res.status(403).send({ ok: false, code: FORBIDDEN });
    const data = await Organization.findById(req.params.id);
    if (!data) return res.status(404).send({ ok: false, code: NOT_FOUND });
    return res.status(200).send({ ok: true, data });
  } catch (err) {
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).send({ ok: false, code: "INVALID_BODY", message: "Name is required" });

    const org = await Organization.create({
      name,
      slug: slugify(name) + "-" + Date.now().toString(36),
      created_by: req.user._id.toString(),
    });

    req.user.organisations.push({ id: org._id.toString(), name: org.name, role: "owner" });
    await req.user.save();

    return res.status(200).send({ ok: true, data: org });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR, message: err.message });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const m = membership(req, req.params.id);
    if (!m || (m.role !== "owner" && m.role !== "admin")) return res.status(403).send({ ok: false, code: FORBIDDEN });

    const update = {};
    if (req.body.name !== undefined) update.name = req.body.name;

    const data = await Organization.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!data) return res.status(404).send({ ok: false, code: NOT_FOUND });

    if (update.name) {
      await User.updateMany({ "organisations.id": data._id.toString() }, { $set: { "organisations.$.name": data.name } });
    }
    return res.status(200).send({ ok: true, data });
  } catch (err) {
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

module.exports = router;
