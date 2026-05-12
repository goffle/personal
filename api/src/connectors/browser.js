/*
 * DISABLED — playwright dependency was uninstalled. Driver not registered in
 * connectors/index.js. Re-enable: `npm install playwright && npx playwright
 * install chromium`, then uncomment the require + DRIVERS entry in index.js.
 *
 * ---
 *
 * Browser automation driver. Wraps Playwright as agent tools.
 *
 * Each tool acquires the per-connector session mutex (via withSessionLock)
 * so two chats hitting the same connector serialize cleanly. Session state
 * (cookies/localStorage) is persisted across server restarts if the connector
 * config has a storage_state — bootstrap one with scripts/browser-login.js.
 *
 * Mandatory allowed_domains config — refuses navigation outside the list.
 *
 * Locator strategy for click/type:
 *   - role + name (accessibility, robust to refactors) — preferred
 *   - selector (CSS) — fallback
 * The agent should ALWAYS call browser.snapshot first to discover what
 * roles/names exist before acting blind.
 */

const { withSessionLock, closeSession, assertDomainAllowed } = require("../services/browser-session");

const NAV_TIMEOUT = 30_000;
const ACT_TIMEOUT = 10_000;
const DEFAULT_SNAPSHOT_CHARS = 6000;

async function snapshot(page, maxChars) {
  const yaml = await page.locator("body").ariaSnapshot();
  if (yaml.length <= maxChars) return yaml;
  return yaml.slice(0, maxChars) + `\n# … truncated (${yaml.length - maxChars} chars omitted)`;
}

function locate(page, args) {
  if (args.role && args.name) return page.getByRole(args.role, { name: args.name });
  if (args.role) return page.getByRole(args.role);
  if (args.text) return page.getByText(args.text);
  if (args.selector) return page.locator(args.selector);
  throw new Error("locator required: pass role+name, role, text, or selector");
}

async function test(connector) {
  assertDomainAllowed("https://example.com", connector.config?.allowed_domains);
  return withSessionLock(connector, async ({ page }) => {
    await page.goto("https://example.com", { timeout: NAV_TIMEOUT, waitUntil: "domcontentloaded" });
    return { ok: true, title: await page.title() };
  });
}

const tools = [
  {
    name: "browser.navigate",
    description:
      "Navigate the agent's persistent browser to a URL (within the connector's allowed_domains). Returns the resolved URL, page title, and a truncated accessibility snapshot you can use to find elements.",
    schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        snapshot_chars: { type: "integer", default: DEFAULT_SNAPSHOT_CHARS },
      },
      required: ["url"],
    },
    async handler(connector, args) {
      assertDomainAllowed(args.url, connector.config?.allowed_domains);
      return withSessionLock(connector, async ({ page }) => {
        await page.goto(args.url, { timeout: NAV_TIMEOUT, waitUntil: "domcontentloaded" });
        return {
          url: page.url(),
          title: await page.title(),
          snapshot: await snapshot(page, args.snapshot_chars || DEFAULT_SNAPSHOT_CHARS),
        };
      });
    },
  },
  {
    name: "browser.snapshot",
    description:
      "Get an accessibility-tree snapshot of the current page (YAML-ish, with refs). Call this before browser.click / browser.type to discover what roles and names exist. Truncated to max_chars.",
    schema: {
      type: "object",
      properties: { max_chars: { type: "integer", default: DEFAULT_SNAPSHOT_CHARS } },
    },
    async handler(connector, args) {
      return withSessionLock(connector, async ({ page }) => ({
        url: page.url(),
        snapshot: await snapshot(page, args.max_chars || DEFAULT_SNAPSHOT_CHARS),
      }));
    },
  },
  {
    name: "browser.click",
    description:
      "Click an element. Prefer role+name (e.g. role='button', name='Sign in'); fall back to a CSS selector when no accessible name exists.",
    schema: {
      type: "object",
      properties: {
        role: { type: "string", description: "ARIA role (button, link, textbox, etc.)" },
        name: { type: "string", description: "Accessible name (label or visible text)" },
        text: { type: "string", description: "Fallback: visible text to match" },
        selector: { type: "string", description: "Fallback: CSS selector" },
      },
    },
    async handler(connector, args) {
      return withSessionLock(connector, async ({ page }) => {
        await locate(page, args).click({ timeout: ACT_TIMEOUT });
        return { clicked: true, url: page.url(), title: await page.title() };
      });
    },
  },
  {
    name: "browser.type",
    description:
      "Type text into an input/textarea. Same locator strategy as click. Set submit=true to press Enter after typing.",
    schema: {
      type: "object",
      properties: {
        role: { type: "string" },
        name: { type: "string" },
        selector: { type: "string" },
        text: { type: "string" },
        submit: { type: "boolean", default: false },
      },
      required: ["text"],
    },
    async handler(connector, args) {
      return withSessionLock(connector, async ({ page }) => {
        const loc = locate(page, args);
        await loc.fill(args.text, { timeout: ACT_TIMEOUT });
        if (args.submit) await loc.press("Enter", { timeout: ACT_TIMEOUT });
        return { typed: true, url: page.url() };
      });
    },
  },
  {
    name: "browser.get_text",
    description:
      "Read the visible text of the current page or a sub-element (via role/selector). Useful to extract content after navigation.",
    schema: {
      type: "object",
      properties: {
        role: { type: "string" },
        name: { type: "string" },
        selector: { type: "string" },
        max_chars: { type: "integer", default: 8000 },
      },
    },
    async handler(connector, args) {
      return withSessionLock(connector, async ({ page }) => {
        let text;
        if (args.role || args.selector || args.name) {
          text = await locate(page, args).innerText({ timeout: ACT_TIMEOUT });
        } else {
          text = await page.locator("body").innerText({ timeout: ACT_TIMEOUT });
        }
        const max = args.max_chars || 8000;
        if (text.length > max) text = text.slice(0, max) + `\n… truncated (${text.length - max} chars omitted)`;
        return { url: page.url(), text };
      });
    },
  },
  {
    name: "browser.screenshot",
    description:
      "Capture a PNG of the current viewport (or full page if full_page=true). The image is delivered as a real image block in the tool result — the model can see it directly. Use sparingly: images cost more tokens than text.",
    schema: {
      type: "object",
      properties: { full_page: { type: "boolean", default: false } },
    },
    async handler(connector, args) {
      return withSessionLock(connector, async ({ page }) => {
        const buf = await page.screenshot({ fullPage: !!args.full_page, type: "png" });
        const base64 = buf.toString("base64");
        // _content is a runner-recognized hint: it forwards the array as the tool_result
        // content directly (Anthropic accepts mixed image+text blocks in tool_result).
        return {
          _content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: base64 } },
            { type: "text", text: `Screenshot of ${page.url()} (${buf.length} bytes)` },
          ],
          url: page.url(),
          bytes: buf.length,
        };
      });
    },
  },
  {
    name: "browser.close",
    description: "Close the agent's browser context (persists storage_state to the connector if configured). The next browser.* call spins up a fresh one.",
    schema: { type: "object", properties: {} },
    async handler(connector) {
      const closed = await closeSession(connector);
      return { closed };
    },
  },
];

module.exports = {
  kind: "browser",
  test,
  tools,
};
