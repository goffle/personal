/*
 * DISABLED — playwright dependency was uninstalled. Running this script will
 * throw at the playwright import below. Re-enable: `npm install playwright &&
 * npx playwright install chromium`.
 *
 * ---
 *
 * Bootstrap a logged-in storage_state for a `browser` connector.
 *
 * Usage:
 *   node scripts/browser-login.js <connector_id> [--url=https://app.example.com] [--keep-open]
 *
 * Opens a HEADED Chromium pointed at --url (or the first allowed_domain), waits
 * for you to log in, then captures cookies + localStorage and saves an encrypted
 * storage_state into the connector's config. From then on, server-side browser
 * sessions for that connector start already authenticated.
 *
 * Press Enter in the terminal when you're done logging in.
 */

const readline = require("readline");
const mongoose = require("mongoose");
const { chromium } = require("playwright");

const config = require("../src/config");
const Connector = require("../src/models/connector");
const { encrypt } = require("../src/utils/crypto");

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : null;
}

async function main() {
  const connectorId = process.argv[2];
  if (!connectorId || connectorId.startsWith("--")) {
    console.error("usage: node scripts/browser-login.js <connector_id> [--url=...] [--keep-open]");
    process.exit(1);
  }

  await mongoose.connect(config.MONGO_URL);
  const connector = await Connector.findById(connectorId);
  if (!connector) {
    console.error(`connector ${connectorId} not found`);
    process.exit(1);
  }
  if (connector.kind !== "browser") {
    console.error(`connector ${connectorId} has kind="${connector.kind}", expected "browser"`);
    process.exit(1);
  }
  const allowed = connector.config?.allowed_domains || [];
  const firstAllowed = allowed[0];
  const startUrl = arg("url") || (firstAllowed ? `https://${firstAllowed}` : null);
  if (!startUrl) {
    console.error("no --url and connector has no allowed_domains[0] to derive from");
    process.exit(1);
  }

  console.log(`\nLaunching headed Chromium for connector "${connector.name}" (${connector._id})`);
  console.log(`Initial URL: ${startUrl}`);
  console.log(`Allowed domains: ${allowed.join(", ") || "(none — will refuse server-side calls)"}`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: connector.config?.viewport || { width: 1280, height: 800 },
    userAgent: connector.config?.user_agent,
  });
  const page = await context.newPage();
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch((e) => {
    console.warn(`navigation warning: ${e.message}`);
  });

  console.log("\n→ Log in interactively in the browser window.");
  console.log("→ When you're done, come back here and press Enter to capture the session.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question("Press Enter when login is complete… ", () => { rl.close(); resolve(); }));

  const state = await context.storageState();
  const encrypted = encrypt(JSON.stringify(state));
  await Connector.updateOne({ _id: connector._id }, { $set: { "config.storage_state": encrypted } });

  console.log(`\nSaved encrypted storage_state to connector ${connector._id}.`);
  console.log(`  cookies: ${state.cookies?.length || 0}`);
  console.log(`  origins (localStorage): ${state.origins?.length || 0}`);

  if (process.argv.includes("--keep-open")) {
    console.log("\n--keep-open set: leaving browser open. Ctrl+C to exit.");
    await new Promise(() => {});
  }
  await context.close();
  await browser.close();
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
