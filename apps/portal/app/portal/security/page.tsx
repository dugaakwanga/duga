"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, PageHeader, Badge, Alert, Spinner, Button, Field, Input, Icon, Tabs } from "@duga/ui";
import { api } from "@/lib/client/api";
import { QrScanner } from "@/components/QrScanner";

interface GateLog {
  id: string;
  date: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  permittedExitAt: string | null;
  permittedExitReason: string | null;
  permittedReturnAt: string | null;
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
interface StaffOption {
  id: string;
  name: string;
  role: string;
}
type ScanMode = "IN" | "OUT" | null;

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
  const [notice, setNotice] = useState<string | null>(null); // soft "already clocked in" feedback

  const [mode, setMode] = useState<ScanMode>(null);
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false); // guards overlapping camera-triggered scans

  const [exitOpen, setExitOpen] = useState(false);
  const [exitCode, setExitCode] = useState("");
  const [exitReason, setExitReason] = useState("");
  const [exitBusy, setExitBusy] = useState(false);

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnCode, setReturnCode] = useState("");
  const [returnBusy, setReturnBusy] = useState(false);

  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [visitorOpen, setVisitorOpen] = useState(false);
  const [visitorForm, setVisitorForm] = useState({ name: "", phone: "", purpose: "", hostName: "", hostUserId: "" });
  const [hostQuery, setHostQuery] = useState("");
  const [hostSuggestOpen, setHostSuggestOpen] = useState(false);
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
  }, [load]);

  useEffect(() => {
    if (tab === "clockin") scanInputRef.current?.focus();
  }, [tab, mode]);

  async function runScan(rawCode: string, activeMode: ScanMode) {
    const trimmed = rawCode.trim();
    if (!trimmed || !activeMode || busyRef.current) return;
    busyRef.current = true;
    setScanning(true);
    setError(null);
    setNotice(null);
    setMessage(null);
    try {
      const res = await api<{ status: "OK" | "ALREADY"; direction: "IN" | "OUT"; student: string; at: string }>("security/scan", {
        method: "POST",
        body: { code: trimmed, mode: activeMode },
        loading: false,
      });
      if (res.status === "ALREADY") {
        setNotice(`${res.student} was already clocked ${res.direction === "IN" ? "in" : "out"} (at ${time(res.at)}).`);
      } else {
        setMessage(`${res.student} clocked ${res.direction === "IN" ? "in" : "out"} at ${time(res.at)}.`);
      }
      setCode("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
      busyRef.current = false;
      scanInputRef.current?.focus();
    }
  }

  function submitScan(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError("Scan a QR code or type the student's admission number first.");
      scanInputRef.current?.focus();
      return;
    }
    runScan(code, mode);
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

  async function submitReturn() {
    if (!returnCode.trim()) return;
    setReturnBusy(true);
    setError(null);
    try {
      const res = await api<{ student: string; at: string }>("security/permittedReturn", { method: "POST", body: { code: returnCode.trim() } });
      setMessage(`${res.student} marked as returned at ${time(res.at)}.`);
      setReturnOpen(false);
      setReturnCode("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReturnBusy(false);
    }
  }

  function openVisitorForm() {
    setVisitorOpen(true);
    setHostQuery("");
    api<StaffOption[]>("security/staffDirectory").then(setStaff).catch(() => setStaff([]));
  }

  function pickHost(s: StaffOption) {
    setVisitorForm({ ...visitorForm, hostUserId: s.id, hostName: s.name });
    setHostQuery(s.name);
    setHostSuggestOpen(false);
  }

  async function submitVisitor() {
    if (!visitorForm.name.trim()) return;
    setVisitorBusy(true);
    setError(null);
    try {
      await api("security/logVisitor", { method: "POST", body: visitorForm });
      setVisitorOpen(false);
      setVisitorForm({ name: "", phone: "", purpose: "", hostName: "", hostUserId: "" });
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

  const filteredStaff = hostQuery.trim()
    ? staff.filter((s) => s.name.toLowerCase().includes(hostQuery.trim().toLowerCase()))
    : staff;

  return (
    <div>
      <PageHeader title="Gate & Visitors" subtitle="Student clock-in and the visitor log — kept as separate tabs." />
      <Tabs
        tabs={[
          { id: "clockin", label: "Student clock-in" },
          { id: "visitors", label: "Visitors" },
        ]}
        value={tab}
        onChange={(k) => { setTab(k as "clockin" | "visitors"); setError(null); setMessage(null); setNotice(null); }}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}
      {notice && <Alert tone="warning">{notice}</Alert>}

      {tab === "clockin" ? (
        <>
          <Card title="Clock students in or out">
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <Button variant={mode === "IN" ? "primary" : "outline"} onClick={() => { setMode("IN"); setError(null); setMessage(null); setNotice(null); }}>
                <Icon name="reports" size={16} /> Clock In mode
              </Button>
              <Button variant={mode === "OUT" ? "primary" : "outline"} onClick={() => { setMode("OUT"); setError(null); setMessage(null); setNotice(null); }}>
                <Icon name="back" size={16} /> Clock Out mode
              </Button>
              {mode && (
                <Button variant="ghost" onClick={() => setMode(null)}>Done — stop scanning</Button>
              )}
            </div>

            {mode ? (
              <>
                <div style={{ marginBottom: 10, fontSize: 13.5, fontWeight: 600, color: mode === "IN" ? "var(--duga-success, #16a34a)" : "var(--duga-primary)" }}>
                  {mode === "IN" ? "Clock In mode — every student scanned now is recorded as arriving." : "Clock Out mode — every student scanned now is recorded as leaving."}
                </div>
                <QrScanner active={!!mode} onDecode={(text) => runScan(text, mode)} />
                <div style={{ fontSize: 12.5, color: "var(--duga-muted)", margin: "10px 0", textAlign: "center" }}>
                  Point the camera at each student&apos;s ID card QR code — scanning happens automatically, one after another.
                </div>
              </>
            ) : (
              <Alert tone="info">Pick &quot;Clock In mode&quot; or &quot;Clock Out mode&quot; above to start scanning students with the camera.</Alert>
            )}

            <form onSubmit={submitScan} style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <Input
                ref={scanInputRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={mode ? "Or type the admission number, then press Enter" : "Pick a mode above first"}
                disabled={!mode}
                style={{ flex: 1, fontSize: 16 }}
              />
              <Button type="submit" loading={scanning} disabled={!mode}>Submit</Button>
            </form>
          </Card>

          <div style={{ display: "flex", gap: 10, margin: "16px 0", flexWrap: "wrap" }}>
            <Button variant="outline" onClick={() => setExitOpen(true)}><Icon name="back" size={16} /> Permitted exit</Button>
            <Button variant="outline" onClick={() => setReturnOpen(true)}><Icon name="reports" size={16} /> Mark returned</Button>
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
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {g.checkInAt && <Badge tone="success">In {time(g.checkInAt)}</Badge>}
                        {g.checkOutAt && <Badge tone="neutral">Out {time(g.checkOutAt)}</Badge>}
                        {g.permittedExitAt && <Badge tone="warning">Permitted exit {time(g.permittedExitAt)}</Badge>}
                        {g.permittedReturnAt && <Badge tone="success">Returned {time(g.permittedReturnAt)}</Badge>}
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

          {returnOpen && (
            <Card title="Mark a permitted exit as returned" style={{ marginTop: 18 }}>
              <Field label="Student admission number or scanned code" required>
                <Input value={returnCode} onChange={(e) => setReturnCode(e.target.value)} placeholder="e.g. DUGA/JSS/2025/0001" />
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                <Button variant="ghost" onClick={() => setReturnOpen(false)}>Cancel</Button>
                <Button onClick={submitReturn} loading={returnBusy}>Mark returned</Button>
              </div>
            </Card>
          )}
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, margin: "16px 0" }}>
            <Button variant="outline" onClick={openVisitorForm}><Icon name="plus" size={16} /> Log a visitor</Button>
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
                          <Button size="sm" variant="outline" onClick={() => checkOutVisitor(v.id)}>Mark departed</Button>
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
              <Field label="Who they're visiting" hint="Search a registered staff member so they get notified — or just type a name.">
                <div style={{ position: "relative" }}>
                  <Input
                    value={hostQuery}
                    onChange={(e) => {
                      setHostQuery(e.target.value);
                      setVisitorForm({ ...visitorForm, hostUserId: "", hostName: e.target.value });
                      setHostSuggestOpen(true);
                    }}
                    onFocus={() => setHostSuggestOpen(true)}
                    onBlur={() => setTimeout(() => setHostSuggestOpen(false), 150)}
                    placeholder="Start typing a name…"
                  />
                  {hostSuggestOpen && hostQuery.trim() && filteredStaff.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, background: "var(--duga-surface, #fff)", border: "1px solid var(--duga-border)", borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 14px rgba(0,0,0,.12)" }}>
                      {filteredStaff.slice(0, 8).map((s) => (
                        <div
                          key={s.id}
                          onMouseDown={() => pickHost(s)}
                          style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13.5, display: "flex", justifyContent: "space-between" }}
                        >
                          <span>{s.name}</span>
                          <span style={{ color: "var(--duga-muted)", fontSize: 12 }}>{s.role}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {visitorForm.hostUserId && <div style={{ fontSize: 12, color: "var(--duga-muted)", marginTop: 4 }}>They&apos;ll be notified in-app and by email.</div>}
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
