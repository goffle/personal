const { GOOGLE_CLIENT_ID, API_URL } = require("../config");
const gmail = require("./gmail");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const API_BASE = "https://www.googleapis.com/calendar/v3";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
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

async function test(connector) {
  const token = await gmail.getAccessToken(connector);
  const r = await fetch(`${API_BASE}/users/me/calendarList?maxResults=1`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`calendar list failed: ${r.status}`);
  return r.json();
}

function summarizeEvent(e) {
  return {
    id: e.id,
    summary: e.summary || "",
    description: e.description || "",
    location: e.location || "",
    start: e.start?.dateTime || e.start?.date || null,
    end: e.end?.dateTime || e.end?.date || null,
    all_day: Boolean(e.start?.date && !e.start?.dateTime),
    status: e.status,
    html_link: e.htmlLink,
    organizer: e.organizer?.email || null,
    attendees: (e.attendees || []).map((a) => ({ email: a.email, response: a.responseStatus, optional: a.optional || false })),
    hangout_link: e.hangoutLink || null,
    conference: e.conferenceData?.entryPoints?.[0]?.uri || null,
  };
}

function buildEventBody(args) {
  const body = {};
  if (args.summary !== undefined) body.summary = args.summary;
  if (args.description !== undefined) body.description = args.description;
  if (args.location !== undefined) body.location = args.location;
  if (args.start_iso) body.start = { dateTime: args.start_iso };
  if (args.end_iso) body.end = { dateTime: args.end_iso };
  if (args.all_day_date) {
    body.start = { date: args.all_day_date };
    body.end = { date: args.all_day_end_date || args.all_day_date };
  }
  if (Array.isArray(args.attendees)) body.attendees = args.attendees.map((email) => ({ email }));
  return body;
}

