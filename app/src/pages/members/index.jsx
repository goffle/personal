import { useEffect, useState } from "react";
import { RiTeamLine, RiUserAddLine, RiDeleteBin6Line, RiClipboardLine } from "react-icons/ri";
import toast from "react-hot-toast";

import API from "@/services/api";
import useStore from "@/services/store";
import Loader from "@/components/loader";

const ROLES = ["member", "admin", "owner"];

export default function Members() {
  const { user, organization } = useStore();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [acceptUrl, setAcceptUrl] = useState(null);

  const myMembership = (user?.organisations || []).find((o) => o.id === organization?._id);
  const canManage = myMembership?.role === "owner" || myMembership?.role === "admin";

  async function load() {
    if (!organization?._id) return;
    setLoading(true);
    const r = await API.post("/user/search", { organization_id: organization._id, limit: 200 });
    if (r.ok) setMembers(r.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [organization?._id]);

  async function remove(member) {
    const isSelf = member._id === user?._id;
    const label = isSelf ? "Leave this workspace?" : `Remove ${member.email}?`;
    if (!window.confirm(label)) return;
    const r = await API.remove(`/user/${member._id}?organization_id=${organization._id}`);
    if (!r.ok) {
      toast.error(r.code || "Could not remove");
      return;
    }
    toast.success(isSelf ? "Left workspace" : "Removed");
    if (isSelf) {
      window.location.href = "/auth";
    } else {
      load();
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <header className="mb-5 flex items-center gap-3">
        <RiTeamLine className="h-6 w-6 text-slate-500" />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">Members</h1>
          <p className="text-sm text-slate-500">
            People with access to <span className="font-medium text-slate-700">{organization?.name || "—"}</span>.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => { setAcceptUrl(null); setInviteOpen(true); }}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <RiUserAddLine className="h-4 w-4" />
            Invite
          </button>
        )}
      </header>

      {loading ? (
        <div className="flex justify-center py-16"><Loader /></div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const mem = (m.organisations || []).find((o) => o.id === organization?._id);
                const pending = !!m.invite_token;
                return (
                  <tr key={m._id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      {m.firstname || m.lastname ? `${m.firstname || ""} ${m.lastname || ""}`.trim() : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{m.email}</td>
                    <td className="px-4 py-2.5 text-slate-600">{mem?.role || "—"}</td>
                    <td className="px-4 py-2.5">
                      {pending ? (
                        <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Pending</span>
                      ) : (
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {(canManage || m._id === user?._id) && (
                        <button
                          onClick={() => remove(m)}
                          className="inline-flex items-center gap-1 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove member"
                          title={m._id === user?._id ? "Leave workspace" : "Remove member"}
                        >
                          <RiDeleteBin6Line className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No members.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {inviteOpen && (
        <InviteModal
          orgId={organization._id}
          submitting={inviting}
          setSubmitting={setInviting}
          acceptUrl={acceptUrl}
          setAcceptUrl={setAcceptUrl}
          onClose={() => { setInviteOpen(false); setAcceptUrl(null); load(); }}
        />
      )}
    </div>
  );
}

function InviteModal({ orgId, submitting, setSubmitting, acceptUrl, setAcceptUrl, onClose }) {
  const [form, setForm] = useState({ email: "", role: "member" });

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await API.post("/user/invite", { organization_id: orgId, email: form.email.trim().toLowerCase(), role: form.role });
      if (!r.ok) {
        toast.error(r.code || "Invite failed");
        return;
      }
      if (r.accept_url) {
        setAcceptUrl(r.accept_url);
        toast.success("Invite created — share the link below");
      } else if (r.already_existed) {
        toast.success("Added existing user to workspace");
        onClose();
      } else {
        toast.success("Invited");
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(acceptUrl);
    toast.success("Copied");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Invite member</h2>
        {acceptUrl ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Share this link with the invitee. It expires in 7 days.
            </p>
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <code className="flex-1 truncate text-xs text-slate-700">{acceptUrl}</code>
              <button onClick={copy} className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800" aria-label="Copy">
                <RiClipboardLine className="h-4 w-4" />
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={onClose} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
              <input
                autoFocus
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Role</span>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {submitting ? "Sending…" : "Send invite"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
