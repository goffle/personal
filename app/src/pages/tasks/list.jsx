import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { RiAddLine, RiDeleteBin6Line, RiSearchLine } from "react-icons/ri";

import API from "@/services/api";
import useStore from "@/services/store";
import Loader from "@/components/loader";
import Modal from "@/components/modal";
import { STATUSES, ENTITIES, statusMeta, entityLabel } from "./constants";
import { sprintOptions, sprintLabel, currentSprint } from "./sprints";

export default function TaskList() {
  const navigate = useNavigate();
  const { organization } = useStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [sprintFilter, setSprintFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const SPRINT_FILTER_OPTIONS = sprintOptions();

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
  }, [organization?._id, statusFilter, entityFilter, sprintFilter]);

  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

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
          <p className="text-sm text-slate-500">{items.length} task{items.length === 1 ? "" : "s"} · Current sprint <span className="font-mono">{currentSprint()}</span></p>
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
        <select
          value={sprintFilter}
          onChange={(e) => setSprintFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All sprints</option>
          {SPRINT_FILTER_OPTIONS.map((s) => (
            <option key={s} value={s}>{sprintLabel(s)}</option>
          ))}
        </select>
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
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{t.sprint || "—"}</td>
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
        organizationId={organization?._id}
        onCreated={(id) => navigate(`/tasks/${id}`)}
      />
    </div>
  );
}

function CreateModal({ open, onClose, organizationId, onCreated }) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setTitle("");
  }, [open]);

  async function save(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    const r = await API.post("/task", { title: t, organization_id: organizationId, sprint: currentSprint() });
    setSaving(false);
    if (r.ok) onCreated?.(r.data._id);
    else toast.error(r.message || "Create failed");
  }

  return (
    <Modal open={open} onClose={onClose} title="New task">
      <form onSubmit={save} className="space-y-3">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        <p className="text-xs text-slate-500">Will be added to sprint <span className="font-mono">{currentSprint()}</span>. Edit the rest on the next page.</p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-2 text-sm">Cancel</button>
          <button disabled={saving || !title.trim()} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
