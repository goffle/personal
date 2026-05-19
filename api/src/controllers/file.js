const { buildCrud } = require("./_factory");
const File = require("../models/file");
const Skill = require("../models/skill");

// Recursively collect all File _ids under the given folder (inclusive).
async function collectDescendants(folderId) {
  const acc = [folderId];
  const frontier = [folderId];
  while (frontier.length) {
    const next = [];
    const kids = await File.find({ parent_id: { $in: frontier } }, { _id: 1 }).lean();
    for (const k of kids) {
      const id = k._id.toString();
      acc.push(id);
      next.push(id);
    }
    frontier.length = 0;
    frontier.push(...next);
  }
  return acc;
}

module.exports = buildCrud(File, {
  searchFields: ["name", "content_md"],
  filterFields: ["organization_id", "parent_id", "kind"],
  defaultSort: { kind: 1, name: 1 },
  beforeDelete: async (doc) => {
    if (doc.kind === "folder") {
      // Reject if this folder, or anything under it, is owned by a Skill.
      const descendants = await collectDescendants(doc._id.toString());
      const owned = await Skill.findOne({ folder_id: { $in: descendants } }, { name: 1 }).lean();
      if (owned) {
        throw {
          status: 409,
          code: "FOLDER_OWNED_BY_SKILL",
          message: `Folder is managed by skill "${owned.name}". Delete the skill instead.`,
        };
      }
    }
  },
  afterDelete: async (id) => {
    // Cascade: remove all descendants of a deleted folder. Safe even when the
    // deleted doc was a file (no descendants → no-op).
    const descendants = await collectDescendants(id);
    if (descendants.length > 1) {
      await File.deleteMany({ _id: { $in: descendants.slice(1) } });
    }
  },
});
