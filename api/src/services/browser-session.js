/*
 * DISABLED — playwright dependency was uninstalled. This file is dormant.
 * Requiring it will throw at the `require("playwright")` line below until you
 * run: `npm install playwright && npx playwright install chromium`
 * and re-enable the driver registration in src/connectors/index.js.
 *
 * ---
 *
 * In-process browser session manager.
 *
 * - One headless Chromium per server process (lazy-launched).
 * - One BrowserContext per connector — siblings on different connectors get
 *   isolated cookie/localStorage jars.
 * - Per-connector mutex (`withSessionLock`) so concurrent chats on the same
 *   connector serialize instead of fighting over the same Page.
 * - Optional persisted storage_state: if connector.config.storage_state is
 *   set (encrypted JSON), it's loaded on context creation; on closeSession
 *   we capture the current state and persist it back (still encrypted).
 *   Bootstrap a logged-in storage_state with scripts/browser-login.js.
 * - Idle GC closes contexts that haven't been touched in IDLE_MS.
 */

const { chromium } = require("playwright");
const Connector = require("../models/connector");
const { encrypt, decrypt } = require("../utils/crypto");

const IDLE_MS = 5 * 60 * 1000;
const MAX_CONTEXTS = 5;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

let browserPromise = null;
const sessions = new Map(); // connectorId -> { context, page, lastUsedAt }
const locks = new Map(); // connectorId -> Promise chain (mutex tail)
let gcTimer = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

function startGcLoop() {
  if (gcTimer) return;
  gcTimer = setInterval(async () => {
    const now = Date.now();
    for (const [id, sess] of sessions.entries()) {
      if (now - sess.lastUsedAt > IDLE_MS) {
        // closeSessionById persists storage_state before tearing the context down.
        try { await closeSessionById(id); } catch (_e) { /* ignore */ }
      }
    }
  }, 60_000);
  gcTimer.unref?.();
}

function decodeStorageState(connector) {
  const raw = connector.config?.storage_state;
  if (!raw) return undefined;
  try {
    const decrypted = decrypt(raw);
    return JSON.parse(decrypted);
  } catch (e) {
    console.warn(`[browser-session] failed to decode storage_state for connector ${connector._id}:`, e.message);
    return undefined;
  }
}

async function getOrCreateSession(connector) {
  const id = connector._id.toString();
  const existing = sessions.get(id);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing;
  }
  if (sessions.size >= MAX_CONTEXTS) {
    throw new Error(`browser session limit reached (${MAX_CONTEXTS}) — close an existing context first`);
  }
  const browser = await getBrowser();
  const cfg = connector.config || {};
  const context = await browser.newContext({
    viewport: cfg.viewport || DEFAULT_VIEWPORT,
    userAgent: cfg.user_agent,
    acceptDownloads: false,
    storageState: decodeStorageState(connector),
  });
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (/\.(exe|dmg|zip|tar|gz|iso|pkg|deb|rpm|msi)(\?|$)/i.test(url)) {
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  const sess = { context, page, lastUsedAt: Date.now(), connectorId: id, persistOnClose: Boolean(cfg.storage_state) };
  sessions.set(id, sess);
  startGcLoop();
  return sess;
}

/**
 * Acquire the per-connector mutex, get (or create) the session, run fn, release.
 * Errors are propagated to the caller but never poison the lock chain.
 *
 * @param {object} connector
 * @param {(sess: {context, page}) => Promise<any>} fn
 */
async function withSessionLock(connector, fn) {
  const id = connector._id.toString();
  const prev = locks.get(id) || Promise.resolve();
  const next = prev.then(async () => {
    const sess = await getOrCreateSession(connector);
    return await fn(sess);
  });
  locks.set(id, next.catch(() => {}));
  return await next;
}

async function persistStorageState(sess) {
  if (!sess?.persistOnClose) return;
  try {
    const state = await sess.context.storageState();
    const encrypted = encrypt(JSON.stringify(state));
    await Connector.updateOne(
      { _id: sess.connectorId },
      { $set: { "config.storage_state": encrypted } },
    );
  } catch (e) {
    console.warn(`[browser-session] failed to persist storage_state for ${sess.connectorId}:`, e.message);
  }
}

async function closeSessionById(connectorId) {
  const sess = sessions.get(connectorId);
  if (!sess) return false;
  sessions.delete(connectorId);
  await persistStorageState(sess);
  await sess.context.close().catch(() => {});
  return true;
}

async function closeSession(connector) {
  return closeSessionById(connector._id.toString());
}

function assertDomainAllowed(url, allowedDomains) {
  if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) {
    throw new Error("browser connector requires config.allowed_domains (non-empty list of hostnames or suffix patterns)");
  }
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`invalid url: ${url}`);
  }
  const host = u.hostname.toLowerCase();
  const ok = allowedDomains.some((d) => {
    const dd = String(d).toLowerCase().trim();
    if (!dd) return false;
    return host === dd || host.endsWith(`.${dd}`);
  });
  if (!ok) throw new Error(`domain "${host}" not in connector allowed_domains`);
}

module.exports = { withSessionLock, closeSession, assertDomainAllowed };
