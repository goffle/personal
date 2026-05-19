/*
 * Migration: align every Skill with the new folder-based file model.
 *   - Each skill gets a folder File at <skill.folder_id>.
 *   - That folder lives under a per-organization "Skills" root folder, so
 *     the data-room groups them visually instead of scattering them at root.
 *   - For skills that still have legacy File.skill_id docs, move those files
 *     into the skill's folder, parsing slashes into real sub-folders.
 *
 * Idempotent: re-running only fixes whatever still doesn't match the target
 * shape. Safe to run multiple times.
 *
 *   node scripts/migrate-skill-files.js           # dry-run
 *   node scripts/migrate-skill-files.js --apply   # execute
 */

const mongoose = require("mongoose");
const config = require("../src/config");

const APPLY = process.argv.includes("--apply");
const SKILLS_ROOT_NAME = "Skills";

async function main() {
  await mongoose.connect(config.MONGO_URI);

  const SkillCol = mongoose.connection.collection("skills");
  const FileCol = mongoose.connection.collection("files");

  const skills = await SkillCol.find({}).toArray();
  console.log(`Scanning ${skills.length} skill(s).`);

  let skillsRootsCreated = 0;
  let foldersCreated = 0;
  let foldersReparented = 0;
  let filesMoved = 0;
  let intermediateFolders = 0;

  const skillsRootCache = new Map(); // organization_id -> _id (string)
  async function ensureSkillsRoot({ organization_id, created_by }) {
    if (skillsRootCache.has(organization_id)) return skillsRootCache.get(organization_id);
    const existing = await FileCol.findOne({
      organization_id,
      parent_id: null,
      kind: "folder",
      name: SKILLS_ROOT_NAME,
    });
    if (existing) {
      const id = existing._id.toString();
      skillsRootCache.set(organization_id, id);
      return id;
    }
    if (!APPLY) {
      skillsRootCache.set(organization_id, "(would-create)");
      skillsRootsCreated++;
      return "(would-create)";
    }
    const newId = new mongoose.Types.ObjectId();
    await FileCol.insertOne({
      _id: newId,
      name: SKILLS_ROOT_NAME,
      kind: "folder",
      parent_id: null,
      content_md: "",
      organization_id,
      created_by,
      created_at: new Date(),
      updated_at: new Date(),
    });
    skillsRootsCreated++;
    const id = newId.toString();
    skillsRootCache.set(organization_id, id);
    return id;
  }

  for (const skill of skills) {
    const skillId = skill._id.toString();
    const actions = [];

    const skillsRootId = await ensureSkillsRoot({
      organization_id: skill.organization_id,
      created_by: skill.created_by,
    });

    // --- 1. Ensure the skill has a folder, and that it lives under Skills/ ---
    let folder = skill.folder_id ? await FileCol.findOne({ _id: new mongoose.Types.ObjectId(skill.folder_id) }) : null;
    let folderId = folder?._id.toString() || null;

    if (!folder) {
      if (APPLY) {
        const newId = new mongoose.Types.ObjectId();
        await FileCol.insertOne({
          _id: newId,
          name: skill.name || "Untitled skill",
          kind: "folder",
          parent_id: skillsRootId,
          content_md: "",
          organization_id: skill.organization_id,
          created_by: skill.created_by,
          created_at: new Date(),
          updated_at: new Date(),
        });
        await SkillCol.updateOne({ _id: skill._id }, { $set: { folder_id: newId.toString() } });
        folderId = newId.toString();
      }
      foldersCreated++;
      actions.push("create folder");
    } else if (folder.parent_id !== skillsRootId) {
      if (APPLY) {
        await FileCol.updateOne({ _id: folder._id }, { $set: { parent_id: skillsRootId, updated_at: new Date() } });
      }
      foldersReparented++;
      actions.push("re-parent under Skills/");
    }

    // --- 2. Move any legacy skill_id files into the folder tree -----------
    const legacyFiles = await FileCol.find({ skill_id: skillId }).toArray();
    if (legacyFiles.length && APPLY && folderId) {
      const folderCache = new Map();
      folderCache.set("", folderId);

      async function ensureFolderPath(segments) {
        let acc = "";
        let parentId = folderId;
        for (const seg of segments) {
          acc = acc ? `${acc}/${seg}` : seg;
          if (folderCache.has(acc)) {
            parentId = folderCache.get(acc);
            continue;
          }
          // Re-use a folder by that name if already present.
          const found = await FileCol.findOne({ parent_id: parentId, name: seg, kind: "folder" });
          if (found) {
            const id = found._id.toString();
            folderCache.set(acc, id);
            parentId = id;
            continue;
          }
          const newId = new mongoose.Types.ObjectId();
          await FileCol.insertOne({
            _id: newId,
            name: seg,
            kind: "folder",
            parent_id: parentId,
            content_md: "",
            organization_id: skill.organization_id,
            created_by: skill.created_by,
            created_at: new Date(),
            updated_at: new Date(),
          });
          intermediateFolders++;
          folderCache.set(acc, newId.toString());
          parentId = newId.toString();
        }
        return parentId;
      }

      for (const f of legacyFiles) {
        const path = (f.name || "").trim();
        if (!path) continue;
        const segments = path.split("/").filter(Boolean);
        const leafName = segments.pop();
        const parentId = await ensureFolderPath(segments);
        await FileCol.updateOne(
          { _id: f._id },
          {
            $set: { name: leafName, parent_id: parentId, updated_at: new Date() },
            $unset: { skill_id: "" },
          },
        );
        filesMoved++;
      }
      actions.push(`move ${legacyFiles.length} legacy file(s)`);
    } else if (legacyFiles.length) {
      actions.push(`would move ${legacyFiles.length} legacy file(s)`);
    }

    if (actions.length) {
      console.log(`  - ${skill.name} (${skillId}): ${actions.join(", ")}`);
    }
  }

  console.log("");
  console.log(`Skills roots: +${skillsRootsCreated}. Skill folders: +${foldersCreated} created, ${foldersReparented} re-parented. Files: ${filesMoved} moved, +${intermediateFolders} sub-folders.`);
  if (!APPLY) console.log("Dry-run. Pass --apply to execute.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
