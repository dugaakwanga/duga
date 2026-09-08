"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Badge, Table, Alert, Spinner, EmptyState, Stat, Button, Icon, Modal, Field, Input, Select } from "@duga/ui";
import { api } from "@/lib/client/api";
import { useSection } from "@/components/SectionContext";

interface Installment {
  id: string;
  sequence: number;
  amount: string | number;
  paidAmount: string | number;
  dueDate: string;
  status: "PENDING" | "PARTIAL" | "PAID" | "OVERDUE";
}

interface InstallmentPlan {
  id: string;
  installmentCount: number;
  installments: Installment[];
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: string | number;
  paidAmount: string | number;
  balance: string | number;
  term: { name: string } | null;
  student?: { user: { firstName: string; lastName: string } };
  installmentPlan: InstallmentPlan | null;
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

interface OwingStudent {
  id: string;
  admissionNumber: string;
  user: { firstName: string; lastName: string };
  fee: { feePaidThrough: string | null; daysRemaining: number; expired: boolean };
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
  const [owingStudents, setOwingStudents] = useState<OwingStudent[]>([]);
  const [payTarget, setPayTarget] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "CASH", coversTo: "" });
  const [installmentTarget, setInstallmentTarget] = useState<Invoice | null>(null);
  const [installmentCount, setInstallmentCount] = useState("3");
  const [installmentBusy, setInstallmentBusy] = useState(false);
  const [installmentPayTarget, setInstallmentPayTarget] = useState<Installment | null>(null);
  const [installmentPayAmount, setInstallmentPayAmount] = useState("");
  const isStaff = role === "OWNER" || role === "BURSAR";
  const { section } = useSection();

  const load = useCallback(async () => {
    void section;
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
      owingStudents?: OwingStudent[];
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
    setOwingStudents(d.owingStudents ?? []);
  }, [section]);

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);

  // Keep the open installment-plan modal in sync with fresh invoice data
  // after any create/pay/delete action triggers a reload.
  useEffect(() => {
    if (!installmentTarget) return;
    const fresh = invoices.find((i) => i.id === installmentTarget.id);
    if (fresh) setInstallmentTarget(fresh);
  }, [invoices]); // eslint-disable-line react-hooks/exhaustive-deps

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

  function openRecordPayment(invoiceId: string) {
    setPayTarget(invoiceId);
    setPayForm({ amount: "", method: "CASH", coversTo: "" });
  }

  async function submitRecordPayment() {
    if (!payTarget) return;
    const amount = Number(payForm.amount);
    if (!amount || amount <= 0) return alert("Enter a valid amount");
    setPaying(payTarget);
    try {
      await api(`fees/${payTarget}/recordManual`, {
        method: "POST",
        body: { amount, method: payForm.method, coversTo: payForm.coversTo || undefined },
      });
      setPayTarget(null);
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setPaying(null);
    }
  }

  async function createInstallmentPlan() {
    if (!installmentTarget) return;
    const count = Number(installmentCount);
    if (!Number.isInteger(count) || count < 2 || count > 12) return alert("Choose between 2 and 12 installments");
    setInstallmentBusy(true);
    try {
      await api(`fees/${installmentTarget.id}/createInstallmentPlan`, { method: "POST", body: { installmentCount: count } });
      await load();
      setInstallmentTarget(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setInstallmentBusy(false);
    }
  }

  async function deleteInstallmentPlan(planId: string) {
    if (!confirm("Remove this installment plan? Only plans with no recorded payments can be removed.")) return;
    setInstallmentBusy(true);
    try {
      await api(`fees/${planId}/deleteInstallmentPlan`, { method: "POST", body: {} });
      await load();
      setInstallmentTarget(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setInstallmentBusy(false);
    }
  }

  function openPayInstallment(installment: Installment) {
    setInstallmentPayTarget(installment);
    setInstallmentPayAmount(String(Number(installment.amount) - Number(installment.paidAmount)));
  }

  async function payInstallmentOnline() {
    if (!installmentTarget || !installmentPayTarget) return;
    setInstallmentBusy(true);
    try {
      const d = await api<{ authorization_url?: string; status?: string }>(`fees/${installmentTarget.id}/initPayment`, {
        method: "POST",
        body: { installmentId: installmentPayTarget.id, amount: Number(installmentPayAmount) || undefined },
      });
      if (d.authorization_url && d.authorization_url !== "/portal/fees") window.location.href = d.authorization_url;
      else {
        alert("Payment recorded.");
        await load();
        setInstallmentPayTarget(null);
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setInstallmentBusy(false);
    }
  }

  async function recordInstallmentPaymentStaff() {
    if (!installmentTarget || !installmentPayTarget) return;
    const amount = Number(installmentPayAmount);
    if (!amount || amount <= 0) return alert("Enter a valid amount");
    setInstallmentBusy(true);
    try {
      await api(`fees/${installmentTarget.id}/recordManual`, { method: "POST", body: { amount, installmentId: installmentPayTarget.id, method: "CASH" } });
      await load();
      setInstallmentPayTarget(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setInstallmentBusy(false);
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

  function openSetup(kind: SetupKind) {
    setSetupKind(kind);
    setEditingSetupId(null);
    setForm({});
    setSetupOpen(true);
  }

  async function sendReminders() {
    if (!confirm("Send fee reminders to all parents with unpaid or partially paid invoices?")) return;
    try {
      const result = await api<{ sent: number }>("fees/remind", { method: "POST", body: {} });
      alert(`${result.sent} reminder(s) sent.`);
    } catch (e) {
      alert((e as Error).message);
    }
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
              <Button variant="outline" onClick={sendReminders}><Icon name="notifications" size={16} /> Send reminders</Button>
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

      {isStaff && owingStudents.length > 0 && (
        <Card title={`Students owing (${owingStudents.length})`} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: "var(--duga-muted)", marginBottom: 10 }}>
            Their fee-access window has lapsed — whichever features are set to require payment (Settings → Restrictions) are currently blocked for them.
          </div>
          <Table headers={["Student", "Admission no.", "Paid through", ""]}>
            {owingStudents.map((s) => (
              <tr key={s.id}>
                <td>{s.user.firstName} {s.user.lastName}</td>
                <td>{s.admissionNumber}</td>
                <td>{s.fee.feePaidThrough ? new Date(s.fee.feePaidThrough).toLocaleDateString() : "Never paid"}</td>
                <td><Badge tone="danger">Owing</Badge></td>
              </tr>
            ))}
          </Table>
        </Card>
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
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {i.status !== "PAID" && i.status !== "OVERPAID" && (role === "STUDENT" || role === "PARENT") && (
                      <Button size="sm" loading={paying === i.id} onClick={() => pay(i.id)}>Pay</Button>
                    )}
                    {(i.installmentPlan || isStaff) && (
                      <Button size="sm" variant="outline" onClick={() => setInstallmentTarget(i)}>
                        {i.installmentPlan ? "Installments" : "Set up installments"}
                      </Button>
                    )}
                    {isStaff && (
                      <>
                        <Button size="sm" variant="outline" loading={paying === i.id} onClick={() => openRecordPayment(i.id)}>Record payment</Button>
                        <Button size="sm" variant="ghost" loading={paying === i.id} onClick={() => deleteInvoice(i.id)}>Delete</Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {isStaff && (
        <>
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

      <Modal open={!!payTarget} onClose={() => setPayTarget(null)} title="Record an offline payment">
        <Alert tone="info">For cash, bank transfer or any payment taken outside the app.</Alert>
        <Field label="Amount received (₦)" required>
          <Input type="number" min={0} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
        </Field>
        <Field label="Method">
          <Select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="TRANSFER">Transfer</option>
            <option value="USSD">USSD</option>
          </Select>
        </Field>
        <Field label="This payment covers up to (optional)" hint="Declare exactly what period this installment covers, e.g. the end of a term. Leave blank to let the app work it out automatically from the amount and the student's fee plan.">
          <Input type="date" value={payForm.coversTo} onChange={(e) => setPayForm({ ...payForm, coversTo: e.target.value })} />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setPayTarget(null)}>Cancel</Button>
          <Button onClick={submitRecordPayment} loading={paying === payTarget}>Record payment</Button>
        </div>
      </Modal>

      <Modal open={!!installmentTarget} onClose={() => setInstallmentTarget(null)} title={installmentTarget ? `Installment plan — ${installmentTarget.invoiceNumber}` : ""}>
        {!installmentTarget ? null : !installmentTarget.installmentPlan ? (
          isStaff ? (
            <>
              <Alert tone="info">Split this invoice&apos;s {naira(installmentTarget.totalAmount)} total into evenly-dated tranches across its term.</Alert>
              <Field label="Number of installments">
                <Select value={installmentCount} onChange={(e) => setInstallmentCount(e.target.value)}>
                  {[2, 3, 4, 6, 12].map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
                <Button variant="ghost" onClick={() => setInstallmentTarget(null)}>Cancel</Button>
                <Button onClick={createInstallmentPlan} loading={installmentBusy}>Create plan</Button>
              </div>
            </>
          ) : (
            <EmptyState title="No installment plan yet" hint="Ask the school to set up an installment plan for this invoice." />
          )
        ) : (
          <>
            <Table headers={["#", "Due", "Amount", "Paid", "Status", ""]}>
              {installmentTarget.installmentPlan.installments.map((inst) => (
                <tr key={inst.id}>
                  <td>{inst.sequence}</td>
                  <td>{new Date(inst.dueDate).toLocaleDateString()}</td>
                  <td>{naira(inst.amount)}</td>
                  <td>{naira(inst.paidAmount)}</td>
                  <td>
                    <Badge tone={inst.status === "PAID" ? "success" : inst.status === "OVERDUE" ? "danger" : inst.status === "PARTIAL" ? "warning" : "neutral"}>
                      {inst.status}
                    </Badge>
                  </td>
                  <td>
                    {inst.status !== "PAID" && (
                      (role === "STUDENT" || role === "PARENT" || isStaff) && (
                        <Button size="sm" variant="outline" onClick={() => openPayInstallment(inst)}>Pay</Button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </Table>
            {isStaff && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <Button size="sm" variant="ghost" onClick={() => deleteInstallmentPlan(installmentTarget.installmentPlan!.id)} loading={installmentBusy}>
                  Remove plan
                </Button>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal open={!!installmentPayTarget} onClose={() => setInstallmentPayTarget(null)} title={installmentPayTarget ? `Pay installment #${installmentPayTarget.sequence}` : ""}>
        <Field label="Amount (₦)" required>
          <Input type="number" min={0} value={installmentPayAmount} onChange={(e) => setInstallmentPayAmount(e.target.value)} />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setInstallmentPayTarget(null)}>Cancel</Button>
          {isStaff ? (
            <Button onClick={recordInstallmentPaymentStaff} loading={installmentBusy}>Record payment</Button>
          ) : (
            <Button onClick={payInstallmentOnline} loading={installmentBusy}>Pay now</Button>
          )}
        </div>
      </Modal>
    </div>
  );
}
