import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { RiAddLine, RiDeleteBin6Line, RiSearchLine } from "react-icons/ri";

import API from "@/services/api";
import useStore from "@/services/store";
import Modal from "@/components/modal";
import Loader from "@/components/loader";

/**
 * Generic CRUD list page used by Agents, Cron, Skills, Connectors, MCP, Tools.
 * @param {object} props
 * @param {string} props.title
 * @param {string} props.resource           "/agent", "/skill", etc.
 * @param {Array<{key:string,label:string,type?:string,required?:boolean,textarea?:boolean}>} props.fields
 * @param {Array<{key:string,label:string,render?:function}>} props.columns
 */
export default function PlaceholderList({ title, resource, fields, columns }) {
  const { organization } = useStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    const r = await API.post(`${resource}/search`, { search, organization_id: organization?._id, limit: 100 });
    if (r.ok) setItems(r.data);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [organization?._id]);
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); /* eslint-disable-next-line */ }, [search]);

  async function remove(item) {
    if (!confirm("Delete this item?")) return;
    const r = await API.remove(`${resource}/${item._id}`);
    if (r.ok) { toast.success("Deleted"); load(); }
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
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
          placeholder={`Search ${title.toLowerCase()}…`}
          className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-500"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((c) => <th key={c.key} className="px-4 py-2.5">{c.label}</th>)}
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center"><Loader /></td></tr>}
            {!loading && items.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-slate-500">Nothing here yet.</td></tr>
            )}
            {!loading && items.map((it) => (
              <tr key={it._id} className="border-t border-slate-100 hover:bg-slate-50">
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3 text-slate-700">
                    {c.render ? c.render(it) : it[c.key] || <span className="text-slate-400">—</span>}
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  <button onClick={() => remove(it)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete">
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
        onCreated={() => { setShowCreate(false); load(); }}
        title={title}
        resource={resource}
        fields={fields}
      />
    </div>
  );
}

function CreateModal({ open, onClose, onCreated, title, resource, fields }) {
  const { organization } = useStore();
  const initial = Object.fromEntries(fields.map((f) => [f.key, ""]));
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, organization_id: organization?._id };
      const r = await API.post(resource, payload);
      if (r.ok) {
        toast.success("Created");
        setForm(initial);
        onCreated?.();
      } else {
        toast.error(r.message || "Create failed");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`New ${title.toLowerCase().replace(/s$/, "")}`}>
      <form onSubmit={save} className="space-y-3">
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{f.label}</span>
            {f.textarea ? (
              <textarea
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                required={f.required}
                rows={4}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            ) : (
              <input
                type={f.type || "text"}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                required={f.required}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            )}
          </label>
        ))}
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
