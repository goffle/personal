import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import useStore from "@/services/store";
import API from "@/services/api";
import Loader from "@/components/loader";
import Layout from "@/components/layout";

import Auth from "@/pages/auth";
import OauthAuthorize from "@/pages/auth/oauth-authorize";
import Tasks from "@/pages/tasks";
import Chat from "@/pages/chat";
import Agents from "@/pages/agents";
import DataRoom from "@/pages/data-room";
import Cron from "@/pages/cron";
import Skills from "@/pages/skills";
import Connectors from "@/pages/connectors";
import Mcp from "@/pages/mcp";
import Usages from "@/pages/usages";
import Members from "@/pages/members";

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <Routes>
        {/* OAuth consent — handles its own auth check (login redirect if needed) */}
        <Route path="/oauth/authorize" element={<OauthAuthorize />} />

        <Route element={<AuthGate />}>
          <Route path="/auth/*" element={<Auth />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/tasks" replace />} />
            <Route path="/tasks/*" element={<Tasks />} />
            <Route path="/chat/*" element={<Chat />} />
            <Route path="/agents/*" element={<Agents />} />
            <Route path="/data-room/*" element={<DataRoom />} />
            <Route path="/cron/*" element={<Cron />} />
            <Route path="/skills/*" element={<Skills />} />
            <Route path="/connectors/*" element={<Connectors />} />
            <Route path="/mcp/*" element={<Mcp />} />
            <Route path="/usages" element={<Usages />} />
            <Route path="/members" element={<Members />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function AuthGate() {
  const { user } = useStore();
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}

function RequireAuth() {
  const { user, setUser, setOrganization } = useStore();
  const [checking, setChecking] = useState(!user);

  useEffect(() => {
    if (user) return;
    (async () => {
      try {
        const r = await API.get("/user/signin_token");
        if (r.ok) {
          if (r.token) API.setToken(r.token);
          setUser(r.user);
          const stored = useStore.getState().organization;
          const fresh = stored && r.organisations?.find((o) => o._id === (stored._id || stored.id));
          // Always prefer the server-side copy so fields like cost_usd stay current.
          setOrganization(fresh || r.organisations?.[0] || null);
        }
      } catch (_e) {
        /* ignore */
      } finally {
        setChecking(false);
      }
    })();
  }, [user, setUser, setOrganization]);

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <Outlet />;
}
