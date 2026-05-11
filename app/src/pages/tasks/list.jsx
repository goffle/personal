import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { RiAddLine, RiArrowDownSLine, RiRobot2Line, RiSearchLine, RiUserLine } from "react-icons/ri";

import API from "@/services/api";
import useStore from "@/services/store";
import Loader from "@/components/loader";
import Modal from "@/components/modal";
import { STATUSES, ENTITIES, statusMeta, entityLabel } from "./constants";
import { sprintOptions, sprintLabel, currentSprint } from "./sprints";

const PRIORITY_CHIPS = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-800",
  high: "bg-red-100 text-red-800",
};

export default function TaskList() {
  const navigate = useNavigate();
  const { organization } = useStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => STATUSES.filter((s) => s.value !== "done").map((s) => s.value));
  const [entityFilter, setEntityFilter] = useState("");
  const [sprintFilter, setSprintFilter] = useState(() => currentSprint());
  const [showCreate, setShowCreate] = useState(false);

  const SPRINT_FILTER_OPTIONS = sprintOptions();

  async function load() {
    setLoading(true);
    const r = await API.post("/task/search", {
      search,
      organization_id: organization?._id,
      status: statusFilter.length ? statusFilter : undefined,
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
        <StatusMultiSelect value={statusFilter} onChange={setStatusFilter} />
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
              <th className="px-4 py-2.5">Priority</th>
              <th className="px-4 py-2.5">Entity</th>
              <th className="px-4 py-2.5">Sprint</th>
              <th className="px-4 py-2.5">Due</th>
              <th className="px-4 py-2.5">Assigned</th>
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
                <tr
                  key={t._id}
                  onClick={() => navigate(`/tasks/${t._id}`)}
                  className="cursor-pointer border-t border-slate-100 transition-shadow hover:bg-slate-50 hover:shadow-[inset_0_0_0_1px_rgb(203_213_225)]"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{t.reference}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/tasks/${t._id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {t.title}
                    </Link>
                    {t.description && <div className="line-clamp-1 text-xs text-slate-500">{t.description}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.chip}`}>{status.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_CHIPS[t.priority] || "bg-slate-100 text-slate-700"}`}>
                      {t.priority || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{entityLabel(t.entity) || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{t.sprint || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{t.due_at ? new Date(t.due_at).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {t.assignee_name ? (
                      <span className="inline-flex items-center gap-1.5">
                        {t.assignee_type === "agent" ? (
                          <RiRobot2Line className="h-3.5 w-3.5 text-violet-500" title="Agent" />
                        ) : (
                          <RiUserLine className="h-3.5 w-3.5 text-slate-400" title="User" />
                        )}
                        <span>{t.assignee_name}</span>
                      </span>
                    ) : "—"}
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

function StatusMultiSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function toggle(v) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  const label =
    value.length === 0
      ? "No status"
      : value.length === STATUSES.length
        ? "All statuses"
        : value.length === 1
          ? STATUSES.find((s) => s.value === value[0])?.label || "1 status"
          : `${value.length} statuses`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        <span>{label}</span>
        <RiArrowDownSLine className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 z-10 mt-1 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {STATUSES.map((s) => (
            <label key={s.value} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50">
              <input
                type="checkbox"
                checked={value.includes(s.value)}
                onChange={() => toggle(s.value)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
