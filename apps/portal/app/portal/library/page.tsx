"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Badge, Table, Alert, Spinner, EmptyState, Button, Icon, Modal, Field, Input, Textarea, Select } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Book {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  category: string;
  shelfLocation: string | null;
  totalCopies: number;
  availableCopies: number;
  description: string | null;
}

interface Loan {
  id: string;
  status: string;
  borrowedAt: string;
  dueDate: string | null;
  returnedAt: string | null;
  book: { id: string; title: string; author: string | null };
  student: { user: { firstName: string; lastName: string } };
}

interface StudentOption {
  id: string;
  admissionNumber: string;
  user: { firstName: string; lastName: string };
}

interface LibraryData {
  role: string;
  books: Book[];
  loans: Loan[];
  students?: StudentOption[];
}

export default function LibraryPage() {
  const [data, setData] = useState<LibraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"book" | "loan">("book");
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    const d = await api<LibraryData>("library");
    setData(d);
  }

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const isStaff = data?.role === "ADMIN" || data?.role === "OWNER" || data?.role === "TEACHER";

  function openModal(kind: "book" | "loan") {
    setKind(kind);
    setForm({});
    setOpen(true);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const path = kind === "book" ? "library/addBook" : "library/addLoan";
      await api(path, { method: "POST", body: form });
      setOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function run(id: string, action: "returnBook" | "markLost" | "deleteBook") {
    if (action !== "returnBook" && !confirm("Are you sure?")) return;
    try {
      await api(`library/${id}/${action}`, { method: "POST", body: {} });
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading || !data) return <Spinner size={28} />;

  const tone = (status: string) =>
    status === "RETURNED" ? "success" : status === "OVERDUE" ? "danger" : status === "LOST" ? "danger" : "warning";

  return (
    <div>
      <PageHeader
        title="Library"
        subtitle="Book catalog and borrowing records."
        actions={
          isStaff ? (
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="outline" onClick={() => openModal("loan")}><Icon name="plus" size={16} /> Issue book</Button>
              <Button onClick={() => openModal("book")}><Icon name="plus" size={16} /> Add book</Button>
            </div>
          ) : undefined
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 12, marginBottom: 20 }}>
        {(data.books ?? []).map((b) => (
          <div key={b.id} style={{ border: "1px solid var(--duga-border)", borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 14.5, lineHeight: 1.3 }}>{b.title}</strong>
              <Badge tone="accent">{b.category}</Badge>
            </div>
            {b.author && <div style={{ fontSize: 13, color: "var(--duga-muted)", marginTop: 6 }}>{b.author}</div>}
            {b.shelfLocation && <div style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>Shelf: {b.shelfLocation}</div>}
            <div style={{ marginTop: 10, fontSize: 13 }}>
              <Badge tone={b.availableCopies > 0 ? "success" : "danger"}>
                {b.availableCopies} of {b.totalCopies} available
              </Badge>
            </div>
            {isStaff && (
              <Button variant="ghost" size="sm" style={{ marginTop: 10 }} onClick={() => run(b.id, "deleteBook")}>
                Remove
              </Button>
            )}
          </div>
        ))}
      </div>

      <Card title="Borrowing records">
        {(data.loans ?? []).length === 0 ? (
          <EmptyState title="No loans yet" hint="Issue a book to a student to start tracking loans." />
        ) : (
          <Table headers={["Book", "Student", "Borrowed", "Due", "Status", isStaff ? "" : null].filter(Boolean) as React.ReactNode[]}>
            {(data.loans ?? []).map((l) => (
              <tr key={l.id}>
                <td>{l.book.title}</td>
                <td>{l.student.user.firstName} {l.student.user.lastName}</td>
                <td>{new Date(l.borrowedAt).toLocaleDateString()}</td>
                <td>{l.dueDate ? new Date(l.dueDate).toLocaleDateString() : "—"}</td>
                <td><Badge tone={tone(l.status)}>{l.status}</Badge></td>
                {isStaff && l.status !== "RETURNED" && l.status !== "LOST" && (
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button variant="outline" size="sm" onClick={() => run(l.id, "returnBook")}>Return</Button>
                      <Button variant="ghost" size="sm" onClick={() => run(l.id, "markLost")}>Lost</Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={kind === "book" ? "Add book" : "Issue book"}>
        {kind === "book" ? (
          <>
            <Field label="Title" required>
              <Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Author">
              <Input value={form.author ?? ""} onChange={(e) => setForm({ ...form, author: e.target.value })} />
            </Field>
            <Field label="ISBN">
              <Input value={form.isbn ?? ""} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
            </Field>
            <Field label="Category">
              <Input value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. English" />
            </Field>
            <Field label="Shelf location">
              <Input value={form.shelfLocation ?? ""} onChange={(e) => setForm({ ...form, shelfLocation: e.target.value })} placeholder="e.g. A2-14" />
            </Field>
            <Field label="Total copies">
              <Input type="number" value={form.totalCopies ?? "1"} onChange={(e) => setForm({ ...form, totalCopies: e.target.value })} />
            </Field>
            <Field label="Description">
              <Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Book" required>
              <Select value={form.bookId ?? ""} onChange={(e) => setForm({ ...form, bookId: e.target.value })}>
                <option value="">Select a book…</option>
                {(data.books ?? [])
                  .filter((b) => b.availableCopies > 0)
                  .map((b) => (
                    <option key={b.id} value={b.id}>{b.title} ({b.availableCopies} left)</option>
                  ))}
              </Select>
            </Field>
            <Field label="Student" required>
              <Select value={form.studentId ?? ""} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                <option value="">Select a student…</option>
                {(data.students ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.user.firstName} {s.user.lastName} · {s.admissionNumber}</option>
                ))}
              </Select>
            </Field>
            <Field label="Due date">
              <Input type="date" value={form.dueDate ?? ""} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </Field>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
