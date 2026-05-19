import { useEffect, useMemo, useRef, useState } from "react";
import { Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  RiAddLine,
  RiBookOpenLine,
  RiDeleteBin6Line,
  RiEyeLine,
  RiCodeSSlashLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
} from "react-icons/ri";
import toast from "react-hot-toast";

import API from "@/services/api";
import useStore from "@/services/store";
import Loader from "@/components/loader";
import Markdown from "@/components/markdown";

export default function Skills() {
  const { organization } = useStore();
  const navigate = useNavigate();
  const [skills, setSkills] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!organization?._id) return;
    setLoading(true);
    const [sk, ag] = await Promise.all([
      API.post("/skill/search", { organization_id: organization._id, limit: 500 }),
      API.post("/agent/search", { organization_id: organization._id, limit: 200 }),
    ]);
    if (sk.ok) setSkills(sk.data);
    if (ag.ok) setAgents(ag.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [organization?._id]);

  async function createSkill() {
    const r = await API.post("/skill", {
      name: "Untitled skill",
      description: "",
      body_md: "",
      organization_id: organization._id,
    });
    if (!r.ok) {
      toast.error("Could not create skill");
      return;
    }
    setSkills((s) => [r.data, ...s]);
    navigate(`/skills/${r.data._id}`);
  }

  function updateLocal(skill) {
    setSkills((s) => s.map((it) => (it._id === skill._id ? skill : it)));
  }

  function removeLocal(id) {
    setSkills((s) => s.filter((it) => it._id !== id));
  }

  return (
    <div className="flex h-full min-h-0">
      <Rail
        skills={skills}
        agents={agents}
        loading={loading}
        onCreate={createSkill}
      />
      <div className="min-w-0 flex-1 overflow-y-auto bg-white">
        <Routes>
          <Route index element={<EmptyState />} />
          <Route
            path=":id"
            element={<Detail skills={skills} agents={agents} onChange={updateLocal} onDelete={removeLocal} />}
          />
        </Routes>
      </div>
    </div>
  );
}

