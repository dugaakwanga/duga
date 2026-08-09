"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, PageHeader, Badge, EmptyState, Spinner, Button, Alert } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Notification {
  id: string;
  title: string;
  body: string;
  read: boolean;
  type: string;
  link?: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ items: Notification[] }>("messages/notifications");
      setItems(data.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markAllRead() {
    await api("messages/notificationsRead", { method: "POST" });
    load();
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Your recent activity and alerts."
        actions={<Button variant="outline" onClick={markAllRead}>Mark all read</Button>}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : items.length === 0 ? (
        <EmptyState title="No notifications" hint="Alerts from your school will appear here." />
      ) : (
        <Card>
          {items.map((n) => (
            <div
              key={n.id}
              onClick={() => n.link && router.push(n.link)}
              style={{
                padding: "14px 0",
                borderBottom: "1px solid var(--duga-border)",
                cursor: n.link ? "pointer" : "default",
                background: n.read ? "transparent" : "var(--duga-info-soft)",
                borderRadius: 8,
                paddingLeft: n.read ? 0 : 10,
                paddingRight: n.read ? 0 : 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong>{n.title}</strong>
                {!n.read && <Badge tone="info">new</Badge>}
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--duga-muted)" }}>
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: 13.5, color: "var(--duga-ink-2)", marginTop: 3 }}>{n.body}</div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
