import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { RiAddLine, RiSendPlaneFill } from "react-icons/ri";

import API from "@/services/api";
import useStore from "@/services/store";
import { apiURL } from "@/config";
import Loader from "@/components/loader";

export default function Chat() {
  const { organization } = useStore();
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef(null);

  async function loadChats() {
    const r = await API.post("/chat/search", { organization_id: organization?._id });
    if (r.ok) {
      setChats(r.data);
      if (!activeId && r.data[0]) setActiveId(r.data[0]._id);
    }
  }

  async function loadMessages(id) {
    const r = await API.post("/message/search", { chat_id: id, limit: 200, sort: { created_at: 1 } });
    if (r.ok) setMessages(r.data);
  }

  useEffect(() => { loadChats(); /* eslint-disable-next-line */ }, [organization?._id]);
  useEffect(() => { if (activeId) loadMessages(activeId); }, [activeId]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  async function newChat() {
    const r = await API.post("/chat", { organization_id: organization?._id, title: "New chat" });
    if (r.ok) {
      setChats([r.data, ...chats]);
      setActiveId(r.data._id);
      setMessages([]);
    }
  }

  async function send(e) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !activeId || streaming) return;

    setMessages((m) => [...m, { _id: `local-${Date.now()}`, role: "user", content }]);
    setDraft("");
    setStreaming(true);

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
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const block of lines) {
          const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          try {
            const payload = JSON.parse(dataLine.slice(5).trim());
            if (payload.delta) {
              setMessages((m) =>
                m.map((msg) => (msg._id === assistantLocalId ? { ...msg, content: msg.content + payload.delta } : msg)),
              );
            }
          } catch (_e) { /* ignore */ }
        }
      }
    } finally {
      setStreaming(false);
      loadMessages(activeId);
    }
  }

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
            {messages.map((m) => (
              <div key={m._id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user" ? "bg-slate-900 text-white" : "bg-white text-slate-900 ring-1 ring-slate-200"
                }`}>
                  <p className="whitespace-pre-wrap">{m.content}{m.streaming && <span className="ml-0.5 inline-block w-1 animate-pulse">▍</span>}</p>
                </div>
              </div>
            ))}
            {streaming && messages.every((m) => !m.streaming) && <Loader />}
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