function Rail({ skills, agents, loading, onCreate }) {
  const navigate = useNavigate();
  const { id: activeId } = useParams();

  const grouped = useMemo(() => {
    const global = [];
    const byAgent = new Map();
    for (const s of skills) {
      if (!s.agent_id) global.push(s);
      else {
        if (!byAgent.has(s.agent_id)) byAgent.set(s.agent_id, []);
        byAgent.get(s.agent_id).push(s);
      }
    }
    const agentName = (id) => agents.find((a) => a._id === id)?.name || "Unknown agent";
    const agentGroups = Array.from(byAgent.entries())
      .map(([agent_id, items]) => ({ agent_id, name: agentName(agent_id), items }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { global, agentGroups };
  }, [skills, agents]);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h1 className="text-lg font-semibold text-slate-900">Skills</h1>
        <button
          onClick={onCreate}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          title="New skill"
          aria-label="New skill"
        >
          <RiAddLine className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="flex justify-center py-8"><Loader /></div>
        ) : (
          <>
            <Group label="Global skills" items={grouped.global} activeId={activeId} onPick={(id) => navigate(`/skills/${id}`)} />
            {grouped.agentGroups.map((g) => (
              <Group
                key={g.agent_id}
                label={g.name}
                items={g.items}
                activeId={activeId}
                onPick={(id) => navigate(`/skills/${id}`)}
              />
            ))}
            {grouped.global.length === 0 && grouped.agentGroups.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-slate-400">
                No skills yet. Click + to add one.
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function Group({ label, items, activeId, onPick }) {
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;
  const Chevron = open ? RiArrowDownSLine : RiArrowRightSLine;
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500 hover:text-slate-700"
      >
        <Chevron className="h-3.5 w-3.5" />
        <span>{label}</span>
      </button>
      {open && (
        <div className="space-y-0.5 px-2">
          {items.map((s) => (
            <button
              key={s._id}
              onClick={() => onPick(s._id)}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                s._id === activeId ? "bg-slate-100 font-medium text-slate-900" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <RiBookOpenLine className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate">{s.name || "Untitled"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center px-8">
      <div className="max-w-sm text-center">
        <RiBookOpenLine className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <h2 className="text-base font-semibold text-slate-700">Select a skill</h2>
        <p className="mt-1 text-sm text-slate-500">
          Pick one from the left, or add a new skill with the + button.
        </p>
      </div>
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function Detail({ skills, agents, onChange, onDelete }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const skill = skills.find((s) => s._id === id);
  const [mode, setMode] = useState("view");

  if (!skill) {
    return (
      <div className="p-8 text-sm text-slate-500">Skill not found.</div>
    );
  }

  const agent = skill.agent_id ? agents.find((a) => a._id === skill.agent_id) : null;

  async function save(patch) {
    const r = await API.put(`/skill/${skill._id}`, patch);
    if (!r.ok) {
      toast.error("Save failed");
      return;
    }
    onChange(r.data);
  }

  async function remove() {
    if (!window.confirm(`Delete "${skill.name}"?`)) return;
    const r = await API.remove(`/skill/${skill._id}`);
    if (!r.ok) {
      toast.error("Delete failed");
      return;
    }
    onDelete(skill._id);
    navigate("/skills");
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <div className="mb-6 flex items-start gap-3">
        <InlineText
          value={skill.name}
          onCommit={(v) => save({ name: v || "Untitled" })}
          className="flex-1 text-2xl font-semibold text-slate-900"
          inputClassName="w-full rounded-md border border-slate-300 px-2 py-1 text-2xl font-semibold outline-none focus:border-slate-500"
          placeholder="Untitled skill"
        />
        <button
          onClick={remove}
          className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
          title="Delete skill"
          aria-label="Delete skill"
        >
          <RiDeleteBin6Line className="h-5 w-5" />
        </button>
      </div>

      <dl className="mb-6 grid grid-cols-3 gap-x-8 gap-y-3 text-sm">
        <Meta label="Scope" value={agent ? agent.name : "Global"} />
        <Meta label="Last updated" value={fmtDate(skill.updated_at)} />
        <Meta label="Created" value={fmtDate(skill.created_at)} />
      </dl>

      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Description</div>
      <InlineText
        value={skill.description}
        onCommit={(v) => save({ description: v })}
        className="mb-8 block text-sm text-slate-700"
        inputClassName="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
        placeholder="Add a short description…"
        multiline
      />

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Body</span>
          <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5">
            <button
              onClick={() => setMode("view")}
              className={`rounded p-1 ${mode === "view" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              title="Preview"
              aria-label="Preview"
            >
              <RiEyeLine className="h-4 w-4" />
            </button>
            <button
              onClick={() => setMode("code")}
              className={`rounded p-1 ${mode === "code" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              title="Edit markdown"
              aria-label="Edit markdown"
            >
              <RiCodeSSlashLine className="h-4 w-4" />
            </button>
          </div>
        </div>
        {mode === "view" ? (
          <div className="px-4 py-4">
            {skill.body_md ? (
              <Markdown content={skill.body_md} />
            ) : (
              <button
                onClick={() => setMode("code")}
                className="text-sm text-slate-400 hover:text-slate-600"
              >
                Empty. Click to write…
              </button>
            )}
          </div>
        ) : (
          <BodyEditor value={skill.body_md} onCommit={(v) => save({ body_md: v })} />
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value}</dd>
    </div>
  );
}

function InlineText({ value, onCommit, className = "", inputClassName = "", placeholder, multiline = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  function commit() {
    setEditing(false);
    if (draft !== (value || "")) onCommit(draft);
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={`text-left ${className} ${!value ? "text-slate-400" : ""}`}
        title="Click to edit"
      >
        {value || placeholder || "—"}
      </button>
    );
  }

  if (multiline) {
    return (
      <textarea
        autoFocus
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        placeholder={placeholder}
        className={inputClassName}
      />
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") { setDraft(value || ""); setEditing(false); }
      }}
      placeholder={placeholder}
      className={inputClassName}
    />
  );
}

function BodyEditor({ value, onCommit }) {
  const [draft, setDraft] = useState(value || "");
  const ref = useRef(null);

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  return (
    <textarea
      ref={ref}
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== (value || "")) onCommit(draft); }}
      placeholder="Write the skill body in Markdown…"
      className="block min-h-[300px] w-full resize-y border-0 px-4 py-4 font-mono text-sm leading-relaxed outline-none focus:ring-0"
    />
  );
}
