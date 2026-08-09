"use client";

import { useEffect, useState, useRef } from "react";
import { PageHeader, Input, Button, EmptyState, Alert, Spinner } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Conversation {
  id: string;
  title: string | null;
  type: string;
  updatedAt: string;
  lastMessage: { id: string; body: string; sentAt: string; senderId: string } | null;
  others: Array<{ id: string; firstName: string; lastName: string; role: string; avatarUrl: string | null }>;
}

interface Message {
  id: string;
  body: string;
  sentAt: string;
  senderId: string;
  sender: { id: string; firstName: string; lastName: string };
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [newUserId, setNewUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myId, setMyId] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => j.ok && setMyId(j.user.id));
    api<{ items: Conversation[] }>("messages")
      .then((d) => {
        setConversations(d.items);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!active) return;
    api<{ id: string; messages: Message[] }>(`messages/${active}`)
      .then((c) => {
        setThread(c.messages);
        setConversations((prev) => prev.map((cv) => ({ ...cv, lastMessage: c.messages[c.messages.length - 1] ?? cv.lastMessage })));
      })
      .catch(() => {});
  }, [active]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length]);

  async function send() {
    if (!active || !draft.trim()) return;
    await api(`messages/${active}/send`, { method: "POST", body: { body: draft } });
    setDraft("");
    const c = await api<{ id: string; messages: Message[] }>(`messages/${active}`);
    setThread(c.messages);
  }

  async function startConversation() {
    if (!newUserId.trim()) return;
    const conv = await api<{ id: string }>("messages", { method: "POST", body: { userId: newUserId } });
    setNewUserId("");
    setActive(conv.id);
    const d = await api<{ items: Conversation[] }>("messages");
    setConversations(d.items);
  }

  return (
    <div>
      <PageHeader title="Messages" subtitle="Direct conversations with staff, students and parents." />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
          <div className="duga-card" style={{ padding: 0, height: 520, overflowY: "auto" }}>
            <div style={{ padding: 12, borderBottom: "1px solid var(--duga-border)" }}>
              <Input placeholder="Other user's ID…" value={newUserId} onChange={(e) => setNewUserId(e.target.value)} />
              <Button variant="outline" size="sm" onClick={startConversation} style={{ marginTop: 8 }}>Start conversation</Button>
            </div>
            {conversations.length === 0 && <EmptyState title="No conversations" />}
            {conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => setActive(c.id)}
                style={{
                  padding: 12,
                  cursor: "pointer",
                  borderBottom: "1px solid var(--duga-border)",
                  background: active === c.id ? "var(--duga-surface-2)" : "transparent",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {c.others.map((o) => `${o.firstName} ${o.lastName}`).join(", ") || "Group"}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginTop: 2 }}>
                  {c.lastMessage ? c.lastMessage.body.slice(0, 60) : "No messages yet"}
                </div>
              </div>
            ))}
          </div>

          <div className="duga-card" style={{ height: 520, display: "flex", flexDirection: "column" }}>
            {!active ? (
              <EmptyState title="Select a conversation" hint="Choose a thread on the left to start chatting." />
            ) : (
              <>
                <div className="chat-thread">
                  {thread.map((m) => {
                    const me = m.sender.id === myId;
                    return (
                      <div key={m.id} className={`chat-bubble ${me ? "chat-bubble--me" : "chat-bubble--them"}`}>
                        {!me && <div style={{ fontWeight: 600, fontSize: 12, opacity: 0.85 }}>{m.sender.firstName} {m.sender.lastName}</div>}
                        {m.body}
                        <div className="chat-meta">{new Date(m.sentAt).toLocaleTimeString()}</div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 12, borderTop: "1px solid var(--duga-border)", paddingTop: 12 }}>
                  <Input placeholder="Type a message…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
                  <Button onClick={send}>Send</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
