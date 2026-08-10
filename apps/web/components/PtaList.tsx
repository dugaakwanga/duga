"use client";

import { Reveal } from "@/components/motion";
import { useSiteContent } from "@/lib/use-site";

export default function PtaList() {
  const { pta, loading } = useSiteContent();

  if (loading) {
    return <p style={{ textAlign: "center", color: "var(--duga-muted)", padding: "40px 0" }}>Loading…</p>;
  }

  const executives = pta?.executives ?? [];
  const meetings = pta?.meetings ?? [];

  return (
    <div className="mkt-grid mkt-grid--3">
      {executives.map((e, i) => (
        <Reveal key={e.id} delay={(i % 3) * 90}>
          <div className="mkt-card" style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--duga-primary)" }}>
              {e.role}
            </div>
            <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 22, fontWeight: 640, color: "var(--duga-primary-ink)" }}>
              {e.name}
            </h3>
            {e.phone && <div style={{ fontSize: 13.5, color: "var(--duga-muted)" }}>{e.phone}</div>}
            {e.email && <div style={{ fontSize: 13.5, color: "var(--duga-muted)" }}>{e.email}</div>}
          </div>
        </Reveal>
      ))}

      {meetings.map((m, i) => (
        <Reveal key={m.id} delay={(i % 3) * 90}>
          <div className="mkt-card" style={{ height: "100%" }}>
            <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--duga-muted)", marginBottom: 10 }}>
              <span style={{ fontWeight: 700, color: "var(--duga-primary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Meeting</span>
              <span>{new Date(m.date).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}</span>
            </div>
            <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 21, fontWeight: 640, color: "var(--duga-primary-ink)", lineHeight: 1.25 }}>{m.title}</h3>
            {m.venue && <p style={{ marginTop: 8 }}>Venue: {m.venue}</p>}
            {m.agenda && <p style={{ fontSize: 13.5, color: "var(--duga-muted)" }}>{m.agenda}</p>}
          </div>
        </Reveal>
      ))}
    </div>
  );
}
