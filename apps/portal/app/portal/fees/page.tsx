"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Badge, Table, Alert, Spinner, EmptyState, Stat, Button, Icon, Modal, Field, Input } from "@duga/ui";
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

function naira(v: string | number | undefined): string {
  return `₦${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function FeesPage() {
  const [role, setRole] = useState<string>("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<{ total: number; paid: number; balance: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [paying, setPaying] = useState<string | null>(null);

  useEffect(() => {
    api<{ role: string; invoices: Invoice[]; summary: { total: number; paid: number; balance: number } }>("fees")
      .then((d) => {
        setRole(d.role);
        setInvoices(d.invoices);
        setSummary(d.summary);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function generate() {
    try {
      await api("fees/generateInvoices", { method: "POST", body: form });
      setOpen(false);
      const d = await api<{ invoices: Invoice[]; summary: { total: number; paid: number; balance: number } }>("fees");
      setInvoices(d.invoices);
      setSummary(d.summary);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function pay(invoiceId: string) {
    setPaying(invoiceId);
    try {
      const d = await api<{ authorizationUrl: string }>(`fees/${invoiceId}/initPayment`, { method: "POST", body: {} });
      if (d.authorizationUrl) window.location.href = d.authorizationUrl;
      else alert("Payment initialized (mock). Check the invoice status.");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setPaying(null);
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
          (role === "ADMIN" || role === "OWNER") ? (
            <Button onClick={() => setOpen(true)}><Icon name="plus" size={16} /> Generate invoices</Button>
          ) : undefined
        }
      />

      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 20 }}>
          <Stat label="Total billed" value={naira(summary.total)} />
          <Stat label="Collected" value={naira(summary.paid)} tone="success" />
          <Stat label="Outstanding" value={naira(summary.balance)} tone="danger" />
        </div>
      )}

      {invoices.length === 0 ? (
        <EmptyState title="No invoices yet" />
      ) : (
        <Card>
          <Table headers={["Invoice", "Student", "Term", "Amount", "Paid", "Balance", "Status", ""]}>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td>{i.invoiceNumber}</td>
                <td>{i.student ? `${i.student.user.firstName} ${i.student.user.lastName}` : "—"}</td>
                <td>{i.term?.name}</td>
                <td>{naira(i.totalAmount)}</td>
                <td>{naira(i.paidAmount)}</td>
                <td>{naira(i.balance)}</td>
                <td>
                  <Badge tone={i.status === "PAID" || i.status === "OVERPAID" ? "success" : i.status === "PARTIAL" ? "warning" : "danger"}>{i.status}</Badge>
                </td>
                <td>
                  {i.status !== "PAID" && i.status !== "OVERPAID" && (role === "STUDENT" || role === "PARENT") && (
                    <Button size="sm" loading={paying === i.id} onClick={() => pay(i.id)}>Pay</Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Generate invoices">
        <Field label="Class group ID">
          <Input value={form.classGroupId ?? ""} onChange={(e) => setForm({ ...form, classGroupId: e.target.value })} placeholder="All classes if empty" />
        </Field>
        <Field label="Term ID">
          <Input value={form.termId ?? ""} onChange={(e) => setForm({ ...form, termId: e.target.value })} />
        </Field>
        <Field label="Fee structure ID">
          <Input value={form.feeStructureId ?? ""} onChange={(e) => setForm({ ...form, feeStructureId: e.target.value })} />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={generate}>Generate</Button>
        </div>
      </Modal>
    </div>
  );
}
