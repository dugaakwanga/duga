"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Table, Badge, Alert, Spinner, EmptyState, Input, Button } from "@duga/ui";
import { api } from "@/lib/client/api";

interface StaffRecordRow {
  id: string;
  date: string;
  checkInAt: string | null;
  checkInDistanceM: number | null;
  checkInWithinRadius: boolean | null;
  checkOutAt: string | null;
  checkOutDistanceM: number | null;
  checkOutWithinRadius: boolean | null;
  user: { firstName: string; lastName: string; role: string };
}

export default function StaffClockRecordsPage() {
  const [items, setItems] = useState<StaffRecordRow[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api<{ items: StaffRecordRow[] }>("attendance/staffRecords", {
        method: "POST",
        query: { from: from || undefined, to: to || undefined },
      });
      setItems(d.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = (v: string | null) => (v ? new Date(v).toLocaleTimeString() : "—");
  const inGeofence = (within: boolean | null) =>
    within == null ? "—" : within ? "Yes" : "No (flagged)";

  return (
    <div>
      <PageHeader title="Staff Clock Records" subtitle="Geofenced clock-in/out history for all staff." />

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 180 }} />
        <span style={{ fontSize: 13, color: "var(--duga-muted)" }}>to</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 180 }} />
        <Button variant="outline" onClick={load}>Filter</Button>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : items.length === 0 ? (
        <EmptyState title="No clock records" hint="Staff records appear once staff clock in or out." />
      ) : (
        <Card>
          {Array.from(
            items.reduce((map, r) => {
              const key = `${r.user.firstName} ${r.user.lastName}`;
              const list = map.get(key) ?? [];
              list.push(r);
              map.set(key, list);
              return map;
            }, new Map<string, StaffRecordRow[]>()),
          )
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, rows]) => {
              const flagged = rows.filter((r) => r.checkInWithinRadius === false || r.checkOutWithinRadius === false).length;
              return (
                <details key={name} open={items.length <= 30} style={{ marginBottom: 10 }}>
                  <summary
                    style={{
                      cursor: "pointer",
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: "var(--duga-surface-2, #f4f6f9)",
                      fontWeight: 700,
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    {name}
                    <span style={{ fontWeight: 400, fontSize: 12.5, color: "var(--duga-muted)", textTransform: "capitalize" }}>
                      {rows[0]!.user.role.toLowerCase()} · {rows.length} day{rows.length === 1 ? "" : "s"}
                    </span>
                    {flagged > 0 && <Badge tone="danger">{flagged} flagged</Badge>}
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    <Table headers={["Date", "Clock in", "In-distance", "Clock out", "Out-distance"]}>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td>{new Date(r.date).toISOString().slice(0, 10)}</td>
                          <td>{t(r.checkInAt)}</td>
                          <td>
                            {r.checkInDistanceM != null && (
                              <Badge tone={r.checkInWithinRadius ? "success" : "danger"}>
                                {r.checkInDistanceM} m · {inGeofence(r.checkInWithinRadius)}
                              </Badge>
                            )}
                            {r.checkInDistanceM == null && "—"}
                          </td>
                          <td>{t(r.checkOutAt)}</td>
                          <td>
                            {r.checkOutDistanceM != null && (
                              <Badge tone={r.checkOutWithinRadius ? "success" : "danger"}>
                                {r.checkOutDistanceM} m · {inGeofence(r.checkOutWithinRadius)}
                              </Badge>
                            )}
                            {r.checkOutDistanceM == null && "—"}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                </details>
              );
            })}
        </Card>
      )}
    </div>
  );
}
