"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, PageHeader, Badge, Alert, Spinner, Button, Field, Input, Icon, Tabs } from "@duga/ui";
import { api } from "@/lib/client/api";

interface GateLog {
  id: string;
  date: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  permittedExitAt: string | null;
  permittedExitReason: string | null;
  student: { admissionNumber: string; user: { firstName: string; lastName: string } };
}
interface Visitor {
  id: string;
  name: string;
  phone: string | null;
  purpose: string | null;
  hostName: string | null;
  timeIn: string;
  timeOut: string | null;
}

function time(v: string | null) {
  return v ? new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function SecurityGatePage() {
  const [tab, setTab] = useState<"clockin" | "visitors">("clockin");
  const [gateLogs, setGateLogs] = useState<GateLog[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const [exitOpen, setExitOpen] = useState(false);
  const [exitCode, setExitCode] = useState("");
  const [exitReason, setExitReason] = useState("");
  const [exitBusy, setExitBusy] = useState(false);

  const [visitorOpen, setVisitorOpen] = useState(false);
  const [visitorForm, setVisitorForm] = useState({ name: "", phone: "", purpose: "", hostName: "" });
  const [visitorBusy, setVisitorBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ gateLogs: GateLog[]; visitors: Visitor[] }>("security");
      setGateLogs(d.gateLogs);
      setVisitors(d.visitors);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    scanInputRef.current?.focus();
  }, [load]);

  async function submitScan(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError("Scan a QR code or type the student's admission number first.");
      scanInputRef.current?.focus();
      return;
    }
    setScanning(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api<{ direction: "IN" | "OUT"; student: string; at: string }>("security/scan", { method: "POST", body: { code: code.trim() } });
      setMessage(`${res.student} clocked ${res.direction === "IN" ? "in" : "out"} at ${time(res.at)}.`);
      setCode("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
      scanInputRef.current?.focus();
    }
  }

  async function submitExit() {
    if (!exitCode.trim() || !exitReason.trim()) return;
    setExitBusy(true);
    setError(null);
    try {
      const res = await api<{ student: string; at: string }>("security/permittedExit", { method: "POST", body: { code: exitCode.trim(), reason: exitReason.trim() } });
      setMessage(`${res.student} logged out on a permitted exit at ${time(res.at)}.`);
      setExitOpen(false);
      setExitCode("");
      setExitReason("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExitBusy(false);
    }
  }

  async function submitVisitor() {
    if (!visitorForm.name.trim()) return;
    setVisitorBusy(true);
    setError(null);
    try {
      await api("security/logVisitor", { method: "POST", body: visitorForm });
      setVisitorOpen(false);
      setVisitorForm({ name: "", phone: "", purpose: "", hostName: "" });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVisitorBusy(false);
    }
  }

  async function checkOutVisitor(id: string) {
    try {
      await api("security/checkOutVisitor", { method: "POST", body: { id } });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader title="Gate & Visitors" subtitle="Student clock-in and the visitor log — kept as separate tabs." />
      <Tabs
        tabs={[
          { id: "clockin", label: "Student clock-in" },
          { id: "visitors", label: "Visitors" },
        ]}
        value={tab}
        onChange={(k) => { setTab(k as "clockin" | "visitors"); setError(null); setMessage(null); }}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      {tab === "clockin" ? (
        <>
          <Card title="Scan">
            <form onSubmit={submitScan} style={{ display: "flex", gap: 10 }}>
              <Input
                ref={scanInputRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Scan a QR code (USB scanner) or type an admission number, then press Enter"
                autoFocus
                style={{ flex: 1, fontSize: 16 }}
              />
              <Button type="submit" loading={scanning}>Clock in / out</Button>
            </form>
            <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginTop: 8 }}>
              Works with a USB/Bluetooth QR scanner (it types the code and presses Enter automatically) or manual entry. First scan of the day clocks a student in; the next scan clocks them out.
            </div>
          </Card>

          <div style={{ display: "flex", gap: 10, margin: "16px 0" }}>
            <Button variant="outline" onClick={() => setExitOpen(true)}><Icon name="back" size={16} /> Permitted exit</Button>
          </div>

          {loading ? (
            <Spinner size={28} />
          ) : (
            <Card title={`Today's gate activity (${gateLogs.length})`}>
              {gateLogs.length === 0 ? (
                <Alert tone="info">No students have been scanned yet today.</Alert>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {gateLogs.map((g) => (
                    <div key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--duga-border)", padding: "8px 0", fontSize: 13.5 }}>
                      <div>
                        <strong>{g.student.user.firstName} {g.student.user.lastName}</strong>
                        <span style={{ color: "var(--duga-muted)", marginLeft: 8 }}>{g.student.admissionNumber}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {g.checkInAt && <Badge tone="success">In {time(g.checkInAt)}</Badge>}
                        {g.checkOutAt && <Badge tone="neutral">Out {time(g.checkOutAt)}</Badge>}
                        {g.permittedExitAt && <Badge tone="warning">Permitted exit {time(g.permittedExitAt)}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {exitOpen && (
            <Card title="Permitted early exit" style={{ marginTop: 18 }}>
              <Field label="Student admission number or scanned code" required>
                <Input value={exitCode} onChange={(e) => setExitCode(e.target.value)} placeholder="e.g. DUGA/JSS/2025/0001" />
              </Field>
              <Field label="Reason" required hint="e.g. Medical appointment, parent pickup, authorized by admin">
                <Input value={exitReason} onChange={(e) => setExitReason(e.target.value)} />
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                <Button variant="ghost" onClick={() => setExitOpen(false)}>Cancel</Button>
                <Button onClick={submitExit} loading={exitBusy}>Log exit</Button>
              </div>
            </Card>
          )}
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, margin: "16px 0" }}>
            <Button variant="outline" onClick={() => setVisitorOpen(true)}><Icon name="plus" size={16} /> Log a visitor</Button>
          </div>

          {loading ? (
            <Spinner size={28} />
          ) : (
            <Card title={`Visitors today (${visitors.length})`}>
              {visitors.length === 0 ? (
                <Alert tone="info">No visitors logged yet today.</Alert>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {visitors.map((v) => (
                    <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--duga-border)", padding: "8px 0", fontSize: 13.5 }}>
                      <div>
                        <strong>{v.name}</strong>
                        {v.purpose && <span style={{ color: "var(--duga-muted)", marginLeft: 8 }}>{v.purpose}</span>}
                        {v.hostName && <span style={{ color: "var(--duga-muted)" }}> — visiting {v.hostName}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <Badge tone="success">In {time(v.timeIn)}</Badge>
                        {v.timeOut ? (
                          <Badge tone="neutral">Out {time(v.timeOut)}</Badge>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => checkOutVisitor(v.id)}>Check out</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {visitorOpen && (
            <Card title="Log a visitor" style={{ marginTop: 18 }}>
              <Field label="Visitor name" required>
                <Input value={visitorForm.name} onChange={(e) => setVisitorForm({ ...visitorForm, name: e.target.value })} />
              </Field>
              <Field label="Phone">
                <Input value={visitorForm.phone} onChange={(e) => setVisitorForm({ ...visitorForm, phone: e.target.value })} />
              </Field>
              <Field label="Purpose of visit">
                <Input value={visitorForm.purpose} onChange={(e) => setVisitorForm({ ...visitorForm, purpose: e.target.value })} />
              </Field>
              <Field label="Who they're visiting">
                <Input value={visitorForm.hostName} onChange={(e) => setVisitorForm({ ...visitorForm, hostName: e.target.value })} />
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                <Button variant="ghost" onClick={() => setVisitorOpen(false)}>Cancel</Button>
                <Button onClick={submitVisitor} loading={visitorBusy}>Log visitor</Button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
