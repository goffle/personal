import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { RiCloseLine, RiFileCopyLine } from "react-icons/ri";

import API from "@/services/api";
import useStore from "@/services/store";
import Loader from "@/components/loader";

const MCP_URL = "https://api.jeeve.me/mcp";

const TABS = [
  { key: "connect", label: "Connect" },
  { key: "tools", label: "Tools" },
  { key: "skills", label: "Skills" },
  { key: "apps", label: "Apps" },
];

const RESOURCES = [
  "mcp_server",
  "cron_job",
  "connector",
  "agent",
  "chat",
  "skill",
  "task",
  "file",
  "tool",
  "user",
];

function groupOf(name) {
  for (const r of RESOURCES) {
    if (name.includes(r)) return r;
  }
  return "other";
}

export default function Mcp() {
  const [tab, setTab] = useState("connect");

  return (
    <div className="mx-auto max-w-6xl p-6">
      <nav className="mb-5 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === t.key
                ? "border-slate-900 font-medium text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "connect" && <ConnectTab />}
      {tab === "tools" && <ToolsTab />}
      {tab === "skills" && <SkillsTab />}
      {tab === "apps" && <AppsTab />}
    </div>
  );
}

function AppsTab() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await API.get("/mcp/connected-apps");
    if (r.ok) setApps(r.data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function disconnect(app) {
    if (!confirm(`Disconnect ${app.client_name}? Any client using it will need to reconnect.`)) return;
    const r = await API.remove(`/mcp/connected-apps/${app.client_id}`);
    if (r.ok) {
      toast.success("Disconnected");
      load();
    } else {
      toast.error(r.error || "Failed to disconnect");
    }
  }

  if (loading) return <Loader />;

  if (apps.length === 0) {
    return <div className="text-sm text-slate-500">No apps connected yet.</div>;
  }

  return (
    <ul className="space-y-3">
      {apps.map((a) => (
        <li key={a.client_id} className="flex items-center gap-3 text-sm">
          {a.logo_uri ? (
            <img src={a.logo_uri} alt="" className="h-8 w-8 rounded" />
          ) : (
            <div className="h-8 w-8 rounded bg-slate-100" />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-slate-900 truncate">
              {a.client_uri ? (
                <a href={a.client_uri} target="_blank" rel="noreferrer" className="hover:underline">{a.client_name}</a>
              ) : (
                a.client_name
              )}
            </div>
            <div className="text-xs text-slate-500">
              Connected {formatDate(a.connected_at)} · Last used {formatDate(a.last_used_at)}
            </div>
          </div>
          <button
            onClick={() => disconnect(a)}
            className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
          >
            <RiCloseLine className="h-3.5 w-3.5" /> Disconnect
          </button>
        </li>
      ))}
    </ul>
  );
}

function formatDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  const now = new Date();
  const diffMs = now - date;
  const day = 24 * 3600 * 1000;
  if (diffMs < day && date.getDate() === now.getDate()) return "today";
  if (diffMs < 2 * day) return "yesterday";
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  return date.toLocaleDateString();
}

function ConnectTab() {
  const url = MCP_URL;

  function copy() {
    navigator.clipboard.writeText(url);
    toast.success("Copied");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Endpoint</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900">{url}</code>
          <button
            onClick={copy}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            <RiFileCopyLine className="h-4 w-4" /> Copy
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Connect from claude.ai / Claude Code</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Open Settings → Connectors → <em>Add custom connector</em>.</li>
          <li>Paste the endpoint URL above.</li>
          <li>Approve the OAuth prompt to grant access to your workspace.</li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          Authentication uses OAuth 2.1 — the server walks the client through
          authorization automatically. No tokens to copy by hand.
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Other MCP clients</h2>
        <p className="text-sm text-slate-700">
          Point any MCP-compatible client at <code className="font-mono">{url}</code> using
          the Streamable HTTP transport. The server supports OAuth 2.1 Dynamic
          Client Registration, so most clients can connect without preconfigured
          credentials.
        </p>
      </section>
    </div>
  );
}

function ToolsTab() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await API.get("/mcp/manifest");
      if (r.ok) setTools(r.data || []);
      setLoading(false);
    })();
  }, []);

  const groups = useMemo(() => {
    const map = new Map();
    for (const t of tools) {
      const g = groupOf(t.name);
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(t);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    const order = [...RESOURCES, "other"];
    return order.filter((k) => map.has(k)).map((k) => [k, map.get(k)]);
  }, [tools]);

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      {groups.map(([group, list]) => (
        <section key={group}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</h3>
          <ul className="space-y-1">
            {list.map((t) => (
              <li key={t.name} className="flex items-baseline gap-3 text-sm">
                <code className="shrink-0 font-mono text-slate-900">{t.name}</code>
                <span className="text-slate-500">{t.description || "—"}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SkillsTab() {
  const { organization } = useStore();
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await API.post("/skill/search", { organization_id: organization?._id, limit: 200 });
      if (r.ok) setSkills(r.data || []);
      setLoading(false);
    })();
  }, [organization?._id]);

  if (loading) return <Loader />;

  if (skills.length === 0) {
    return <div className="text-sm text-slate-500">No skills.</div>;
  }

  return (
    <ul className="space-y-1">
      {skills.map((s) => (
        <li key={s._id} className="flex items-baseline gap-3 text-sm">
          <code className="shrink-0 font-mono text-slate-900">{s.name}</code>
          <span className="text-slate-500">{s.description || "—"}</span>
        </li>
      ))}
    </ul>
  );
}
