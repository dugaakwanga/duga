"use client";

import { useState } from "react";
import { Card, PageHeader, Alert, Button, Input, Field, Spinner } from "@duga/ui";
import { api } from "@/lib/client/api";

interface StudentHit {
  id: string;
  admissionNumber: string;
  photoUrl: string | null;
  user: { firstName: string; lastName: string };
  classGroup: { name: string; level: { name: string } } | null;
}

export default function IdCardsPage() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<StudentHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<StudentHit | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setResults(null);
    try {
      const d = await api<{ items: StudentHit[] }>(`students?search=${encodeURIComponent(query.trim())}`);
      setResults(d.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function generate(student: StudentHit) {
    setSelected(student);
    setQrDataUrl(null);
    setGenerating(true);
    setError(null);
    try {
      const res = await api<{ code: string }>("security/qrCode", { method: "POST", body: { studentId: student.id } });
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(res.code, { width: 320, margin: 2 });
      setQrDataUrl(dataUrl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function printCard() {
    window.print();
  }

  return (
    <div>
      <PageHeader title="Student ID cards" subtitle="Generate the QR code each student's ID card carries for gate scanning." />
      {error && <Alert tone="danger">{error}</Alert>}

      <Card title="Find a student">
        <form onSubmit={search} style={{ display: "flex", gap: 10 }}>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or admission number" style={{ flex: 1 }} />
          <Button type="submit" loading={searching}>Search</Button>
        </form>
      </Card>

      {results && (
        <Card title={`Results (${results.length})`} style={{ marginTop: 16 }}>
          {results.length === 0 ? (
            <Alert tone="info">No students matched.</Alert>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {results.map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--duga-border)", padding: "8px 0", fontSize: 13.5 }}>
                  <div>
                    <strong>{s.user.firstName} {s.user.lastName}</strong>
                    <span style={{ color: "var(--duga-muted)", marginLeft: 8 }}>{s.admissionNumber}</span>
                    {s.classGroup && <span style={{ color: "var(--duga-muted)" }}> — {s.classGroup.level.name} {s.classGroup.name}</span>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => generate(s)}>Generate ID card</Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {selected && (
        <Card title={`ID card — ${selected.user.firstName} ${selected.user.lastName}`} style={{ marginTop: 16 }}>
          {generating ? (
            <Spinner size={28} />
          ) : qrDataUrl ? (
            <div className="id-card-print" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: 20, maxWidth: 320 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="Student QR code" width={220} height={220} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>{selected.user.firstName} {selected.user.lastName}</div>
              <div style={{ color: "var(--duga-muted)", fontSize: 13 }}>{selected.admissionNumber}</div>
              {selected.classGroup && <div style={{ color: "var(--duga-muted)", fontSize: 13 }}>{selected.classGroup.level.name} {selected.classGroup.name}</div>}
              <Button onClick={printCard} style={{ marginTop: 8 }}>Print</Button>
            </div>
          ) : null}
        </Card>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            body * { visibility: hidden; }
            .id-card-print, .id-card-print * { visibility: visible; }
            .id-card-print { position: fixed; top: 40px; left: 50%; transform: translateX(-50%); }
          }
        `,
      }} />
    </div>
  );
}
