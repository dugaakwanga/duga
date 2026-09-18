"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Spinner, Table } from "@duga/ui";
import { api } from "@/lib/client/api";

type Staff = { id: string; firstName: string; lastName: string; role: string; salaryProfile?: { monthlyAmount: number; rewardAmount: number } | null };
type Entry = { id: string; userId: string; baseSalary: number; lateDays: number; lateDeduction: number; reward: number; extraDeduction: number; netPay: number; status: string; note?: string | null; user: { firstName: string; lastName: string; role: string } };
type Deduction = { id: string; userId: string; month: string; amount: number; reason: string; createdAt: string };
const money = (v: number | string) => `₦${Number(v ?? 0).toLocaleString()}`;

export default function PayrollPage() {
  const [role, setRole] = useState(""); const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [staff, setStaff] = useState<Staff[]>([]); const [entries, setEntries] = useState<Entry[]>([]); const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [salaryStaff, setSalaryStaff] = useState<Staff | null>(null); const [edit, setEdit] = useState<Entry | null>(null); const [form, setForm] = useState<Record<string, string>>({}); const [bursarAccess, setBursarAccess] = useState(false);
  const [lateAfterTime, setLateAfterTime] = useState("08:00"); const [lateTimeDraft, setLateTimeDraft] = useState("08:00");
  const [latePenaltyAmount, setLatePenaltyAmount] = useState(0); const [latePenaltyDraft, setLatePenaltyDraft] = useState("0"); const [savingRules, setSavingRules] = useState(false);
  const [deductStaff, setDeductStaff] = useState<Staff | null>(null); const [deductForm, setDeductForm] = useState({ amount: "", reason: "", month: month }); const [deductBusy, setDeductBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ role: string; staff: Staff[]; entries: Entry[]; deductions: Deduction[]; bursarAccess: boolean; payrollRules: { lateAfterTime: string; latePenaltyAmount: number } }>(`payroll?month=${month}`);
      setRole(data.role); setStaff(data.staff); setEntries(data.entries); setDeductions(data.deductions);
      setBursarAccess(data.bursarAccess);
      setLateAfterTime(data.payrollRules.lateAfterTime); setLateTimeDraft(data.payrollRules.lateAfterTime);
      setLatePenaltyAmount(data.payrollRules.latePenaltyAmount); setLatePenaltyDraft(String(data.payrollRules.latePenaltyAmount));
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps
  async function generate() { try { await api("payroll/generate", { method: "POST", body: { month } }); await load(); } catch (e) { alert((e as Error).message); } }
  async function saveSalary() { if (!salaryStaff) return; try { await api("payroll/setSalary", { method: "POST", body: { userId: salaryStaff.id, monthlyAmount: Number(form.monthlyAmount), rewardAmount: Number(form.rewardAmount) } }); setSalaryStaff(null); await load(); } catch (e) { alert((e as Error).message); } }
  async function saveAdjustment() { if (!edit) return; try { await api(`payroll/${edit.id}/adjust`, { method: "POST", body: { lateDays: Number(form.lateDays), reward: Number(form.reward), extraDeduction: Number(form.extraDeduction), note: form.note } }); setEdit(null); await load(); } catch (e) { alert((e as Error).message); } }
  async function paid(id: string) { try { await api(`payroll/${id}/markPaid`, { method: "POST", body: {} }); await load(); } catch (e) { alert((e as Error).message); } }
  async function toggleBursar() { try { await api("payroll/setBursarAccess", { method: "POST", body: { enabled: !bursarAccess } }); setBursarAccess(!bursarAccess); } catch (e) { alert((e as Error).message); } }
  async function saveRules() {
    setSavingRules(true);
    try {
      await api("payroll/setPayrollRules", { method: "POST", body: { lateAfterTime: lateTimeDraft, latePenaltyAmount: Number(latePenaltyDraft) || 0 } });
      setLateAfterTime(lateTimeDraft); setLatePenaltyAmount(Number(latePenaltyDraft) || 0);
    } catch (e) { alert((e as Error).message); } finally { setSavingRules(false); }
  }
  function openDeductions(s: Staff) { setDeductStaff(s); setDeductForm({ amount: "", reason: "", month }); }
  async function addDeduction() {
    if (!deductStaff) return;
    const amount = Number(deductForm.amount);
    if (!amount || amount <= 0) return alert("Enter a valid amount");
    if (!deductForm.reason.trim()) return alert("Enter a reason for this deduction");
    setDeductBusy(true);
    try {
      await api("payroll/addDeduction", { method: "POST", body: { userId: deductStaff.id, month: deductForm.month, amount, reason: deductForm.reason } });
      setDeductForm({ amount: "", reason: "", month });
      await load();
    } catch (e) { alert((e as Error).message); } finally { setDeductBusy(false); }
  }
  async function removeDeduction(id: string) {
    if (!confirm("Remove this deduction?")) return;
    try { await api(`payroll/${id}/removeDeduction`, { method: "POST", body: {} }); await load(); } catch (e) { alert((e as Error).message); }
  }

  if (loading) return <Spinner size={28} />; if (error) return <Alert tone="danger">{error}</Alert>;
  // Reaching this page at all means the server already confirmed finance
  // access (list() gates on financeManager()) — so any role rendering here
  // (owner, or an admin/bursar the owner granted access to) can set rules.
  const canManagePayroll = role === "OWNER" || role === "ADMIN" || role === "BURSAR";
  const rulesChanged = lateTimeDraft !== lateAfterTime || Number(latePenaltyDraft) !== latePenaltyAmount;
  const deductStaffRows = deductStaff ? deductions.filter((d) => d.userId === deductStaff.id) : [];

  return <div><PageHeader title="Payroll" subtitle="Monthly salaries, late-coming penalties, rewards and deductions." actions={<Button onClick={generate}>Generate {month} payroll</Button>} />
    {role === "OWNER" && <Card title="Bursar access" style={{ marginBottom: 16 }}><p>The bursar can manage fees and payroll only when you grant access.</p><Button variant={bursarAccess ? "outline" : "primary"} onClick={toggleBursar}>{bursarAccess ? "Remove bursar finance access" : "Grant bursar finance access"}</Button></Card>}
    {canManagePayroll && <Card title="Attendance & penalty rules" style={{ marginBottom: 16 }}>
      <p>Late days are pulled automatically from real clock-in records when payroll is generated — a staff member counts as late on any day they clock in after this time. A day they never clock in at all is an absence, not lateness, and never counts here. The late penalty is one school-wide amount that applies to every staff member the same way.</p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <Field label="Staff must clock in by"><Input type="time" value={lateTimeDraft} onChange={e => setLateTimeDraft(e.target.value)} /></Field>
        <Field label="Late penalty per day (₦)"><Input type="number" min={0} value={latePenaltyDraft} onChange={e => setLatePenaltyDraft(e.target.value)} /></Field>
        <Button onClick={saveRules} loading={savingRules} disabled={!rulesChanged}>Save</Button>
      </div>
    </Card>}
    {canManagePayroll && <Card title="Staff salary rules" style={{ marginBottom: 16 }}><Table headers={["Staff", "Role", "Monthly salary", "Monthly reward", ""]}>{staff.map(s => <tr key={s.id}><td>{s.firstName} {s.lastName}</td><td>{s.role}</td><td>{money(s.salaryProfile?.monthlyAmount ?? 0)}</td><td>{money(s.salaryProfile?.rewardAmount ?? 0)}</td><td><div style={{ display: "flex", gap: 6 }}><Button size="sm" variant="outline" onClick={() => { setSalaryStaff(s); setForm({ monthlyAmount: String(s.salaryProfile?.monthlyAmount ?? 0), rewardAmount: String(s.salaryProfile?.rewardAmount ?? 0) }); }}>Set rules</Button><Button size="sm" variant="ghost" onClick={() => openDeductions(s)}>Deductions</Button></div></td></tr>)}</Table></Card>}
    {entries.length === 0 ? <EmptyState title="No payroll entries" hint="Set staff salary rules, then generate the monthly payroll." /> : <Card title={`Payroll — ${month}`}><Table headers={["Staff", "Base", `Late days (auto, after ${lateAfterTime})`, "Late deduction", "Reward", "Other deduction", "Net pay", "Status", ""]}>{entries.map(e => <tr key={e.id}><td>{e.user.firstName} {e.user.lastName}</td><td>{money(e.baseSalary)}</td><td>{e.lateDays}</td><td>{money(e.lateDeduction)}</td><td>{money(e.reward)}</td><td>{money(e.extraDeduction)}</td><td><b>{money(e.netPay)}</b></td><td><Badge tone={e.status === "PAID" ? "success" : "warning"}>{e.status}</Badge></td><td>{e.status !== "PAID" && <><Button size="sm" variant="outline" onClick={() => { setEdit(e); setForm({ lateDays: String(e.lateDays), reward: String(e.reward), extraDeduction: String(e.extraDeduction), note: e.note ?? "" }); }}>Adjust</Button> <Button size="sm" onClick={() => paid(e.id)}>Mark paid</Button></>}</td></tr>)}</Table></Card>}
    <Modal open={!!salaryStaff} onClose={() => setSalaryStaff(null)} title="Set salary rules"><Field label="Monthly salary"><Input type="number" value={form.monthlyAmount ?? ""} onChange={e => setForm({ ...form, monthlyAmount: e.target.value })} /></Field><Field label="Monthly reward"><Input type="number" value={form.rewardAmount ?? ""} onChange={e => setForm({ ...form, rewardAmount: e.target.value })} /></Field><Button onClick={saveSalary}>Save salary rules</Button></Modal>
    <Modal open={!!edit} onClose={() => setEdit(null)} title="Adjust payroll"><Field label="Late days" hint="Auto-filled from clock-in records when generated — change it here to correct for a documented excuse."><Input type="number" value={form.lateDays ?? "0"} onChange={e => setForm({ ...form, lateDays: e.target.value })} /></Field><Field label="Reward"><Input type="number" value={form.reward ?? "0"} onChange={e => setForm({ ...form, reward: e.target.value })} /></Field><Field label="Other deduction" hint="Includes any deductions logged for this staff member and month."><Input type="number" value={form.extraDeduction ?? "0"} onChange={e => setForm({ ...form, extraDeduction: e.target.value })} /></Field><Field label="Note"><Input value={form.note ?? ""} onChange={e => setForm({ ...form, note: e.target.value })} /></Field><Button onClick={saveAdjustment}>Save adjustment</Button></Modal>

    <Modal open={!!deductStaff} onClose={() => setDeductStaff(null)} title={deductStaff ? `Deductions — ${deductStaff.firstName} ${deductStaff.lastName}` : ""}>
      <Alert tone="info">A one-off deduction (e.g. didn&apos;t submit lesson notes) — entered by hand, any time. It applies to the month you pick below, whether or not that month&apos;s payroll has already been generated.</Alert>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <Field label="Month"><Input type="month" value={deductForm.month} onChange={e => setDeductForm({ ...deductForm, month: e.target.value })} /></Field>
        <Field label="Amount (₦)"><Input type="number" min={0} value={deductForm.amount} onChange={e => setDeductForm({ ...deductForm, amount: e.target.value })} /></Field>
      </div>
      <Field label="Reason"><Input value={deductForm.reason} onChange={e => setDeductForm({ ...deductForm, reason: e.target.value })} placeholder="e.g. Did not submit lesson notes" /></Field>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <Button onClick={addDeduction} loading={deductBusy}>Add deduction</Button>
      </div>
      {deductStaffRows.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>Logged for {month}</div>
          <Table headers={["Reason", "Amount", ""]}>
            {deductStaffRows.map((d) => (
              <tr key={d.id}>
                <td>{d.reason}</td>
                <td>{money(d.amount)}</td>
                <td><Button size="sm" variant="ghost" onClick={() => removeDeduction(d.id)}>Remove</Button></td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Modal>
  </div>;
}
