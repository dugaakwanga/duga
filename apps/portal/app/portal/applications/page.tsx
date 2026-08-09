"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Badge, Table, Alert, Spinner, EmptyState, Button, Select } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Application {
  id: string;
  applicantName: string;
  applicantType: string;
  email: string;
  phone: string;
  section: string;
  levelApplied: string | null;
  previousSchool: string | null;
  guardianName: string | null;
  status: string;
  submittedAt: string;
}

const STATUS_TONES: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  RECEIVED: "info",
  REVIEWING: "warning",
  APPROVED: "success",
  WAITLISTED: "neutral",
  REJECTED: "danger",
};

export default function ApplicationsPage() {
  const [items, setItems] = useState<Application[]>([]);
  const [counts, setCounts] = useState<Array<{ status: string; _count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api<{ items: Application[]; counts: Array<{ status: string; _count: number }> }>("applications")
      .then((d) => {
        setItems(d.items);
        setCounts(d.counts);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function setStatus(id: string, status: string) {
    try {
      await api(`applications/${id}/updateStatus`, { method: "POST", body: { status } });
      const d = await api<{ items: Application[] }>("applications");
      setItems(d.items);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const visible = filter ? items.filter((i) => i.status === filter) : items;

  return (
    <div>
      <PageHeader title="Admission applications" subtitle="Inbox for applications from the public website." />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 200 }}>
              <option value="">All statuses</option>
              {counts.map((c) => (
                <option key={c.status} value={c.status}>{c.status} ({c._count})</option>
              ))}
            </Select>
          </div>
          {visible.length === 0 ? (
            <EmptyState title="No applications" hint="Applications from the website will appear here." />
          ) : (
            <Card>
              <Table headers={["Applicant", "Section", "Level", "Contact", "Guardian", "Submitted", "Status", "Actions"]}>
                {visible.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.applicantName}</strong>
                      <div style={{ fontSize: 12, color: "var(--duga-muted)" }}>{a.applicantType.toLowerCase()}</div>
                    </td>
                    <td><Badge tone={a.section === "PRIMARY" ? "info" : "accent"}>{a.section.toLowerCase()}</Badge></td>
                    <td>{a.levelApplied ?? "—"}</td>
                    <td>
                      {a.email}
                      <div style={{ fontSize: 12, color: "var(--duga-muted)" }}>{a.phone}</div>
                    </td>
                    <td>{a.guardianName ?? "—"}</td>
                    <td>{new Date(a.submittedAt).toLocaleDateString()}</td>
                    <td><Badge tone={STATUS_TONES[a.status] ?? "neutral"}>{a.status}</Badge></td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <Button size="sm" variant="outline" onClick={() => setStatus(a.id, "APPROVED")}>Approve</Button>
                        <Button size="sm" variant="ghost" onClick={() => setStatus(a.id, "REJECTED")}>Reject</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
