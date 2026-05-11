import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { RiAddLine, RiArrowLeftLine, RiDeleteBin6Line, RiFileTextLine } from "react-icons/ri";

import API from "@/services/api";
import Loader from "@/components/loader";

const TABS = [
  { value: "config", label: "Configuration" },
  { value: "files", label: "Files" },
];

export default function AgentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("config");
  const [savingField, setSavingField] = useState(null);

  async function load() {
    setLoading(true);
    const r = await API.get(`/agent/${id}`);
    if (r.ok) setAgent(r.data);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function patch(fields) {
    const key = Object.keys(fields)[0];
    setSavingField(key);
    const r = await API.put(`/agent/${id}`, fields);
    if (r.ok) setAgent(r.data);
    else toast.error("Update failed");
    setSavingField(null);
  }

  async function deleteAgent() {
    if (!confirm("Delete this agent?")) return;
    const r = await API.remove(`/agent/${id}`);
    if (r.ok) { toast.success("Deleted"); navigate("/agents"); }
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader /></div>;
  if (!agent) return <div className="p-6 text-slate-500">Agent not found.</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link to="/agents" className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <RiArrowLeftLine className="h-4 w-4" /> Back to agents
        </Link>
        <button onClick={deleteAgent} className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">
          <RiDeleteBin6Line className="h-3.5 w-3.5" /> Delete
        </button>
      </div>

      <h1 className="mb-4 text-2xl font-semibold text-slate-900">{agent.name}</h1>

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === t.value
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "config" && (
        <ConfigTab agent={agent} setAgent={setAgent} patch={patch} savingField={savingField} />
      )}
      {tab === "files" && (
        <FilesTab agent={agent} patch={patch} />
      )}
    </div>
  );
}

function ConfigTab({ agent, setAgent, patch }) {
  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
        <input
          value={agent.name}
          onChange={(e) => setAgent({ ...agent, name: e.target.value })}
          onBlur={(e) => patch({ name: e.target.value })}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Description</span>
        <textarea
          value={agent.description || ""}
          onChange={(e) => setAgent({ ...agent, description: e.target.value })}
          onBlur={(e) => patch({ description: e.target.value })}
          rows={5}
          placeholder="What this agent is for…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
    </div>
  );
}

function FilesTab({ agent, patch }) {
  const files = agent.files || [];
  const [selectedId, setSelectedId] = useState(files[0]?._id || null);
  const [draft, setDraft] = useState(null);
  const selected = files.find((f) => f._id === selectedId);

  useEffect(() => {
    setDraft(selected ? { name: selected.name, content_md: selected.content_md || "" } : null);
  }, [selectedId, selected?.name, selected?.content_md]);

  async function addFile() {
    const name = prompt("File name (e.g. soul.md, skill.md):");
    if (!name) return;
    const next = [...files, { name, content_md: "" }];
    const r = await API.put(`/agent/${agent._id}`, { files: next });
    if (r.ok) {
      const created = r.data.files[r.data.files.length - 1];
      setSelectedId(created._id);
    } else {
      toast.error("Could not add file");
    }
  }

  async function saveFile() {
    if (!selected || !draft) return;
    const next = files.map((f) => (f._id === selected._id ? { ...f, name: draft.name, content_md: draft.content_md } : f));
    await patch({ files: next });
    toast.success("Saved");
  }

  async function removeFile(file) {
    if (!confirm(`Delete "${file.name}"?`)) return;
    const next = files.filter((f) => f._id !== file._id);
    const r = await API.put(`/agent/${agent._id}`, { files: next });
    if (r.ok && selectedId === file._id) setSelectedId(next[0]?._id || null);
  }

  return (
    <div className="grid grid-cols-[220px_1fr] gap-4">
      <aside className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Files</span>
          <button onClick={addFile} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Add file">
            <RiAddLine className="h-4 w-4" />
          </button>
        </div>
        <ul>
          {files.length === 0 && (
            <li className="px-3 py-3 text-xs text-slate-500">No files yet.</li>
          )}
          {files.map((f) => (
            <li
              key={f._id}
              onClick={() => setSelectedId(f._id)}
              className={`group flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 ${
                selectedId === f._id ? "bg-slate-100 text-slate-900" : "text-slate-700"
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <RiFileTextLine className="h-3.5 w-3.5 text-slate-400" />
                <span className="truncate">{f.name}</span>
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); removeFile(f); }}
                className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-slate-400 hover:text-red-600"
                title="Delete file"
              >
                <RiDeleteBin6Line className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        {!selected || !draft ? (
          <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-slate-500">
            Select or add a file to edit.
          </div>
        ) : (
          <div className="space-y-3">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
            />
            <textarea
              value={draft.content_md}
              onChange={(e) => setDraft({ ...draft, content_md: e.target.value })}
              rows={16}
              placeholder="Markdown content…"
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm outline-none focus:bg-white"
            />
            <div className="flex justify-end">
              <button onClick={saveFile} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                Save
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