const tools = [
  {
    name: "calendar.list_calendars",
    description: "List calendars accessible by the user (id, summary, primary flag). Useful when the user wants to act on a calendar other than their primary one.",
    schema: { type: "object", properties: {} },
    async handler(connector) {
      const token = await gmail.getAccessToken(connector);
      const r = await fetch(`${API_BASE}/users/me/calendarList`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`calendar list_calendars failed: ${r.status} ${await r.text()}`);
      const j = await r.json();
      return {
        calendars: (j.items || []).map((c) => ({
          id: c.id,
          summary: c.summary,
          primary: Boolean(c.primary),
          access_role: c.accessRole,
          time_zone: c.timeZone,
        })),
      };
    },
  },
  {
    name: "calendar.list_events",
    description: "List events from a calendar in a time window. Defaults to the user's primary calendar and a 7-day forward window starting NOW if time_min/time_max are omitted. PREFER omitting time_min/time_max when the user says 'this week', 'next 7 days', 'upcoming' — the server-side default is anchored to real wall-clock time. Only pass explicit time_min/time_max when the user gives a specific date or you've confirmed today's date from the temporal context block in your system prompt.",
    schema: {
      type: "object",
      properties: {
        calendar_id: { type: "string", default: "primary" },
        time_min: { type: "string", description: "ISO 8601 lower bound (inclusive). Defaults to now." },
        time_max: { type: "string", description: "ISO 8601 upper bound (exclusive). Defaults to 7 days from now." },
        q: { type: "string", description: "Free-text search across event fields." },
        max_results: { type: "integer", default: 25, minimum: 1, maximum: 250 },
      },
    },
    async handler(connector, args) {
      const token = await gmail.getAccessToken(connector);
      const calendarId = args.calendar_id || "primary";
      const now = new Date();
      const timeMin = args.time_min || now.toISOString();
      const timeMax = args.time_max || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const u = new URL(`${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`);
      u.searchParams.set("timeMin", timeMin);
      u.searchParams.set("timeMax", timeMax);
      u.searchParams.set("singleEvents", "true");
      u.searchParams.set("orderBy", "startTime");
      u.searchParams.set("maxResults", String(args.max_results || 25));
      if (args.q) u.searchParams.set("q", args.q);
      const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`calendar list_events failed: ${r.status} ${await r.text()}`);
      const j = await r.json();
      return {
        calendar_id: calendarId,
        time_min: timeMin,
        time_max: timeMax,
        count: (j.items || []).length,
        events: (j.items || []).map(summarizeEvent),
      };
    },
  },
  {
    name: "calendar.get_event",
    description: "Fetch a single calendar event by id.",
    schema: {
      type: "object",
      properties: {
        calendar_id: { type: "string", default: "primary" },
        event_id: { type: "string" },
      },
      required: ["event_id"],
    },
    async handler(connector, args) {
      const token = await gmail.getAccessToken(connector);
      const calendarId = args.calendar_id || "primary";
      const r = await fetch(`${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(args.event_id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`calendar get_event failed: ${r.status} ${await r.text()}`);
      const j = await r.json();
      return summarizeEvent(j);
    },
  },
  {
    name: "calendar.create_event",
    description: "Create a calendar event. Use start_iso/end_iso (with timezone offset, e.g. '2026-05-12T15:00:00+02:00') for timed events, or all_day_date (YYYY-MM-DD) for all-day events.",
    schema: {
      type: "object",
      properties: {
        calendar_id: { type: "string", default: "primary" },
        summary: { type: "string" },
        description: { type: "string" },
        location: { type: "string" },
        start_iso: { type: "string" },
        end_iso: { type: "string" },
        all_day_date: { type: "string", description: "YYYY-MM-DD for an all-day event." },
        all_day_end_date: { type: "string", description: "Optional YYYY-MM-DD exclusive end for multi-day all-day events." },
        attendees: { type: "array", items: { type: "string" }, description: "Attendee email addresses." },
        send_updates: { type: "string", enum: ["all", "externalOnly", "none"], default: "none" },
      },
      required: ["summary"],
    },
    async handler(connector, args) {
      const token = await gmail.getAccessToken(connector);
      const calendarId = args.calendar_id || "primary";
      const body = buildEventBody(args);
      const u = new URL(`${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`);
      if (args.send_updates) u.searchParams.set("sendUpdates", args.send_updates);
      const r = await fetch(u, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`calendar create_event failed: ${r.status} ${await r.text()}`);
      const j = await r.json();
      return summarizeEvent(j);
    },
  },
  {
    name: "calendar.update_event",
    description: "Partially update a calendar event. Only the fields you pass are touched (PATCH semantics).",
    schema: {
      type: "object",
      properties: {
        calendar_id: { type: "string", default: "primary" },
        event_id: { type: "string" },
        summary: { type: "string" },
        description: { type: "string" },
        location: { type: "string" },
        start_iso: { type: "string" },
        end_iso: { type: "string" },
        all_day_date: { type: "string" },
        all_day_end_date: { type: "string" },
        attendees: { type: "array", items: { type: "string" } },
        send_updates: { type: "string", enum: ["all", "externalOnly", "none"], default: "none" },
      },
      required: ["event_id"],
    },
    async handler(connector, args) {
      const token = await gmail.getAccessToken(connector);
      const calendarId = args.calendar_id || "primary";
      const body = buildEventBody(args);
      const u = new URL(`${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(args.event_id)}`);
      if (args.send_updates) u.searchParams.set("sendUpdates", args.send_updates);
      const r = await fetch(u, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`calendar update_event failed: ${r.status} ${await r.text()}`);
      const j = await r.json();
      return summarizeEvent(j);
    },
  },
  {
    name: "calendar.delete_event",
    description: "Delete a calendar event by id.",
    schema: {
      type: "object",
      properties: {
        calendar_id: { type: "string", default: "primary" },
        event_id: { type: "string" },
        send_updates: { type: "string", enum: ["all", "externalOnly", "none"], default: "none" },
      },
      required: ["event_id"],
    },
    async handler(connector, args) {
      const token = await gmail.getAccessToken(connector);
      const calendarId = args.calendar_id || "primary";
      const u = new URL(`${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(args.event_id)}`);
      if (args.send_updates) u.searchParams.set("sendUpdates", args.send_updates);
      const r = await fetch(u, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok && r.status !== 410) throw new Error(`calendar delete_event failed: ${r.status} ${await r.text()}`);
      return { event_id: args.event_id, deleted: true };
    },
  },
];

module.exports = {
  kind: "google_calendar",
  scopes: SCOPES,
  buildAuthUrl,
  exchangeCode: gmail.exchangeCode,
  fetchUserEmail: gmail.fetchUserEmail,
  persistTokens: gmail.persistTokens,
  getAccessToken: gmail.getAccessToken,
  test,
  tools,
};
