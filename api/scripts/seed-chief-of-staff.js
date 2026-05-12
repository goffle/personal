/*
 * Seed/upsert the "Chief of Staff" agent.
 *
 *   node scripts/seed-chief-of-staff.js            # dry-run, org auto-detected
 *   node scripts/seed-chief-of-staff.js --apply    # execute
 *
 * Placeholder: no connectors wired yet — those come next.
 * Idempotent: re-running keeps the same _id and refreshes the prompt.
 */

const mongoose = require("mongoose");
const config = require("../src/config");
const Agent = require("../src/models/agent");
const Connector = require("../src/models/connector");
const User = require("../src/models/user");

const DEFAULT_EMAIL = "se.legoff@gmail.com";
const APPLY = process.argv.includes("--apply");
const emailArg = process.argv.find((a) => a.startsWith("--email="))?.split("=")[1];
const orgArg = process.argv.find((a) => a.startsWith("--org="))?.split("=")[1];

const NAME = "Chief of Staff";
const DESCRIPTION = "Daily brief, inbox triage, calendar review, and task routing across all entities.";
const REFERENCE = "chief-of-staff";
const MODEL = "claude-sonnet-4-6";
const CONNECTOR_NAMES = ["gmail", "gagenda"];

const SYSTEM_PROMPT = `You are Seb's Chief of Staff.

Your job is to keep Seb's day under control across his entities (Walego, Selego, Jobego, Tirana, Tochet, Admin) by triaging incoming signals (email, calendar, tasks) and producing a short, decision-oriented briefing.

Operating principles:
- Assistive by default. You draft, propose, and surface — you never send emails or accept meetings without explicit confirmation.
- Be terse. Seb reads fast; favour bullets over prose, decisions over descriptions.
- Tag every item with its entity (walego / selego / jobego / tirana / tochet / admin / other).
- When you spot something actionable, create a Task with a clear title, the right entity, and the source link in the description. Use external_id to stay idempotent.
- When in doubt, ask one sharp question rather than guess.

Tools and connectors will be wired in progressively. For now, work from whatever context the user provides.`;

async function resolveOrgId() {
  if (orgArg) return orgArg;
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

  const { orgId, userId } = await resolveOrgId();
  console.log(`\n=== Seed Chief of Staff for org ${orgId} ===`);
  console.log(APPLY ? "MODE: APPLY (writes to DB)\n" : "MODE: DRY-RUN (no writes — pass --apply to execute)\n");

  const existing = await Agent.findOne({ organization_id: orgId, reference: REFERENCE });

  const connectorDocs = await Connector.find({ organization_id: orgId, name: { $in: CONNECTOR_NAMES } }).lean();
  const connectors = CONNECTOR_NAMES
    .map((name) => connectorDocs.find((c) => c.name === name))
    .filter(Boolean)
    .map((c) => ({ id: c._id.toString(), name: c.name }));
  const missing = CONNECTOR_NAMES.filter((n) => !connectors.find((c) => c.name === n));
  if (missing.length) console.log(`WARN: missing connectors ${missing.join(", ")} — run seed-connectors.js first.`);
  console.log(`Will link ${connectors.length} connector(s): ${connectors.map((c) => c.name).join(", ") || "(none)"}\n`);

  const payload = {
    name: NAME,
    description: DESCRIPTION,
    reference: REFERENCE,
    model: MODEL,
    system_prompt: SYSTEM_PROMPT,
    connectors,
    organization_id: orgId,
  };

  if (existing) {
    console.log(`Found existing agent ${existing._id} — will refresh fields.`);
    if (APPLY) {
      Object.assign(existing, payload);
      await existing.save();
      console.log(`Updated agent ${existing._id}.`);
    }
  } else {
    console.log("No existing agent — will create.");
    if (APPLY) {
      const created = await Agent.create({ ...payload, created_by: userId });
      console.log(`Created agent ${created._id}.`);
    }
  }

  await mongoose.disconnect();
  console.log("\nDone.");
})().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
