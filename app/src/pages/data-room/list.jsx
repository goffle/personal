import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  RiAddLine,
  RiFile3Line,
  RiFolder3Line,
  RiFolderOpenLine,
  RiDeleteBin6Line,
  RiArrowRightSLine,
} from "react-icons/ri";

import API from "@/services/api";
import useStore from "@/services/store";
import Modal from "@/components/modal";
import Loader from "@/components/loader";

export default function DataRoomList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get("open");
  const { organization } = useStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(() => new Set());
  const [createUnder, setCreateUnder] = useState(undefined); // undefined = closed; null = at root; id = inside folder
  const [highlightId, setHighlightId] = useState(null);
  const rowRefs = useRef(new Map());

  async function load() {
    setLoading(true);
    const r = await API.post("/file/search", {
      organization_id: organization?._id,
      limit: 1000,
    });
    if (r.ok) setItems(r.data);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [organization?._id]);

  const tree = useMemo(() => buildTree(items), [items]);

  // Handle ?open=<folderId>: expand ancestors, scroll, briefly highlight, clear param.
  useEffect(() => {
    if (!openId || loading || items.length === 0) return;
    const byId = new Map(items.map((it) => [it._id, it]));
    if (!byId.has(openId)) {
      setSearchParams({}, { replace: true });
      return;
    }
    const toExpand = new Set();
    // expand the folder itself + every ancestor
    let cur = byId.get(openId);
    while (cur) {
      toExpand.add(cur._id);
      cur = byId.get(cur.parent_id);
    }
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of toExpand) next.add(id);
      return next;
    });
    setHighlightId(openId);
    setSearchParams({}, { replace: true });

    // scroll + clear highlight after the next paint
    const raf = requestAnimationFrame(() => {
      rowRefs.current.get(openId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const t = setTimeout(() => setHighlightId(null), 1800);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
    // eslint-disable-next-line
  }, [openId, loading, items]);

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function remove(item) {
    if (!confirm(`Delete "${item.name}"?`)) return;
    const r = await API.remove(`/file/${item._id}`);
    if (r.ok) { toast.success("Deleted"); load(); }
  }

  function openItem(it) {
    if (it.kind === "folder") toggle(it._id);
    else navigate(`/data-room/${it._id}`);
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Data Room</h1>
        <button
          onClick={() => setCreateUnder(null)}
          className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <RiAddLine className="h-4 w-4" /> New at root
        </button>
      </header>

      <div className="rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-center"><Loader /></div>
        ) : tree.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Empty data room.</div>
        ) : (
          <ul className="py-1">
            {tree.map((node) => (
              <TreeNode
                key={node._id}
                node={node}
                depth={0}
                expanded={expanded}
                onToggle={toggle}
                onOpen={openItem}
                onCreateChild={(id) => setCreateUnder(id)}
                onDelete={remove}
                highlightId={highlightId}
                rowRefs={rowRefs}
              />
            ))}
          </ul>
        )}
      </div>

      <CreateModal
        open={createUnder !== undefined}
        onClose={() => setCreateUnder(undefined)}
        parentId={createUnder ?? null}
        onCreated={(item) => {
          setCreateUnder(undefined);
          if (item?.parent_id) setExpanded((prev) => new Set(prev).add(item.parent_id));
          load();
        }}
      />
    </div>
  );
}

function buildTree(items) {
  const byParent = new Map();
  for (const it of items) {
    const key = it.parent_id || null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(it);
  }
  for (const arr of byParent.values()) arr.sort(sortItems);
  const attachChildren = (node) => {
    const kids = byParent.get(node._id) || [];
    node.children = kids.map(attachChildren);
    return node;
  };
  return (byParent.get(null) || []).map(attachChildren);
}

function sortItems(a, b) {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function TreeNode({ node, depth, expanded, onToggle, onOpen, onCreateChild, onDelete, highlightId, rowRefs }) {
  const isFolder = node.kind === "folder";
  const isOpen = expanded.has(node._id);
  const hasChildren = node.children && node.children.length > 0;
  const isHighlighted = highlightId === node._id;

  return (
    <li>
      <div
        ref={(el) => {
          if (!rowRefs) return;
          if (el) rowRefs.current.set(node._id, el);
          else rowRefs.current.delete(node._id);
        }}
        className={`group flex items-center gap-1 px-2 py-1.5 transition-colors ${
          isHighlighted ? "bg-amber-100" : "hover:bg-slate-50"
        }`}
        style={{ paddingLeft: 8 + depth * 18 }}
      >
        {isFolder ? (
          <button
            onClick={() => onToggle(node._id)}
            className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            <RiArrowRightSLine className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="inline-block h-5 w-5" />
        )}

        <button
          onClick={() => onOpen(node)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          {isFolder ? (
            isOpen ? (
              <RiFolderOpenLine className="h-4 w-4 text-amber-500" />
            ) : (
              <RiFolder3Line className="h-4 w-4 text-amber-500" />
            )
          ) : (
            <RiFile3Line className="h-4 w-4 text-slate-400" />
          )}
          <span className="text-sm text-slate-800">{node.name}</span>
          {isFolder && hasChildren && (
            <span className="text-xs text-slate-400">{node.children.length}</span>
          )}
        </button>

        <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
          {isFolder && (
            <button
              onClick={() => onCreateChild(node._id)}
              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              title="New inside"
            >
              <RiAddLine className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => onDelete(node)}
            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
            title="Delete"
          >
            <RiDeleteBin6Line className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isFolder && isOpen && hasChildren && (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child._id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onOpen={onOpen}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
              highlightId={highlightId}
              rowRefs={rowRefs}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function CreateModal({ open, onClose, onCreated, parentId }) {
  const { organization } = useStore();
  const [kind, setKind] = useState("folder");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setKind("folder"); setName(""); } }, [open]);

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
      if (r.ok) { toast.success("Created"); onCreated?.(r.data); }
      else toast.error("Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={parentId ? "New item inside folder" : "New item at root"}>
      <form onSubmit={save} className="space-y-3">
        <div className="flex gap-2">
          {["folder", "file"].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`flex-1 rounded-md border px-3 py-2 text-sm capitalize ${
                kind === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
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
