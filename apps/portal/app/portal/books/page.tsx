"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, Field, Icon, Input, Modal, PageHeader, Select, Spinner, Tabs } from "@duga/ui";
import { api } from "@/lib/client/api";

type ColumnKind = "TEXT" | "NUMBER" | "CURRENCY" | "DATE" | "SELECT";
type BookKind = "CUSTOM" | "SYSTEM_FEES" | "SYSTEM_PAYROLL" | "SYSTEM_EXPENSE";

interface LedgerColumn {
  id: string;
  label: string;
  kind: ColumnKind;
  order: number;
  required: boolean;
  totals: boolean;
  parentId: string | null;
  optionsJson?: string[] | null;
}

interface LedgerTab {
  id: string;
  bookId: string;
  name: string;
  order: number;
  columns: LedgerColumn[];
}

interface LedgerBook {
  id: string;
  name: string;
  description: string | null;
  kind: BookKind;
  tabs: LedgerTab[];
}

interface SuggestedBook {
  kind: BookKind;
  name: string;
  description: string;
}

interface LedgerRow {
  id: string;
  valuesJson: Record<string, string | number>;
  createdAt: string;
}

interface SystemFeeRow {
  id: string;
  date: string | null;
  student: string;
  invoice: string;
  method: string;
  amountLabel: string;
}

interface SystemPayrollRow {
  id: string;
  month: string;
  staff: string;
  role: string;
  netPayLabel: string;
  status: string;
}

