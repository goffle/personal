/*
 * Seed/upsert the "inbox-triage" skill on the Chief of Staff agent.
 *
 *   node scripts/seed-inbox-triage-skill.js            # dry-run
 *   node scripts/seed-inbox-triage-skill.js --apply    # execute
 *
 * Idempotent: looks up by (organization_id, agent_id, name) and updates in place.
 */

const mongoose = require("mongoose");
const config = require("../src/config");
const Agent = require("../src/models/agent");
const Skill = require("../src/models/skill");
const User = require("../src/models/user");

const DEFAULT_EMAIL = "se.legoff@gmail.com";
const APPLY = process.argv.includes("--apply");

const SKILL_NAME = "inbox-triage";
const SKILL_DESCRIPTION = "Read unread emails from the last 24h, classify by entity and importance, propose one action per thread.";

const SKILL_BODY = `# Inbox triage

Va chercher tous les emails non lus depuis les dernières 24h via le connecteur \`gmail\` (utilise les tools Gmail disponibles).

Pour chaque thread :

1. **Entity** — \`walego\` / \`selego\` / \`jobego\` / \`tirana\` / \`tochet\` / \`admin\` / \`perso\` / \`other\`
2. **Importance** — \`high\` (décision/action < 24h), \`medium\` (cette semaine), \`low\` (info, archivable)
3. **Action proposée** (une seule) :
   - \`reply\` — propose un brouillon court (3-5 lignes max), ton aligné avec les threads passés du même expéditeur si visible
   - \`task\` — crée une Task via \`create_task\` :
     - \`title\` : verbe + objet, max 60 chars
     - \`entity\` : la même que ci-dessus
     - \`description\` : 1-2 lignes de contexte + lien Gmail vers le thread
     - \`external_id\` : \`gmail:<thread_id>\` (idempotent — skip si déjà existant)
   - \`archive\` — rien à faire, juste signaler dans le compte
   - \`wait\` — Seb doit lire mais pas d'action

## Format de sortie

- D'abord tous les \`high\`, dans l'ordre d'urgence (tous entités confondues)
- Puis chaque entité avec ses \`medium\`
- Puis un compte des \`low\` (juste le total par entité, pas le détail)

Pour chaque \`reply\`, mets le brouillon en bloc citation (\`>\`) sous l'item.

**Ne réponds à aucun email automatiquement.** Tu proposes, Seb valide.
`;

(async function main() {
  await mongoose.connect(config.MONGO_URI);

  const user = await User.findOne({ email: DEFAULT_EMAIL });
  if (!user) throw new Error(`No user found with email ${DEFAULT_EMAIL}`);
  const org = user.organisations?.[0];
  if (!org) throw new Error(`User ${DEFAULT_EMAIL} has no organisations`);
  const orgId = org.id;
  console.log(`Org: ${org.name} (${orgId})`);

  const agent = await Agent.findOne({ organization_id: orgId, reference: "chief-of-staff" });
  if (!agent) throw new Error("Chief of Staff agent not found — run seed-chief-of-staff.js --apply first.");
  const agentId = agent._id.toString();
  console.log(`Agent: ${agent.name} (${agentId})`);

  console.log(APPLY ? "\nMODE: APPLY (writes to DB)\n" : "\nMODE: DRY-RUN (no writes — pass --apply to execute)\n");

  const existing = await Skill.findOne({ organization_id: orgId, agent_id: agentId, name: SKILL_NAME });
  const payload = {
    name: SKILL_NAME,
    description: SKILL_DESCRIPTION,
    body_md: SKILL_BODY,
    agent_id: agentId,
    organization_id: orgId,
  };

  if (existing) {
    console.log(`Found existing skill ${existing._id} — will refresh.`);
    if (APPLY) {
      Object.assign(existing, payload);
      await existing.save();
      console.log(`Updated skill ${existing._id}.`);
    }
  } else {
    console.log("No existing skill — will create.");
    if (APPLY) {
      const created = await Skill.create({ ...payload, created_by: user._id.toString() });
      console.log(`Created skill ${created._id}.`);
    }
  }

  await mongoose.disconnect();
  console.log("\nDone.");
})().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
