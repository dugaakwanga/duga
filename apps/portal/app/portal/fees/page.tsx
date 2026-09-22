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

interface StudentClassGroup {
  id: string;
  name: string;
  level: { name: string; section: string; order: number };
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: string | number;
  paidAmount: string | number;
  balance: string | number;
  term: { name: string } | null;
  student?: { user: { firstName: string; lastName: string }; classGroup: StudentClassGroup | null };
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
  appliesTo: "ALL" | "BOARDING" | "DAY";
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

interface SchoolFeeStudent {
  id: string;
  admissionNumber: string;
  user: { firstName: string; lastName: string };
  schoolFee: { feeAmount: number; paid: number; owing: number };
  classGroup: StudentClassGroup | null;
}

interface Override {
  id: string;
  reason: string;
  note: string | null;
  discountAmount: string | number | null;
  expiresAt: string | null;
  isActive: boolean;
  student: { id: string; user: { firstName: string; lastName: string } };
  term: { id: string; name: string } | null;
}

interface ChildFeeSummary {
  studentId: string;
  name: string;
  total: number;
  paid: number;
  balance: number;
  invoiceCount: number;
}

function naira(v: string | number | undefined): string {
  return `₦${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// Section -> level order -> class name, so every fee list reads the same
// way the Classes page does, instead of whatever order the DB happened to
// return rows in. Unassigned/no-class rows sort last.
function classGroupSortKey(cg: StudentClassGroup | null | undefined): string {
  if (!cg) return "zzz";
  return `${cg.level.section}-${String(cg.level.order).padStart(4, "0")}-${cg.name}`;
}

function classLabel(cg: StudentClassGroup | null | undefined): string {
  return cg ? `${cg.level.name} ${cg.name}` : "No class";
}

// Fee structures don't carry a level's section/order on their own — this
// looks each one's scope up against the `levels` list (already fetched in
// the school's canonical section -> order sequence) so "All classes" rows
// sort first (broadest scope), then class/level/section-scoped rows follow
// in the same order the Classes page shows them, instead of creation order.
function feeStructureSortKey(s: FeeStructure, levels: ClassLevel[]): string {
  const levelId = s.classGroup?.level.id ?? s.level?.id;
  const idx = levelId ? levels.findIndex((l) => l.id === levelId) : s.section ? levels.findIndex((l) => l.section === s.section) : -1;
  return `${String(idx === -1 ? 0 : idx + 1).padStart(4, "0")}-${s.classGroup?.name ?? ""}`;
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
  const [schoolFeeStudents, setSchoolFeeStudents] = useState<SchoolFeeStudent[]>([]);
  const [byChild, setByChild] = useState<ChildFeeSummary[] | undefined>(undefined);
  const [payTarget, setPayTarget] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "CASH", coversTo: "" });
  const [installmentTarget, setInstallmentTarget] = useState<Invoice | null>(null);
  const [installmentCount, setInstallmentCount] = useState("3");
  const [installmentBusy, setInstallmentBusy] = useState(false);
  const [installmentPayTarget, setInstallmentPayTarget] = useState<Installment | null>(null);
  const [installmentPayAmount, setInstallmentPayAmount] = useState("");
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [grantTarget, setGrantTarget] = useState<{ id: string; name: string } | null>(null);
  const [grantForm, setGrantForm] = useState({ termId: "", reason: "EXCEPTION", note: "", expiresAt: "" });
  const [chargeTarget, setChargeTarget] = useState<Invoice | null>(null);
  const [chargeForm, setChargeForm] = useState({ description: "", amount: "" });
  const [chargeBusy, setChargeBusy] = useState(false);
  // Record a payment directly against a student with no invoice yet — the
  // server's recordManual action already supports this (see fees.ts), but
  // until now the only UI entry point was the "Record payment" button on an
  // existing invoice row, so a bursar had nothing to click for a student who
  // doesn't have one yet.
  const [standalonePayOpen, setStandalonePayOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState<Array<{ id: string; admissionNumber: string; user: { firstName: string; lastName: string } }>>([]);
  const [studentSearchBusy, setStudentSearchBusy] = useState(false);
  const [standaloneStudent, setStandaloneStudent] = useState<{ id: string; name: string } | null>(null);
  const [standaloneForm, setStandaloneForm] = useState({ amount: "", method: "CASH", coversTo: "" });
  const [standaloneBusy, setStandaloneBusy] = useState(false);
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
      schoolFeeStudents?: SchoolFeeStudent[];
      byChild?: ChildFeeSummary[];
      overrides?: Override[];
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
    setSchoolFeeStudents(d.schoolFeeStudents ?? []);
    setByChild(d.byChild);
    setOverrides(d.overrides ?? []);
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
      const result = await api<{ created: number }>("fees/generateInvoices", { method: "POST", body: form });
      setOpen(false);
      await load();
      alert(
        result.created > 0
          ? `${result.created} invoice(s) generated.`
          : "No invoices were created. Check that a fee structure exists for this term/class, and that these students don't already have an invoice for this term.",
      );
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

  function openStandalonePayment() {
    setStandalonePayOpen(true);
    setStudentSearch("");
    setStudentResults([]);
    setStandaloneStudent(null);
    setStandaloneForm({ amount: "", method: "CASH", coversTo: "" });
  }

  async function searchStudentsForPayment() {
    if (!studentSearch.trim()) return setStudentResults([]);
    setStudentSearchBusy(true);
    try {
      const d = await api<{ items: Array<{ id: string; admissionNumber: string; user: { firstName: string; lastName: string } }> }>("students", {
        query: { search: studentSearch.trim() },
      });
      setStudentResults(d.items);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setStudentSearchBusy(false);
    }
  }

  async function submitStandalonePayment() {
    if (!standaloneStudent) return;
    const amount = Number(standaloneForm.amount);
    if (!amount || amount <= 0) return alert("Enter a valid amount");
    setStandaloneBusy(true);
    try {
      await api("fees/recordManual", {
        method: "POST",
        body: { studentId: standaloneStudent.id, amount, method: standaloneForm.method, coversTo: standaloneForm.coversTo || undefined },
      });
      setStandalonePayOpen(false);
      await load();
      alert(`Payment recorded for ${standaloneStudent.name}.`);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setStandaloneBusy(false);
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

  function openGrantOverride(student: { id: string; name: string }) {
    setGrantTarget(student);
    setGrantForm({ termId: "", reason: "EXCEPTION", note: "", expiresAt: "" });
  }

  async function submitGrantOverride() {
    if (!grantTarget) return;
    setOverrideBusy(true);
    try {
      await api("fees/setOverride", {
        method: "POST",
        body: {
          studentId: grantTarget.id,
          termId: grantForm.termId || undefined,
          reason: grantForm.reason,
          note: grantForm.note || undefined,
          expiresAt: grantForm.expiresAt || undefined,
        },
      });
      setGrantTarget(null);
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setOverrideBusy(false);
    }
  }

  async function revokeOverride(id: string) {
    if (!confirm("Revoke this fee exception? The student will go back to being gated by their fee window.")) return;
    setOverrideBusy(true);
    try {
      await api(`fees/${id}/deactivateOverride`, { method: "POST", body: {} });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setOverrideBusy(false);
    }
  }

  function openAddCharge(invoice: Invoice) {
    setChargeTarget(invoice);
    setChargeForm({ description: "", amount: "" });
  }

  async function submitAddCharge() {
    if (!chargeTarget) return;
    const amount = Number(chargeForm.amount);
    if (!chargeForm.description.trim()) return alert("Enter a description for this charge");
    if (!amount || amount <= 0) return alert("Enter a valid amount");
    setChargeBusy(true);
    try {
      await api(`fees/${chargeTarget.id}/addInvoiceItem`, { method: "POST", body: { description: chargeForm.description, amount } });
      setChargeTarget(null);
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setChargeBusy(false);
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
        appliesTo: s.appliesTo ?? "ALL",
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
        title={role === "PARENT" ? "Children's Fees" : role === "STUDENT" ? "My Fees" : "Fees & payments"}
        subtitle={
          role === "PARENT"
            ? "Itemized invoices, balances and installment plans for each of your children."
            : role === "STUDENT"
              ? "Your invoices, balance and installment plan."
              : "Other fees (PTA levy, excursions, etc.) via invoices — core school fees are set per student on the Students page."
        }
        actions={
          isStaff ? (
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="outline" onClick={() => openSetup("type")}><Icon name="plus" size={16} /> Add fee type</Button>
              <Button variant="outline" onClick={sendReminders}><Icon name="notifications" size={16} /> Send reminders</Button>
              <Button variant="outline" onClick={openStandalonePayment}><Icon name="plus" size={16} /> Record school-fee payment</Button>
              <Button onClick={() => setOpen(true)}><Icon name="plus" size={16} /> Generate other-fee invoices</Button>
            </div>
          ) : undefined
        }
      />

      {role === "PARENT" && byChild && byChild.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14, marginBottom: 20 }}>
          {byChild.map((c) => (
            <Card key={c.studentId} title={c.name}>
              {c.invoiceCount === 0 ? (
                <div style={{ fontSize: 13, color: "var(--duga-muted)" }}>No invoices generated yet.</div>
              ) : (
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <Stat label="Billed" value={naira(c.total)} />
                  <Stat label="Paid" value={naira(c.paid)} tone="success" />
                  <Stat label="Owing" value={naira(c.balance)} tone={c.balance > 0 ? "danger" : "success"} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 20 }}>
          <Stat label="Total billed" value={naira(summary.total)} />
          {paymentRecordsVisible && <Stat label="Collected" value={naira(summary.paid)} tone="success" />}
          <Stat label="Outstanding" value={naira(summary.balance)} tone="danger" />
        </div>
      )}

      {isStaff && schoolFeeStudents.length > 0 && (
        <Card title={`School fees — ${schoolFeeStudents.length} student${schoolFeeStudents.length === 1 ? "" : "s"} with a fee set`} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: "var(--duga-muted)", marginBottom: 10 }}>
            Every student with a core school fee set (via &quot;Set school fees&quot; on the Students page) — what they&apos;ve paid and what they still owe, grouped by class. This is exactly what the dashboard&apos;s totals are built from; use it to check any figure there against the actual students behind it.
          </div>
          {Array.from(
            [...schoolFeeStudents]
              .sort((a, b) => classGroupSortKey(a.classGroup).localeCompare(classGroupSortKey(b.classGroup)) || a.admissionNumber.localeCompare(b.admissionNumber))
              .reduce((map, s) => {
                const key = classLabel(s.classGroup);
                const list = map.get(key) ?? [];
                list.push(s);
                map.set(key, list);
                return map;
              }, new Map<string, SchoolFeeStudent[]>()),
          ).map(([className, rows]) => {
            const classTotal = rows.reduce((a, s) => a + s.schoolFee.feeAmount, 0);
            const classPaid = rows.reduce((a, s) => a + s.schoolFee.paid, 0);
            const classOwing = rows.reduce((a, s) => a + s.schoolFee.owing, 0);
            return (
              <details key={className} open={schoolFeeStudents.length <= 20} style={{ marginBottom: 10 }}>
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
                    flexWrap: "wrap",
                  }}
                >
                  {className}
                  <span style={{ fontWeight: 400, fontSize: 12.5, color: "var(--duga-muted)" }}>
                    {rows.length} student{rows.length === 1 ? "" : "s"} · expected {naira(classTotal)}
                  </span>
                  <Badge tone="success">{naira(classPaid)} collected</Badge>
                  {classOwing > 0 && <Badge tone="danger">{naira(classOwing)} owing</Badge>}
                </summary>
                <div style={{ marginTop: 8 }}>
                  <Table headers={["Student", "Admission no.", "Fee", "Paid", "Owing", ""]}>
                    {rows.map((s) => (
                      <tr key={s.id}>
                        <td>{s.user.firstName} {s.user.lastName}</td>
                        <td>{s.admissionNumber}</td>
                        <td>{naira(s.schoolFee.feeAmount)}</td>
                        <td style={{ color: "var(--duga-success, #1a7f37)" }}>{naira(s.schoolFee.paid)}</td>
                        <td>
                          {s.schoolFee.owing > 0 ? (
                            <Badge tone="danger">{naira(s.schoolFee.owing)}</Badge>
                          ) : (
                            <Badge tone="success">Paid in full</Badge>
                          )}
                        </td>
                        <td>
                          {s.schoolFee.owing > 0 && (
                            <Button size="sm" variant="outline" onClick={() => openGrantOverride({ id: s.id, name: `${s.user.firstName} ${s.user.lastName}` })}>
                              Grant exception
                            </Button>
                          )}
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

      {isStaff && (
        <Card title={`Fee exceptions / overrides (${overrides.length})`} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: "var(--duga-muted)", marginBottom: 10 }}>
            A scholarship, payment plan, or one-off exception that grants access to every fee-gated feature (tests, assignments, e-learning, games, live classes, results) for a student regardless of their fee window.
          </div>
          {overrides.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--duga-muted)" }}>No active exceptions.</div>
          ) : (
            <Table headers={["Student", "Term", "Reason", "Note", "Expires", ""]}>
              {overrides.map((o) => (
                <tr key={o.id}>
                  <td>{o.student.user.firstName} {o.student.user.lastName}</td>
                  <td>{o.term?.name ?? "All terms"}</td>
                  <td><Badge tone="neutral">{o.reason}</Badge></td>
                  <td>{o.note ?? "—"}</td>
                  <td>{o.expiresAt ? new Date(o.expiresAt).toLocaleDateString() : "Never"}</td>
                  <td>
                    <Button size="sm" variant="ghost" loading={overrideBusy} onClick={() => revokeOverride(o.id)}>Revoke</Button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {invoices.length === 0 ? (
        <EmptyState title="No invoices yet" />
      ) : !isStaff ? (
        // Students/parents typically have a handful of invoices — a flat
        // table is fine and avoids an unnecessary extra click to expand.
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
                    {i.status !== "PAID" && i.status !== "OVERPAID" && (
                      <Button size="sm" loading={paying === i.id} onClick={() => pay(i.id)}>Pay</Button>
                    )}
                    {i.installmentPlan && (
                      <Button size="sm" variant="outline" onClick={() => setInstallmentTarget(i)}>Installments</Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : (
        // Staff: every invoice in the school in one place — group by term so
        // a bursar can find "this term's invoices" instead of scanning a
        // single table mixing every term ever billed.
        <Card>
          {Array.from(
            invoices.reduce((map, i) => {
              const key = i.term?.name ?? "No term";
              const list = map.get(key) ?? [];
              list.push(i);
              map.set(key, list);
              return map;
            }, new Map<string, Invoice[]>()),
          ).map(([termName, rowsUnsorted]) => {
            // Arranged by class within each term, not scattered in
            // whatever order invoices happened to be created.
            const rows = [...rowsUnsorted].sort(
              (a, b) =>
                classGroupSortKey(a.student?.classGroup).localeCompare(classGroupSortKey(b.student?.classGroup)) ||
                (a.student ? `${a.student.user.firstName} ${a.student.user.lastName}` : "").localeCompare(b.student ? `${b.student.user.firstName} ${b.student.user.lastName}` : ""),
            );
            const balance = rows.reduce((a, i) => a + Number(i.balance), 0);
            return (
              <details key={termName} open={invoices.length <= 20} style={{ marginBottom: 10 }}>
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
                  {termName}
                  <span style={{ fontWeight: 400, fontSize: 12.5, color: "var(--duga-muted)" }}>
                    {rows.length} invoice{rows.length === 1 ? "" : "s"}
                  </span>
                  {paymentRecordsVisible && <Badge tone={balance > 0 ? "danger" : "success"}>{naira(balance)} outstanding</Badge>}
                </summary>
                <div style={{ marginTop: 8 }}>
                  <Table headers={paymentRecordsVisible ? ["Invoice", "Student", "Class", "Amount", "Paid", "Balance", "Status", ""] : ["Invoice", "Student", "Class", "Amount", "Balance", "Status", ""]}>
                    {rows.map((i) => (
                      <tr key={i.id}>
                        <td>{i.invoiceNumber}</td>
                        <td>{i.student ? `${i.student.user.firstName} ${i.student.user.lastName}` : "—"}</td>
                        <td>{classLabel(i.student?.classGroup)}</td>
                        <td>{naira(i.totalAmount)}</td>
                        {paymentRecordsVisible && <td>{naira(i.paidAmount)}</td>}
                        <td>{naira(i.balance)}</td>
                        <td>
                          <Badge tone={i.status === "PAID" || i.status === "OVERPAID" ? "success" : i.status === "PARTIAL" ? "warning" : "danger"}>{i.status}</Badge>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Button size="sm" variant="outline" onClick={() => setInstallmentTarget(i)}>
                              {i.installmentPlan ? "Installments" : "Set up installments"}
                            </Button>
                            <Button size="sm" variant="outline" loading={paying === i.id} onClick={() => openRecordPayment(i.id)}>Record payment</Button>
                            <Button size="sm" variant="outline" onClick={() => openAddCharge(i)}>Add charge</Button>
                            <Button size="sm" variant="ghost" loading={paying === i.id} onClick={() => deleteInvoice(i.id)}>Delete</Button>
                          </div>
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

      {isStaff && (
        <>
          <Card title="Fee types (other fees)" style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, color: "var(--duga-muted)", marginBottom: 12 }}>
              For supplementary fees only — PTA levy, excursions, uniforms, and the like — never the core school fee, which is set per student on the Students page instead. A fee type is just a named category; attach an actual ₦ amount to it per class/term under &quot;Fee structures&quot; below.
            </div>
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
            <div style={{ fontSize: 13, color: "var(--duga-muted)", marginBottom: 12 }}>
              This is where the actual ₦ amounts live — each row attaches one fee type to an amount, scoped to a term, class/level/section, and boarding-or-day. &quot;Generate invoices&quot; above bills students using whichever of these rows apply to them.
            </div>
            {feeStructures.length === 0 ? (
              <EmptyState title="No fee structures yet" hint="Attach an amount to a fee type for a class, level, section or term." />
            ) : (
              <Table headers={["Fee", "Amount", "Term", "Scope", "Student type", ""]}>
                {[...feeStructures].sort((a, b) => feeStructureSortKey(a, levels).localeCompare(feeStructureSortKey(b, levels))).map((s) => (
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
                      {s.appliesTo === "BOARDING" ? <Badge tone="info">Boarding only</Badge> : s.appliesTo === "DAY" ? <Badge tone="info">Day only</Badge> : "All students"}
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

      <Modal open={open} onClose={() => setOpen(false)} title="Generate other-fee invoices">
        <Alert tone="info">
          For supplementary fees only (PTA levy, excursions, etc.) — never the core school fee, which is set per student on the Students page and never needs an invoice. Bills every active student in the selected term (or just one class) using the amounts set up under &quot;Fee structures&quot; below. Students who already have an invoice for this term are skipped, so this is safe to run again later.
        </Alert>
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
            <Alert tone="info">Just a category — no amount here. After saving, add a &quot;Fee structure&quot; below to attach the actual ₦ amount for a class/term.</Alert>
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
            <Field label="Student type" hint="Charge this fee only to boarding or only to day students, or leave as All.">
              <Select value={form.appliesTo ?? "ALL"} onChange={(e) => setForm({ ...form, appliesTo: e.target.value })}>
                <option value="ALL">All students</option>
                <option value="BOARDING">Boarding only</option>
                <option value="DAY">Day only</option>
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

      <Modal open={standalonePayOpen} onClose={() => setStandalonePayOpen(false)} title="Record a school-fee payment">
        <Alert tone="info">Pays down this student&apos;s core school fee (set on the Students page) — for cash, bank transfer or any payment taken outside the app. For PTA levy or other supplementary fees, use Generate other-fee invoices below instead.</Alert>
        {!standaloneStudent ? (
          <>
            <Field label="Find student" hint="Search by name or admission number.">
              <div style={{ display: "flex", gap: 8 }}>
                <Input
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchStudentsForPayment()}
                  placeholder="e.g. Chidi or DUGA/2026/001"
                />
                <Button variant="outline" onClick={searchStudentsForPayment} loading={studentSearchBusy}>Search</Button>
              </div>
            </Field>
            {studentResults.length > 0 && (
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {studentResults.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStandaloneStudent({ id: s.id, name: `${s.user.firstName} ${s.user.lastName}` })}
                    style={{
                      display: "flex", justifyContent: "space-between", padding: "10px 12px",
                      border: "1px solid var(--duga-border)", borderRadius: 8, background: "transparent",
                      cursor: "pointer", textAlign: "left", fontSize: 13.5,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{s.user.firstName} {s.user.lastName}</span>
                    <span style={{ color: "var(--duga-muted)" }}>{s.admissionNumber}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontWeight: 600 }}>{standaloneStudent.name}</span>
              <Button variant="ghost" size="sm" onClick={() => setStandaloneStudent(null)}>Change student</Button>
            </div>
            <Field label="Amount received (₦)" required>
              <Input type="number" min={0} value={standaloneForm.amount} onChange={(e) => setStandaloneForm({ ...standaloneForm, amount: e.target.value })} />
            </Field>
            <Field label="Method">
              <Select value={standaloneForm.method} onChange={(e) => setStandaloneForm({ ...standaloneForm, method: e.target.value })}>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="TRANSFER">Transfer</option>
                <option value="USSD">USSD</option>
              </Select>
            </Field>
            <Field label="This payment covers up to (optional)" hint="Declare exactly what period this payment covers, e.g. the end of a term.">
              <Input type="date" value={standaloneForm.coversTo} onChange={(e) => setStandaloneForm({ ...standaloneForm, coversTo: e.target.value })} />
            </Field>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <Button variant="ghost" onClick={() => setStandalonePayOpen(false)}>Cancel</Button>
              <Button onClick={submitStandalonePayment} loading={standaloneBusy}>Record payment</Button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!grantTarget} onClose={() => setGrantTarget(null)} title={grantTarget ? `Grant exception — ${grantTarget.name}` : ""}>
        <Alert tone="info">Grants access to every fee-gated feature (tests, assignments, e-learning, games, live classes, results) regardless of the fee window — for a scholarship, an agreed payment plan, or a one-off exception.</Alert>
        <Field label="Term" hint="Leave blank to apply to every term, not just one.">
          <Select value={grantForm.termId} onChange={(e) => setGrantForm({ ...grantForm, termId: e.target.value })}>
            <option value="">All terms</option>
            {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Reason">
          <Select value={grantForm.reason} onChange={(e) => setGrantForm({ ...grantForm, reason: e.target.value })}>
            <option value="SCHOLARSHIP">Scholarship</option>
            <option value="PAYMENT_PLAN">Payment plan</option>
            <option value="EXCEPTION">Exception</option>
            <option value="FREE">Free</option>
          </Select>
        </Field>
        <Field label="Note (optional)">
          <Input value={grantForm.note} onChange={(e) => setGrantForm({ ...grantForm, note: e.target.value })} placeholder="e.g. Approved by the owner, Sept 2026" />
        </Field>
        <Field label="Expires on (optional)" hint="Leave blank for no expiry.">
          <Input type="date" value={grantForm.expiresAt} onChange={(e) => setGrantForm({ ...grantForm, expiresAt: e.target.value })} />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setGrantTarget(null)}>Cancel</Button>
          <Button onClick={submitGrantOverride} loading={overrideBusy}>Grant exception</Button>
        </div>
      </Modal>

      <Modal open={!!chargeTarget} onClose={() => setChargeTarget(null)} title={chargeTarget ? `Add charge — ${chargeTarget.invoiceNumber}` : ""}>
        <Alert tone="info">A one-off charge for this student only — a fine, a late-registration fee, a damaged-book charge — added as a new line item on this invoice.</Alert>
        <Field label="Description" required>
          <Input value={chargeForm.description} onChange={(e) => setChargeForm({ ...chargeForm, description: e.target.value })} placeholder="e.g. Damaged textbook" />
        </Field>
        <Field label="Amount (₦)" required>
          <Input type="number" min={0} value={chargeForm.amount} onChange={(e) => setChargeForm({ ...chargeForm, amount: e.target.value })} />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setChargeTarget(null)}>Cancel</Button>
          <Button onClick={submitAddCharge} loading={chargeBusy}>Add charge</Button>
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
