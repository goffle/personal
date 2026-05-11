import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { RiAddLine, RiFile3Line, RiFolder3Line, RiDeleteBin6Line, RiArrowLeftLine } from "react-icons/ri";

import API from "@/services/api";
import useStore from "@/services/store";
import Modal from "@/components/modal";
import Loader from "@/components/loader";

export default function DataRoom() {
  const { organization } = useStore();
  const [parents, setParents] = useState([{ _id: null, name: "Root" }]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [active, setActive] = useState(null);

  const currentParent = parents[parents.length - 1];

  async function load() {
    setLoading(true);
    const r = await API.post("/file/search", {
      organization_id: organization?._id,
      parent_id: currentParent._id,
      limit: 200,
    });
    if (r.ok) setItems(r.data);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [organization?._id, currentParent._id]);

  function open(item) {
    if (item.kind === "folder") setParents([...parents, item]);
    else setActive(item);
  }

  async function remove(item) {
    if (!confirm(`Delete "${item.name}"?`)) return;
    const r = await API.remove(`/file/${item._id}`);
    if (r.ok) load();
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Data Room</h1>
          <nav className="mt-1 flex items-center gap-1 text-sm text-slate-500">
            {parents.map((p, i) => (
              <span key={p._id || "root"} className="flex items-center gap-1">
                <button
                  onClick={() => setParents(parents.slice(0, i + 1))}
                  className="hover:text-slate-900"
                  disabled={i === parents.length - 1}
                >
                  {p.name}
                </button>
                {i < parents.length - 1 && <span>/</span>}
              </span>
            ))}
          </nav>
        </div>
        <div className="flex gap-2">
          {parents.length > 1 && (
            <button onClick={() => setParents(parents.slice(0, -1))} className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-sm">
              <RiArrowLeftLine className="h-4 w-4" /> Up
            </button>
          )}
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
            <RiAddLine className="h-4 w-4" /> New
          </button>
        </div>
      </header>

      <div className="rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-center"><Loader /></div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Empty folder.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((it) => (
              <li key={it._id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                <button onClick={() => open(it)} className="flex flex-1 items-center gap-3 text-left">
                  {it.kind === "folder" ? <RiFolder3Line className="h-5 w-5 text-amber-500" /> : <RiFile3Line className="h-5 w-5 text-slate-400" />}
                  <span className="text-sm text-slate-800">{it.name}</span>
                </button>
                <button onClick={() => remove(it)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <RiDeleteBin6Line className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        parentId={currentParent._id}
        onCreated={() => { setShowCreate(false); load(); }}
      />

      <FileViewer file={active} onClose={() => setActive(null)} onSaved={(f) => { setActive(f); load(); }} />
    </div>
  );
}

function CreateModal({ open, onClose, onCreated, parentId }) {
  const { organization } = useStore();
  const [kind, setKind] = useState("file");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await API.post("/file", {
        organization_id: organization?._id,
        parent_id: parentId,
        name,
        kind,
      });
      if (r.ok) { toast.success("Created"); setName(""); onCreated?.(); }
      else toast.error("Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New item">
      <form onSubmit={save} className="space-y-3">
        <div className="flex gap-2">
          {["file", "folder"].map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`flex-1 rounded-md border px-3 py-2 text-sm capitalize ${
              kind === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"
            }`}>
              {k}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
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

function FileViewer({ file, onClose, onSaved }) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setContent(file?.content_md || ""); }, [file]);
  if (!file) return null;

  async function save() {
    setSaving(true);
    const r = await API.put(`/file/${file._id}`, { content_md: content });
    setSaving(false);
    if (r.ok) { toast.success("Saved"); onSaved?.(r.data); }
  }

  return (
    <Modal open={!!file} onClose={onClose} title={file.name} width="max-w-3xl">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={18}
        placeholder="# Markdown…"
        className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-slate-300 px-3 py-2 text-sm">Close</button>
        <button onClick={save} disabled={saving} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
