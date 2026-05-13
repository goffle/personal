import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { RiArrowLeftLine, RiDeleteBin6Line, RiDownloadLine, RiFolder3Line, RiEditLine } from "react-icons/ri";

import API from "@/services/api";
import useStore from "@/services/store";
import Loader from "@/components/loader";
import Markdown from "@/components/markdown";

export default function DataRoomDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { organization, user } = useStore();

  const [file, setFile] = useState(null);
  const [content, setContent] = useState("");
  const [ancestors, setAncestors] = useState([]); // [{_id, name}, ...] from root → parent
  const [authors, setAuthors] = useState({}); // id → display name
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  async function load() {
    setLoading(true);
    const r = await API.get(`/file/${id}`);
    if (!r.ok) { setLoading(false); return; }
    setFile(r.data);
    setContent(r.data.content_md || "");

    // Load full file list once to resolve ancestor path
    const all = await API.post("/file/search", {
      organization_id: organization?._id,
      limit: 1000,
    });
    if (all.ok) {
      const byId = new Map(all.data.map((it) => [it._id, it]));
      const chain = [];
      let cur = byId.get(r.data.parent_id);
      while (cur) {
        chain.unshift({ _id: cur._id, name: cur.name });
        cur = byId.get(cur.parent_id);
      }
      setAncestors(chain);
    }

    // Resolve creator name
    if (r.data.created_by) {
      const u = await API.get(`/user/${r.data.created_by}`);
      if (u.ok && u.data) {
        const name = `${u.data.firstname || ""} ${u.data.lastname || ""}`.trim() || u.data.email || r.data.created_by;
        setAuthors((prev) => ({ ...prev, [r.data.created_by]: name }));
      }
    }

    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  function startEdit() {
    setDraft(content);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    const r = await API.put(`/file/${id}`, { content_md: draft });
    setSaving(false);
    if (r.ok) {
      setFile(r.data);
      setContent(draft);
      setEditing(false);
      toast.success("Saved");
    } else {
      toast.error("Save failed");
    }
  }

  function cancelEdit() {
    setDraft("");
    setEditing(false);
  }

  function download() {
    const text = editing ? draft : content;
    const blob = new Blob([text || ""], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeFilename(file.name)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function remove() {
    if (!confirm(`Delete "${file.name}"?`)) return;
    const r = await API.remove(`/file/${id}`);
    if (r.ok) {
      toast.success("Deleted");
      navigate("/data-room");
    }
  }

  const dirty = editing && draft !== content;

  if (loading) return <div className="flex h-full items-center justify-center"><Loader /></div>;
  if (!file) return <div className="p-6 text-slate-500">File not found.</div>;

  const creatorName =
    file.created_by === user?._id
      ? "You"
      : authors[file.created_by] || file.created_by || "—";

  const wordsValue = editing ? draft : content;

  return (
    <div className="flex h-full flex-col">
      {/* Top bar with breadcrumb + actions */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <nav className="flex min-w-0 items-center gap-1 text-sm text-slate-500">
          <Link to="/data-room" className="flex items-center gap-1 hover:text-slate-900">
            <RiArrowLeftLine className="h-4 w-4" />
            Data Room
          </Link>
          {ancestors.map((seg) => (
            <span key={seg._id} className="flex min-w-0 items-center gap-1">
              <span className="text-slate-300">/</span>
              <Link
                to={`/data-room?open=${seg._id}`}
                className="flex items-center gap-1 truncate text-slate-600 hover:text-slate-900 hover:underline"
              >
                <RiFolder3Line className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="truncate">{seg.name}</span>
              </Link>
            </span>
          ))}
          <span className="flex min-w-0 items-center gap-1">
            <span className="text-slate-300">/</span>
            <span className="truncate text-slate-700">{file.name}</span>
          </span>
        </nav>

        <div className="flex items-center gap-2">
          {editing ? (
            <>
              {dirty && <span className="text-xs text-slate-400">Unsaved changes</span>}
              <button
                onClick={cancelEdit}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !dirty}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={download}
                className="flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                title="Download as Markdown"
              >
                <RiDownloadLine className="h-3.5 w-3.5" /> Download
              </button>
              <button
                onClick={startEdit}
                className="flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <RiEditLine className="h-3.5 w-3.5" /> Edit
              </button>
              <button
                onClick={remove}
                className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
                title="Delete"
              >
                <RiDeleteBin6Line className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main content + right sidebar */}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-auto bg-white">
          <div className="mx-auto max-w-3xl px-8 py-10">
            <input
              value={file.name}
              onChange={(e) => setFile({ ...file, name: e.target.value })}
              onBlur={async (e) => {
                const v = e.target.value.trim();
                if (!v || v === file.name) return;
                const r = await API.put(`/file/${id}`, { name: v });
                if (r.ok) { setFile(r.data); toast.success("Renamed", { duration: 1200 }); }
              }}
              className="w-full border-none bg-transparent text-3xl font-semibold text-slate-900 outline-none"
            />

            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
                {initialOf(creatorName)}
              </span>
              <span className="text-slate-700">{creatorName}</span>
              <span className="text-slate-300">·</span>
              <span>Édité {fmtDate(file.updated_at)}</span>
            </div>

            <div className="mt-8">
              {editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="# Write in Markdown…"
                  autoFocus
                  className="h-[calc(100vh-260px)] w-full resize-none rounded-md border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm leading-6 outline-none focus:bg-white focus:border-slate-400"
                />
              ) : content ? (
                <Markdown content={content} className="text-[15px] leading-7" />
              ) : (
                <button
                  onClick={startEdit}
                  className="text-sm text-slate-400 hover:text-slate-600"
                >
                  Empty — click to write…
                </button>
              )}
            </div>
          </div>
        </main>

        <aside className="w-72 shrink-0 overflow-auto border-l border-slate-200 bg-slate-50 p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Properties</h3>

          <Field label="Parent">
            {ancestors.length === 0 ? (
              <span className="text-slate-400">Root</span>
            ) : (
              <Link
                to={`/data-room?open=${ancestors[ancestors.length - 1]._id}`}
                className="flex items-center gap-1 text-slate-700 hover:text-slate-900 hover:underline"
              >
                <RiFolder3Line className="h-3.5 w-3.5 text-amber-500" />
                <span className="truncate">{ancestors[ancestors.length - 1].name}</span>
              </Link>
            )}
          </Field>

          <Field label="Created by">{creatorName}</Field>
          <Field label="Updated">{fmtDate(file.updated_at)}</Field>
          <Field label="Words">{wordCount(wordsValue)}</Field>
          <Field label="Chars">{(wordsValue || "").length.toLocaleString()}</Field>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <div className="mb-0.5 text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}

function safeFilename(name) {
  const base = (name || "untitled").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return base || "untitled";
}

function initialOf(name) {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed || trimmed === "—") return "?";
  return trimmed[0].toUpperCase();
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function wordCount(s) {
  if (!s) return 0;
  return s.trim().split(/\s+/).filter(Boolean).length.toLocaleString();
}
