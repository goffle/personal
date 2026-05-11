import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { RiArrowLeftLine, RiDeleteBin6Line } from "react-icons/ri";

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

  async function patch(fields) {
    const keys = Object.keys(fields);
    setSavingField(keys[0]);
    const r = await API.put(`/task/${id}`, fields);
    if (r.ok) setTask(r.data);
    else toast.error("Update failed");
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
    e.preventDefault();
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

  async function deleteTask() {
    if (!confirm("Delete this task and its comments?")) return;
    const r = await API.remove(`/task/${id}`);
    if (r.ok) {
      toast.success("Deleted");
      navigate("/tasks");
    }
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader /></div>;
  if (!task) return <div className="p-6 text-slate-500">Task not found.</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link to="/tasks" className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <RiArrowLeftLine className="h-4 w-4" /> Back to tasks
        </Link>
        <button onClick={deleteTask} className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">
          <RiDeleteBin6Line className="h-3.5 w-3.5" /> Delete
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          {task.reference && (
            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">{task.reference}</span>
          )}
        </div>
        <input
          value={task.title}
          onChange={(e) => setTask({ ...task, title: e.target.value })}
          onBlur={(e) => patch({ title: e.target.value })}
          className="mt-1 w-full border-none bg-transparent text-2xl font-semibold text-slate-900 outline-none"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <FieldSelect
            label="Status"
            value={task.status}
            options={STATUSES.map((s) => ({ value: s.value, label: s.label }))}
            onChange={(v) => patch({ status: v })}
            saving={savingField === "status"}
          />
          <FieldSelect
            label="Priority"
            value={task.priority}
            options={PRIORITIES.map((p) => ({ value: p, label: p }))}
            onChange={(v) => patch({ priority: v })}
            saving={savingField === "priority"}
          />
          <FieldSelect
            label="Entity"
            value={task.entity || ""}
            options={[{ value: "", label: "—" }, ...ENTITIES]}
            onChange={(v) => patch({ entity: v || null })}
            saving={savingField === "entity"}
          />
          <FieldSelect
            label="Sprint"
            value={task.sprint || ""}
            options={[
              { value: "", label: "—" },
              ...SPRINT_OPTIONS.map((s) => ({ value: s, label: sprintLabel(s) })),
              ...(task.sprint && !SPRINT_OPTIONS.includes(task.sprint) ? [{ value: task.sprint, label: task.sprint }] : []),
            ]}
            onChange={(v) => patch({ sprint: v || null })}
            saving={savingField === "sprint"}
          />
          <FieldSelect
            label="Assigned"
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
          <label className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-500">Due</span>
            <input
              type="date"
              value={task.due_at ? new Date(task.due_at).toISOString().slice(0, 10) : ""}
              onChange={(e) => patch({ due_at: e.target.value || null })}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
        </div>

        <textarea
          value={task.description || ""}
          onChange={(e) => setTask({ ...task, description: e.target.value })}
          onBlur={(e) => patch({ description: e.target.value })}
          rows={5}
          placeholder="Add a description…"
          className="mt-4 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:bg-white"
        />
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Comments ({comments.length})</h2>
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c._id} className="group rounded-md border border-slate-200 bg-white p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-700">{c.author_name || "Anonymous"}</span>
                <span>{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-800">{c.content}</p>
              <button onClick={() => deleteComment(c)} className="mt-1 text-xs text-slate-400 opacity-0 hover:text-red-600 group-hover:opacity-100">
                Delete
              </button>
            </li>
          ))}
          {comments.length === 0 && <li className="text-sm text-slate-500">No comments yet.</li>}
        </ul>

        <form onSubmit={addComment} className="mt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Write a comment…"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
          />
          <div className="mt-2 flex justify-end">
            <button disabled={!draft.trim()} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              Comment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldSelect({ label, value, options, onChange, saving }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={saving} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm capitalize">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
