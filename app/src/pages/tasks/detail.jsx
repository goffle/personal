import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  RiAddLine,
  RiArrowLeftLine,
  RiCheckLine,
  RiDeleteBin6Line,
  RiPlayLine,
} from "react-icons/ri";

import API from "@/services/api";
import useStore from "@/services/store";
import Loader from "@/components/loader";
import { STATUSES, ENTITIES } from "./constants";
import { sprintOptions, sprintLabel } from "./sprints";

const PRIORITIES = ["low", "medium", "high"];
const SPRINT_OPTIONS = sprintOptions();

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { organization, user } = useStore();

  const [task, setTask] = useState(null);
  const [comments, setComments] = useState([]);
  const [agents, setAgents] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState(null);
  const [newItemText, setNewItemText] = useState("");

  async function load() {
    setLoading(true);
    const [t, c, a] = await Promise.all([
      API.get(`/task/${id}`),
      API.post("/comment/search", { task_id: id }),
      API.post("/agent/search", { organization_id: organization?._id, limit: 100 }),
    ]);
    if (t.ok) setTask(t.data);
    if (c.ok) setComments(c.data);
    if (a.ok) setAgents(a.data);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  function normField(k, v) {
    if (v == null) return "";
    if (k === "due_at") {
      const d = new Date(v);
      return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
    }
    return String(v);
  }

  async function patch(fields, fieldKey) {
    const skipDiff = fieldKey === "checklist";
    if (!skipDiff) {
      const changed = Object.entries(fields).some(([k, v]) => normField(k, task?.[k]) !== normField(k, v));
      if (!changed) return;
    }
    setSavingField(fieldKey || Object.keys(fields)[0]);
    const r = await API.put(`/task/${id}`, fields);
    if (r.ok) {
      setTask(r.data);
    } else {
      toast.error("Update failed");
    }
    setSavingField(null);
  }

  function meName() {
    return `${user?.firstname || ""} ${user?.lastname || ""}`.trim() || user?.email || "Me";
  }

  function assigneeKey(t) {
    if (!t?.assignee_id) return "";
    return `${t.assignee_type || "user"}:${t.assignee_id}`;
  }

  function onAssigneeChange(key) {
    if (!key) return patch({ assignee_id: null, assignee_name: null, assignee_type: null });
    const [type, sid] = key.split(":");
    if (type === "user") return patch({ assignee_id: sid, assignee_name: meName(), assignee_type: "user" });
    const ag = agents.find((x) => x._id === sid);
    return patch({ assignee_id: sid, assignee_name: ag?.name || "Agent", assignee_type: "agent" });
  }

  async function addComment(e) {
    e?.preventDefault();
    if (!draft.trim()) return;
    const r = await API.post("/comment", { task_id: id, organization_id: organization?._id, content: draft.trim() });
    if (r.ok) {
      setComments([...comments, r.data]);
      setDraft("");
      setTask((t) => (t ? { ...t, comment_count: (t.comment_count || 0) + 1 } : t));
    } else {
      toast.error("Comment failed");
    }
  }

  async function deleteComment(c) {
    if (!confirm("Delete this comment?")) return;
    const r = await API.remove(`/comment/${c._id}`);
    if (r.ok) {
      setComments(comments.filter((x) => x._id !== c._id));
      setTask((t) => (t ? { ...t, comment_count: Math.max(0, (t.comment_count || 1) - 1) } : t));
    }
  }

  async function runWithAgent() {
    setSavingField("run-with-agent");
    try {
      const r = await API.post(`/task/${id}/run-with-agent`);
      if (r.ok && r.data?.chat_id) {
        toast.success("Agent started");
        navigate("/chat");
      } else {
        toast.error(r.message || "Could not start agent");
      }
    } finally {
      setSavingField(null);
    }
  }

  async function deleteTask() {
    if (!confirm("Delete this task and its comments?")) return;
    const r = await API.remove(`/task/${id}`);
    if (r.ok) {
      toast.success("Deleted");
      navigate("/tasks");
    }
  }

  function checklistMutate(next) {
    setTask((t) => (t ? { ...t, checklist: next } : t));
    const payload = next.map((it) => {
      const id = String(it._id || "");
      if (!id || id.startsWith("tmp-")) return { text: it.text, done: !!it.done };
      return { _id: it._id, text: it.text, done: !!it.done };
    });
    patch({ checklist: payload }, "checklist");
  }

  function toggleItem(itemId) {
    const next = (task.checklist || []).map((it) =>
      String(it._id) === String(itemId) ? { ...it, done: !it.done } : it,
    );
    checklistMutate(next);
  }

  function deleteItem(itemId) {
    const next = (task.checklist || []).filter((it) => String(it._id) !== String(itemId));
    checklistMutate(next);
  }

  function editItemText(itemId, text) {
    const next = (task.checklist || []).map((it) =>
      String(it._id) === String(itemId) ? { ...it, text } : it,
    );
    setTask((t) => (t ? { ...t, checklist: next } : t));
  }

  function commitItemText(itemId, text) {
    const trimmed = text.trim();
    if (!trimmed) return deleteItem(itemId);
    const original = (task.checklist || []).find((it) => String(it._id) === String(itemId));
    if (original && original.text === trimmed) return;
    const next = (task.checklist || []).map((it) =>
      String(it._id) === String(itemId) ? { ...it, text: trimmed } : it,
    );
    checklistMutate(next);
  }

  function addItem(e) {
    e?.preventDefault();
    const text = newItemText.trim();
    if (!text) return;
    const next = [...(task.checklist || []), { _id: `tmp-${Date.now()}`, text, done: false }];
    setNewItemText("");
    checklistMutate(next);
  }

  const checklistStats = useMemo(() => {
    const items = task?.checklist || [];
    const total = items.length;
    const done = items.filter((it) => it.done).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, pct };
  }, [task?.checklist]);

  if (loading) return <div className="flex h-full items-center justify-center"><Loader /></div>;
  if (!task) return <div className="p-6 text-slate-500">Task not found.</div>;

  const isAgentAssignee = task.assignee_type === "agent" && task.assignee_id;

  return (
    <div className="flex h-full overflow-hidden">
      <main className="flex-1 overflow-auto bg-white">
        <div className="mx-auto max-w-3xl px-8 py-10">
          <nav className="mb-4 flex min-w-0 items-center gap-1 text-sm text-slate-500">
            <Link to="/tasks" className="flex items-center gap-1 hover:text-slate-900">
              <RiArrowLeftLine className="h-4 w-4" />
              Tasks
            </Link>
            <span className="text-slate-300">/</span>
            {task.reference && (
              <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">{task.reference}</span>
            )}
          </nav>
          <input
              value={task.title}
              onChange={(e) => setTask({ ...task, title: e.target.value })}
              onBlur={(e) => patch({ title: e.target.value })}
              className="w-full border-none bg-transparent text-3xl font-semibold text-slate-900 outline-none"
            />

            {/* Description */}
            <section className="mt-8">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Description</h2>
              <AutoTextarea
                value={task.description || ""}
                onChange={(v) => setTask({ ...task, description: v })}
                onBlur={(v) => patch({ description: v })}
                placeholder="Add a description…"
                className="w-full resize-none border-none bg-transparent text-[15px] leading-7 text-slate-800 outline-none placeholder-slate-400"
              />
            </section>

            {/* Checklist */}
            <section className="mt-10">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checklist</h2>
                {checklistStats.total > 0 && (
                  <span className="text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{checklistStats.done}</span>
                    {" / "}{checklistStats.total}
                    <span className="ml-2 text-slate-400">{checklistStats.pct}%</span>
                  </span>
                )}
              </div>

              {checklistStats.total > 0 && (
                <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${checklistStats.pct}%` }}
                  />
                </div>
              )}

              <ul className="space-y-1">
                {(task.checklist || []).map((it) => (
                  <ChecklistRow
                    key={it._id}
                    item={it}
                    onToggle={() => toggleItem(it._id)}
                    onEdit={(text) => editItemText(it._id, text)}
                    onCommit={(text) => commitItemText(it._id, text)}
                    onDelete={() => deleteItem(it._id)}
                  />
                ))}
              </ul>

              <form onSubmit={addItem} className="mt-2 flex items-center gap-2 pl-7">
                <RiAddLine className="h-4 w-4 text-slate-400" />
                <input
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  placeholder="Add item"
                  className="flex-1 border-none bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none"
                />
              </form>
            </section>

            {/* Comments */}
            <section className="mt-10">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Comments <span className="ml-1 text-slate-400">{comments.length}</span>
              </h2>
              <ul className="space-y-2">
                {comments.map((c) => (
                  <li key={c._id} className="group rounded-md border border-slate-200 bg-white p-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{c.author_name || "Anonymous"}</span>
                      <span>{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-slate-800">{c.content}</p>
                    <button
                      onClick={() => deleteComment(c)}
                      className="mt-1 text-xs text-slate-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
                    >
                      Delete
                    </button>
                  </li>
                ))}
                {comments.length === 0 && <li className="text-sm text-slate-400">No comments yet.</li>}
              </ul>

              <form onSubmit={addComment} className="mt-3 flex items-start gap-2">
                <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-600">
                  {initialOf(meName())}
                </span>
                <div className="flex-1">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addComment(e);
                    }}
                    rows={2}
                    placeholder="Write a comment…"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <span className="text-[11px] text-slate-400">⌘↵</span>
                    <button
                      disabled={!draft.trim()}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      Comment
                    </button>
                  </div>
                </div>
              </form>
            </section>
          </div>
        </main>

        {/* Right sidebar */}
        <aside className="w-72 shrink-0 overflow-auto border-l border-slate-200 bg-slate-50 p-5">
          {isAgentAssignee && (
            <button
              onClick={runWithAgent}
              disabled={savingField === "run-with-agent"}
              className="mb-5 flex w-full items-center justify-center gap-1 rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <RiPlayLine className="h-3.5 w-3.5" />
              {savingField === "run-with-agent" ? "Starting…" : `Run with ${task.assignee_name || "agent"}`}
            </button>
          )}

          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Properties</h3>

          <Prop label="Status">
            <SelectInline
              value={task.status}
              options={STATUSES.map((s) => ({ value: s.value, label: s.label }))}
              onChange={(v) => patch({ status: v })}
              saving={savingField === "status"}
            />
          </Prop>
          <Prop label="Priority">
            <SelectInline
              value={task.priority}
              options={PRIORITIES.map((p) => ({ value: p, label: p }))}
              onChange={(v) => patch({ priority: v })}
              saving={savingField === "priority"}
            />
          </Prop>
          <Prop label="Assignee">
            <SelectInline
              value={assigneeKey(task)}
              options={[
                { value: "", label: "—" },
                ...(user?._id ? [{ value: `user:${user._id}`, label: meName() }] : []),
                ...agents.map((a) => ({ value: `agent:${a._id}`, label: a.name })),
                ...(task.assignee_id && task.assignee_type === "agent" && !agents.find((a) => a._id === task.assignee_id)
                  ? [{ value: `agent:${task.assignee_id}`, label: task.assignee_name || "Agent" }]
                  : []),
              ]}
              onChange={onAssigneeChange}
              saving={savingField === "assignee_id"}
            />
          </Prop>
          <Prop label="Due">
            <input
              type="date"
              value={task.due_at ? new Date(task.due_at).toISOString().slice(0, 10) : ""}
              onChange={(e) => patch({ due_at: e.target.value || null })}
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
            />
          </Prop>
          <Prop label="Entity">
            <SelectInline
              value={task.entity || ""}
              options={[{ value: "", label: "—" }, ...ENTITIES]}
              onChange={(v) => patch({ entity: v || null })}
              saving={savingField === "entity"}
            />
          </Prop>
          <Prop label="Sprint">
            <SelectInline
              value={task.sprint || ""}
              options={[
                { value: "", label: "—" },
                ...SPRINT_OPTIONS.map((s) => ({ value: s, label: sprintLabel(s) })),
                ...(task.sprint && !SPRINT_OPTIONS.includes(task.sprint) ? [{ value: task.sprint, label: task.sprint }] : []),
              ]}
              onChange={(v) => patch({ sprint: v || null })}
              saving={savingField === "sprint"}
            />
          </Prop>
          <Prop label="Created">
            <span className="text-sm text-slate-700">{fmtDate(task.created_at)}</span>
          </Prop>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <button
              onClick={deleteTask}
              className="flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
            >
              <RiDeleteBin6Line className="h-3.5 w-3.5" /> Delete task
            </button>
          </div>
        </aside>
      </div>
  );
}

function AutoTextarea({ value, onChange, onBlur, placeholder, className }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onBlur?.(e.target.value)}
      className={className}
    />
  );
}

function ChecklistRow({ item, onToggle, onEdit, onCommit, onDelete }) {
  return (
    <li className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-50">
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.done ? "Mark not done" : "Mark done"}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          item.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent hover:border-slate-400"
        }`}
      >
        <RiCheckLine className="h-3 w-3" />
      </button>
      <input
        value={item.text}
        onChange={(e) => onEdit(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={`flex-1 border-none bg-transparent text-sm outline-none ${
          item.done ? "text-slate-400 line-through" : "text-slate-800"
        }`}
      />
      <button
        type="button"
        onClick={onDelete}
        className="rounded p-1 text-slate-300 opacity-0 hover:bg-slate-200 hover:text-red-600 group-hover:opacity-100"
        title="Delete"
      >
        <RiDeleteBin6Line className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function Prop({ label, children }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}

function SelectInline({ value, options, onChange, saving }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={saving}
      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm capitalize"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function initialOf(name) {
  if (!name) return "?";
  const t = name.trim();
  return t ? t[0].toUpperCase() : "?";
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
