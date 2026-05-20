import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { RiArrowLeftLine, RiDeleteBin6Line } from "react-icons/ri";
import toast from "react-hot-toast";

import API from "@/services/api";
import useStore from "@/services/store";
import Loader from "@/components/loader";

const ROLES = ["member", "admin", "owner"];

export default function MemberDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, organization } = useStore();

  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState(null);
  const [draft, setDraft] = useState({ firstname: "", lastname: "", email: "" });

  const myMembership = (user?.organisations || []).find((o) => o.id === organization?._id);
  const canManage = myMembership?.role === "owner" || myMembership?.role === "admin";
  const isSelf = member?._id === user?._id;
  const orgMembership = (member?.organisations || []).find((o) => o.id === organization?._id);
  const canEdit = canManage || isSelf;
  const canEditRole = canManage && !isSelf;
  const canRemove = canManage || isSelf;

  async function load() {
    setLoading(true);
    const r = await API.get(`/user/${id}`);
    if (r.ok) {
      setMember(r.data);
      setDraft({ firstname: r.data.firstname || "", lastname: r.data.lastname || "", email: r.data.email || "" });
    } else {
      toast.error(r.code || "Could not load");
    }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function saveField(field) {
    if ((draft[field] || "") === (member[field] || "")) return;
    setSavingField(field);
    const r = await API.put(`/user/${id}`, { [field]: draft[field] });
    if (r.ok) {
      setMember(r.data);
      toast.success("Saved");
    } else {
      toast.error(r.code || "Save failed");
      setDraft({ ...draft, [field]: member[field] || "" });
    }
    setSavingField(null);
  }

  async function changeRole(role) {
    setSavingField("role");
    const r = await API.put(`/user/${id}`, { organization_id: organization._id, role });
    if (r.ok) {
      setMember(r.data);
      toast.success("Role updated");
    } else {
      toast.error(r.code || "Could not update role");
    }
    setSavingField(null);
  }

  async function remove() {
    const label = isSelf ? "Leave this workspace?" : `Remove ${member.email} from this workspace?`;
    if (!window.confirm(label)) return;
    const r = await API.remove(`/user/${id}?organization_id=${organization._id}`);
    if (!r.ok) {
      toast.error(r.code || "Could not remove");
      return;
    }
    if (isSelf) {
      window.location.href = "/auth";
    } else {
      toast.success("Removed");
      navigate("/members");
    }
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader /></div>;
  if (!member) return <div className="p-6 text-slate-500">User not found.</div>;

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link to="/members" className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <RiArrowLeftLine className="h-4 w-4" /> Back to members
        </Link>
        {canRemove && (
          <button
            onClick={remove}
            className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            <RiDeleteBin6Line className="h-3.5 w-3.5" /> {isSelf ? "Leave workspace" : "Remove from workspace"}
          </button>
        )}
      </div>

      <h1 className="mb-1 text-2xl font-semibold text-slate-900">
        {member.firstname || member.lastname ? `${member.firstname || ""} ${member.lastname || ""}`.trim() : member.email}
      </h1>
      <p className="mb-6 text-sm text-slate-500">{member.email}</p>

      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <Field label="First name">
          <input
            disabled={!canEdit}
            value={draft.firstname}
            onChange={(e) => setDraft({ ...draft, firstname: e.target.value })}
            onBlur={() => saveField("firstname")}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
          />
          {savingField === "firstname" && <SavingHint />}
        </Field>
        <Field label="Last name">
          <input
            disabled={!canEdit}
            value={draft.lastname}
            onChange={(e) => setDraft({ ...draft, lastname: e.target.value })}
            onBlur={() => saveField("lastname")}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
          />
          {savingField === "lastname" && <SavingHint />}
        </Field>
        <Field label="Email">
          <input
            type="email"
            disabled={!canEdit}
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            onBlur={() => saveField("email")}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
          />
          {savingField === "email" && <SavingHint />}
        </Field>
        <Field label="Role in this workspace">
          {canEditRole ? (
            <select
              value={orgMembership?.role || "member"}
              onChange={(e) => changeRole(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : (
            <div className="text-sm text-slate-700">{orgMembership?.role || "—"}</div>
          )}
          {savingField === "role" && <SavingHint />}
        </Field>
        <Field label="Status">
          {member.invite_token ? (
            <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Pending invite</span>
          ) : (
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
          )}
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function SavingHint() {
  return <span className="mt-1 block text-xs text-slate-400">Saving…</span>;
}
