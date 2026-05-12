/*
 * Rename the Mongo collection "messages" → "chatmessages" to match the new
 * mongoose model name (ChatMessage). Safe and idempotent: if the destination
 * already exists or the source is absent, the script reports and exits 0.
 *
 *   node scripts/migrate-messages-to-chatmessages.js            # dry-run
 *   node scripts/migrate-messages-to-chatmessages.js --apply    # execute
 */

const mongoose = require("mongoose");
const config = require("../src/config");

const APPLY = process.argv.includes("--apply");
const FROM = "messages";
const TO = "chatmessages";

(async function main() {
  await mongoose.connect(config.MONGO_URI);
  const db = mongoose.connection.db;

  const collections = (await db.listCollections().toArray()).map((c) => c.name);
  const hasFrom = collections.includes(FROM);
  const hasTo = collections.includes(TO);

  console.log(`From "${FROM}": ${hasFrom ? "present" : "absent"}`);
  console.log(`To   "${TO}": ${hasTo ? "present" : "absent"}`);

  if (!hasFrom) {
    console.log("\nNothing to do — source collection does not exist.");
    return mongoose.disconnect();
  }
  if (hasTo) {
    const toCount = await db.collection(TO).countDocuments();
    const fromCount = await db.collection(FROM).countDocuments();
    console.log(`\nDestination already exists with ${toCount} docs (source has ${fromCount}).`);
    console.log("Refusing to merge automatically. If you really want to migrate, drop one of the collections first.");
    return mongoose.disconnect();
  }

  const fromCount = await db.collection(FROM).countDocuments();
  console.log(`\nWill rename "${FROM}" (${fromCount} docs) → "${TO}".`);
  console.log(APPLY ? "MODE: APPLY\n" : "MODE: DRY-RUN (no writes — pass --apply to execute)\n");

  if (APPLY) {
    await db.collection(FROM).rename(TO);
    console.log(`Renamed. "${TO}" now has ${await db.collection(TO).countDocuments()} docs.`);
  }

  await mongoose.disconnect();
  console.log("\nDone.");
})().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
