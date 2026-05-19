/*
 * One-time backfill: set category = "KPI" on every skill whose name starts with "kpi" (case-insensitive)
 * and that does not already have a category.
 *
 *   node scripts/backfill-skill-category.js            # dry-run
 *   node scripts/backfill-skill-category.js --apply    # execute
 *
 * Safe to run multiple times.
 */

const mongoose = require("mongoose");
const config = require("../src/config");
const Skill = require("../src/models/skill");

const APPLY = process.argv.includes("--apply");

async function main() {
  await mongoose.connect(config.MONGO_URI);

  const matches = await Skill.find({ name: { $regex: "^kpi", $options: "i" } }).lean();
  const todo = matches.filter((s) => !s.category);

  console.log(`Found ${matches.length} kpi-prefixed skills, ${todo.length} without a category.`);
  for (const s of todo) console.log(`  - ${s.name} (${s._id})`);

  if (!APPLY) {
    console.log("\nDry-run. Pass --apply to update.");
    await mongoose.disconnect();
    return;
  }

  if (todo.length === 0) {
    console.log("Nothing to update.");
    await mongoose.disconnect();
    return;
  }

  const ids = todo.map((s) => s._id);
  const r = await Skill.updateMany({ _id: { $in: ids } }, { $set: { category: "KPI" } });
  console.log(`Updated ${r.modifiedCount} skill(s).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
