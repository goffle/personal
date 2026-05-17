const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, API_URL } = require("../config");
const { encrypt, decrypt } = require("../utils/crypto");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://gmail.googleapis.com/gmail/v1";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

function redirectUri() {
  return `${API_URL}/connector/oauth/google/callback`;
}

function buildAuthUrl(state) {
  if (!GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID is not set");
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error(`token exchange failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error(`token refresh failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function fetchUserEmail(accessToken) {
  const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) return null;
  const j = await r.json();
  return j.email || null;
}

function persistTokens(connector, tokenResp, accountEmail) {
  const now = Date.now();
  const cfg = connector.config || {};
  const next = {
    ...cfg,
    account_email: accountEmail || cfg.account_email,
    access_token: tokenResp.access_token ? encrypt(tokenResp.access_token) : cfg.access_token,
    expires_at: tokenResp.expires_in ? now + tokenResp.expires_in * 1000 - 60_000 : cfg.expires_at,
    scope: tokenResp.scope || cfg.scope,
  };
  if (tokenResp.refresh_token) next.refresh_token = encrypt(tokenResp.refresh_token);
  connector.config = next;
}

async function getAccessToken(connector) {
  const cfg = connector.config || {};
  if (!cfg.refresh_token) throw new Error("connector not connected");
  if (cfg.access_token && cfg.expires_at && cfg.expires_at > Date.now()) {
    return decrypt(cfg.access_token);
  }
  const refresh = decrypt(cfg.refresh_token);
  const tok = await refreshAccessToken(refresh);
  persistTokens(connector, tok);
  await connector.save();
  return decrypt(connector.config.access_token);
}

async function test(connector) {
  const token = await getAccessToken(connector);
  const r = await fetch(`${API_BASE}/users/me/profile`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`gmail profile failed: ${r.status}`);
  return r.json();
}

function decodeBase64Url(s) {
  if (!s) return "";
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf-8");
}

function extractBodyFromPayload(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = extractBodyFromPayload(part);
      if (found) return found;
    }
  }
  if (payload.body?.data && (!payload.mimeType || payload.mimeType.startsWith("text/"))) {
    return decodeBase64Url(payload.body.data);
  }
  return "";
}

