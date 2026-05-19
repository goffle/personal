/*
 * One-time migration: move every Skill.files subdocument into the File collection
 * with parent_kind='skill', parent_id=<skill_id>. After insert, unset Skill.files
 * on the source document. Idempotent — skips skills already migrated.
 *
 *   node scripts/migrate-skill-files.js           # dry-run
 *   node scripts/migrate-skill-files.js --apply   # execute
 *
 * Safe to run multiple times.
 */

const mongoose = require("mongoose");
const config = require("../src/config");
const File = require("../src/models/file");

const APPLY = process.argv.includes("--apply");

async function main() {
  await mongoose.connect(config.MONGO_URI);

  // Bypass the (now files-less) Skill model by reading the raw collection.
  const SkillCol = mongoose.connection.collection("skills");
  const skills = await SkillCol.find({ files: { $exists: true, $ne: [] } }).toArray();

  console.log(`Found ${skills.length} skill(s) with embedded files.`);
  let createdTotal = 0;
  let skippedTotal = 0;

  for (const skill of skills) {
    const skillId = skill._id.toString();
    const files = skill.files || [];
    const existing = await File.find({ parent_kind: "skill", parent_id: skillId }).lean();
    const existingPaths = new Set(existing.map((f) => f.name));

    const toCreate = [];
    for (const f of files) {
      const path = (f?.path || "").trim();
      if (!path) continue;
      if (existingPaths.has(path)) {
        skippedTotal++;
        continue;
      }
      toCreate.push({
        name: path,
        kind: "file",
        parent_kind: "skill",
        parent_id: skillId,
        content_md: f.body_md || "",
        organization_id: skill.organization_id,
        created_by: skill.created_by,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    console.log(`  - ${skill.name} (${skillId}): ${files.length} embedded → ${toCreate.length} new, ${files.length - toCreate.length} already in File collection`);

    if (APPLY) {
      if (toCreate.length) {
        await File.insertMany(toCreate);
        createdTotal += toCreate.length;
      }
      await SkillCol.updateOne({ _id: skill._id }, { $unset: { files: "" } });
    }
  }

  console.log("");
  if (APPLY) {
    console.log(`Created ${createdTotal} File docs, skipped ${skippedTotal} already-present, unset files[] on ${skills.length} skill(s).`);
  } else {
    console.log("Dry-run. Pass --apply to execute.");
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
