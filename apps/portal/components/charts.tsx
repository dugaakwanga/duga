"use client";

// Minimal dependency-free bar/line charts using CSS + SVG.

interface SeriesPoint {
  label: string;
  value: number;
  passRate?: number;
}

export function BarChart({
  points,
  color = "var(--duga-primary)",
  format = (v) => String(v),
}: {
  points: SeriesPoint[];
  color?: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 180, padding: "0 4px" }}>
      {points.map((p) => (
        <div key={p.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%" }}>
          <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div
              style={{
                width: "70%",
                maxWidth: 40,
                height: `${Math.max(2, (p.value / max) * 100)}%`,
                background: color,
                borderRadius: 6,
                position: "relative",
                minHeight: 4,
              }}
              title={format(p.value)}
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--duga-muted)", textAlign: "center", lineHeight: 1.2, overflowWrap: "anywhere" }}>{p.label}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700 }}>{format(p.value)}</div>
        </div>
      ))}
    </div>
  );
}

export function Donut({
  value,
  total,
  label,
  color = "var(--duga-primary)",
}: {
  value: number;
  total: number;
  label: string;
  color?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const r = 44;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width={110} height={110} viewBox="0 0 110 110">
        <circle cx={55} cy={55} r={r} fill="none" stroke="var(--duga-border)" strokeWidth={14} />
        <circle
          cx={55}
          cy={55}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * circ} ${circ}`}
          transform="rotate(-90 55 55)"
        />
        <text x={55} y={55} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 22, fontWeight: 800 }}>
          {pct}%
        </text>
      </svg>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{label}</div>
        <div style={{ fontSize: 13, color: "var(--duga-muted)" }}>
          {formatNumber(value)} of {formatNumber(total)}
        </div>
      </div>
    </div>
  );
}

export function formatNumber(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
