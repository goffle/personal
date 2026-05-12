import { useEffect, useMemo, useState } from "react";
import { RiCoinLine } from "react-icons/ri";

import API from "@/services/api";
import useStore from "@/services/store";
import Loader from "@/components/loader";

const FETCH_LIMIT = 500;

function fmtUsd(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return "$0.00";
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function fmtTokens(n) {
  if (!n) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function Usages() {
  const { organization } = useStore();
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!organization?._id) return;
    setLoading(true);
    const [msgs, chs, ags] = await Promise.all([
      API.post("/chat-message/search", { organization_id: organization._id, role: "assistant", limit: FETCH_LIMIT, sort: { created_at: -1 } }),
      API.post("/chat/search", { organization_id: organization._id, limit: 500 }),
      API.post("/agent/search", { organization_id: organization._id, limit: 100 }),
    ]);
    if (msgs.ok) setMessages(msgs.data);
    if (chs.ok) setChats(chs.data);
    if (ags.ok) setAgents(ags.data);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [organization?._id]);

  const chatById = useMemo(() => Object.fromEntries(chats.map((c) => [c._id, c])), [chats]);
  const agentById = useMemo(() => Object.fromEntries(agents.map((a) => [a._id, a])), [agents]);

  const stats = useMemo(() => {
    const totals = { messages: messages.length, tokens_in: 0, tokens_out: 0, tokens_cache_read: 0, tokens_cache_write: 0, cost: 0 };
    const byModel = new Map();
    const byAgent = new Map();
    for (const m of messages) {
      totals.tokens_in += m.tokens_in || 0;
      totals.tokens_out += m.tokens_out || 0;
      totals.tokens_cache_read += m.tokens_cache_read || 0;
      totals.tokens_cache_write += m.tokens_cache_write || 0;
      totals.cost += m.cost_usd || 0;

      const model = m.model || "unknown";
      if (!byModel.has(model)) byModel.set(model, { model, messages: 0, tokens_in: 0, tokens_out: 0, cost: 0 });
      const mm = byModel.get(model);
      mm.messages += 1;
      mm.tokens_in += m.tokens_in || 0;
      mm.tokens_out += m.tokens_out || 0;
      mm.cost += m.cost_usd || 0;

      const chat = chatById[m.chat_id];
      const agentId = chat?.agent_id || "unknown";
      if (!byAgent.has(agentId)) byAgent.set(agentId, { agent_id: agentId, messages: 0, cost: 0 });
      const aa = byAgent.get(agentId);
      aa.messages += 1;
      aa.cost += m.cost_usd || 0;
    }
    return {
      totals,
      byModel: Array.from(byModel.values()).sort((a, b) => b.cost - a.cost),
      byAgent: Array.from(byAgent.values()).sort((a, b) => b.cost - a.cost),
    };
  }, [messages, chatById]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-5 flex items-center gap-3">
        <RiCoinLine className="h-6 w-6 text-slate-500" />
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Usages</h1>
          <p className="text-sm text-slate-500">
            Anthropic API spend for <span className="font-medium text-slate-700">{organization?.name || "—"}</span>.
            Aggregates computed over the {FETCH_LIMIT} most recent assistant messages.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-16"><Loader /></div>
      ) : (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Total spend (org)" value={fmtUsd(organization?.cost_usd)} hint="lifetime, server-side counter" />
            <Stat label="Spend in window" value={fmtUsd(stats.totals.cost)} hint={`${stats.totals.messages} messages`} />
            <Stat label="Tokens in / out" value={`${fmtTokens(stats.totals.tokens_in)} / ${fmtTokens(stats.totals.tokens_out)}`} hint={`cache: ${fmtTokens(stats.totals.tokens_cache_read)} read · ${fmtTokens(stats.totals.tokens_cache_write)} write`} />
            <Stat label="Avg cost / message" value={stats.totals.messages ? fmtUsd(stats.totals.cost / stats.totals.messages) : "—"} />
          </section>

          <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card title="By model">
              {stats.byModel.length === 0 ? (
                <Empty>No usage yet.</Empty>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-3 py-2 font-medium">Model</th><th className="px-3 py-2 font-medium">Msgs</th><th className="px-3 py-2 font-medium">In</th><th className="px-3 py-2 font-medium">Out</th><th className="px-3 py-2 text-right font-medium">Cost</th></tr>
                  </thead>
                  <tbody>
                    {stats.byModel.map((m) => (
                      <tr key={m.model} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-800">{m.model}</td>
                        <td className="px-3 py-2 text-slate-600">{m.messages}</td>
                        <td className="px-3 py-2 text-slate-600">{fmtTokens(m.tokens_in)}</td>
                        <td className="px-3 py-2 text-slate-600">{fmtTokens(m.tokens_out)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">{fmtUsd(m.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="By agent">
              {stats.byAgent.length === 0 ? (
                <Empty>No usage yet.</Empty>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-3 py-2 font-medium">Agent</th><th className="px-3 py-2 font-medium">Msgs</th><th className="px-3 py-2 text-right font-medium">Cost</th></tr>
                  </thead>
                  <tbody>
                    {stats.byAgent.map((a) => (
                      <tr key={a.agent_id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-800">{agentById[a.agent_id]?.name || <span className="text-slate-400">— unattached</span>}</td>
                        <td className="px-3 py-2 text-slate-600">{a.messages}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">{fmtUsd(a.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </section>

          <Card title="Recent assistant messages">
            {messages.length === 0 ? (
              <Empty>No assistant messages yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">Chat</th>
                      <th className="px-3 py-2 font-medium">Agent</th>
                      <th className="px-3 py-2 font-medium">Model</th>
                      <th className="px-3 py-2 font-medium">In</th>
                      <th className="px-3 py-2 font-medium">Out</th>
                      <th className="px-3 py-2 font-medium">Cache r/w</th>
                      <th className="px-3 py-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messages.map((m) => {
                      const chat = chatById[m.chat_id];
                      const agent = agentById[chat?.agent_id];
                      return (
                        <tr key={m._id} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtDateTime(m.created_at)}</td>
                          <td className="px-3 py-2 text-slate-700">{chat?.title || <span className="text-slate-400">— deleted</span>}</td>
                          <td className="px-3 py-2 text-slate-700">{agent?.name || <span className="text-slate-400">—</span>}</td>
                          <td className="px-3 py-2 text-slate-600">{m.model || <span className="text-slate-400">—</span>}</td>
                          <td className="px-3 py-2 text-slate-600">{fmtTokens(m.tokens_in)}</td>
                          <td className="px-3 py-2 text-slate-600">{fmtTokens(m.tokens_out)}</td>
                          <td className="px-3 py-2 text-slate-500">{fmtTokens(m.tokens_cache_read)} / {fmtTokens(m.tokens_cache_write)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">{fmtUsd(m.cost_usd)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <div className="px-4 py-8 text-center text-sm text-slate-500">{children}</div>;
}
