import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { RiAddLine, RiDeleteBin6Line, RiSearchLine } from "react-icons/ri";

import API from "@/services/api";
import useStore from "@/services/store";
import Modal from "@/components/modal";
import Loader from "@/components/loader";
import { STATUSES, ENTITIES, statusMeta, entityLabel } from "./constants";

export default function TaskList() {
  const { organization } = useStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [sprintFilter, setSprintFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    const r = await API.post("/task/search", {
      search,
      organization_id: organization?._id,
      status: statusFilter || undefined,
      entity: entityFilter || undefined,
      sprint: sprintFilter || undefined,
      limit: 100,
    });
    if (r.ok) setItems(r.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?._id, statusFilter, entityFilter]);

  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sprintFilter]);

  const sprintOptions = useMemo(() => {
    const set = new Set();
    items.forEach((t) => t.sprint && set.add(t.sprint));
    return Array.from(set).sort();
  }, [items]);

  async function remove(task) {
    if (!confirm(`Delete "${task.title}"?`)) return;
    const r = await API.remove(`/task/${task._id}`);
    if (r.ok) {
      toast.success("Task deleted");
      load();
    } else {
      toast.error("Delete failed");
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Tasks</h1>
          <p className="text-sm text-slate-500">{items.length} task{items.length === 1 ? "" : "s"}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <RiAddLine className="h-4 w-4" /> New task
        </button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <RiSearchLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All entities</option>
          {ENTITIES.map((e) => (
            <option key={e.value} value={e.value}>{e.label}</option>
          ))}
        </select>
        <input
          value={sprintFilter}
          onChange={(e) => setSprintFilter(e.target.value)}
          placeholder="Sprint…"
          list="sprint-options"
          className="w-40 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <datalist id="sprint-options">
          {sprintOptions.map((s) => <option key={s} value={s} />)}
        </datalist>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Ref</th>
              <th className="px-4 py-2.5">Title</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Entity</th>
              <th className="px-4 py-2.5">Sprint</th>
              <th className="px-4 py-2.5">Due</th>
              <th className="px-4 py-2.5">Comments</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center"><Loader /></td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No tasks yet.</td></tr>
            )}
            {!loading && items.map((t) => {
              const status = statusMeta(t.status);
              return (
                <tr key={t._id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{t.reference}</td>
                  <td className="px-4 py-3">
                    <Link to={`/tasks/${t._id}`} className="font-medium text-slate-900 hover:underline">
                      {t.title}
                    </Link>
                    {t.description && <div className="line-clamp-1 text-xs text-slate-500">{t.description}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.chip}`}>{status.label}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{entityLabel(t.entity) || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{t.sprint || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{t.due_at ? new Date(t.due_at).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{t.comment_count || 0}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(t)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                      <RiDeleteBin6Line className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); load(); }}
        sprintOptions={sprintOptions}
      />
    </div>
  );
}

function CreateModal({ open, onClose, onCreated, sprintOptions }) {
  const { organization } = useStore();
  const [form, setForm] = useState({ title: "", description: "", status: "todo", priority: "medium", entity: "", sprint: "", due_at: "" });
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, organization_id: organization?._id };
      if (!payload.due_at) delete payload.due_at;
      if (!payload.entity) delete payload.entity;
      if (!payload.sprint) delete payload.sprint;
      const r = await API.post("/task", payload);
      if (r.ok) {
        toast.success("Task created");
        setForm({ title: "", description: "", status: "todo", priority: "medium", entity: "", sprint: "", due_at: "" });
        onCreated?.();
      } else {
        toast.error(r.message || "Create failed");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New task">
      <form onSubmit={save} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Title</span>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Description</span>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Status</span>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Priority</span>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Due</span>
            <input type="date" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Entity</span>
            <select value={form.entity} onChange={(e) => setForm({ ...form, entity: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">—</option>
              {ENTITIES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Sprint</span>
            <input value={form.sprint} onChange={(e) => setForm({ ...form, sprint: e.target.value })} list="create-sprint-options" placeholder="Sprint 20, Backlog…" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <datalist id="create-sprint-options">
              {sprintOptions?.map((s) => <option key={s} value={s} />)}
            </datalist>
          </label>
        </div>
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
