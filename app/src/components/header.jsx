import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RiLogoutBoxRLine, RiCoinLine, RiMenuLine, RiArrowDownSLine, RiCheckLine, RiAddLine, RiTeamLine } from "react-icons/ri";
import toast from "react-hot-toast";

import useStore from "@/services/store";
import API from "@/services/api";

function initial(user) {
  return (user?.firstname?.[0] || user?.email?.[0] || "?").toUpperCase();
}

function formatCost(usd) {
  if (typeof usd !== "number" || Number.isNaN(usd)) return "$0.00";
  if (usd >= 0.01) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}

export default function Header({ onMenuClick }) {
  const { user, organization, setUser, setOrganization } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
  const rootRef = useRef(null);
  const orgRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!orgOpen) return;
    function onDocClick(e) {
      if (orgRef.current && !orgRef.current.contains(e.target)) setOrgOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOrgOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [orgOpen]);

  async function logout() {
    await API.post("/user/logout");
    API.setToken(null);
    setUser(null);
    setOrganization(null);
    navigate("/auth");
  }

  async function switchOrg(orgEntry) {
    if (orgEntry.id === organization?._id) {
      setOrgOpen(false);
      return;
    }
    const r = await API.get(`/organization/${orgEntry.id}`);
    if (!r.ok) {
      toast.error("Could not switch workspace");
      return;
    }
    setOrganization(r.data);
    setOrgOpen(false);
    window.location.reload();
  }

  async function createOrg() {
    const name = window.prompt("Workspace name");
    if (!name || !name.trim()) return;
    const r = await API.post("/organization", { name: name.trim() });
    if (!r.ok) {
      toast.error(r.code || "Could not create workspace");
      return;
    }
    const fresh = await API.get("/user/signin_token");
    if (fresh.ok) setUser(fresh.user);
    setOrganization(r.data);
    setOrgOpen(false);
    toast.success("Workspace created");
    window.location.reload();
  }

  const orgs = user?.organisations || [];

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 md:px-4">
      <button
        onClick={onMenuClick}
        className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:hidden"
        aria-label="Open menu"
      >
        <RiMenuLine className="h-5 w-5" />
      </button>

      <div className="relative" ref={orgRef}>
        <button
          onClick={() => setOrgOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
          aria-label="Switch workspace"
        >
          <span className="max-w-[160px] truncate font-medium">{organization?.name || "No workspace"}</span>
          <RiArrowDownSLine className="h-4 w-4 text-slate-400" />
        </button>

        {orgOpen && (
          <div className="absolute left-0 top-10 z-50 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            <div className="border-b border-slate-100 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Workspaces
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {orgs.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-500">None</div>
              ) : (
                orgs.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => switchOrg(o)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span className="flex h-5 w-5 items-center justify-center">
                      {o.id === organization?._id && <RiCheckLine className="h-4 w-4 text-slate-900" />}
                    </span>
                    <span className="flex-1 truncate">{o.name}</span>
                    <span className="text-xs text-slate-400">{o.role}</span>
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-slate-100">
              <button
                onClick={() => { setOrgOpen(false); navigate("/members"); }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <RiTeamLine className="h-4 w-4 text-slate-400" />
                Members
              </button>
              <button
                onClick={createOrg}
                className="flex w-full items-center gap-3 border-t border-slate-100 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <RiAddLine className="h-4 w-4 text-slate-400" />
                Create workspace
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1" />
      <span
        className="rounded-md bg-slate-100 px-2 py-1 text-xs font-mono tabular-nums text-slate-600"
        title="Cumulative Anthropic API spend for this organization"
      >
        {formatCost(organization?.cost_usd)}
      </span>
      <div className="relative" ref={rootRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-medium text-white hover:bg-slate-800"
          aria-label="Account menu"
        >
          {initial(user)}
        </button>

        {open && (
          <div className="absolute right-0 top-10 z-50 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            <div className="flex flex-col items-center gap-1 px-4 py-5">
              <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-xl font-medium text-white">
                {initial(user)}
              </div>
              <div className="text-sm font-semibold text-slate-900">
                {user?.firstname || user?.lastname ? `${user?.firstname || ""} ${user?.lastname || ""}`.trim() : "—"}
              </div>
              <div className="text-xs text-slate-500">{user?.email}</div>
              {organization?.name && <div className="mt-0.5 text-xs text-slate-400">{organization.name}</div>}
            </div>
            <div className="border-t border-slate-100">
              <button
                onClick={() => { setOpen(false); navigate("/usages"); }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <RiCoinLine className="h-4 w-4 text-slate-400" />
                Usages
              </button>
              <button
                onClick={logout}
                className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <RiLogoutBoxRLine className="h-4 w-4 text-slate-400" />
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
