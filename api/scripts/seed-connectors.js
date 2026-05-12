/*
 * Seed/upsert placeholder connectors.
 *
 *   node scripts/seed-connectors.js            # dry-run, org auto-detected
 *   node scripts/seed-connectors.js --apply    # execute
 *
 * Placeholder rows only — credentials/OAuth wiring comes later.
 * Idempotent: matched by (organization_id, name).
 */

const mongoose = require("mongoose");
const config = require("../src/config");
const Connector = require("../src/models/connector");
const User = require("../src/models/user");

const DEFAULT_EMAIL = "se.legoff@gmail.com";
const APPLY = process.argv.includes("--apply");
const emailArg = process.argv.find((a) => a.startsWith("--email="))?.split("=")[1];
const orgArg = process.argv.find((a) => a.startsWith("--org="))?.split("=")[1];

const CONNECTORS = [
  { name: "gmail", kind: "gmail" },
  { name: "gagenda", kind: "google_calendar" },
  { name: "jobego", kind: "jobego" },
  { name: "accounting", kind: "accounting" },
  { name: "walego", kind: "walego" },
  { name: "web", kind: "web" },
];

async function resolveCtx() {
  if (orgArg) return { orgId: orgArg, userId: null };
  const email = emailArg || DEFAULT_EMAIL;
  const user = await User.findOne({ email });
  if (!user) throw new Error(`No user found with email ${email}`);
  if (!user.organisations?.length) throw new Error(`User ${email} has no organisations`);
  const org = user.organisations[0];
  console.log(`Detected org "${org.name}" (${org.id}) for user ${email}`);
  return { orgId: org.id, userId: user._id.toString() };
}

(async function main() {
  await mongoose.connect(config.MONGO_URI);

  const { orgId, userId } = await resolveCtx();
  console.log(`\n=== Seed connectors for org ${orgId} ===`);
  console.log(APPLY ? "MODE: APPLY (writes to DB)\n" : "MODE: DRY-RUN (no writes — pass --apply to execute)\n");

  for (const c of CONNECTORS) {
    const existing = await Connector.findOne({ organization_id: orgId, name: c.name });
    if (existing) {
      console.log(`• ${c.name.padEnd(12)} exists (${existing._id}) — kind=${existing.kind}, status=${existing.status}`);
      if (APPLY && existing.kind !== c.kind) {
        existing.kind = c.kind;
        await existing.save();
        console.log(`  ↳ updated kind → ${c.kind}`);
      }
    } else {
      console.log(`• ${c.name.padEnd(12)} missing — will create (kind=${c.kind})`);
      if (APPLY) {
        const created = await Connector.create({
          name: c.name,
          kind: c.kind,
          status: "disconnected",
          organization_id: orgId,
          created_by: userId,
        });
        console.log(`  ↳ created ${created._id}`);
      }
    }
  }

  await mongoose.disconnect();
  console.log("\nDone.");
})().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
