const express = require("express");
const passport = require("passport");

const Skill = require("../models/skill");
const File = require("../models/file");
const { ensureSkillsRoot } = require("../services/skill-folders");

const SERVER_ERROR = "SERVER_ERROR";
const NOT_FOUND = "NOT_FOUND";
const ENTRYPOINT = "SKILL.md";

const router = express.Router();
const auth = passport.authenticate(["user", "admin"], { session: false });

// A skill's files live as regular File docs under the folder pointed to by
// skill.folder_id. Sub-folders are real File docs of kind:"folder". The REST
// contract still exposes them as a flat `files: [{_id, path, body_md}]` array
// (path = slash-joined segments) so the /skills page stays unchanged.

// ---------- Hydration -----------------------------------------------------

async function listDescendants(rootId) {
  const acc = [];
  const frontier = [rootId];
  while (frontier.length) {
    const next = [];
    const kids = await File.find({ parent_id: { $in: frontier } }).lean();
    for (const k of kids) {
      acc.push(k);
      if (k.kind === "folder") next.push(k._id.toString());
    }
    frontier.length = 0;
    frontier.push(...next);
  }
  return acc;
}

function buildPaths(rootId, descendants) {
  const byId = new Map(descendants.map((d) => [d._id.toString(), d]));
  function pathOf(node) {
    const segments = [node.name];
    let cur = node;
    while (cur.parent_id && cur.parent_id !== rootId) {
      cur = byId.get(cur.parent_id);
      if (!cur) break;
      segments.unshift(cur.name);
    }
    return segments.join("/");
  }
  return descendants
    .filter((d) => d.kind === "file")
    .map((f) => ({ _id: f._id, path: pathOf(f), body_md: f.content_md || "" }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function hydrateOne(skill) {
  if (!skill) return skill;
  const obj = typeof skill.toObject === "function" ? skill.toObject() : { ...skill };
  if (!skill.folder_id) {
    obj.files = [];
    return obj;
  }
  const descendants = await listDescendants(skill.folder_id);
  obj.files = buildPaths(skill.folder_id, descendants);
  return obj;
}

async function hydrateMany(skills) {
  return Promise.all(skills.map(hydrateOne));
}

// ---------- Sync ----------------------------------------------------------

// Ensure the chain of folder names `segments` exists under `rootId`, creating
// any missing ones. Returns the leaf folder _id.
async function ensureFolderChain({ rootId, segments, organization_id, created_by }) {
  let parent = rootId;
  for (const name of segments) {
    let folder = await File.findOne({ parent_id: parent, name, kind: "folder" });
    if (!folder) {
      folder = await File.create({ name, kind: "folder", parent_id: parent, organization_id, created_by });
    }
    parent = folder._id.toString();
  }
  return parent;
}

// Diff incoming {path, body_md}[] against the current tree under skill.folder_id.
// Upsert by path, delete any paths no longer present. Always ensures SKILL.md
// exists at the root so freshly created skills are never empty.
async function syncSkillFiles({ skill, incoming, user }) {
  const rootId = skill.folder_id;
  if (!rootId) throw new Error(`skill ${skill._id} has no folder_id`);

  const items = Array.isArray(incoming) ? incoming.slice() : [];
  if (!items.some((it) => (it?.path || "").trim() === ENTRYPOINT)) {
    items.unshift({ path: ENTRYPOINT, body_md: "" });
  }

  // Index current files by reconstructed path.
  const descendants = await listDescendants(rootId);
  const current = buildPaths(rootId, descendants);
  const byPath = new Map();
  const fileById = new Map(descendants.map((d) => [d._id.toString(), d]));
  for (const f of current) byPath.set(f.path, fileById.get(f._id.toString()));

  const seen = new Set();
  for (const item of items) {
    const path = (item?.path || "").trim();
    if (!path) continue;
    if (seen.has(path)) continue;
    seen.add(path);

    const body = item.body_md || "";
    const existing = byPath.get(path);
    if (existing) {
      if (existing.content_md !== body) {
        await File.findByIdAndUpdate(existing._id, { content_md: body });
      }
      continue;
    }

    const segments = path.split("/").filter(Boolean);
    const leafName = segments.pop();
    const parentId = await ensureFolderChain({
      rootId,
      segments,
      organization_id: skill.organization_id,
      created_by: user?._id?.toString(),
    });
    await File.create({
      name: leafName,
      kind: "file",
      parent_id: parentId,
      content_md: body,
      organization_id: skill.organization_id,
      created_by: user?._id?.toString(),
    });
  }

  const toDelete = current.filter((f) => !seen.has(f.path)).map((f) => f._id);
  if (toDelete.length) await File.deleteMany({ _id: { $in: toDelete } });
}

async function createSkillFolder({ name, organization_id, created_by }) {
  const parentId = await ensureSkillsRoot({ organization_id, created_by });
  return await File.create({ name, kind: "folder", parent_id: parentId, organization_id, created_by });
}

// ---------- Routes --------------------------------------------------------

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
    const created_by = req.user._id.toString();
    const folder = await createSkillFolder({
      name: skillFields.name || "Untitled skill",
      organization_id: skillFields.organization_id,
      created_by,
    });
    const skill = await Skill.create({ ...skillFields, folder_id: folder._id.toString(), created_by });
    await syncSkillFiles({ skill, incoming: files, user: req.user });
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
    if (patch.name && skill.folder_id) {
      await File.findByIdAndUpdate(skill.folder_id, { name: patch.name });
    }
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
    if (skill.folder_id) {
      const descendants = await listDescendants(skill.folder_id);
      const ids = descendants.map((d) => d._id.toString());
      ids.push(skill.folder_id);
      await File.deleteMany({ _id: { $in: ids } });
    }
    return res.status(200).send({ ok: true });
  } catch (err) {
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

module.exports = router;