const naira = (v: number) => `₦${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function cellDisplay(col: LedgerColumn, raw: string | number | undefined): string {
  if (raw === undefined || raw === null || raw === "") return "—";
  if (col.kind === "CURRENCY") return naira(Number(raw) || 0);
  if (col.kind === "DATE") return new Date(String(raw)).toLocaleDateString();
  return String(raw);
}

export default function BooksPage() {
  const [books, setBooks] = useState<LedgerBook[]>([]);
  const [suggested, setSuggested] = useState<SuggestedBook[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);

  const [tabRows, setTabRows] = useState<LedgerRow[]>([]);
  const [tabTotals, setTabTotals] = useState<Record<string, number>>({});
  const [tabLoading, setTabLoading] = useState(false);

  const [systemRows, setSystemRows] = useState<SystemFeeRow[] | SystemPayrollRow[]>([]);
  const [systemTotal, setSystemTotal] = useState(0);

  const [newBookOpen, setNewBookOpen] = useState(false);
  const [newBookForm, setNewBookForm] = useState({ name: "", description: "" });
  const [busy, setBusy] = useState(false);

  const [newTabOpen, setNewTabOpen] = useState(false);
  const [newTabName, setNewTabName] = useState("");

  const [newColumnOpen, setNewColumnOpen] = useState(false);
  const [newColumnForm, setNewColumnForm] = useState({ label: "", kind: "TEXT" as ColumnKind, required: false, totals: false, parentId: "" });

  const [rowTarget, setRowTarget] = useState<LedgerRow | "new" | null>(null);
  const [rowForm, setRowForm] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const d = await api<{ books: LedgerBook[]; suggested: SuggestedBook[]; canManage: boolean }>("books");
    setBooks(d.books);
    setSuggested(d.suggested);
    setCanManage(d.canManage);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);

  const selectedBook = books.find((b) => b.id === selectedBookId) ?? null;
  const selectedTab = selectedBook?.tabs.find((t) => t.id === selectedTabId) ?? null;
  const isSystemLive = selectedBook?.kind === "SYSTEM_FEES" || selectedBook?.kind === "SYSTEM_PAYROLL";

  // Keep the selected tab valid whenever the book list refreshes (e.g. after
  // adding/removing a tab) instead of pointing at a tab that no longer exists.
  useEffect(() => {
    if (!selectedBook) return;
    if (!selectedBook.tabs.some((t) => t.id === selectedTabId)) {
      setSelectedTabId(selectedBook.tabs[0]?.id ?? null);
    }
  }, [selectedBook, selectedTabId]);

  const loadTabData = useCallback(async (tabId: string) => {
    setTabLoading(true);
    try {
      const d = await api<{ tab: LedgerTab & { rows: LedgerRow[] }; totals: Record<string, number> }>(`books/getTabData?tabId=${tabId}`);
      setTabRows(d.tab.rows);
      setTabTotals(d.totals);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setTabLoading(false);
    }
  }, []);

  const loadSystemData = useCallback(async (book: LedgerBook) => {
    setTabLoading(true);
    try {
      if (book.kind === "SYSTEM_FEES") {
        const d = await api<{ rows: SystemFeeRow[]; total: number }>("books/getSystemFeesData");
        setSystemRows(d.rows);
        setSystemTotal(d.total);
      } else {
        const d = await api<{ rows: SystemPayrollRow[]; total: number }>("books/getSystemPayrollData");
        setSystemRows(d.rows);
        setSystemTotal(d.total);
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setTabLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedBook) return;
    if (isSystemLive) {
      loadSystemData(selectedBook);
    } else if (selectedTabId) {
      loadTabData(selectedTabId);
    }
  }, [selectedBook, selectedTabId, isSystemLive, loadSystemData, loadTabData]);

  function openBook(bookId: string) {
    setSelectedBookId(bookId);
    const book = books.find((b) => b.id === bookId);
    setSelectedTabId(book?.tabs[0]?.id ?? null);
  }

  async function createBook() {
    if (!newBookForm.name.trim()) return alert("Enter a name for this book");
    setBusy(true);
    try {
      const book = await api<LedgerBook>("books/createBook", { method: "POST", body: newBookForm });
      setNewBookOpen(false);
      setNewBookForm({ name: "", description: "" });
      await load();
      openBook(book.id);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function provisionSystemBook(kind: BookKind) {
    setBusy(true);
    try {
      const book = await api<LedgerBook>("books/provisionSystemBook", { method: "POST", body: { kind } });
      await load();
      openBook(book.id);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteBook(book: LedgerBook) {
    if (!confirm(`Delete "${book.name}"? Only books with no entries recorded can be deleted.`)) return;
    setBusy(true);
    try {
      await api(`books/${book.id}/deleteBook`, { method: "POST", body: {} });
      if (selectedBookId === book.id) setSelectedBookId(null);
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addTab() {
    if (!selectedBook || !newTabName.trim()) return alert("Enter a name for this tab");
    setBusy(true);
    try {
      const tab = await api<LedgerTab>("books/addTab", { method: "POST", body: { bookId: selectedBook.id, name: newTabName } });
      setNewTabOpen(false);
      setNewTabName("");
      await load();
      setSelectedTabId(tab.id);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTab(tab: LedgerTab) {
    if (!confirm(`Remove the "${tab.name}" tab? Only tabs with no entries recorded can be removed.`)) return;
    setBusy(true);
    try {
      await api(`books/${tab.id}/deleteTab`, { method: "POST", body: {} });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addColumn() {
    if (!selectedTab || !newColumnForm.label.trim()) return alert("Enter a heading");
    setBusy(true);
    try {
      await api("books/addColumn", {
        method: "POST",
        body: { tabId: selectedTab.id, label: newColumnForm.label, kind: newColumnForm.kind, required: newColumnForm.required, totals: newColumnForm.totals, parentId: newColumnForm.parentId || undefined },
      });
      setNewColumnOpen(false);
      setNewColumnForm({ label: "", kind: "TEXT", required: false, totals: false, parentId: "" });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteColumn(col: LedgerColumn) {
    if (!confirm(`Remove the "${col.label}" column? Its data in existing entries is dropped.`)) return;
    setBusy(true);
    try {
      await api(`books/${col.id}/deleteColumn`, { method: "POST", body: {} });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openAddRow() {
    setRowForm({});
    setRowTarget("new");
  }

  function openEditRow(row: LedgerRow) {
    const draft: Record<string, string> = {};
    for (const [k, v] of Object.entries(row.valuesJson)) draft[k] = String(v);
    setRowForm(draft);
    setRowTarget(row);
  }

  async function saveRow() {
    if (!selectedTab || !rowTarget) return;
    setBusy(true);
    try {
      const values: Record<string, string> = { ...rowForm };
      if (rowTarget === "new") {
        await api("books/addRow", { method: "POST", body: { tabId: selectedTab.id, values } });
      } else {
        await api(`books/${rowTarget.id}/updateRow`, { method: "POST", body: { values } });
      }
      setRowTarget(null);
      await loadTabData(selectedTab.id);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteRow(row: LedgerRow) {
    if (!selectedTab) return;
    if (!confirm("Delete this entry?")) return;
    setBusy(true);
    try {
      await api(`books/${row.id}/deleteRow`, { method: "POST", body: {} });
      await loadTabData(selectedTab.id);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Columns rendered in display order, expanded so a heading with
  // subheadings is followed immediately by its children, and a plain column
  // stands alone — used for both the header and every data row/totals cell.
  const leafColumns = useMemo(() => {
    if (!selectedTab) return [] as LedgerColumn[];
    const topLevel = selectedTab.columns.filter((c) => !c.parentId).sort((a, b) => a.order - b.order);
    const out: LedgerColumn[] = [];
    for (const col of topLevel) {
      const children = selectedTab.columns.filter((c) => c.parentId === col.id).sort((a, b) => a.order - b.order);
      if (children.length > 0) out.push(...children);
      else out.push(col);
    }
    return out;
  }, [selectedTab]);

  const headingGroups = useMemo(() => {
    if (!selectedTab) return [] as Array<{ heading: LedgerColumn | null; children: LedgerColumn[] }>;
    const topLevel = selectedTab.columns.filter((c) => !c.parentId).sort((a, b) => a.order - b.order);
    return topLevel.map((col) => ({
      heading: col,
      children: selectedTab.columns.filter((c) => c.parentId === col.id).sort((a, b) => a.order - b.order),
    }));
  }, [selectedTab]);
  const hasSubheadings = headingGroups.some((g) => g.children.length > 0);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading) return <Spinner size={28} />;

  return (
    <div>
      <PageHeader
        title="Books"
        subtitle="Ledgers for the school's finances — auto-filled system books, plus your own custom books."
        actions={canManage ? <Button onClick={() => setNewBookOpen(true)}><Icon name="plus" size={16} /> New custom book</Button> : undefined}
      />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 14 }}>
          <Card title="Your books" pad={false}>
            {books.length === 0 ? (
              <div style={{ padding: 14, fontSize: 13, color: "var(--duga-muted)" }}>No books yet — add one from the suggestions below, or create a custom one.</div>
            ) : (
              <div style={{ display: "grid" }}>
                {books.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => openBook(b.id)}
                    className="duga-btn duga-btn--ghost"
                    style={{
                      justifyContent: "flex-start",
                      borderRadius: 0,
                      background: selectedBookId === b.id ? "var(--duga-surface-2, #f4f6f9)" : "transparent",
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ flex: 1, textAlign: "left" }}>{b.name}</span>
                    <Badge tone={b.kind === "CUSTOM" ? "neutral" : "info"}>{b.kind === "CUSTOM" ? "Custom" : "System"}</Badge>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {suggested.length > 0 && canManage && (
            <Card title="Suggested books">
              <div style={{ display: "grid", gap: 10 }}>
                {suggested.map((s) => (
                  <div key={s.kind} style={{ display: "grid", gap: 6, paddingBottom: 10, borderBottom: "1px solid var(--duga-border)" }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.name}</div>
                    <div style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>{s.description}</div>
                    <Button size="sm" variant="outline" loading={busy} onClick={() => provisionSystemBook(s.kind)}>
                      Add this book
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div>
          {!selectedBook ? (
            <Card>
              <EmptyState title="Select a book" hint="Choose a book on the left, or add one of the suggested books to get started." />
            </Card>
          ) : (
            <Card
              title={selectedBook.name}
              actions={
                canManage && selectedBook.kind === "CUSTOM" ? (
                  <Button size="sm" variant="ghost" onClick={() => deleteBook(selectedBook)}>Delete book</Button>
                ) : undefined
              }
            >
              {isSystemLive ? (
                <>
                  <Alert tone="info">
                    This book updates automatically from {selectedBook.kind === "SYSTEM_FEES" ? "Fees & Payments" : "Payroll"} records — it&apos;s read-only here.
                  </Alert>
                  {tabLoading ? (
                    <Spinner size={22} />
                  ) : selectedBook.kind === "SYSTEM_FEES" ? (
                    <div className="duga-table-wrap" style={{ marginTop: 12 }}>
                      <table className="duga-table">
                        <thead>
                          <tr>
                            <th>Date</th><th>Student</th><th>Invoice</th><th>Method</th><th>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(systemRows as SystemFeeRow[]).map((r) => (
                            <tr key={r.id}>
                              <td>{r.date ? new Date(r.date).toLocaleDateString() : "—"}</td>
                              <td>{r.student}</td>
                              <td>{r.invoice}</td>
                              <td>{r.method}</td>
                              <td>{r.amountLabel}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr><td colSpan={4} style={{ fontWeight: 700 }}>Total</td><td style={{ fontWeight: 700 }}>{naira(systemTotal)}</td></tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div className="duga-table-wrap" style={{ marginTop: 12 }}>
                      <table className="duga-table">
                        <thead>
                          <tr>
                            <th>Month</th><th>Staff</th><th>Role</th><th>Status</th><th>Net pay</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(systemRows as SystemPayrollRow[]).map((r) => (
                            <tr key={r.id}>
                              <td>{r.month}</td>
                              <td>{r.staff}</td>
                              <td>{r.role}</td>
                              <td>{r.status}</td>
                              <td>{r.netPayLabel}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr><td colSpan={4} style={{ fontWeight: 700 }}>Total</td><td style={{ fontWeight: 700 }}>{naira(systemTotal)}</td></tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Tabs tabs={selectedBook.tabs.map((t) => ({ id: t.id, label: t.name }))} value={selectedTabId ?? ""} onChange={setSelectedTabId} />
                    </div>
                    {canManage && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button size="sm" variant="outline" onClick={() => setNewTabOpen(true)}>+ Tab</Button>
                        {selectedTab && selectedBook.tabs.length > 1 && (
                          <Button size="sm" variant="ghost" onClick={() => deleteTab(selectedTab)}>Remove tab</Button>
                        )}
                      </div>
                    )}
                  </div>

                  {!selectedTab ? (
                    <EmptyState title="No tabs yet" />
                  ) : tabLoading ? (
                    <Spinner size={22} />
                  ) : (
                    <>
                      {canManage && (
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 10 }}>
                          <Button size="sm" variant="outline" onClick={() => setNewColumnOpen(true)}>+ Column</Button>
                          <Button size="sm" onClick={openAddRow} disabled={leafColumns.length === 0}>+ Add entry</Button>
                        </div>
                      )}
                      {leafColumns.length === 0 ? (
                        <EmptyState title="No columns yet" hint='Add a column (e.g. "Date", "Amount") before recording entries.' />
                      ) : (
                        <div className="duga-table-wrap">
                          <table className="duga-table">
                            <thead>
                              <tr>
                                {headingGroups.map((g) =>
                                  g.children.length > 0 ? (
                                    <th key={g.heading!.id} colSpan={g.children.length}>{g.heading!.label}</th>
                                  ) : (
                                    <th key={g.heading!.id} rowSpan={hasSubheadings ? 2 : 1}>{g.heading!.label}</th>
                                  ),
                                )}
                                {canManage && <th rowSpan={hasSubheadings ? 2 : 1}></th>}
                              </tr>
                              {hasSubheadings && (
                                <tr>
                                  {headingGroups.flatMap((g) => g.children.map((c) => <th key={c.id}>{c.label}</th>))}
                                </tr>
                              )}
                            </thead>
                            <tbody>
                              {tabRows.length === 0 ? (
                                <tr><td colSpan={leafColumns.length + (canManage ? 1 : 0)} style={{ textAlign: "center", color: "var(--duga-muted)" }}>No entries yet.</td></tr>
                              ) : (
                                tabRows.map((row) => (
                                  <tr key={row.id}>
                                    {leafColumns.map((col) => <td key={col.id}>{cellDisplay(col, row.valuesJson[col.id])}</td>)}
                                    {canManage && (
                                      <td>
                                        <div style={{ display: "flex", gap: 6 }}>
                                          <Button size="sm" variant="ghost" onClick={() => openEditRow(row)}>Edit</Button>
                                          <Button size="sm" variant="ghost" onClick={() => deleteRow(row)}>Delete</Button>
                                        </div>
                                      </td>
                                    )}
                                  </tr>
                                ))
                              )}
                            </tbody>
                            {leafColumns.some((c) => c.totals) && (
                              <tfoot>
                                <tr>
                                  {leafColumns.map((col, i) => (
                                    <td key={col.id} style={{ fontWeight: 700 }}>
                                      {col.totals ? naira(tabTotals[col.id] ?? 0) : i === 0 ? "Total" : ""}
                                    </td>
                                  ))}
                                  {canManage && <td />}
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      )}
                      {canManage && leafColumns.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          {selectedTab.columns.map((col) => (
                            <span key={col.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 8, marginBottom: 6 }}>
                              <Badge tone="neutral">{col.label}</Badge>
                              <button
                                onClick={() => deleteColumn(col)}
                                title={`Remove "${col.label}"`}
                                style={{ border: "none", background: "none", cursor: "pointer", color: "var(--duga-muted)", fontSize: 12 }}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </Card>
          )}
        </div>
      </div>

      <Modal open={newBookOpen} onClose={() => setNewBookOpen(false)} title="New custom book">
        <Field label="Name" required>
          <Input value={newBookForm.name} onChange={(e) => setNewBookForm({ ...newBookForm, name: e.target.value })} placeholder="e.g. Uniform Sales Book" />
        </Field>
        <Field label="Description">
          <Input value={newBookForm.description} onChange={(e) => setNewBookForm({ ...newBookForm, description: e.target.value })} />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setNewBookOpen(false)}>Cancel</Button>
          <Button onClick={createBook} loading={busy}>Create</Button>
        </div>
      </Modal>

      <Modal open={newTabOpen} onClose={() => setNewTabOpen(false)} title="Add a tab">
        <Field label="Tab name" required>
          <Input value={newTabName} onChange={(e) => setNewTabName(e.target.value)} placeholder="e.g. 2026 Term 1" />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setNewTabOpen(false)}>Cancel</Button>
          <Button onClick={addTab} loading={busy}>Add tab</Button>
        </div>
      </Modal>

      <Modal open={newColumnOpen} onClose={() => setNewColumnOpen(false)} title="Add a column">
        <Field label="Heading" required>
          <Input value={newColumnForm.label} onChange={(e) => setNewColumnForm({ ...newColumnForm, label: e.target.value })} placeholder="e.g. Amount" />
        </Field>
        <Field label="Type">
          <Select value={newColumnForm.kind} onChange={(e) => setNewColumnForm({ ...newColumnForm, kind: e.target.value as ColumnKind })}>
            <option value="TEXT">Text</option>
            <option value="NUMBER">Number</option>
            <option value="CURRENCY">Currency (₦)</option>
            <option value="DATE">Date</option>
          </Select>
        </Field>
        <Field label="Group under (optional)" hint="Makes this a subheading nested under an existing heading, instead of its own column.">
          <Select value={newColumnForm.parentId} onChange={(e) => setNewColumnForm({ ...newColumnForm, parentId: e.target.value })}>
            <option value="">No grouping — its own column</option>
            {selectedTab?.columns.filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </Field>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginTop: 10 }}>
          <input type="checkbox" checked={newColumnForm.required} onChange={(e) => setNewColumnForm({ ...newColumnForm, required: e.target.checked })} />
          Required — an entry can&apos;t be saved without a value here
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginTop: 8 }}>
          <input type="checkbox" checked={newColumnForm.totals} onChange={(e) => setNewColumnForm({ ...newColumnForm, totals: e.target.checked })} />
          Show a total row for this column (for number/currency columns)
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setNewColumnOpen(false)}>Cancel</Button>
          <Button onClick={addColumn} loading={busy}>Add column</Button>
        </div>
      </Modal>

      <Modal open={!!rowTarget} onClose={() => setRowTarget(null)} title={rowTarget === "new" ? "Add entry" : "Edit entry"}>
        {leafColumns.map((col) => (
          <Field key={col.id} label={col.label} required={col.required}>
            {col.kind === "SELECT" ? (
              <Select value={rowForm[col.id] ?? ""} onChange={(e) => setRowForm({ ...rowForm, [col.id]: e.target.value })}>
                <option value="">Select…</option>
                {(col.optionsJson ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </Select>
            ) : (
              <Input
                type={col.kind === "NUMBER" || col.kind === "CURRENCY" ? "number" : col.kind === "DATE" ? "date" : "text"}
                value={rowForm[col.id] ?? ""}
                onChange={(e) => setRowForm({ ...rowForm, [col.id]: e.target.value })}
              />
            )}
          </Field>
        ))}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setRowTarget(null)}>Cancel</Button>
          <Button onClick={saveRow} loading={busy}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
