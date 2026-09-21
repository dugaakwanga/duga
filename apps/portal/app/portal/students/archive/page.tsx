"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Table, PageHeader, Button, EmptyState, Alert, Spinner, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

interface WithdrawnStudent {
  id: string;
  admissionNumber: string;
  updatedAt: string;
  user: { firstName: string; lastName: string; email: string | null; phone: string | null };
  classGroup: { level: { name: string; section: string }; name: string } | null;
}

// Section -> class name, so this reads the same way the rest of the app
// groups students — the exact ordering the classes were created in isn't
// critical here (these students aren't being taught anymore), alphabetical
// within each section is clear enough for finding someone.
function classLabel(cg: WithdrawnStudent["classGroup"]): string {
  return cg ? `${cg.level.name} ${cg.name}` : "No class on record";
}

export default function StudentsArchivePage() {
  const [items, setItems] = useState<WithdrawnStudent[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reinstating, setReinstating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ items: WithdrawnStudent[]; canManage: boolean }>("students", { query: { archived: "true" } });
      setItems(data.items ?? []);
      setCanManage(data.canManage);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function reinstate(s: WithdrawnStudent) {
    if (!confirm(`Reinstate ${s.user.firstName} ${s.user.lastName}? They'll be active again in ${classLabel(s.classGroup)} and able to sign in.`)) return;
    setReinstating(s.id);
    try {
      await api(`students/${s.id}/reinstate`, { method: "POST", body: {} });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setReinstating(null);
    }
  }

  const groups = Array.from(
    [...items]
      .sort((a, b) => classLabel(a.classGroup).localeCompare(classLabel(b.classGroup)) || a.admissionNumber.localeCompare(b.admissionNumber))
      .reduce((map, s) => {
        const key = classLabel(s.classGroup);
        const list = map.get(key) ?? [];
        list.push(s);
        map.set(key, list);
        return map;
      }, new Map<string, WithdrawnStudent[]>()),
  );

  return (
    <div>
      <PageHeader
        title="Students Archive"
        subtitle="Withdrawn students — kept on record, not deleted, and never shown in the active class lists. Reinstate one to bring them back into their class."
        actions={
          <Link href="/portal/students" className="duga-btn duga-btn--outline duga-btn--sm">
            <Icon name="back" size={14} /> Back to Students
          </Link>
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : items.length === 0 ? (
        <EmptyState title="No withdrawn students" hint="Students removed from the Students page appear here, grouped by the class they were in." />
      ) : (
        groups.map(([className, rows]) => (
          <Card key={className} title={`${className} (${rows.length})`} style={{ marginBottom: 16 }}>
            <Table headers={["Adm No.", "Name", "Contact", "Withdrawn around", ""]}>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>{s.admissionNumber}</td>
                  <td>{s.user.firstName} {s.user.lastName}</td>
                  <td style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>{s.user.email || s.user.phone || "—"}</td>
                  <td>{new Date(s.updatedAt).toLocaleDateString()}</td>
                  <td>
                    {canManage && (
                      <Button size="sm" variant="outline" loading={reinstating === s.id} onClick={() => reinstate(s)}>
                        Reinstate
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        ))
      )}
    </div>
  );
}
