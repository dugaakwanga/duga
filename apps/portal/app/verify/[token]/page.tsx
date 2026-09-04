"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface VerifyResponse {
  active: boolean;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  className: string | null;
  section: string;
  photoUrl: string | null;
  school: { name: string; shortName: string; logoUrl: string | null } | null;
}

// Public, unauthenticated: what an ordinary camera or QR app shows when it
// scans a student's ID card — the DUGA app's own in-app scanner recognizes
// this same link and uses it for gate clock-in/out instead of opening it.
export default function VerifyStudentPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<VerifyResponse | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/public/verify-student/${token}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Could not verify this code");
        return json.data as VerifyResponse;
      })
      .then(setData)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#f1f5f9", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>{children}</div>
    </div>
  );

  if (loading) return wrap(<p style={{ textAlign: "center", color: "#64748b" }}>Checking…</p>);

  if (error || !data) {
    return wrap(
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,.08)" }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>⚠️</div>
        <div style={{ fontWeight: 800, color: "#b91c1c", fontSize: 17, marginBottom: 6 }}>Not a valid student ID</div>
        <p style={{ color: "#64748b", fontSize: 13.5, margin: 0 }}>{error || "This code could not be verified."}</p>
      </div>,
    );
  }

  const primary = "#1e3a5f";
  const accent = "#c8a448";

  return wrap(
    <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,.1)" }}>
      <div style={{ background: primary, padding: "18px 20px", display: "flex", alignItems: "center", gap: 10 }}>
        {data.school?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.school.logoUrl} alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: "contain", background: "#fff" }} />
        ) : null}
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 14, letterSpacing: 0.3 }}>{data.school?.name ?? "DUGA"}</div>
      </div>

      <div style={{ padding: 24, textAlign: "center" }}>
        {data.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.photoUrl} alt="" style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", border: `3px solid ${accent}`, margin: "0 auto 14px" }} />
        ) : (
          <div style={{ width: 96, height: 96, borderRadius: "50%", background: "#e5e7eb", display: "grid", placeItems: "center", margin: "0 auto 14px", fontWeight: 800, fontSize: 28, color: primary }}>
            {`${data.firstName[0] ?? ""}${data.lastName[0] ?? ""}`.toUpperCase()}
          </div>
        )}

        <div style={{ fontWeight: 800, fontSize: 19, color: "#111827" }}>{data.firstName} {data.lastName}</div>
        <div style={{ color: "#6b7280", fontSize: 13.5, margin: "4px 0 14px" }}>{data.className ? `${data.className} · ${data.section}` : data.section}</div>

        <span
          style={{
            display: "inline-block",
            padding: "6px 14px",
            borderRadius: 999,
            fontSize: 12.5,
            fontWeight: 700,
            background: data.active ? "#dcfce7" : "#fee2e2",
            color: data.active ? "#166534" : "#991b1b",
          }}
        >
          {data.active ? "✓ Active enrolled student" : "Not currently enrolled"}
        </span>

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #e5e7eb", fontSize: 12.5, color: "#9ca3af" }}>
          Admission No. {data.admissionNumber}
        </div>
      </div>
    </div>,
  );
}
