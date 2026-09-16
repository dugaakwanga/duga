"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader, Input, Button, EmptyState, Alert, Spinner, Avatar, Badge, Icon, Modal } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Conversation {
  id: string;
  title: string | null;
  type: string;
  updatedAt: string;
  lastMessage: { id: string; body: string; sentAt: string; senderId: string } | null;
  unread: boolean;
  others: Array<{ id: string; firstName: string; lastName: string; role: string; avatarUrl: string | null }>;
}

interface Message {
  id: string;
  body: string;
  sentAt: string;
  senderId: string;
  sender: { id: string; firstName: string; lastName: string };
}

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  avatarUrl: string | null;
}

function convName(c: Conversation): string {
  return c.others.map((o) => `${o.firstName} ${o.lastName}`).join(", ") || "Group";
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], sameYear ? { weekday: "long", day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myId, setMyId] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);

  const activeConversation = useMemo(() => conversations.find((c) => c.id === active) ?? null, [conversations, active]);

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
    setThreadLoading(true);
    api<{ id: string; messages: Message[] }>(`messages/${active}`)
      .then((c) => {
        setThread(c.messages);
        setConversations((prev) =>
          prev.map((cv) => (cv.id === active ? { ...cv, unread: false, lastMessage: c.messages[c.messages.length - 1] ?? cv.lastMessage } : cv)),
        );
      })
      .catch(() => {})
      .finally(() => setThreadLoading(false));
  }, [active]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length]);

  // Debounced contact search — waits for a pause in typing before hitting
  // the server, same as any normal "search people" picker.
  useEffect(() => {
    if (!pickerOpen) return;
    setContactsLoading(true);
    setContactsError(null);
    const t = setTimeout(() => {
      api<{ items: Contact[] }>("messages/contacts", { query: { q: contactQuery || undefined }, loading: false })
        .then((d) => setContacts(d.items))
        .catch((e) => setContactsError(e.message))
        .finally(() => setContactsLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [pickerOpen, contactQuery]);

  async function send() {
    const body = draft.trim();
    if (!active || !body || sending) return;
    setDraft("");
    setSending(true);
    try {
      await api(`messages/${active}/send`, { method: "POST", body: { body } });
      const c = await api<{ id: string; messages: Message[] }>(`messages/${active}`);
      setThread(c.messages);
      setConversations((prev) => {
        const last = c.messages[c.messages.length - 1] ?? null;
        const next = prev.map((cv) => (cv.id === active ? { ...cv, lastMessage: last, updatedAt: new Date().toISOString() } : cv));
        return next.sort((a, b) => (a.id === active ? -1 : b.id === active ? 1 : 0));
      });
    } finally {
      setSending(false);
    }
  }

  async function startConversation(userId: string) {
    const conv = await api<{ id: string }>("messages", { method: "POST", body: { userId } });
    setPickerOpen(false);
    setContactQuery("");
    setActive(conv.id);
    const d = await api<{ items: Conversation[] }>("messages");
    setConversations(d.items);
  }

  const list = (
    <div className="duga-messages-list">
      <div className="duga-messages-list__header">
        <div className="duga-card__title" style={{ padding: 0 }}>Chats</div>
        <button className="duga-btn duga-btn--accent duga-btn--sm" onClick={() => setPickerOpen(true)} aria-label="New chat">
          <Icon name="plus" size={16} /> New chat
        </button>
      </div>
      <div className="duga-messages-list__scroll">
        {conversations.length === 0 && (
          <div style={{ padding: 24 }}>
            <EmptyState title="No conversations yet" hint="Tap “New chat” to message someone." />
          </div>
        )}
        {conversations.map((c) => {
          const other = c.others[0];
          const preview = c.lastMessage
            ? `${c.lastMessage.senderId === myId ? "You: " : ""}${c.lastMessage.body}`
            : "No messages yet";
          return (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className="duga-messages-row"
              data-active={active === c.id || undefined}
            >
              <Avatar name={other ? `${other.firstName} ${other.lastName}` : convName(c)} src={other?.avatarUrl} size={46} />
              <div className="duga-messages-row__body">
                <div className="duga-messages-row__top">
                  <span className="duga-messages-row__name">{convName(c)}</span>
                  {c.lastMessage && <span className="duga-messages-row__time">{timeLabel(c.lastMessage.sentAt)}</span>}
                </div>
                <div className="duga-messages-row__bottom">
                  <span className="duga-messages-row__preview">{preview}</span>
                  {c.unread && <span className="duga-messages-row__dot" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const thread_ = (
    <div className="duga-messages-thread">
      {!activeConversation ? (
        <EmptyState title="Select a conversation" hint="Choose a chat on the left, or start a new one." />
      ) : (
        <>
          <div className="duga-messages-thread__header">
            <button className="duga-btn duga-btn--ghost duga-btn--sm duga-messages-thread__back" onClick={() => setActive(null)} aria-label="Back to chats">
              <Icon name="back" size={18} />
            </button>
            <Avatar name={convName(activeConversation)} src={activeConversation.others[0]?.avatarUrl} size={38} />
            <div>
              <div className="duga-messages-thread__name">{convName(activeConversation)}</div>
              {activeConversation.others[0] && <div className="duga-messages-thread__role">{activeConversation.others[0].role.toLowerCase()}</div>}
            </div>
          </div>

          {threadLoading ? (
            <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
              <Spinner size={26} />
            </div>
          ) : (
            <div className="chat-thread">
              {thread.map((m, i) => {
                const me = m.sender.id === myId;
                const prev = thread[i - 1];
                const showDay = !prev || new Date(prev.sentAt).toDateString() !== new Date(m.sentAt).toDateString();
                return (
                  <div key={m.id}>
                    {showDay && (
                      <div className="chat-day-sep">
                        <span>{dayLabel(m.sentAt)}</span>
                      </div>
                    )}
                    <div className={`chat-bubble ${me ? "chat-bubble--me" : "chat-bubble--them"}`}>
                      {!me && <div style={{ fontWeight: 600, fontSize: 12, opacity: 0.85 }}>{m.sender.firstName} {m.sender.lastName}</div>}
                      {m.body}
                      <div className="chat-meta">{new Date(m.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}

          <div className="duga-messages-composer">
            <input
              className="duga-messages-composer__input"
              placeholder="Type a message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            />
            <button className="duga-messages-composer__send" onClick={send} disabled={!draft.trim() || sending} aria-label="Send">
              <Icon name="send" size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader title="Messages" subtitle="Direct conversations with staff, students and parents." />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : (
        <div className="duga-messages-grid" data-mobile-view={active ? "thread" : "list"}>
          {list}
          {thread_}
        </div>
      )}

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="New chat">
        <Input
          placeholder="Search by name or email…"
          value={contactQuery}
          onChange={(e) => setContactQuery(e.target.value)}
          autoFocus
        />
        <div className="duga-contact-list">
          {contactsLoading ? (
            <div style={{ padding: 20, textAlign: "center" }}>
              <Spinner size={22} />
            </div>
          ) : contactsError ? (
            <Alert tone="danger">{contactsError}</Alert>
          ) : contacts.length === 0 ? (
            <EmptyState title="No matches" hint="Try a different name." />
          ) : (
            contacts.map((c) => (
              <button key={c.id} className="duga-contact-row" onClick={() => startConversation(c.id)}>
                <Avatar name={`${c.firstName} ${c.lastName}`} src={c.avatarUrl} size={40} />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.firstName} {c.lastName}</div>
                  <Badge tone="neutral">{c.role.toLowerCase()}</Badge>
                </div>
              </button>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