function headerValue(message, name) {
  const h = (message.payload?.headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

function summarizeMessage(message) {
  return {
    id: message.id,
    thread_id: message.threadId,
    message_id: headerValue(message, "Message-Id") || headerValue(message, "Message-ID"),
    from: headerValue(message, "From"),
    to: headerValue(message, "To"),
    subject: headerValue(message, "Subject"),
    date: headerValue(message, "Date"),
    snippet: message.snippet || "",
    label_ids: message.labelIds || [],
  };
}

function bracketedMessageId(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  return trimmed.startsWith("<") ? trimmed : `<${trimmed}>`;
}

function encodeRfc822(message) {
  const lines = [];
  if (message.to) lines.push(`To: ${message.to}`);
  if (message.cc) lines.push(`Cc: ${message.cc}`);
  if (message.subject) lines.push(`Subject: ${message.subject}`);
  const inReplyTo = bracketedMessageId(message.in_reply_to_message_id);
  if (inReplyTo) {
    lines.push(`In-Reply-To: ${inReplyTo}`);
    const refs = message.references ? `${message.references} ${inReplyTo}` : inReplyTo;
    lines.push(`References: ${refs}`);
  }
  lines.push("MIME-Version: 1.0");
  lines.push("Content-Type: text/plain; charset=UTF-8");
  lines.push("");
  lines.push(message.body || "");
  const raw = lines.join("\r\n");
  return Buffer.from(raw, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const tools = [
  {
    name: "gmail.search_threads",
    description: "Search Gmail threads using Gmail query syntax (e.g. 'is:unread newer_than:1d'). Returns thread ids and snippets.",
    schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query." },
        max_results: { type: "integer", default: 20, minimum: 1, maximum: 100 },
      },
      required: ["query"],
    },
    async handler(connector, args) {
      const token = await getAccessToken(connector);
      const u = new URL(`${API_BASE}/users/me/threads`);
      u.searchParams.set("q", args.query || "");
      u.searchParams.set("maxResults", String(args.max_results || 20));
      const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`gmail search failed: ${r.status} ${await r.text()}`);
      const j = await r.json();
      return { result_size_estimate: j.resultSizeEstimate || 0, threads: (j.threads || []).map((t) => ({ id: t.id, snippet: t.snippet || "" })) };
    },
  },
  {
    name: "gmail.get_thread",
    description: "Fetch a Gmail thread by id. Returns subject, participants and each message's headers + plain-text body.",
    schema: {
      type: "object",
      properties: {
        thread_id: { type: "string" },
        format: { type: "string", enum: ["summary", "full"], default: "full", description: "'summary' omits message bodies." },
      },
      required: ["thread_id"],
    },
    async handler(connector, args) {
      const token = await getAccessToken(connector);
      const r = await fetch(`${API_BASE}/users/me/threads/${encodeURIComponent(args.thread_id)}?format=full`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`gmail get_thread failed: ${r.status} ${await r.text()}`);
      const j = await r.json();
      const messages = (j.messages || []).map((m) => {
        const base = summarizeMessage(m);
        if (args.format === "summary") return base;
        return { ...base, body: extractBodyFromPayload(m.payload) };
      });
      return { thread_id: j.id, subject: headerValue(j.messages?.[0] || {}, "Subject"), message_count: messages.length, messages };
    },
  },
  {
    name: "gmail.create_draft",
    description: "Create a Gmail draft. Use thread_id + in_reply_to_message_id when replying to an existing thread; omit them for a new outbound draft. After creating, show the recipient/subject/body to the user and wait for explicit confirmation before calling gmail.send_draft.",
    schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient (comma-separated allowed)." },
        cc: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
        thread_id: { type: "string", description: "Optional Gmail thread id to attach the draft to." },
        in_reply_to_message_id: {
          type: "string",
          description: "RFC822 Message-Id header of the message being replied to (e.g. '<CABc...@mail.gmail.com>'). Returned as `message_id` by gmail.get_thread. Required for correct threading in non-Gmail clients.",
        },
        references: {
          type: "string",
          description: "Optional pre-existing References header value to chain ancestry. The in_reply_to_message_id is appended automatically.",
        },
      },
      required: ["body"],
    },
    async handler(connector, args) {
      const token = await getAccessToken(connector);
      const raw = encodeRfc822({
        to: args.to,
        cc: args.cc,
        subject: args.subject,
        body: args.body,
        in_reply_to_message_id: args.in_reply_to_message_id,
        references: args.references,
      });
      const payload = { message: { raw, ...(args.thread_id ? { threadId: args.thread_id } : {}) } };
      const r = await fetch(`${API_BASE}/users/me/drafts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`gmail create_draft failed: ${r.status} ${await r.text()}`);
      const j = await r.json();
      return {
        draft_id: j.id,
        message_id: j.message?.id,
        thread_id: j.message?.threadId,
        preview: { to: args.to || "", cc: args.cc || "", subject: args.subject || "", body: args.body || "" },
      };
    },
  },
  {
    name: "gmail.update_draft",
    description: "Replace the contents of an existing Gmail draft. PUT semantics — fields you omit are cleared. Use this when the user asks to tweak a draft before sending so you don't litter the drafts folder with stale copies.",
    schema: {
      type: "object",
      properties: {
        draft_id: { type: "string" },
        to: { type: "string" },
        cc: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
        thread_id: { type: "string" },
        in_reply_to_message_id: { type: "string" },
        references: { type: "string" },
      },
      required: ["draft_id", "body"],
    },
    async handler(connector, args) {
      const token = await getAccessToken(connector);
      const raw = encodeRfc822({
        to: args.to,
        cc: args.cc,
        subject: args.subject,
        body: args.body,
        in_reply_to_message_id: args.in_reply_to_message_id,
        references: args.references,
      });
      const payload = { message: { raw, ...(args.thread_id ? { threadId: args.thread_id } : {}) } };
      const r = await fetch(`${API_BASE}/users/me/drafts/${encodeURIComponent(args.draft_id)}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`gmail update_draft failed: ${r.status} ${await r.text()}`);
      const j = await r.json();
      return {
        draft_id: j.id,
        message_id: j.message?.id,
        thread_id: j.message?.threadId,
        preview: { to: args.to || "", cc: args.cc || "", subject: args.subject || "", body: args.body || "" },
      };
    },
  },
  {
    name: "gmail.send_draft",
    description: "Send an existing Gmail draft. ONLY call this after the user has reviewed the draft body and recipients and explicitly asked to send (e.g. 'send it', 'envoie', 'go'). Sent email cannot be unsent. Never chain create_draft + send_draft in the same turn — pause and confirm first.",
    schema: {
      type: "object",
      properties: {
        draft_id: { type: "string", description: "Draft id returned by gmail.create_draft (or gmail.update_draft)." },
      },
      required: ["draft_id"],
    },
    async handler(connector, args) {
      const token = await getAccessToken(connector);
      const r = await fetch(`${API_BASE}/users/me/drafts/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: args.draft_id }),
      });
      if (r.status === 404) throw new Error(`gmail send_draft: draft ${args.draft_id} not found (may have been deleted or already sent)`);
      if (!r.ok) throw new Error(`gmail send_draft failed: ${r.status} ${await r.text()}`);
      const j = await r.json();
      return { sent: true, message_id: j.id, thread_id: j.threadId, label_ids: j.labelIds || [] };
    },
  },
  {
    name: "gmail.delete_draft",
    description: "Delete a Gmail draft without sending it. Use when the user discards or rewrites a draft you created.",
    schema: {
      type: "object",
      properties: { draft_id: { type: "string" } },
      required: ["draft_id"],
    },
    async handler(connector, args) {
      const token = await getAccessToken(connector);
      const r = await fetch(`${API_BASE}/users/me/drafts/${encodeURIComponent(args.draft_id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok && r.status !== 404) throw new Error(`gmail delete_draft failed: ${r.status} ${await r.text()}`);
      return { draft_id: args.draft_id, deleted: true };
    },
  },
  {
    name: "gmail.mark_read",
    description: "Mark a Gmail thread as read (removes the UNREAD label from all messages in it).",
    schema: {
      type: "object",
      properties: { thread_id: { type: "string" } },
      required: ["thread_id"],
    },
    async handler(connector, args) {
      const token = await getAccessToken(connector);
      const r = await fetch(`${API_BASE}/users/me/threads/${encodeURIComponent(args.thread_id)}/modify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
      });
      if (!r.ok) throw new Error(`gmail mark_read failed: ${r.status} ${await r.text()}`);
      return { thread_id: args.thread_id, marked_read: true };
    },
  },
];

module.exports = {
  kind: "gmail",
  scopes: SCOPES,
  buildAuthUrl,
  exchangeCode,
  fetchUserEmail,
  persistTokens,
  getAccessToken,
  test,
  tools,
};
