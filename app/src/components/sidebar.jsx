import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  RiCheckboxMultipleLine,
  RiChat3Line,
  RiRobot2Line,
  RiFolder3Line,
  RiTimer2Line,
  RiBookOpenLine,
  RiPlugLine,
  RiServerLine,
  RiCloseLine,
  RiArrowDownSLine,
  RiCheckLine,
  RiAddLine,
  RiTeamLine,
} from "react-icons/ri";
import toast from "react-hot-toast";

import useStore from "@/services/store";
import API from "@/services/api";

const NAV = [
  { to: "/tasks", label: "Tasks", icon: RiCheckboxMultipleLine },
  { to: "/chat", label: "Chat", icon: RiChat3Line },
  { to: "/agents", label: "Agents", icon: RiRobot2Line },
  { to: "/data-room", label: "Data Room", icon: RiFolder3Line },
  { to: "/cron", label: "Cron", icon: RiTimer2Line },
  { to: "/skills", label: "Skills", icon: RiBookOpenLine },
  { to: "/connectors", label: "Connectors", icon: RiPlugLine },
  { to: "/mcp", label: "MCP", icon: RiServerLine },
];

export default function Sidebar({ open = false, onClose }) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
          <WorkspaceSwitcher />
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:hidden"
            aria-label="Close menu"
          >
            <RiCloseLine className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition ${
                  isActive ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}

function WorkspaceSwitcher() {
  const { user, organization, setUser, setOrganization } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

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

  async function switchOrg(orgEntry) {
    if (orgEntry.id === organization?._id) {
      setOpen(false);
      return;
    }
    const r = await API.get(`/organization/${orgEntry.id}`);
    if (!r.ok) {
      toast.error("Could not switch workspace");
      return;
    }
    setOrganization(r.data);
    setOpen(false);
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
    setOpen(false);
    toast.success("Workspace created");
    window.location.reload();
  }

  const orgs = user?.organisations || [];

  return (
    <div className="relative min-w-0 flex-1" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-slate-100"
        aria-label="Switch workspace"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">Console</div>
          <div className="mt-0.5 truncate text-xs text-slate-500">{organization?.name || "No workspace"}</div>
        </div>
        <RiArrowDownSLine className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
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
              onClick={() => { setOpen(false); navigate("/members"); }}
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
  );
}
