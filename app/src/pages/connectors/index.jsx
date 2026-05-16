import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { RiAddLine, RiDeleteBin6Line, RiSearchLine, RiPlugLine, RiRefreshLine } from "react-icons/ri";

import API from "@/services/api";
import useStore from "@/services/store";
import Modal from "@/components/modal";
import Loader from "@/components/loader";

const OAUTH_KINDS = new Set(["gmail", "google_calendar"]);

export default function Connectors() {
  const { organization } = useStore();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setLoading(true);
    const r = await API.post("/connector/search", { search, organization_id: organization?._id, limit: 100 });
    if (r.ok) setItems(r.data);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [organization?._id]);
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); /* eslint-disable-next-line */ }, [search]);

  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) { toast.success("Connector linked"); params.delete("connected"); setParams(params, { replace: true }); load(); }
    if (error) { toast.error(`OAuth: ${error}`); params.delete("error"); setParams(params, { replace: true }); }
    /* eslint-disable-next-line */
  }, [params]);

  async function remove(item) {
    if (!confirm(`Delete "${item.name}"?`)) return;
    const r = await API.remove(`/connector/${item._id}`);
    if (r.ok) { toast.success("Deleted"); load(); }
  }

  async function connect(item) {
    setBusyId(item._id);
    try {
      const r = await API.get(`/connector/${item._id}/oauth/start`);
      if (r.ok && r.url) window.location.href = r.url;
      else toast.error(r.message || "Cannot start OAuth");
    } finally {
      setBusyId(null);
    }
  }

  async function test(item) {
    setBusyId(item._id);
    try {
      const r = await API.post(`/connector/${item._id}/test`, {});
      if (r.ok) toast.success(`OK — ${r.data?.emailAddress || "connected"}`);
      else toast.error(r.message || "Test failed");
      load();
    } finally {
      setBusyId(null);
    }
  }

  const statusBadge = {
    connected: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    disconnected: "bg-slate-50 text-slate-600 ring-slate-200",
    error: "bg-red-50 text-red-700 ring-red-200",
  };

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Connectors</h1>
          <p className="text-sm text-slate-500">{items.length} item{items.length === 1 ? "" : "s"}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          <RiAddLine className="h-4 w-4" /> New
        </button>
      </header>

      <div className="relative mb-4">
        <RiSearchLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search connectors…"
          className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-500"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Kind</th>
              <th className="px-4 py-2.5">Account</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center"><Loader /></td></tr>}
            {!loading && items.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No connectors yet.</td></tr>
            )}
            {!loading && items.map((it) => {
              const canOAuth = OAUTH_KINDS.has(it.kind);
              const isBusy = busyId === it._id;
              return (
                <tr key={it._id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900 flex items-center gap-2">
                    <RiPlugLine className="h-4 w-4 text-slate-400" /> {it.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{it.kind || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{it.config?.account_email || <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadge[it.status] || statusBadge.disconnected}`}>
                      {it.status || "disconnected"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {canOAuth && (
                        <button
                          disabled={isBusy}
                          onClick={() => connect(it)}
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {it.status === "connected" ? "Reconnect" : "Connect"}
                        </button>
                      )}
                      {(it.status === "connected" || !canOAuth) && (
                        <button
                          disabled={isBusy}
                          onClick={() => test(it)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                          title="Test"
                        >
                          <RiRefreshLine className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => remove(it)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                        <RiDeleteBin6Line className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
    </div>
  );
}

function CreateModal({ open, onClose, onCreated }) {
  const { organization } = useStore();
  const [form, setForm] = useState({ name: "", kind: "", provider: "tavily", api_key: "" });
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: form.name, kind: form.kind, organization_id: organization?._id };
      if (form.kind === "web") {
        payload.config = { provider: form.provider || "tavily" };
        if (form.api_key) payload.config.api_key = form.api_key;
      }
      const r = await API.post("/connector", payload);
      if (r.ok) {
        toast.success("Connector created");
        setForm({ name: "", kind: "", provider: "tavily", api_key: "" });
        onCreated?.();
      } else {
        toast.error(r.message || "Create failed");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New connector">
      <form onSubmit={save} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Kind</span>
          <input value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} placeholder="gmail, google_calendar, web, jobego…" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        {form.kind === "web" && (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Provider</span>
              <select
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="tavily">Tavily</option>
                <option value="brave">Brave Search</option>
                <option value="serper">Serper (Google)</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">API key</span>
              <input
                type="password"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                placeholder="provider api key"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-slate-500">Stored encrypted. Required to use web.search.</span>
            </label>
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-2 text-sm">Cancel</button>
          <button disabled={saving} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
