"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader, Input, EmptyState, Alert, Spinner, Avatar, Badge, Icon, Modal } from "@duga/ui";
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

interface ContactUser {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  avatarUrl: string | null;
}

interface ContactSubgroup {
  key: string;
  label: string;
  contacts: ContactUser[];
}

interface ContactGroup {
  key: string;
  label: string;
  contacts?: ContactUser[];
  subgroups?: ContactSubgroup[];
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

function ContactRow({ contact, onPick }: { contact: ContactUser; onPick: (id: string) => void }) {
  return (
    <button className="duga-contact-row" onClick={() => onPick(contact.id)}>
      <Avatar name={`${contact.firstName} ${contact.lastName}`} src={contact.avatarUrl} size={40} />
      <div style={{ textAlign: "left" }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{contact.firstName} {contact.lastName}</div>
        <Badge tone="neutral">{contact.role.toLowerCase()}</Badge>
      </div>
    </button>
  );
}

export default function MessagesPage() {
  return (
    <Suspense>
      <MessagesPageInner />
    </Suspense>
  );
}

function MessagesPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
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
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedSubgroups, setExpandedSubgroups] = useState<Set<string>>(new Set());

  const activeConversation = useMemo(() => conversations.find((c) => c.id === active) ?? null, [conversations, active]);
  const searching = contactQuery.trim().length > 0;

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

  // A "new message" notification links to /portal/messages/<id>, which
  // redirects here with ?conversation=<id> (see app/portal/messages/[id])
  // — open straight into that chat instead of leaving the visitor stuck on
  // an empty list.
  useEffect(() => {
    const fromLink = searchParams.get("conversation");
    if (!fromLink) return;
    setActive(fromLink);
    router.replace("/portal/messages");
  }, [searchParams, router]);

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
      api<{ groups: ContactGroup[] }>("messages/contacts", { query: { q: contactQuery || undefined }, loading: false })
        .then((d) => setGroups(d.groups))
        .catch((e) => setContactsError(e.message))
        .finally(() => setContactsLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [pickerOpen, contactQuery]);

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSubgroup(key: string) {
    setExpandedSubgroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
          ) : groups.length === 0 ? (
            <EmptyState title="No matches" hint="Try a different name." />
          ) : (
            groups.map((g) => {
              const count = g.contacts ? g.contacts.length : (g.subgroups ?? []).reduce((n, s) => n + s.contacts.length, 0);
              const open = searching || expandedGroups.has(g.key);
              return (
                <div key={g.key} className="duga-contact-group">
                  <button className="duga-contact-group__head" onClick={() => toggleGroup(g.key)}>
                    <span className="duga-contact-group__chevron" data-open={open || undefined}>▸</span>
                    <span className="duga-contact-group__label">{g.label}</span>
                    <span className="duga-contact-group__count">{count}</span>
                  </button>
                  {open && g.contacts && (
                    <div className="duga-contact-group__body">
                      {g.contacts.map((c) => (
                        <ContactRow key={c.id} contact={c} onPick={startConversation} />
                      ))}
                    </div>
                  )}
                  {open && g.subgroups && (
                    <div className="duga-contact-group__body">
                      {g.subgroups.map((sg) => {
                        const subKey = `${g.key}:${sg.key}`;
                        const subOpen = searching || expandedSubgroups.has(subKey);
                        return (
                          <div key={sg.key} className="duga-contact-subgroup">
                            <button className="duga-contact-subgroup__head" onClick={() => toggleSubgroup(subKey)}>
                              <span className="duga-contact-group__chevron" data-open={subOpen || undefined}>▸</span>
                              <span className="duga-contact-group__label">{sg.label}</span>
                              <span className="duga-contact-group__count">{sg.contacts.length}</span>
                            </button>
                            {subOpen && (
                              <div className="duga-contact-subgroup__body">
                                {sg.contacts.map((c) => (
                                  <ContactRow key={c.id} contact={c} onPick={startConversation} />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Modal>
    </div>
  );
}
