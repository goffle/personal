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
  RiFileTextLine,
  RiFolderLine,
  RiFileAddLine,
} from "react-icons/ri";
import toast from "react-hot-toast";

import API from "@/services/api";
import useStore from "@/services/store";
import Loader from "@/components/loader";
import Markdown from "@/components/markdown";

const ENTRYPOINT = "SKILL.md";

function normalizeFiles(skill) {
  if (skill.files && skill.files.length) return skill.files;
  return [{ path: ENTRYPOINT, body_md: skill.body_md || "" }];
}

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
      files: [{ path: ENTRYPOINT, body_md: "" }],
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

const UNCATEGORIZED = "Uncategorized";

function Rail({ skills, agents, loading, onCreate }) {
  const navigate = useNavigate();
  const { id: activeId } = useParams();

  const groups = useMemo(() => {
    const byCategory = new Map();
    for (const s of skills) {
      const cat = (s.category || "").trim() || UNCATEGORIZED;
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push(s);
    }
    return Array.from(byCategory.entries())
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
      }))
      .sort((a, b) => {
        if (a.category === UNCATEGORIZED) return 1;
        if (b.category === UNCATEGORIZED) return -1;
        return a.category.localeCompare(b.category);
      });
  }, [skills]);

  const agentName = (id) => agents.find((a) => a._id === id)?.name || "Unknown";

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
        ) : groups.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-400">
            No skills yet. Click + to add one.
          </div>
        ) : (
          groups.map((g) => (
            <Group
              key={g.category}
              label={g.category}
              items={g.items}
              activeId={activeId}
              agentName={agentName}
              onPick={(id) => navigate(`/skills/${id}`)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function Group({ label, items, activeId, agentName, onPick }) {
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
        <span className="truncate">{label}</span>
      </button>
      {open && (
        <div className="space-y-0.5 px-2">
          {items.map((s) => {
            const scope = s.agent_id ? agentName(s.agent_id) : "Global";
            const active = s._id === activeId;
            return (
              <button
                key={s._id}
                onClick={() => onPick(s._id)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                  active ? "bg-slate-100 font-medium text-slate-900" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <RiBookOpenLine className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate">{s.name || "Untitled"}</span>
                <span className="shrink-0 max-w-[6rem] truncate rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  {scope}
                </span>
              </button>
            );
          })}
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
  const [activePath, setActivePath] = useState(ENTRYPOINT);

  useEffect(() => {
    setActivePath(ENTRYPOINT);
    setMode("view");
  }, [id]);

  if (!skill) {
    return (
      <div className="p-8 text-sm text-slate-500">Skill not found.</div>
    );
  }

  const agent = skill.agent_id ? agents.find((a) => a._id === skill.agent_id) : null;
  const files = normalizeFiles(skill);
  const active = files.find((f) => f.path === activePath) || files[0];

  async function save(patch) {
    const r = await API.put(`/skill/${skill._id}`, patch);
    if (!r.ok) {
      toast.error("Save failed");
      return;
    }
    onChange(r.data);
  }

  async function saveFiles(nextFiles) {
    const entry = nextFiles.find((f) => f.path === ENTRYPOINT);
    await save({ files: nextFiles, body_md: entry?.body_md || "" });
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

  function commitBody(value) {
    if (value === (active.body_md || "")) return;
    saveFiles(files.map((f) => (f.path === active.path ? { ...f, body_md: value } : f)));
  }

  function addFile() {
    const raw = window.prompt("New file path", "reference/example.md");
    if (!raw) return;
    const path = raw.trim();
    if (!path || path === ENTRYPOINT) {
      toast.error("Invalid path");
      return;
    }
    if (files.some((f) => f.path === path)) {
      toast.error("Path already exists");
      return;
    }
    saveFiles([...files, { path, body_md: "" }]);
    setActivePath(path);
    setMode("code");
  }

  function deleteActive() {
    if (active.path === ENTRYPOINT) return;
    if (!window.confirm(`Delete ${active.path}?`)) return;
    saveFiles(files.filter((f) => f.path !== active.path));
    setActivePath(ENTRYPOINT);
  }

  function renameActive(nextPath) {
    if (active.path === ENTRYPOINT) return;
    const trimmed = (nextPath || "").trim();
    if (!trimmed || trimmed === active.path) return;
    if (trimmed === ENTRYPOINT) {
      toast.error("Reserved path");
      return;
    }
    if (files.some((f) => f.path === trimmed)) {
      toast.error("Path already exists");
      return;
    }
    const oldPath = active.path;
    saveFiles(files.map((f) => (f.path === oldPath ? { ...f, path: trimmed } : f)));
    setActivePath(trimmed);
  }

  return (
    <div className="px-8 py-8">
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

      <dl className="mb-6 grid grid-cols-4 gap-x-8 gap-y-3 text-sm">
        <Meta label="Scope" value={agent ? agent.name : "Global"} />
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Category</dt>
          <dd className="mt-0.5">
            <InlineText
              value={skill.category}
              onCommit={(v) => save({ category: (v || "").trim() })}
              className="block text-sm text-slate-800"
              inputClassName="w-full rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-slate-500"
              placeholder="Add category…"
            />
          </dd>
        </div>
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
        <div className="flex min-h-[24rem]">
          <FileTree
            files={files}
            activePath={active.path}
            onPick={(p) => setActivePath(p)}
            onAdd={addFile}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <RiFileTextLine className="h-4 w-4 shrink-0 text-slate-400" />
                {active.path === ENTRYPOINT ? (
                  <span className="truncate font-mono text-xs text-slate-700">{ENTRYPOINT}</span>
                ) : (
                  <InlineText
                    value={active.path}
                    onCommit={renameActive}
                    className="block min-w-0 truncate font-mono text-xs text-slate-700 hover:text-slate-900"
                    inputClassName="w-72 rounded-md border border-slate-300 px-2 py-1 font-mono text-xs outline-none focus:border-slate-500"
                    placeholder="path/to/file.md"
                  />
                )}
              </div>
              <div className="flex items-center gap-1">
                {active.path !== ENTRYPOINT && (
                  <button
                    onClick={deleteActive}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="Delete file"
                    aria-label="Delete file"
                  >
                    <RiDeleteBin6Line className="h-4 w-4" />
                  </button>
                )}
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
            </div>
            {mode === "view" ? (
              <div className="px-4 py-4">
                {active.body_md ? (
                  <Markdown content={active.body_md} />
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
              <BodyEditor key={active.path} value={active.body_md} onCommit={commitBody} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FileTree({ files, activePath, onPick, onAdd }) {
  const tree = useMemo(() => {
    const entry = files.find((f) => f.path === ENTRYPOINT);
    const rest = files.filter((f) => f.path !== ENTRYPOINT);
    const folders = new Map();
    const roots = [];
    for (const f of rest) {
      const slash = f.path.indexOf("/");
      if (slash === -1) {
        roots.push(f);
      } else {
        const folder = f.path.slice(0, slash);
        if (!folders.has(folder)) folders.set(folder, []);
        folders.get(folder).push(f);
      }
    }
    const folderEntries = Array.from(folders.entries())
      .map(([name, items]) => ({ name, items: items.sort((a, b) => a.path.localeCompare(b.path)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    roots.sort((a, b) => a.path.localeCompare(b.path));
    return { entry, folders: folderEntries, roots };
  }, [files]);

  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Files</span>
        <button
          onClick={onAdd}
          className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-900"
          title="Add file"
          aria-label="Add file"
        >
          <RiFileAddLine className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 py-2">
        {tree.entry && (
          <FileRow
            file={tree.entry}
            label={ENTRYPOINT}
            active={activePath === tree.entry.path}
            onPick={() => onPick(tree.entry.path)}
          />
        )}
        {tree.roots.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            label={f.path}
            active={activePath === f.path}
            onPick={() => onPick(f.path)}
          />
        ))}
        {tree.folders.map((g) => (
          <Folder
            key={g.name}
            name={g.name}
            items={g.items}
            activePath={activePath}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

function Folder({ name, items, activePath, onPick }) {
  const [open, setOpen] = useState(true);
  const Chevron = open ? RiArrowDownSLine : RiArrowRightSLine;
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs text-slate-600 hover:bg-white hover:text-slate-900"
      >
        <Chevron className="h-3.5 w-3.5" />
        <RiFolderLine className="h-3.5 w-3.5 text-slate-400" />
        <span className="truncate font-mono">{name}/</span>
      </button>
      {open && (
        <div className="ml-3 border-l border-slate-200 pl-1">
          {items.map((f) => (
            <FileRow
              key={f.path}
              file={f}
              label={f.path.slice(name.length + 1)}
              active={activePath === f.path}
              onPick={() => onPick(f.path)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FileRow({ label, active, onPick }) {
  return (
    <button
      onClick={onPick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs ${
        active ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-700 hover:bg-white"
      }`}
    >
      <RiFileTextLine className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className="truncate font-mono">{label}</span>
    </button>
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
      <AutoGrowTextarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        placeholder={placeholder}
        className={inputClassName}
        minRows={3}
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

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  return (
    <AutoGrowTextarea
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== (value || "")) onCommit(draft); }}
      placeholder="Write the file body in Markdown…"
      className="block w-full resize-none border-0 px-4 py-4 font-mono text-sm leading-relaxed outline-none focus:ring-0"
      minRows={12}
    />
  );
}

function AutoGrowTextarea({ value, minRows = 3, className = "", ...rest }) {
  const ref = useRef(null);

  function resize(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  useEffect(() => {
    resize(ref.current);
  }, [value]);

  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        resize(el);
      }}
      value={value}
      rows={minRows}
      className={className}
      {...rest}
    />
  );
}
