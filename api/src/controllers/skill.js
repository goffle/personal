const express = require("express");
const passport = require("passport");

const Skill = require("../models/skill");
const File = require("../models/file");

const SERVER_ERROR = "SERVER_ERROR";
const NOT_FOUND = "NOT_FOUND";

const router = express.Router();
const auth = passport.authenticate(["user", "admin"], { session: false });

// Files belonging to skills live as top-level File docs with parent_kind='skill'.
// The REST contract still exposes them as an embedded `files: [{_id, path, body_md}]`
// array so the skills page in the app keeps working unchanged.

function fileToSkillFile(file) {
  return { _id: file._id, path: file.name, body_md: file.content_md || "" };
}

async function hydrateOne(skill) {
  if (!skill) return skill;
  const files = await File.find({ parent_kind: "skill", parent_id: skill._id.toString() }).sort({ name: 1 }).lean();
  const obj = typeof skill.toObject === "function" ? skill.toObject() : { ...skill };
  obj.files = files.map(fileToSkillFile);
  return obj;
}

async function hydrateMany(skills) {
  if (!skills.length) return skills;
  const ids = skills.map((s) => s._id.toString());
  const files = await File.find({ parent_kind: "skill", parent_id: { $in: ids } }).sort({ name: 1 }).lean();
  const byParent = new Map();
  for (const f of files) {
    if (!byParent.has(f.parent_id)) byParent.set(f.parent_id, []);
    byParent.get(f.parent_id).push(fileToSkillFile(f));
  }
  return skills.map((s) => {
    const obj = typeof s.toObject === "function" ? s.toObject() : { ...s };
    obj.files = byParent.get(s._id.toString()) || [];
    return obj;
  });
}

// Diff incoming {path, body_md}[] against current File docs for this skill.
// Upsert by path, delete any paths no longer present.
async function syncSkillFiles({ skill, incoming, user }) {
  const skillId = skill._id.toString();
  const existing = await File.find({ parent_kind: "skill", parent_id: skillId });
  const byPath = new Map(existing.map((f) => [f.name, f]));

  const seen = new Set();
  for (const item of incoming) {
    const path = (item?.path || "").trim();
    if (!path) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    const body = item.body_md || "";
    const current = byPath.get(path);
    if (current) {
      if (current.content_md !== body) {
        current.content_md = body;
        await current.save();
      }
    } else {
      await File.create({
        name: path,
        kind: "file",
        parent_kind: "skill",
        parent_id: skillId,
        content_md: body,
        organization_id: skill.organization_id,
        created_by: user?._id?.toString(),
      });
    }
  }

  const toDelete = existing.filter((f) => !seen.has(f.name)).map((f) => f._id);
  if (toDelete.length) await File.deleteMany({ _id: { $in: toDelete } });
}

router.post("/search", auth, async (req, res) => {
  try {
    const limit = parseInt(req.body.limit) || 25;
    const page = parseInt(req.body.page) || 1;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.body.search) {
      const re = { $regex: req.body.search, $options: "i" };
      query.$or = [{ name: re }, { description: re }];
    }
    for (const f of ["organization_id", "agent_id", "category"]) {
      if (req.body[f] !== undefined && req.body[f] !== null && req.body[f] !== "") query[f] = req.body[f];
    }

    const sort = req.body.sort || { created_at: -1 };
    const [skills, total] = await Promise.all([Skill.find(query).sort(sort).skip(skip).limit(limit), Skill.countDocuments(query)]);
    const data = await hydrateMany(skills);
    return res.status(200).send({ ok: true, data, total, page, limit });
  } catch (err) {
    console.error("[skill/search]", err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.get("/:id", auth, async (req, res) => {
  try {
    const skill = await Skill.findById(req.params.id);
    if (!skill) return res.status(404).send({ ok: false, code: NOT_FOUND });
    const data = await hydrateOne(skill);
    return res.status(200).send({ ok: true, data });
  } catch (err) {
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const { files, ...skillFields } = req.body || {};
    const skill = await Skill.create({ ...skillFields, created_by: req.user._id.toString() });
    if (Array.isArray(files)) {
      await syncSkillFiles({ skill, incoming: files, user: req.user });
    }
    const data = await hydrateOne(skill);
    return res.status(200).send({ ok: true, data });
  } catch (err) {
    console.error("[skill/create]", err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR, message: err.message });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const { files, ...patch } = req.body || {};
    const skill = await Skill.findByIdAndUpdate(req.params.id, patch, { new: true });
    if (!skill) return res.status(404).send({ ok: false, code: NOT_FOUND });
    if (Array.isArray(files)) {
      await syncSkillFiles({ skill, incoming: files, user: req.user });
    }
    const data = await hydrateOne(skill);
    return res.status(200).send({ ok: true, data });
  } catch (err) {
    console.error("[skill/update]", err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const skill = await Skill.findByIdAndDelete(req.params.id);
    if (!skill) return res.status(404).send({ ok: false, code: NOT_FOUND });
    await File.deleteMany({ parent_kind: "skill", parent_id: req.params.id });
    return res.status(200).send({ ok: true });
  } catch (err) {
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

module.exports = router;
