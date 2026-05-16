import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { RiAddLine, RiArrowLeftLine, RiChat3Line, RiDeleteBin6Line, RiFileTextLine, RiPlayLine, RiPlugLine, RiToolsLine } from "react-icons/ri";

import API from "@/services/api";
import useStore from "@/services/store";
import Loader from "@/components/loader";

const TABS = [
  { value: "config", label: "Configuration" },
  { value: "connectors", label: "Connectors" },
  { value: "skills", label: "Skills" },
  { value: "schedules", label: "Schedules" },
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

  async function startChat() {
    const r = await API.post("/chat", {
      organization_id: agent.organization_id,
      agent_id: agent._id,
      title: agent.name,
    });
    if (r.ok) {
      navigate("/chat");
    } else {
      toast.error(r.message || "Could not create chat");
    }
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader /></div>;
  if (!agent) return <div className="p-6 text-slate-500">Agent not found.</div>;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link to="/agents" className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <RiArrowLeftLine className="h-4 w-4" /> Back to agents
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={startChat} className="flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800">
            <RiChat3Line className="h-3.5 w-3.5" /> Chat with {agent.name}
          </button>
          <button onClick={deleteAgent} className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">
            <RiDeleteBin6Line className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
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
      {tab === "connectors" && (
        <ConnectorsTab agent={agent} patch={patch} />
      )}
      {tab === "skills" && (
        <SkillsTab agent={agent} />
      )}
      {tab === "schedules" && (
        <SchedulesTab agent={agent} />
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

function ConnectorsTab({ agent, patch }) {
  const { organization } = useStore();
  const [items, setItems] = useState([]);
  const [driverKinds, setDriverKinds] = useState(null);
  const [loading, setLoading] = useState(true);
  const linked = agent.connectors || [];

  async function load() {
    setLoading(true);
    const [list, drivers] = await Promise.all([
      API.post("/connector/search", { organization_id: organization?._id, limit: 200 }),
      API.get("/connector/drivers"),
    ]);
    if (list.ok) setItems(list.data);
    if (drivers.ok) setDriverKinds(new Set(drivers.data?.kinds || []));
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [organization?._id]);

  async function toggle(c) {
    const isLinked = linked.some((x) => x.id === c._id);
    const next = isLinked
      ? linked.filter((x) => x.id !== c._id)
      : [...linked, { id: c._id, name: c.name }];
    await patch({ connectors: next });
  }

  const statusColor = {
    connected: "bg-emerald-500",
    disconnected: "bg-slate-300",
    error: "bg-red-500",
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Available connectors</span>
        <span className="text-xs text-slate-500">{linked.length} linked</span>
      </div>
      {loading ? (
        <div className="flex justify-center py-8"><Loader /></div>
      ) : items.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-500">No connectors in this org yet.</div>
      ) : (
        <ul>
          {items.map((c) => {
            const isLinked = linked.some((x) => x.id === c._id);
            const driverMissing = driverKinds && c.kind && !driverKinds.has(c.kind);
            return (
              <li key={c._id} className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 first:border-t-0">
                <label className="flex flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={isLinked} onChange={() => toggle(c)} className="h-4 w-4 rounded border-slate-300" />
                  <RiPlugLine className="h-4 w-4 text-slate-400" />
                  <div className="flex flex-1 items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{c.name}</div>
                      <div className="text-xs text-slate-500">{c.kind || "—"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {driverMissing && (
                        <span
                          className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200"
                          title={`No driver registered for kind="${c.kind}" — linking this connector will expose no tools to the agent.`}
                        >
                          driver missing
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span className={`h-1.5 w-1.5 rounded-full ${statusColor[c.status] || "bg-slate-300"}`} />
                        {c.status || "unknown"}
                      </span>
                    </div>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}
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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
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
                className="rounded p-0.5 text-slate-400 hover:text-red-600 opacity-100 md:opacity-0 md:group-hover:opacity-100"
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

function SkillsTab({ agent }) {
  const { organization } = useStore();
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const selected = skills.find((s) => s._id === selectedId);

  async function load() {
    setLoading(true);
    const r = await API.post("/skill/search", { organization_id: organization?._id, agent_id: agent._id, limit: 200 });
    if (r.ok) {
      setSkills(r.data);
      if (!selectedId && r.data[0]) setSelectedId(r.data[0]._id);
    }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [agent._id]);

  useEffect(() => {
    setDraft(selected ? { name: selected.name, description: selected.description || "", body_md: selected.body_md || "" } : null);
  }, [selectedId, selected?.name, selected?.description, selected?.body_md]);

  async function addSkill() {
    const name = prompt("Skill name (e.g. morning-brief):");
    if (!name) return;
    const r = await API.post("/skill", { name, organization_id: organization?._id, agent_id: agent._id });
    if (r.ok) {
      await load();
      setSelectedId(r.data._id);
    } else {
      toast.error("Could not create skill");
    }
  }

  async function saveSkill() {
    if (!selected || !draft) return;
    const r = await API.put(`/skill/${selected._id}`, draft);
    if (r.ok) {
      setSkills((prev) => prev.map((s) => (s._id === selected._id ? r.data : s)));
      toast.success("Saved");
    } else {
      toast.error("Save failed");
    }
  }

  async function removeSkill(skill) {
    if (!confirm(`Delete "${skill.name}"?`)) return;
    const r = await API.remove(`/skill/${skill._id}`);
    if (r.ok) {
      const next = skills.filter((s) => s._id !== skill._id);
      setSkills(next);
      if (selectedId === skill._id) setSelectedId(next[0]?._id || null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
      <aside className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Skills</span>
          <button onClick={addSkill} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Add skill">
            <RiAddLine className="h-4 w-4" />
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-6"><Loader /></div>
        ) : skills.length === 0 ? (
          <div className="px-3 py-3 text-xs text-slate-500">No skills yet.</div>
        ) : (
          <ul>
            {skills.map((s) => (
              <li
                key={s._id}
                onClick={() => setSelectedId(s._id)}
                className={`group flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 ${
                  selectedId === s._id ? "bg-slate-100 text-slate-900" : "text-slate-700"
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <RiToolsLine className="h-3.5 w-3.5 text-slate-400" />
                  <span className="truncate">{s.name}</span>
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeSkill(s); }}
                  className="rounded p-0.5 text-slate-400 hover:text-red-600 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                  title="Delete skill"
                >
                  <RiDeleteBin6Line className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        {!selected || !draft ? (
          <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-slate-500">
            Select or add a skill to edit.
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Description</span>
              <input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="When and how to use this skill…"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Body (Markdown)</span>
              <textarea
                value={draft.body_md}
                onChange={(e) => setDraft({ ...draft, body_md: e.target.value })}
                rows={16}
                placeholder="The instructions sent to the agent when this skill runs…"
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm outline-none focus:bg-white"
              />
            </label>
            <div className="flex justify-end">
              <button onClick={saveSkill} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                Save
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SchedulesTab({ agent }) {
  const { organization } = useStore();
  const [crons, setCrons] = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    const [cronRes, skillRes] = await Promise.all([
      API.post("/cron-job/search", { organization_id: organization?._id, agent_id: agent._id, limit: 200 }),
      API.post("/skill/search", { organization_id: organization?._id, agent_id: agent._id, limit: 200 }),
    ]);
    if (cronRes.ok) setCrons(cronRes.data);
    if (skillRes.ok) setSkills(skillRes.data);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [agent._id]);

  async function toggleEnabled(cron) {
    const r = await API.put(`/cron-job/${cron._id}`, { enabled: !cron.enabled });
    if (r.ok) setCrons((prev) => prev.map((c) => (c._id === cron._id ? r.data : c)));
  }

  async function remove(cron) {
    if (!confirm(`Delete schedule "${cron.name}"?`)) return;
    const r = await API.remove(`/cron-job/${cron._id}`);
    if (r.ok) setCrons((prev) => prev.filter((c) => c._id !== cron._id));
  }

  async function runNow(cron) {
    const r = await API.post(`/cron-job/${cron._id}/run`);
    if (r.ok) {
      toast.success("Run triggered");
      load();
    } else {
      toast.error(r.message || "Run failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {crons.length} schedule{crons.length === 1 ? "" : "s"}
        </span>
        <button
          onClick={() => setShowCreate(true)}
          disabled={skills.length === 0}
          className="flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          title={skills.length === 0 ? "Create a skill first" : "New schedule"}
        >
          <RiAddLine className="h-4 w-4" /> New schedule
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="flex justify-center py-8"><Loader /></div>
        ) : crons.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            {skills.length === 0
              ? "Create a skill first, then schedule it here."
              : "No schedules yet. Click \"New schedule\" to add one."}
          </div>
        ) : (
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Schedule</th>
                <th className="px-4 py-2.5">Skill</th>
                <th className="px-4 py-2.5">Last run</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {crons.map((c) => (
                <tr key={c._id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{c.schedule}</td>
                  <td className="px-4 py-3 text-slate-700">{c.skill_name || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {c.last_run_at ? new Date(c.last_run_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleEnabled(c)}
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        c.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {c.enabled ? "enabled" : "paused"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => runNow(c)}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        title="Run now"
                      >
                        <RiPlayLine className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(c)}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        <RiDeleteBin6Line className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateScheduleModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); load(); }}
        agent={agent}
        skills={skills}
      />
    </div>
  );
}

function CreateScheduleModal({ open, onClose, onCreated, agent, skills }) {
  const { organization } = useStore();
  const [form, setForm] = useState({ name: "", schedule: "0 8 * * *", skill_id: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && !form.skill_id && skills[0]) setForm((f) => ({ ...f, skill_id: skills[0]._id }));
  }, [open, skills, form.skill_id]);

  if (!open) return null;

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const skill = skills.find((s) => s._id === form.skill_id);
      const r = await API.post("/cron-job", {
        name: form.name,
        schedule: form.schedule,
        skill_id: form.skill_id,
        skill_name: skill?.name || "",
        agent_id: agent._id,
        organization_id: organization?._id,
        enabled: true,
      });
      if (r.ok) {
        toast.success("Scheduled");
        setForm({ name: "", schedule: "0 8 * * *", skill_id: skills[0]?._id || "" });
        onCreated?.();
      } else {
        toast.error(r.message || "Create failed");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h3 className="mb-3 text-base font-semibold text-slate-900">New schedule</h3>
        <form onSubmit={save} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Name</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Morning brief"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Schedule (cron)</span>
            <input
              required
              value={form.schedule}
              onChange={(e) => setForm({ ...form, schedule: e.target.value })}
              placeholder="0 8 * * *"
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Standard 5-field cron. Default <code>0 8 * * *</code> = every day at 08:00.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Skill</span>
            <select
              required
              value={form.skill_id}
              onChange={(e) => setForm({ ...form, skill_id: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {skills.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-2 text-sm">Cancel</button>
            <button
              disabled={saving || !form.skill_id}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
