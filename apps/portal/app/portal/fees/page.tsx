"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Badge, Table, Alert, Spinner, EmptyState, Stat, Button, Icon, Modal, Field, Input, Select } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: string | number;
  paidAmount: string | number;
  balance: string | number;
  term: { name: string } | null;
  student?: { user: { firstName: string; lastName: string } };
}

interface FeeType {
  id: string;
  name: string;
  description: string | null;
  isOptional: boolean;
  isRecurring: boolean;
}

interface FeeStructure {
  id: string;
  amount: string | number;
  feeType: { id: string; name: string };
  term: { id: string; name: string } | null;
  level: { id: string; name: string } | null;
  classGroup: { id: string; name: string; level: { id: string; name: string } } | null;
  section: string | null;
}

interface Term {
  id: string;
  name: string;
  status: string;
}

interface ClassLevel {
  id: string;
  name: string;
  section: string;
}

interface ClassGroup {
  id: string;
  name: string;
  level: { id: string; name: string };
}

function naira(v: string | number | undefined): string {
  return `₦${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

type SetupKind = "type" | "structure";

export default function FeesPage() {
  const [role, setRole] = useState<string>("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<{ total: number; paid: number; balance: number } | null>(null);
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [levels, setLevels] = useState<ClassLevel[]>([]);
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupKind, setSetupKind] = useState<SetupKind>("type");
  const [editingSetupId, setEditingSetupId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [paying, setPaying] = useState<string | null>(null);
  const [paymentRecordsVisible, setPaymentRecordsVisible] = useState(true);
  const [adminPaymentVisibility, setAdminPaymentVisibility] = useState(false);

  const isStaff = role === "ADMIN" || role === "OWNER";

  async function load() {
    const d = await api<{
      role: string;
      invoices: Invoice[];
      summary: { total: number; paid: number; balance: number };
      feeTypes: FeeType[];
      feeStructures: FeeStructure[];
      terms: Term[];
      levels: ClassLevel[];
      classGroups: ClassGroup[];
      paymentRecordsVisible?: boolean;
      adminPaymentVisibility?: boolean;
    }>("fees");
    setRole(d.role);
    setInvoices(d.invoices);
    setSummary(d.summary);
    setFeeTypes(d.feeTypes ?? []);
    setFeeStructures(d.feeStructures ?? []);
    setTerms(d.terms ?? []);
    setLevels(d.levels ?? []);
    setClassGroups(d.classGroups ?? []);
    setPaymentRecordsVisible(d.paymentRecordsVisible !== false);
    setAdminPaymentVisibility(d.adminPaymentVisibility === true);
  }

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function generate() {
    try {
      await api("fees/generateInvoices", { method: "POST", body: form });
      setOpen(false);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function pay(invoiceId: string) {
    setPaying(invoiceId);
    try {
      const d = await api<{ authorization_url?: string; status?: string }>(`fees/${invoiceId}/initPayment`, { method: "POST", body: {} });
      if (d.authorization_url) window.location.href = d.authorization_url;
      else alert(d.status === "SUCCESS" ? "Payment recorded." : "Payment initialized. Check the invoice status.");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setPaying(null);
    }
  }

  async function recordManual(invoiceId: string) {
    const amount = window.prompt("Amount received (₦)");
    if (!amount || Number(amount) <= 0) return alert("Enter a valid amount");
    setPaying(invoiceId);
    try {
      await api(`fees/${invoiceId}/recordManual`, { method: "POST", body: { amount: Number(amount) } });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setPaying(null);
    }
  }

  async function deleteInvoice(invoiceId: string) {
    if (!confirm("Delete this invoice? Only invoices with no payments can be deleted.")) return;
    setPaying(invoiceId);
    try {
      await api(`fees/${invoiceId}/deleteInvoice`, { method: "POST", body: {} });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setPaying(null);
    }
  }

  async function setAdminVisibility(enabled: boolean) {
    try {
      await api("fees/setAdminPaymentVisibility", { method: "POST", body: { enabled } });
      setAdminPaymentVisibility(enabled);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function openSetup(kind: SetupKind) {
    setSetupKind(kind);
    setEditingSetupId(null);
    setForm({});
    setSetupOpen(true);
  }

  function openEditSetup(kind: SetupKind, item: FeeType | FeeStructure) {
    setSetupKind(kind);
    setEditingSetupId(item.id);
    if (kind === "type") {
      const t = item as FeeType;
      setForm({ name: t.name, description: t.description ?? "", isRecurring: t.isRecurring ? "true" : "false", isOptional: t.isOptional ? "true" : "false" });
    } else {
      const s = item as FeeStructure;
      setForm({
        feeTypeId: s.feeType.id,
        amount: String(Number(s.amount)),
        termId: s.term?.id ?? "",
        section: s.section ?? "",
        levelId: s.level?.id ?? "",
        classGroupId: s.classGroup?.id ?? "",
      });
    }
    setSetupOpen(true);
  }

  async function saveSetup() {
    try {
      if (setupKind === "type") {
        const body: Record<string, unknown> = {
          name: form.name ?? "",
          description: form.description ?? "",
          isRecurring: form.isRecurring === "true",
          isOptional: form.isOptional === "true",
        };
        const path = editingSetupId ? `fees/${editingSetupId}/updateFeeType` : "fees/addFeeType";
        await api(path, { method: "POST", body });
      } else {
        const path = editingSetupId ? `fees/${editingSetupId}/updateFeeStructure` : "fees/addFeeStructure";
        await api(path, { method: "POST", body: form });
      }
      setSetupOpen(false);
      setEditingSetupId(null);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function removeSetup(kind: SetupKind, id: string) {
    if (!confirm("Delete this fee item?")) return;
    try {
      const path = kind === "type" ? `fees/${id}/deleteFeeType` : `fees/${id}/deleteFeeStructure`;
      await api(path, { method: "POST", body: {} });
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading) return <Spinner size={28} />;

  return (
    <div>
      <PageHeader
        title="Fees & payments"
        subtitle="Invoices, payments and fee structures."
        actions={
          isStaff ? (
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="outline" onClick={() => openSetup("type")}><Icon name="plus" size={16} /> Add fee type</Button>
              <Button onClick={() => setOpen(true)}><Icon name="plus" size={16} /> Generate invoices</Button>
            </div>
          ) : undefined
        }
      />

      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 20 }}>
          <Stat label="Total billed" value={naira(summary.total)} />
          {paymentRecordsVisible && <Stat label="Collected" value={naira(summary.paid)} tone="success" />}
          <Stat label="Outstanding" value={naira(summary.balance)} tone="danger" />
        </div>
      )}

      {invoices.length === 0 ? (
        <EmptyState title="No invoices yet" />
      ) : (
        <Card>
          <Table headers={paymentRecordsVisible ? ["Invoice", "Student", "Term", "Amount", "Paid", "Balance", "Status", ""] : ["Invoice", "Student", "Term", "Amount", "Balance", "Status", ""]}>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td>{i.invoiceNumber}</td>
                <td>{i.student ? `${i.student.user.firstName} ${i.student.user.lastName}` : "—"}</td>
                <td>{i.term?.name}</td>
                <td>{naira(i.totalAmount)}</td>
                {paymentRecordsVisible && <td>{naira(i.paidAmount)}</td>}
                <td>{naira(i.balance)}</td>
                <td>
                  <Badge tone={i.status === "PAID" || i.status === "OVERPAID" ? "success" : i.status === "PARTIAL" ? "warning" : "danger"}>{i.status}</Badge>
                </td>
                <td>
                  {i.status !== "PAID" && i.status !== "OVERPAID" && (role === "STUDENT" || role === "PARENT") && (
                    <Button size="sm" loading={paying === i.id} onClick={() => pay(i.id)}>Pay</Button>
                  )}
                  {isStaff && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button size="sm" variant="outline" loading={paying === i.id} onClick={() => recordManual(i.id)}>Record payment</Button>
                      <Button size="sm" variant="ghost" loading={paying === i.id} onClick={() => deleteInvoice(i.id)}>Delete</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {isStaff && (
        <>
          {role === "OWNER" && (
            <Card title="Payment record visibility" style={{ marginTop: 20 }}>
              <p style={{ marginTop: 0 }}>Only you can view money collected by default. You can allow all administrators to view payment records and collection totals.</p>
              <Button variant={adminPaymentVisibility ? "outline" : "primary"} onClick={() => setAdminVisibility(!adminPaymentVisibility)}>
                {adminPaymentVisibility ? "Restrict payment records to owner" : "Allow administrators to view payment records"}
              </Button>
            </Card>
          )}
          <Card title="Fee types" style={{ marginTop: 20 }}>
            {feeTypes.length === 0 ? (
              <EmptyState title="No fee types yet" hint="Add fee types (e.g. Tuition, Transport) then attach amounts per class." />
            ) : (
              <Table headers={["Name", "Description", "Recurring", "Optional", ""]}>
                {feeTypes.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{t.description ?? "—"}</td>
                    <td><Badge tone={t.isRecurring ? "success" : "neutral"}>{t.isRecurring ? "Yes" : "No"}</Badge></td>
                    <td><Badge tone={t.isOptional ? "warning" : "neutral"}>{t.isOptional ? "Yes" : "No"}</Badge></td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button variant="outline" size="sm" onClick={() => openEditSetup("type", t)}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => removeSetup("type", t.id)}>Remove</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Fee structures" style={{ marginTop: 20 }}>
            {feeStructures.length === 0 ? (
              <EmptyState title="No fee structures yet" hint="Attach an amount to a fee type for a class, level, section or term." />
            ) : (
              <Table headers={["Fee", "Amount", "Term", "Scope", ""]}>
                {feeStructures.map((s) => (
                  <tr key={s.id}>
                    <td>{s.feeType.name}</td>
                    <td>{naira(s.amount)}</td>
                    <td>{s.term?.name ?? "All terms"}</td>
                    <td>
                      {s.classGroup
                        ? `${s.classGroup.level.name} ${s.classGroup.name}`
                        : s.level
                          ? `${s.section ?? ""} ${s.level.name}`
                          : s.section ?? "All classes"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button variant="outline" size="sm" onClick={() => openEditSetup("structure", s)}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => removeSetup("structure", s.id)}>Remove</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Generate invoices">
        <Field label="Term" required>
          <Select value={form.termId ?? ""} onChange={(e) => setForm({ ...form, termId: e.target.value })}>
            <option value="">Select term…</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Class group">
          <Select value={form.classGroupId ?? ""} onChange={(e) => setForm({ ...form, classGroupId: e.target.value })}>
            <option value="">All classes</option>
            {classGroups.map((c) => (
              <option key={c.id} value={c.id}>{c.level.name} {c.name}</option>
            ))}
          </Select>
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={generate}>Generate</Button>
        </div>
      </Modal>

      <Modal open={setupOpen} onClose={() => { setSetupOpen(false); setEditingSetupId(null); }} title={`${editingSetupId ? "Edit" : "Add"} ${setupKind === "type" ? "fee type" : "fee structure"}`}>
        {setupKind === "type" ? (
          <>
            <Field label="Name" required>
              <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Tuition" />
            </Field>
            <Field label="Description">
              <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Fee type" required>
              <Select value={form.feeTypeId ?? ""} onChange={(e) => setForm({ ...form, feeTypeId: e.target.value })}>
                <option value="">Select fee type…</option>
                {feeTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Amount (₦)" required>
              <Input type="number" value={form.amount ?? ""} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Term">
              <Select value={form.termId ?? ""} onChange={(e) => setForm({ ...form, termId: e.target.value })}>
                <option value="">All terms</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Section">
              <Select value={form.section ?? ""} onChange={(e) => setForm({ ...form, section: e.target.value })}>
                <option value="">All sections</option>
                <option value="PRIMARY">Primary</option>
                <option value="SECONDARY">Secondary</option>
              </Select>
            </Field>
            <Field label="Class level">
              <Select value={form.levelId ?? ""} onChange={(e) => setForm({ ...form, levelId: e.target.value })}>
                <option value="">All levels</option>
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>{l.section} — {l.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Class group">
              <Select value={form.classGroupId ?? ""} onChange={(e) => setForm({ ...form, classGroupId: e.target.value })}>
                <option value="">All classes</option>
                {classGroups.map((c) => (
                  <option key={c.id} value={c.id}>{c.level.name} {c.name}</option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => { setSetupOpen(false); setEditingSetupId(null); }}>Cancel</Button>
          <Button onClick={saveSetup}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
