import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { RiAddLine, RiSendPlaneFill, RiCheckLine, RiCloseLine, RiLoader4Line, RiToolsLine } from "react-icons/ri";

import API from "@/services/api";
import useStore from "@/services/store";
import { apiURL } from "@/config";
import Loader from "@/components/loader";
import Markdown from "@/components/markdown";

// "gagenda__calendar_list_events" -> "calendar.list_events"
function prettyToolName(name) {
  if (!name) return "tool";
  const sep = name.indexOf("__");
  const tail = sep >= 0 ? name.slice(sep + 2) : name;
  return tail.replace(/_/g, ".");
}

function ToolChip({ name, status }) {
  const Icon =
    status === "done" ? RiCheckLine : status === "error" ? RiCloseLine : status === "running" ? RiLoader4Line : RiToolsLine;
  const color =
    status === "done"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "error"
        ? "bg-red-50 text-red-700 ring-red-200"
        : status === "running"
          ? "bg-slate-100 text-slate-600 ring-slate-200"
          : "bg-slate-50 text-slate-500 ring-slate-200";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${color}`}>
      <Icon className={`h-3.5 w-3.5 ${status === "running" ? "animate-spin" : ""}`} />
      <span className="font-mono">{prettyToolName(name)}</span>
    </span>
  );
}

// Extract tool_use blocks from a persisted assistant message's content_blocks.
function persistedToolChips(m) {
  if (!Array.isArray(m.content_blocks)) return [];
  return m.content_blocks.filter((b) => b?.type === "tool_use").map((b) => ({ name: b.name, status: "done" }));
}

// A user message with only tool_result blocks is noise — hide it from the visible flow.
function isToolResultOnly(m) {
  if (m.role !== "user") return false;
  if (m.content && m.content.trim()) return false;
  return Array.isArray(m.content_blocks) && m.content_blocks.length > 0 && m.content_blocks.every((b) => b?.type === "tool_result");
}

export default function Chat() {
  const { organization, setOrganization } = useStore();
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [liveTools, setLiveTools] = useState([]); // { id, name, status }
  const scrollRef = useRef(null);

  async function loadChats() {
    const r = await API.post("/chat/search", { organization_id: organization?._id });
    if (r.ok) {
      setChats(r.data);
      if (!activeId && r.data[0]) setActiveId(r.data[0]._id);
    }
  }

  async function loadMessages(id) {
    const r = await API.post("/chat-message/search", { chat_id: id, limit: 200, sort: { created_at: 1 } });
    if (r.ok) setMessages(r.data);
  }

  useEffect(() => { loadChats(); /* eslint-disable-next-line */ }, [organization?._id]);
  useEffect(() => { if (activeId) { setLiveTools([]); loadMessages(activeId); } }, [activeId]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, liveTools]);

  async function newChat() {
    const r = await API.post("/chat", { organization_id: organization?._id, title: "New chat" });
    if (r.ok) {
      setChats([r.data, ...chats]);
      setActiveId(r.data._id);
      setMessages([]);
    }
  }

  function handleToolEvent(evt) {
    if (!evt?.tool) return;
    if (evt.status === "start") {
      setLiveTools((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, name: evt.tool, status: "running" }]);
    } else if (evt.status === "end") {
      setLiveTools((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].name === evt.tool && next[i].status === "running") {
            next[i] = { ...next[i], status: evt.error ? "error" : "done" };
            break;
          }
        }
        return next;
      });
    }
  }

  async function send(e) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !activeId || streaming) return;

    setMessages((m) => [...m, { _id: `local-${Date.now()}`, role: "user", content }]);
    setDraft("");
    setStreaming(true);
    setLiveTools([]);

    const assistantLocalId = `assistant-${Date.now()}`;
    setMessages((m) => [...m, { _id: assistantLocalId, role: "assistant", content: "", streaming: true }]);

    try {
      const res = await fetch(`${apiURL}/chat/${activeId}/stream`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Authorization: `JWT ${localStorage.getItem("token") || ""}` },
        body: JSON.stringify({ content }),
      });
      if (!res.ok || !res.body) {
        toast.error("Stream failed");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const block of chunks) {
          const lines = block.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event:"));
          const dataLine = lines.find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const event = eventLine ? eventLine.slice(6).trim() : "message";
          let payload;
          try {
            payload = JSON.parse(dataLine.slice(5).trim());
          } catch {
            continue;
          }
          if (event === "tool_event") {
            handleToolEvent(payload);
          } else if (payload.delta) {
            setMessages((m) =>
              m.map((msg) => (msg._id === assistantLocalId ? { ...msg, content: msg.content + payload.delta } : msg)),
            );
          }
          if (typeof payload.org_cost_usd === "number") {
            setOrganization({ ...organization, cost_usd: payload.org_cost_usd });
          }
        }
      }
    } finally {
      setStreaming(false);
      setLiveTools([]);
      loadMessages(activeId);
    }
  }

  const visibleMessages = messages.filter((m) => !isToolResultOnly(m));

  return (
    <div className="flex h-full">
      <div className="w-64 shrink-0 border-r border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3">
          <span className="text-sm font-semibold text-slate-900">Chats</span>
          <button onClick={newChat} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="New chat">
            <RiAddLine className="h-4 w-4" />
          </button>
        </div>
        <ul className="space-y-0.5 p-2">
          {chats.length === 0 && <li className="px-2 py-4 text-xs text-slate-500">No chats yet — click + to start.</li>}
          {chats.map((c) => (
            <li key={c._id}>
              <button
                onClick={() => setActiveId(c._id)}
                className={`w-full truncate rounded-md px-2.5 py-1.5 text-left text-sm ${
                  activeId === c._id ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {c.title || "Untitled"}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
          {!activeId && <div className="flex h-full items-center justify-center text-sm text-slate-500">Select or create a chat to start streaming.</div>}
          <div className="mx-auto max-w-3xl space-y-4">
            {visibleMessages.map((m) => {
              const chips = persistedToolChips(m);
              const hasText = (m.content && m.content.length > 0) || m.streaming;
              return (
                <div key={m._id} className="space-y-2">
                  {chips.length > 0 && (
                    <div className="flex flex-wrap justify-start gap-1.5">
                      {chips.map((c, i) => <ToolChip key={i} name={c.name} status={c.status} />)}
                    </div>
                  )}
                  {hasText && (
                    <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                        m.role === "user" ? "bg-slate-900 text-white" : "bg-white text-slate-900 ring-1 ring-slate-200"
                      }`}>
                        {m.role === "user" ? (
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        ) : (
                          <>
                            <Markdown content={m.content} />
                            {m.streaming && <span className="ml-0.5 inline-block w-1 animate-pulse">▍</span>}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {liveTools.length > 0 && (
              <div className="flex flex-wrap justify-start gap-1.5">
                {liveTools.map((t) => <ToolChip key={t.id} name={t.name} status={t.status} />)}
              </div>
            )}
            {streaming && visibleMessages.every((m) => !m.streaming) && <Loader />}
          </div>
        </div>

        {activeId && (
          <form onSubmit={send} className="border-t border-slate-200 bg-white p-3">
            <div className="mx-auto flex max-w-3xl gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                disabled={streaming}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
              <button
                disabled={!draft.trim() || streaming}
                className="flex items-center gap-1 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <RiSendPlaneFill className="h-4 w-4" /> Send
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
