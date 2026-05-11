import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { RiAddLine, RiDeleteBin6Line, RiSearchLine } from "react-icons/ri";

import API from "@/services/api";
import useStore from "@/services/store";
import Modal from "@/components/modal";
import Loader from "@/components/loader";

export default function AgentList() {
  const { organization } = useStore();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    const r = await API.post("/agent/search", { search, organization_id: organization?._id, limit: 100 });
    if (r.ok) setItems(r.data);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [organization?._id]);
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); /* eslint-disable-next-line */ }, [search]);

  async function remove(e, item) {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm(`Delete "${item.name}"?`)) return;
    const r = await API.remove(`/agent/${item._id}`);
    if (r.ok) { toast.success("Deleted"); load(); }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Agents</h1>
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
          placeholder="Search agents…"
          className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-500"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={2} className="px-4 py-8 text-center"><Loader /></td></tr>}
            {!loading && items.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-500">No agents yet.</td></tr>
            )}
            {!loading && items.map((it) => (
              <tr
                key={it._id}
                onClick={() => navigate(`/agents/${it._id}`)}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-3">
                  <Link to={`/agents/${it._id}`} className="font-medium text-slate-900 hover:underline" onClick={(e) => e.stopPropagation()}>
                    {it.name}
                  </Link>
                  {it.description && <div className="line-clamp-1 text-xs text-slate-500">{it.description}</div>}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={(e) => remove(e, it)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                    <RiDeleteBin6Line className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(id) => { setShowCreate(false); if (id) navigate(`/agents/${id}`); else load(); }}
      />
    </div>
  );
}

function CreateModal({ open, onClose, onCreated }) {
  const { organization } = useStore();
  const [form, setForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await API.post("/agent", { ...form, organization_id: organization?._id });
      if (r.ok) {
        toast.success("Agent created");
        setForm({ name: "", description: "" });
        onCreated?.(r.data?._id);
      } else {
        toast.error(r.message || "Create failed");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New agent">
      <form onSubmit={save} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Description</span>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
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
