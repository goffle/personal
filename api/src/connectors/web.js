const { decrypt } = require("../utils/crypto");

const DEFAULT_PROVIDER = "tavily";
const DEFAULT_FETCH_MAX_CHARS = 8000;

function getApiKey(connector) {
  const cfg = connector.config || {};
  if (!cfg.api_key) return null;
  return decrypt(cfg.api_key);
}

function htmlToText(html) {
  return String(html)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function searchTavily(apiKey, query, maxResults) {
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: maxResults }),
  });
  if (!r.ok) throw new Error(`tavily search failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return (j.results || []).map((x) => ({ title: x.title, url: x.url, snippet: x.content }));
}

async function searchBrave(apiKey, query, maxResults) {
  const u = new URL("https://api.search.brave.com/res/v1/web/search");
  u.searchParams.set("q", query);
  u.searchParams.set("count", String(maxResults));
  const r = await fetch(u, { headers: { "X-Subscription-Token": apiKey, Accept: "application/json" } });
  if (!r.ok) throw new Error(`brave search failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return (j.web?.results || []).map((x) => ({ title: x.title, url: x.url, snippet: x.description }));
}

async function searchSerper(apiKey, query, maxResults) {
  const r = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: maxResults }),
  });
  if (!r.ok) throw new Error(`serper search failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return (j.organic || []).map((x) => ({ title: x.title, url: x.link, snippet: x.snippet }));
}

async function runSearch(connector, query, maxResults) {
  const apiKey = getApiKey(connector);
  if (!apiKey) throw new Error("missing api_key in connector config");
  const provider = connector.config?.provider || DEFAULT_PROVIDER;
  if (provider === "tavily") return searchTavily(apiKey, query, maxResults);
  if (provider === "brave") return searchBrave(apiKey, query, maxResults);
  if (provider === "serper") return searchSerper(apiKey, query, maxResults);
  throw new Error(`unsupported provider: ${provider}`);
}

async function test(connector) {
  const results = await runSearch(connector, "hello world", 1);
  return { provider: connector.config?.provider || DEFAULT_PROVIDER, sample: results[0] || null };
}

const tools = [
  {
    name: "web.search",
    description: "Search the web and return a list of {title, url, snippet} results.",
    schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query." },
        max_results: { type: "integer", default: 5, minimum: 1, maximum: 20 },
      },
      required: ["query"],
    },
    async handler(connector, args) {
      const results = await runSearch(connector, args.query, args.max_results || 5);
      return { results };
    },
  },
  {
    name: "web.fetch",
    description: "Fetch a URL and return its text content (HTML stripped). Useful for reading articles after a search.",
    schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Absolute URL to fetch." },
        max_chars: { type: "integer", default: DEFAULT_FETCH_MAX_CHARS, minimum: 200, maximum: 50000 },
      },
      required: ["url"],
    },
    async handler(_connector, args) {
      const url = args.url;
      if (!/^https?:\/\//i.test(url)) throw new Error("url must start with http:// or https://");
      const r = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; JeeveBot/1.0)" },
      });
      const status = r.status;
      const contentType = r.headers.get("content-type") || "";
      const raw = await r.text();
      const max = args.max_chars || DEFAULT_FETCH_MAX_CHARS;
      const body = contentType.includes("html") ? htmlToText(raw) : raw;
      return {
        url,
        status,
        content_type: contentType,
        truncated: body.length > max,
        text: body.slice(0, max),
      };
    },
  },
];

module.exports = {
  kind: "web",
  test,
  tools,
};
