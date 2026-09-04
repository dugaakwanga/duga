"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, PageHeader, Field, Input, Button, Badge, Alert, Spinner, Table, EmptyState, Modal, Select } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Term {
  id: string;
  name: string;
  termNumber: number;
  status: string;
  session: { name: string };
}

interface SessionOpt {
  id: string;
  name: string;
}

interface SchoolDaysConfig {
  weekdays: Record<string, boolean>;
  holidays: Array<{ date: string; name: string }>;
}

interface RestrictionsConfig {
  resultsRequirePayment: boolean;
  applicationsOpen: boolean;
  feeGatedFeatures: string[];
}

interface SettingsData {
  school: { id: string; name: string; shortName: string; phone: string | null; email: string | null; address: string | null; logoUrl: string | null };
  subscription: { plan: string; status: string; expiresAt: string | null } | null;
  terms: Term[];
  sessions?: SessionOpt[];
  role?: string;
  financeAccess?: boolean;
  bursarFinanceAccess?: boolean;
  schoolDays?: SchoolDaysConfig;
  restrictions?: RestrictionsConfig;
}

const DAYS: Array<{ key: string; label: string }> = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

const DEFAULT_DAYS = { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false };

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [days, setDays] = useState<Record<string, boolean>>(DEFAULT_DAYS);
  const [holidays, setHolidays] = useState<Array<{ date: string; name: string }>>([]);
  const [holidayForm, setHolidayForm] = useState<{ date: string; name: string }>({ date: "", name: "" });
  const [restrictions, setRestrictions] = useState<RestrictionsConfig>({ resultsRequirePayment: true, applicationsOpen: true, feeGatedFeatures: ["tests", "assignments", "elearn", "games", "live"] });
  const [termOpen, setTermOpen] = useState(false);
  const [termForm, setTermForm] = useState<Record<string, string>>({});
  const [termBusy, setTermBusy] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<SettingsData>("settings")
      .then((d) => {
        setData(d);
        setForm({
          name: d.school.name,
          shortName: d.school.shortName,
          phone: d.school.phone ?? "",
          email: d.school.email ?? "",
          address: d.school.address ?? "",
          logoUrl: d.school.logoUrl ?? "",
        });
        if (d.schoolDays) {
          setDays({ ...DEFAULT_DAYS, ...d.schoolDays.weekdays });
          setHolidays(d.schoolDays.holidays ?? []);
        }
        if (d.restrictions) {
          setRestrictions({ ...d.restrictions });
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setError(null);
    setSaved(false);
    try {
      await api("settings", { method: "PATCH", body: form });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function activateTerm(id: string) {
    await api("settings/activateTerm", { method: "POST", body: { termId: id } });
    const d = await api<SettingsData>("settings");
    setData(d);
  }

  async function saveSchoolDays() {
    setError(null);
    try {
      await api("settings/saveSchoolDays", { method: "POST", body: { weekdays: days, holidays } });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveRestrictions() {
    setError(null);
    try {
      await api("settings/saveRestrictions", { method: "POST", body: restrictions });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleFinanceAccess(role: "admin" | "bursar") {
    setError(null);
    try {
      const value = role === "admin" ? !data?.financeAccess : !data?.bursarFinanceAccess;
      await api("settings/setFinanceAccess", { method: "POST", body: { role, value } });
      setData({ ...data!, ...(role === "admin" ? { financeAccess: value } : { bursarFinanceAccess: value }) });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload?purpose=school-logo", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
      setForm((f) => ({ ...f, logoUrl: json.data.url }));
      await api("settings", { method: "PATCH", body: { logoUrl: json.data.url } });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploadingLogo(false);
    }
  }

  function addHoliday() {
    if (!holidayForm.date || !holidayForm.name) return;
    setHolidays((h) => [...h, holidayForm]);
    setHolidayForm({ date: "", name: "" });
  }

  async function createTerm() {
    if (!termForm.sessionId || !termForm.termNumber) return alert("Choose a session and term number.");
    setTermBusy(true);
    try {
      await api("settings/addTerm", { method: "POST", body: { ...termForm, name: termForm.name || undefined } });
      setTermOpen(false);
      setTermForm({});
      const d = await api<SettingsData>("settings");
      setData(d);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setTermBusy(false);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading || !data) return <Spinner size={28} />;

  return (
    <div>
      <PageHeader title="School settings" subtitle="Manage school profile, academic terms, calendar and restrictions." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 }}>
        <div>
          <Card title="School profile">
            <Field label="School logo" hint="Shown on ID cards, report cards, and the public site. Square images work best.">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.logoUrl} alt="School logo" style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 8, border: "1px solid var(--duga-border)", background: "#fff" }} />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: 8, border: "1px dashed var(--duga-border)", display: "grid", placeItems: "center", fontSize: 11, color: "var(--duga-muted)", textAlign: "center" }}>
                    No logo
                  </div>
                )}
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={(e) => uploadLogo(e.target.files?.[0])} />
                <Button type="button" variant="outline" size="sm" loading={uploadingLogo} onClick={() => logoInputRef.current?.click()}>
                  {form.logoUrl ? "Change logo" : "Upload logo"}
                </Button>
              </div>
            </Field>
            <Field label="School name"><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Short name"><Input value={form.shortName ?? ""} onChange={(e) => setForm({ ...form, shortName: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email"><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Address"><Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            {saved && <Alert tone="success">Saved.</Alert>}
            <Button onClick={save} style={{ marginTop: 14 }}>Save profile</Button>
          </Card>

          <Card title="School days" style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13.5, color: "var(--duga-ink-2)", marginBottom: 12 }}>
              Which days of the week are school days? Holidays are closed days for the whole school.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8, marginBottom: 14 }}>
              {DAYS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDays((prev) => ({ ...prev, [d.key]: !prev[d.key] }))}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "8px 10px",
                    border: `1px solid ${days[d.key] ? "var(--duga-primary)" : "var(--duga-border)"}`,
                    borderRadius: 10,
                    background: days[d.key] ? "var(--duga-primary-soft, rgba(26,115,232,0.08))" : "transparent",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <span>{d.label.slice(0, 3)}</span>
                  <Badge tone={days[d.key] ? "success" : "neutral"}>{days[d.key] ? "Yes" : "No"}</Badge>
                </button>
              ))}
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--duga-muted)", marginBottom: 10 }}>
              Holidays
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <Input type="date" value={holidayForm.date} onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })} />
              <Input value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} placeholder="Holiday name" />
              <Button variant="outline" onClick={addHoliday}>Add</Button>
            </div>
            {holidays.length === 0 ? (
              <EmptyState title="No holidays set" />
            ) : (
              <Table headers={["Date", "Name", ""]}>
                {holidays.map((h, i) => (
                  <tr key={`${h.date}-${i}`}>
                    <td>{h.date}</td>
                    <td>{h.name}</td>
                    <td>
                      <Button variant="ghost" size="sm" onClick={() => setHolidays((arr) => arr.filter((_, j) => j !== i))}>Remove</Button>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
            <Button onClick={saveSchoolDays} style={{ marginTop: 14 }}>Save school days</Button>
          </Card>
        </div>

        <div>
          <Card title="Subscription">
            {data.subscription ? (
              <div>
                <Badge tone={data.subscription.status === "ACTIVE" ? "success" : "warning"}>{data.subscription.status}</Badge>
                <div style={{ marginTop: 8 }}>
                  <strong>{data.subscription.plan.replace("_", " ")}</strong>
                  <div style={{ fontSize: 13, color: "var(--duga-muted)" }}>
                    {data.subscription.expiresAt ? `Expires ${new Date(data.subscription.expiresAt).toLocaleDateString()}` : "No expiry set"}
                  </div>
                </div>
              </div>
            ) : (
              <Alert tone="info">No subscription on file.</Alert>
            )}
          </Card>

          <Card title="Restrictions" style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13.5, color: "var(--duga-ink-2)", marginBottom: 12 }}>
              Control access rules for the portal and public site.
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <button
                type="button"
                onClick={() => setRestrictions({ ...restrictions, resultsRequirePayment: !restrictions.resultsRequirePayment })}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: "1px solid var(--duga-border)", borderRadius: 10, cursor: "pointer", textAlign: "left", background: "transparent" }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>Require fee payment before results</span>
                <Badge tone={restrictions.resultsRequirePayment ? "success" : "neutral"}>{restrictions.resultsRequirePayment ? "On" : "Off"}</Badge>
              </button>
              <button
                type="button"
                onClick={() => setRestrictions({ ...restrictions, applicationsOpen: !restrictions.applicationsOpen })}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: "1px solid var(--duga-border)", borderRadius: 10, cursor: "pointer", textAlign: "left", background: "transparent" }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>Accept online applications</span>
                <Badge tone={restrictions.applicationsOpen ? "success" : "neutral"}>{restrictions.applicationsOpen ? "On" : "Off"}</Badge>
              </button>
            </div>

            <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 18, marginBottom: 8 }}>Block for students who are owing</div>
            <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginBottom: 10 }}>
              When a student&apos;s fee-access window lapses (see Fees → Students owing), these are the things it blocks. Turn any of them off to let owing students keep using that feature anyway.
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                { key: "tests", label: "CBT / online tests" },
                { key: "assignments", label: "Assignment submission" },
                { key: "elearn", label: "E-learning content" },
                { key: "games", label: "Educational games" },
                { key: "live", label: "Live classes" },
              ].map((f) => {
                const on = restrictions.feeGatedFeatures.includes(f.key);
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() =>
                      setRestrictions({
                        ...restrictions,
                        feeGatedFeatures: on ? restrictions.feeGatedFeatures.filter((id) => id !== f.key) : [...restrictions.feeGatedFeatures, f.key],
                      })
                    }
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: "1px solid var(--duga-border)", borderRadius: 10, cursor: "pointer", textAlign: "left", background: "transparent" }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{f.label}</span>
                    <Badge tone={on ? "danger" : "neutral"}>{on ? "Blocked when owing" : "Always allowed"}</Badge>
                  </button>
                );
              })}
            </div>
            <Button onClick={saveRestrictions} style={{ marginTop: 14 }}>Save restrictions</Button>
          </Card>

          <Card title="Features & roles" style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13.5, color: "var(--duga-ink-2)", marginBottom: 12 }}>
              The owner decides what the admin can use, and the admin decides what teachers and students can use.
            </div>
            <Link href="/portal/settings/features" className="duga-btn duga-btn--outline duga-btn--sm" style={{ display: "inline-flex" }}>
              Manage features & roles
            </Link>
          </Card>

          {data.role === "OWNER" && (
            <Card title="Finance access" style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13.5, color: "var(--duga-ink-2)", marginBottom: 12 }}>
                By default only you (the owner) can see financial details. Grant the admin or bursar access to the finance dashboard, fees, reports and payroll here. Without a grant, none of the finance items appear in their portal.
              </div>
              <button
                type="button"
                onClick={() => toggleFinanceAccess("admin")}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: "1px solid var(--duga-border)", borderRadius: 10, cursor: "pointer", textAlign: "left", background: "transparent", width: "100%" }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>Admin finance access</span>
                <Badge tone={data.financeAccess ? "success" : "neutral"}>{data.financeAccess ? "Granted" : "Not granted"}</Badge>
              </button>
              <button
                type="button"
                onClick={() => toggleFinanceAccess("bursar")}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: "1px solid var(--duga-border)", borderRadius: 10, cursor: "pointer", textAlign: "left", background: "transparent", width: "100%", marginTop: 8 }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>Bursar finance access</span>
                <Badge tone={data.bursarFinanceAccess ? "success" : "neutral"}>{data.bursarFinanceAccess ? "Granted" : "Not granted"}</Badge>
              </button>
              <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginTop: 8 }}>
                When granted, that account can view fees, reports, payroll and the finance dashboard. Teachers, students and parents never see financial details.
              </div>
            </Card>
          )}

          <Card title="Academic terms" style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13.5, color: "var(--duga-ink-2)", marginBottom: 12 }}>
              Each session can hold first, second and third term. Activate the current term.
            </div>
            {data.terms.length === 0 ? (
              <EmptyState title="No terms yet" />
            ) : (
              <Table headers={["Term", "Session", "Status", ""]}>
                {data.terms.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{t.session.name}</td>
                    <td>
                      <Badge tone={t.status === "ACTIVE" ? "success" : "neutral"}>{t.status}</Badge>
                    </td>
                    <td>
                      {t.status !== "ACTIVE" && (
                        <Button variant="outline" size="sm" onClick={() => activateTerm(t.id)}>Activate</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
            <Button variant="outline" style={{ marginTop: 12 }} onClick={() => { setTermForm({}); setTermOpen(true); }}>Add term</Button>
          </Card>
        </div>
      </div>

      <Modal open={termOpen} onClose={() => setTermOpen(false)} title="Add term">
        <Field label="Session" required>
          <Select value={termForm.sessionId ?? ""} onChange={(e) => setTermForm({ ...termForm, sessionId: e.target.value })}>
            <option value="">Select session…</option>
            {(data.sessions ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Term number" required>
          <Select value={termForm.termNumber ?? ""} onChange={(e) => setTermForm({ ...termForm, termNumber: e.target.value })}>
            <option value="">Select term…</option>
            <option value="1">First term</option>
            <option value="2">Second term</option>
            <option value="3">Third term</option>
          </Select>
        </Field>
        <Field label="Name (optional)">
          <Input value={termForm.name ?? ""} onChange={(e) => setTermForm({ ...termForm, name: e.target.value })} placeholder="Defaults to First/Second/Third Term" />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setTermOpen(false)}>Cancel</Button>
          <Button loading={termBusy} onClick={createTerm}>Add term</Button>
        </div>
      </Modal>
    </div>
  );
}
