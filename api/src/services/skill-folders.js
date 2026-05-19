const File = require("../models/file");

const SKILLS_ROOT_NAME = "Skills";

// All skill folders for an organization live nested under a single top-level
// "Skills" folder, so the data-room shows them grouped instead of mixed with
// user content at the workspace root. This helper finds-or-creates that root.
async function ensureSkillsRoot({ organization_id, created_by }) {
  const existing = await File.findOne({
    organization_id,
    parent_id: null,
    kind: "folder",
    name: SKILLS_ROOT_NAME,
  });
  if (existing) return existing._id.toString();
  const folder = await File.create({
    name: SKILLS_ROOT_NAME,
    kind: "folder",
    parent_id: null,
    organization_id,
    created_by,
  });
  return folder._id.toString();
}

module.exports = { ensureSkillsRoot, SKILLS_ROOT_NAME };
