/*
 * Data-room reorg.
 *
 *   node scripts/dataroom-reorg.js            # dry-run, org auto-detected
 *   node scripts/dataroom-reorg.js --apply    # execute
 *
 * Plan (idempotent):
 *   1. Rename root folder "Dataroom" → "Self"
 *   2. Rename "00 — Self (Sébastien)" → "00 — Perso" (inside Self)
 *   3. Create root folder "Documentation" if missing
 *   4. Move "CLAUDE.md (Karpathy guidelines)" (or any CLAUDE.md*) into Documentation
 *   5. Delete root strays: "qqq", empty "aa"
 */

const mongoose = require("mongoose");
const config = require("../src/config");
const File = require("../src/models/file");
const User = require("../src/models/user");

const DEFAULT_EMAIL = "se.legoff@gmail.com";
const APPLY = process.argv.includes("--apply");
const emailArg = process.argv.find((a) => a.startsWith("--email="))?.split("=")[1];
const orgArg = process.argv.find((a) => a.startsWith("--org="))?.split("=")[1];

const SELF_NAME = "Self";
const DOC_NAME = "Documentation";
const PERSO_NAME = "00 — Perso";
const STRAY_NAMES = ["qqq", "aa"];

async function resolveOrgId() {
  if (orgArg) return orgArg;
  const email = emailArg || DEFAULT_EMAIL;
  const user = await User.findOne({ email });
  if (!user) throw new Error(`No user found with email ${email}`);
  if (!user.organisations?.length) throw new Error(`User ${email} has no organisations`);
  const org = user.organisations[0];
  console.log(`Detected org "${org.name}" (${org.id}) for user ${email}`);
  return org.id;
}

(async function main() {
  await mongoose.connect(config.MONGO_URI);

  const ORG_ID = await resolveOrgId();
  console.log(`\n=== Data-room reorg for org ${ORG_ID} ===`);
  console.log(APPLY ? "MODE: APPLY (writes to DB)\n" : "MODE: DRY-RUN (no writes — pass --apply to execute)\n");

  const all = await File.find({ organization_id: ORG_ID }).lean();
  const rootItems = all.filter((it) => it.parent_id == null);
  console.log(`Found ${all.length} items total (${rootItems.length} at root).\n`);

  const childCount = (parentId) => all.filter((it) => it.parent_id === String(parentId)).length;
  const plan = [];

  // 1. Rename Dataroom → Self
  const dataroom = rootItems.find((it) => it.kind === "folder" && it.name === "Dataroom");
  const existingSelf = rootItems.find((it) => it.kind === "folder" && it.name === SELF_NAME);
  let selfId;
  if (existingSelf) {
    selfId = existingSelf._id.toString();
  } else if (dataroom) {
    plan.push({ op: "rename", _id: dataroom._id.toString(), from: dataroom.name, to: SELF_NAME });
    selfId = dataroom._id.toString();
  } else {
    plan.push({ op: "create", name: SELF_NAME, parentId: null, placeholder: "__SELF__" });
    selfId = "__SELF__";
  }

  // 2. Rename "00 — Self (Sébastien)" → "00 — Perso" (inside Self)
  const oldPerso = all.find((it) => it.kind === "folder" && /^00 — Self/.test(it.name));
  if (oldPerso && oldPerso.name !== PERSO_NAME) {
    plan.push({ op: "rename", _id: oldPerso._id.toString(), from: oldPerso.name, to: PERSO_NAME });
  }

  // 3. Create Documentation at root if missing
  let docId;
  const existingDoc = rootItems.find((it) => it.kind === "folder" && it.name === DOC_NAME);
  if (existingDoc) {
    docId = existingDoc._id.toString();
  } else {
    plan.push({ op: "create", name: DOC_NAME, parentId: null, placeholder: "__DOC__" });
    docId = "__DOC__";
  }

  // 4. Move any root file starting with "CLAUDE.md" into Documentation
  for (const it of rootItems) {
    if (it.kind === "file" && /^CLAUDE\.md/i.test(it.name)) {
      plan.push({ op: "move", _id: it._id.toString(), item: it.name, into: DOC_NAME, newParent: docId });
    }
  }

  // 5. Delete strays at root
  for (const name of STRAY_NAMES) {
    const it = rootItems.find((x) => x.name === name);
    if (!it) continue;
    if (it.kind === "folder" && childCount(it._id) > 0) {
      console.log(`(skip delete "${it.name}": folder has ${childCount(it._id)} children)`);
      continue;
    }
    plan.push({ op: "delete", _id: it._id.toString(), item: it.name });
  }

  // ── Print plan ─────────────────────────────────────────────────────────────
  if (plan.length === 0) {
    console.log("Nothing to do — data room already organized.\n");
  } else {
    console.log("Plan:");
    for (const s of plan) {
      if (s.op === "create") console.log(`  + create folder "${s.name}" ${s.parentId == null ? "at root" : "inside " + s.parentId}`);
      else if (s.op === "rename") console.log(`  ✎ rename "${s.from}" → "${s.to}"`);
      else if (s.op === "move") console.log(`  → move   "${s.item}"  →  "${s.into}/"`);
      else if (s.op === "delete") console.log(`  ✗ delete "${s.item}"`);
    }
    console.log();
  }

  if (!APPLY) {
    console.log("Re-run with --apply to execute.\n");
    await mongoose.disconnect();
    return;
  }

  // ── Execute ─────────────────────────────────────────────────────────────────
  const realIds = {};
  const resolve = (v) => (typeof v === "string" && v.startsWith("__") ? realIds[v] : v);

  for (const s of plan.filter((x) => x.op === "create")) {
    const doc = await File.create({ name: s.name, kind: "folder", parent_id: resolve(s.parentId), organization_id: ORG_ID });
    realIds[s.placeholder] = doc._id.toString();
    console.log(`  ✓ created "${s.name}" (${doc._id})`);
  }

  for (const s of plan.filter((x) => x.op === "rename")) {
    await File.findByIdAndUpdate(s._id, { name: s.to });
    console.log(`  ✓ renamed "${s.from}" → "${s.to}"`);
  }

  for (const s of plan.filter((x) => x.op === "move")) {
    await File.findByIdAndUpdate(s._id, { parent_id: resolve(s.newParent) });
    console.log(`  ✓ moved "${s.item}" → "${s.into}/"`);
  }

  for (const s of plan.filter((x) => x.op === "delete")) {
    await File.findByIdAndDelete(s._id);
    console.log(`  ✓ deleted "${s.item}"`);
  }

  console.log("\nDone.\n");
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
