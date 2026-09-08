"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Badge, Table, Alert, Spinner, EmptyState, Button, Icon, Modal, Field, Input, Select } from "@duga/ui";
import { api } from "@/lib/client/api";

interface CalendarEvent {
  id: string;
  title: string;
  type: "HOLIDAY" | "MIDTERM_BREAK" | "ASSESSMENT_WINDOW" | "GENERIC";
  startDate: string;
  endDate: string;
  appliesToSection: string | null;
  targetType: "ASSIGNMENT" | "TEST" | "CBT" | "RESULTS" | null;
  term: { id: string; name: string } | null;
}

interface TermOption {
  id: string;
  name: string;
}

interface CalendarData {
  role: string;
  events: CalendarEvent[];
  terms: TermOption[];
}

const TYPE_LABEL: Record<CalendarEvent["type"], string> = {
  HOLIDAY: "Holiday",
  MIDTERM_BREAK: "Midterm break",
  ASSESSMENT_WINDOW: "Assessment window",
  GENERIC: "Event",
};

const TYPE_TONE: Record<CalendarEvent["type"], "success" | "warning" | "info" | "neutral"> = {
  HOLIDAY: "success",
  MIDTERM_BREAK: "warning",
  ASSESSMENT_WINDOW: "info",
  GENERIC: "neutral",
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function CalendarPage() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const d = await api<CalendarData>("calendar");
      setData(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const canManage = data?.role === "OWNER" || data?.role === "ADMIN";

  function openCreate() {
    setEditId(null);
    setForm({ type: "GENERIC" });
    setSaveError(null);
    setOpen(true);
  }

  function openEdit(ev: CalendarEvent) {
    setEditId(ev.id);
    setForm({
      title: ev.title,
      type: ev.type,
      startDate: ev.startDate.slice(0, 10),
      endDate: ev.endDate.slice(0, 10),
      termId: ev.term?.id ?? "",
      appliesToSection: ev.appliesToSection ?? "",
      targetType: ev.targetType ?? "",
    });
    setSaveError(null);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        title: form.title,
        type: form.type,
        startDate: form.startDate,
        endDate: form.endDate,
        termId: form.termId || undefined,
        appliesToSection: form.appliesToSection || undefined,
        targetType: form.type === "ASSESSMENT_WINDOW" ? form.targetType || undefined : undefined,
      };
      if (editId) await api(`calendar/${editId}`, { method: "PATCH", body });
      else await api("calendar", { method: "POST", body });
      setOpen(false);
      await load();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(ev: CalendarEvent) {
    if (!confirm(`Delete "${ev.title}"?`)) return;
    try {
      await api(`calendar/${ev.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;

  return (
    <div>
      <PageHeader
        title="School Calendar"
        subtitle={canManage ? "Term dates, holidays and assessment windows." : "Upcoming term dates, holidays and assessment windows."}
        actions={canManage ? <Button onClick={openCreate}><Icon name="plus" size={16} /> Add event</Button> : undefined}
      />

      {loading ? (
        <Spinner size={28} />
      ) : !data?.events.length ? (
        <EmptyState title="No calendar events yet" hint={canManage ? "Add a holiday, break or assessment window to get started." : "Check back later."} />
      ) : (
        <Card>
          <Table headers={["Event", "Type", "Dates", "Section", "Term", canManage ? "" : undefined].filter(Boolean) as string[]}>
            {data.events.map((ev) => (
              <tr key={ev.id}>
                <td>
                  {ev.title}
                  {ev.type === "ASSESSMENT_WINDOW" && ev.targetType && (
                    <div style={{ fontSize: 12, color: "var(--duga-muted)" }}>Gates: {ev.targetType}</div>
                  )}
                </td>
                <td><Badge tone={TYPE_TONE[ev.type]}>{TYPE_LABEL[ev.type]}</Badge></td>
                <td>{fmt(ev.startDate)} – {fmt(ev.endDate)}</td>
                <td>{ev.appliesToSection ?? "All sections"}</td>
                <td>{ev.term?.name ?? "—"}</td>
                {canManage && (
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(ev)}>Edit</Button>
                      <Button size="sm" variant="danger" onClick={() => remove(ev)}>Delete</Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? "Edit calendar event" : "Add calendar event"}>
        {saveError && <Alert tone="danger">{saveError}</Alert>}
        <Field label="Title">
          <Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Mid-term break" />
        </Field>
        <Field label="Type">
          <Select value={form.type ?? "GENERIC"} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="GENERIC">Event</option>
            <option value="HOLIDAY">Holiday</option>
            <option value="MIDTERM_BREAK">Midterm break</option>
            <option value="ASSESSMENT_WINDOW">Assessment window (locks submissions outside it)</option>
          </Select>
        </Field>
        {form.type === "ASSESSMENT_WINDOW" && (
          <Field label="Gates">
            <Select value={form.targetType ?? ""} onChange={(e) => setForm({ ...form, targetType: e.target.value })}>
              <option value="">Choose what this window gates…</option>
              <option value="ASSIGNMENT">Assignment submissions</option>
              <option value="CBT">CBT / test submissions</option>
              <option value="RESULTS">Teacher results entry</option>
            </Select>
          </Field>
        )}
        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Start date">
            <Input type="date" value={form.startDate ?? ""} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label="End date">
            <Input type="date" value={form.endDate ?? ""} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </Field>
        </div>
        <Field label="Term (optional)">
          <Select value={form.termId ?? ""} onChange={(e) => setForm({ ...form, termId: e.target.value })}>
            <option value="">No specific term</option>
            {data?.terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Section (optional)">
          <Input value={form.appliesToSection ?? ""} onChange={(e) => setForm({ ...form, appliesToSection: e.target.value })} placeholder="Leave blank for all sections" />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={saving} onClick={save} disabled={!form.title || !form.startDate || !form.endDate}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
