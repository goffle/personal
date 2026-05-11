import { useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import toast from "react-hot-toast";

import API from "@/services/api";
import useStore from "@/services/store";

export default function Auth() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Console</h1>
        <p className="mb-6 text-sm text-slate-500">Sign in or create a workspace.</p>
        <Routes>
          <Route index element={<SignIn />} />
          <Route path="signup" element={<SignUp />} />
        </Routes>
      </div>
    </div>
  );
}

function SignIn() {
  const { setUser, setOrganization } = useStore();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await API.post("/user/signin", form);
      if (!r.ok) {
        toast.error(r.code || "Sign in failed");
        return;
      }
      API.setToken(r.token);
      setUser(r.user);
      setOrganization(r.organisations?.[0] || null);
      toast.success("Welcome back");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} autoFocus />
      <Field label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
      <button
        disabled={loading}
        className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
      <p className="pt-2 text-center text-sm text-slate-500">
        No account?{" "}
        <Link to="/auth/signup" className="font-medium text-slate-900 hover:underline">
          Create workspace
        </Link>
      </p>
    </form>
  );
}

function SignUp() {
  const { setUser, setOrganization } = useStore();
  const [form, setForm] = useState({ firstname: "", lastname: "", email: "", password: "", organization_name: "" });
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await API.post("/user/signup", form);
      if (!r.ok) {
        toast.error(r.code || r.message || "Sign up failed");
        return;
      }
      API.setToken(r.token);
      setUser(r.user);
      setOrganization(r.organisations?.[0] || null);
      toast.success("Workspace created");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" value={form.firstname} onChange={(v) => setForm({ ...form, firstname: v })} autoFocus />
        <Field label="Last name" value={form.lastname} onChange={(v) => setForm({ ...form, lastname: v })} />
      </div>
      <Field label="Workspace name" value={form.organization_name} onChange={(v) => setForm({ ...form, organization_name: v })} />
      <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
      <Field label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
      <button
        disabled={loading}
        className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? "Creating…" : "Create workspace"}
      </button>
      <p className="pt-2 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link to="/auth" className="font-medium text-slate-900 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

function Field({ label, type = "text", value, onChange, autoFocus }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        autoFocus={autoFocus}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        required
      />
    </label>
  );
}
