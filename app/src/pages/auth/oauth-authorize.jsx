import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { RiLinkM, RiShieldCheckLine } from "react-icons/ri";

import API from "@/services/api";
import useStore from "@/services/store";
import Loader from "@/components/loader";

const REQUIRED = ["client_id", "redirect_uri", "code_challenge", "response_type"];

export default function OauthAuthorize() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, setUser, setOrganization } = useStore();

  const params = Object.fromEntries(searchParams.entries());

  const [checking, setChecking] = useState(!user);
  const [client, setClient] = useState(null);
  const [clientError, setClientError] = useState(null);
  const [approving, setApproving] = useState(false);
  const [denying, setDenying] = useState(false);

  useEffect(() => {
    if (user) {
      setChecking(false);
      return;
    }
    (async () => {
      try {
        const r = await API.get("/user/signin_token");
        if (!r.ok || !r.user) {
          const back = window.location.pathname + window.location.search;
          navigate(`/auth?redirect=${encodeURIComponent(back)}`, { replace: true });
          return;
        }
        if (r.token) API.setToken(r.token);
        setUser(r.user);
        setOrganization(r.organisations?.[0] || null);
      } catch {
        const back = window.location.pathname + window.location.search;
        navigate(`/auth?redirect=${encodeURIComponent(back)}`, { replace: true });
      } finally {
        setChecking(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user || !params.client_id) return;
    (async () => {
      try {
        const r = await API.get(`/oauth/authorize/client?client_id=${encodeURIComponent(params.client_id)}`);
        if (!r.ok) {
          setClientError(r.code || "Unknown client");
          return;
        }
        setClient(r);
      } catch (e) {
        setClientError(e?.message || "Could not load client info");
      }
    })();
  }, [user, params.client_id]);

  const missing = REQUIRED.filter((k) => !params[k]);
  const badMethod = params.code_challenge_method && params.code_challenge_method !== "S256";
  const badResponse = params.response_type && params.response_type !== "code";

  async function approve() {
    try {
      setApproving(true);
      const r = await API.post("/oauth/authorize/grant", {
        client_id: params.client_id,
        redirect_uri: params.redirect_uri,
        code_challenge: params.code_challenge,
        code_challenge_method: params.code_challenge_method || "S256",
        response_type: params.response_type,
        state: params.state,
        scope: params.scope,
        resource: params.resource,
      });
      if (r.redirect_url) window.location.href = r.redirect_url;
      else {
        toast.error(r.code || "Authorization failed");
        setApproving(false);
      }
    } catch (e) {
      toast.error(e?.message || "Authorization failed");
      setApproving(false);
    }
  }

  async function deny() {
    try {
      setDenying(true);
      const r = await API.post("/oauth/authorize/deny", {
        client_id: params.client_id,
        redirect_uri: params.redirect_uri,
        state: params.state,
      });
      if (r.redirect_url) window.location.href = r.redirect_url;
      else setDenying(false);
    } catch (e) {
      setDenying(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Loader />
      </div>
    );
  }

  if (missing.length || badMethod || badResponse) {
    return (
      <Shell title="Invalid OAuth request">
        <p className="text-sm text-slate-600">
          {missing.length
            ? `Missing params: ${missing.join(", ")}`
            : badMethod
              ? "Only PKCE S256 is supported."
              : "Only response_type=code is supported."}
        </p>
      </Shell>
    );
  }

  if (clientError) return <Shell title="Unknown client"><p className="text-sm text-slate-600">{clientError}</p></Shell>;

  if (!client) {
    return (
      <Shell>
        <div className="flex justify-center py-8"><Loader /></div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 flex items-center justify-center gap-4">
        <Logo src={client.logo_uri} alt={client.client_name} />
        <RiLinkM className="h-5 w-5 text-slate-400" />
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-sm font-extrabold text-white">C</div>
      </div>

      <h1 className="mb-2 text-center text-xl font-semibold text-slate-900">
        Connect <span className="text-slate-900">{client.client_name}</span> to Console
      </h1>
      <p className="mb-6 text-center text-sm text-slate-600">
        {client.client_name} will be able to read and manage your tasks, chats, agents and files on your behalf.
      </p>

      <div className="mb-6 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <RiShieldCheckLine className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
        <div className="text-sm text-slate-700">
          Signed in as <span className="font-medium text-slate-900">{user.firstname} {user.lastname}</span>
          <div className="text-xs text-slate-500">{user.email}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={approve}
          disabled={approving || denying}
          className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {approving ? "Authorizing…" : "Allow"}
        </button>
        <button
          onClick={deny}
          disabled={approving || denying}
          className="w-full rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {denying ? "Cancelling…" : "Cancel"}
        </button>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">You can revoke this access at any time from your account settings.</p>
    </Shell>
  );
}

function Shell({ title, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex justify-center">
          <span className="text-xl font-extrabold text-slate-900">Console</span>
        </div>
        {title && <h1 className="mb-3 text-xl font-semibold text-slate-900">{title}</h1>}
        {children}
      </div>
    </div>
  );
}

function Logo({ src, alt }) {
  if (!src) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-500">
        {(alt || "?").slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return <img src={src} alt={alt} className="h-12 w-12 rounded-xl border border-slate-200 bg-white object-contain" />;
}
