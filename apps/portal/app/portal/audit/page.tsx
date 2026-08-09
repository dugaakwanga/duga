"use client";

import { useEffect, useState } from "react";
import { Card, Table, PageHeader, Badge, Alert, Spinner, EmptyState } from "@duga/ui";
import { api } from "@/lib/client/api";

interface LogRow {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
  user: { firstName: string; lastName: string; role: string } | null;
}

export default function AuditPage() {
  const [items, setItems] = useState<LogRow[]>([]);
  const [actions, setActions] = useState<Array<{ action: string }>>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: LogRow[]; actions: Array<{ action: string }> }>("audit")
      .then((d) => {
        setItems(d.items);
        setActions(d.actions);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every important action recorded, in chronological order." />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : (
        <Card>
          <div style={{ marginBottom: 12 }}>
            <select className="duga-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a.action} value={a.action}>{a.action}</option>
              ))}
            </select>
          </div>
          {items.length === 0 ? (
            <EmptyState title="No log entries yet" />
          ) : (
            <Table headers={["Time", "Actor", "Action", "Entity"]}>
              {items
                .filter((l) => !filter || l.action === filter)
                .map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.createdAt).toLocaleString()}</td>
                    <td>{l.user ? `${l.user.firstName} ${l.user.lastName}` : "—"}</td>
                    <td><Badge tone="neutral">{l.action}</Badge></td>
                    <td>{l.entityType}</td>
                  </tr>
                ))}
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
