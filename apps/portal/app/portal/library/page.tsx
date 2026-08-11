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
  coverUrl: string | null;
  coverKey?: string | null;
  fileUrl: string | null;
  fileKey?: string | null;
  fileMime: string | null;
  fileSize: number | null;
  description: string | null;
  onLoanCount?: number;
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

function fmtBytes(b: number | null | undefined): string {
  if (!b) return "";
  if (b < 1024 * 1024) return `${Math.round((b / 1024) * 10) / 10} KB`;
  return `${Math.round((b / (1024 * 1024)) * 10) / 10} MB`;
}

const BOOK_CATEGORIES = ["General", "English", "Mathematics", "Science", "Literature", "History", "Religious Studies", "ICT", "Health", "Reference"];

export default function LibraryPage() {
  const [data, setData] = useState<LibraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"book" | "loan">("book");
  const [editing, setEditing] = useState<Book | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
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
    setEditing(null);
    setForm({});
    setFile(null);
    setCover(null);
    setError(null);
    setOpen(true);
  }

  function openEdit(b: Book) {
    setKind("book");
    setEditing(b);
    setFile(null);
    setCover(null);
    setError(null);
    setForm({
      title: b.title,
      author: b.author ?? "",
      isbn: b.isbn ?? "",
      category: b.category,
      shelfLocation: b.shelfLocation ?? "",
      totalCopies: String(b.totalCopies),
      availableCopies: String(b.availableCopies),
      description: b.description ?? "",
      coverUrl: b.coverUrl ?? "",
      fileUrl: b.fileUrl ?? "",
      fileMime: b.fileMime ?? "",
      fileSize: b.fileSize ? String(b.fileSize) : "",
    });
    setOpen(true);
  }

  async function uploadFile(fileToUpload: File): Promise<{ url: string; key: string; size: number; mime: string }> {
    const fd = new FormData();
    fd.append("file", fileToUpload);
    const res = await fetch("/api/upload?purpose=library", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
    return json.data as { url: string; key: string; size: number; mime: string };
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      if (kind === "loan" && !editing) {
        await api("library/addLoan", { method: "POST", body: form });
      } else {
        const body: Record<string, string> = { ...form };
        if (file) {
          const up = await uploadFile(file);
          body.fileUrl = up.url;
          body.fileKey = up.key;
          body.fileSize = String(up.size);
          body.fileMime = up.mime;
        } else if (editing) {
          delete body.fileUrl;
          delete body.fileKey;
          delete body.fileSize;
          delete body.fileMime;
        }
        if (cover) {
          const up = await uploadFile(cover);
          body.coverUrl = up.url;
          body.coverKey = up.key;
        }
        if (editing) {
          await api(`library/${editing.id}/updateBook`, { method: "POST", body });
        } else {
          await api("library/addBook", { method: "POST", body });
        }
      }
      setOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function run(id: string, action: "returnBook" | "markLost" | "deleteBook" | "deleteLoan") {
    if (action !== "returnBook" && !confirm("Are you sure?")) return;
    try {
      await api(`library/${id}/${action}`, { method: "POST", body: {} });
      if (action === "deleteBook") setOpen(false);
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
        subtitle="Book catalog, borrowing records and digital books."
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
            {b.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.coverUrl} alt={b.title} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 8, marginBottom: 10, background: "var(--duga-surface)" }} />
            )}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 14.5, lineHeight: 1.3 }}>{b.title}</strong>
              <Badge tone="accent">{b.category}</Badge>
            </div>
            {b.author && <div style={{ fontSize: 13, color: "var(--duga-muted)", marginTop: 6 }}>{b.author}</div>}
            {b.shelfLocation && <div style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>Shelf: {b.shelfLocation}</div>}
            {b.fileUrl && (
              <div style={{ marginTop: 4, display: "flex", gap: 8, alignItems: "center" }}>
                <Badge tone="info">Digital</Badge>
                <a href={b.fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>Read book {b.fileMime ? `.${b.fileMime}` : ""} {fmtBytes(b.fileSize)}</a>
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 13 }}>
              <Badge tone={b.availableCopies > 0 ? "success" : "danger"}>
                {b.availableCopies} of {b.totalCopies} available
              </Badge>
            </div>
            {isStaff && (
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <Button variant="outline" size="sm" onClick={() => openEdit(b)}>Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => run(b.id, "deleteBook")}>Delete</Button>
              </div>
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
                {isStaff && (
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {l.status !== "RETURNED" && l.status !== "LOST" && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => run(l.id, "returnBook")}>Return</Button>
                          <Button variant="ghost" size="sm" onClick={() => run(l.id, "markLost")}>Lost</Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => run(l.id, "deleteLoan")}>Delete</Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit book" : kind === "book" ? "Add book" : "Issue book"}>
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
              <Select value={form.category ?? "General"} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {BOOK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Shelf location">
              <Input value={form.shelfLocation ?? ""} onChange={(e) => setForm({ ...form, shelfLocation: e.target.value })} placeholder="e.g. A2-14" />
            </Field>
            <Field label="Total copies">
              <Input type="number" value={form.totalCopies ?? "1"} onChange={(e) => setForm({ ...form, totalCopies: e.target.value })} />
            </Field>
            <Field label="Book file (PDF, EPUB or MOBI)" hint={file ? `${file.name} · ${fmtBytes(file.size)}` : editing?.fileUrl ? "A file is already attached — pick a new one to replace it." : "Attach a digital copy so students can read it online."}>
              <input
                type="file"
                accept={".pdf,.epub,.mobi,application/pdf,application/epub+zip,application/x-mobipocket-ebook"}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setForm((f) => ({ ...f, fileUrl: "", fileSize: "" }));
                }}
              />
            </Field>
            {editing?.fileUrl && !file && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <Badge tone="info">Attached: {fmtBytes(editing.fileSize)}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing({ ...editing, fileUrl: null, fileKey: null, fileMime: null, fileSize: null });
                    setForm((f) => ({ ...f, clearFile: "1" }));
                  }}
                >
                  Remove file
                </Button>
              </div>
            )}
            <Field label="Cover image (JPG, PNG or WebP)">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  setCover(e.target.files?.[0] ?? null);
                  setForm((f) => ({ ...f, coverUrl: "" }));
                }}
              />
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
          <Button onClick={submit} loading={saving}>
            {editing ? "Save changes" : kind === "book" ? "Add book" : "Issue book"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}