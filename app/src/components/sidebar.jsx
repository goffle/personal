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
  RiLogoutBoxRLine,
} from "react-icons/ri";

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

export default function Sidebar() {
  const { user, organization, setUser, setOrganization } = useStore();
  const navigate = useNavigate();

  async function logout() {
    await API.post("/user/logout");
    API.setToken(null);
    setUser(null);
    setOrganization(null);
    navigate("/auth");
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="text-sm font-semibold text-slate-900">Console</div>
        <div className="mt-0.5 truncate text-xs text-slate-500">{organization?.name || "No workspace"}</div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
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

      <div className="border-t border-slate-200 px-3 py-3">
        <div className="mb-2 text-xs text-slate-600">
          <div className="truncate font-medium text-slate-800">
            {user?.firstname} {user?.lastname}
          </div>
          <div className="truncate text-slate-500">{user?.email}</div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          <RiLogoutBoxRLine className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </aside>
  );
}
