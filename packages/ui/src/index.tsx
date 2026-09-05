import React, { forwardRef, useEffect } from "react";

type ReactNode = React.ReactNode;

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
export type ButtonVariant = "primary" | "accent" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", block, loading, children, className = "", disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`duga-btn duga-btn--${variant} duga-btn--${size}${block ? " duga-btn--block" : ""} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="duga-spinner" style={{ borderTopColor: "currentColor" }} />}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({ title, actions, children, className = "", pad, style }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean; style?: React.CSSProperties }) {
  return (
    <div className={`duga-card ${className}`} style={style}>
      {title !== undefined && (
        <div className="duga-card__header">
          <div className="duga-card__title">{title}</div>
          {actions}
        </div>
      )}
      <div className={pad === false ? undefined : "duga-card__pad"}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
export function Field({ label, hint, error, children, required }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; required?: boolean }) {
  return (
    <div className="duga-field">
      {label && (
        <label className="duga-field__label">
          {label} {required && <span style={{ color: "var(--duga-danger)" }}>*</span>}
        </label>
      )}
      {children}
      {error ? <span className="duga-field__error">{error}</span> : hint ? <span className="duga-field__hint">{hint}</span> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className = "", ...rest }, ref) {
  return <input ref={ref} className={`duga-input ${className}`} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = "", ...rest }, ref) {
  return <textarea ref={ref} className={`duga-textarea ${className}`} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className = "", children, ...rest }, ref) {
  return (
    <select ref={ref} className={`duga-select ${className}`} {...rest}>
      {children}
    </select>
  );
});

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`duga-badge duga-badge--${tone}`}>{children}</span>;
}

// ---------------------------------------------------------------------------
// ProgressBar — a percentage fill bar, e.g. "how much of this has been
// marked/graded/completed". `tone` is picked automatically from `pct` when
// omitted (green once mostly done, amber part-way, red barely started).
// ---------------------------------------------------------------------------
export function ProgressBar({ pct, tone }: { pct: number; tone?: BadgeTone }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const resolvedTone = tone ?? (clamped >= 80 ? "success" : clamped >= 40 ? "warning" : "danger");
  return (
    <div className="duga-progress" role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`duga-progress__fill duga-progress__fill--${resolvedTone}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------
export function Alert({ tone = "info", children }: { tone?: "success" | "warning" | "danger" | "info"; children: ReactNode }) {
  return <div className={`duga-alert duga-alert--${tone}`}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------
export function Table({ headers, children, empty }: { headers: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="duga-table-wrap">
      <table className="duga-table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}
export const Td = ({ children, colSpan }: { children?: ReactNode; colSpan?: number }) => <td colSpan={colSpan}>{children}</td>;

// ---------------------------------------------------------------------------
// Stat
// ---------------------------------------------------------------------------
export function Stat({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "success" | "warning" | "danger" | "info" | "accent" }) {
  return (
    <div className="duga-card duga-stat">
      <span className="duga-stat__label">{label}</span>
      <span className="duga-stat__value" style={tone ? { color: `var(--duga-${tone})` } : undefined}>
        {value}
      </span>
      {hint && <span className="duga-stat__hint">{hint}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------
export function Spinner({ size = 18 }: { size?: number }) {
  return <span className="duga-spinner" style={{ width: size, height: size }} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="duga-empty">
      <div style={{ fontSize: 28 }}>🗒️</div>
      <div style={{ fontWeight: 600, marginTop: 8 }}>{title}</div>
      {hint && <div style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="duga-page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Avatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (src) return <img className="duga-avatar" src={src} alt={name} style={{ width: size, height: size }} />;
  return (
    <span className="duga-avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(16,24,40,0.5)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="duga-card"
        style={{ width: "100%", maxWidth: wide ? 820 : 520, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="duga-card__header">
          <div className="duga-card__title">{title}</div>
          <button className="duga-btn duga-btn--ghost duga-btn--sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="duga-card__body">{children}</div>
        {footer && <div className="duga-card__header" style={{ borderTop: "1px solid var(--duga-border)", borderBottom: "none", justifyContent: "flex-end" }}>{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
export function Tabs({ tabs, value, onChange }: { tabs: Array<{ id: string; label: ReactNode }>; value: string; onChange: (id: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--duga-border)", marginBottom: 16, overflowX: "auto" }}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "10px 14px", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap",
              color: active ? "var(--duga-primary)" : "var(--duga-muted)",
              borderBottom: active ? "2px solid var(--duga-primary)" : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons (minimal inline SVG set)
// ---------------------------------------------------------------------------
export type IconName =
  | "dashboard" | "students" | "staff" | "classes" | "notes" | "assignment" | "quiz"
  | "live" | "attendance" | "results" | "messages" | "announcements" | "fees"
  | "hostel" | "timetable" | "bus" | "reports" | "settings" | "audit" | "applications"
  | "notifications" | "logout" | "back" | "plus" | "more" | "check" | "clock" | "home" | "menu" | "trophy";

const paths: Record<IconName, ReactNode> = {
  dashboard: <path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z" />,
  students: <path d="M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM4 20c0-4 4-6 8-6s8 2 8 6M12 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
  staff: <path d="M4 18c0-3 3-5 6-5h4c3 0 6 2 6 5M9 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm6 1a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z" />,
  classes: <path d="M3 5h18v14H3zM8 5v14M3 9h5M16 5v14" />,
  notes: <path d="M5 3h10l4 4v14H5zM15 3v4h4M8 12h8M8 16h8M8 8h3" />,
  assignment: <path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4M9 3l3 2 3-2" />,
  quiz: <path d="M4 6h16v12H4zM4 6l8 5 8-5M7 16h3M12 16h5" />,
  live: <path d="M12 4v10M4 8v2a8 8 0 0 0 16 0V8M12 14v4M9 20h6" />,
  attendance: <path d="M3 12a9 9 0 1 0 9-9M3 12h6M12 3v6M3 12l3 3M12 3l3 3" />,
  results: <path d="M4 4v16h16M8 15l3-4 3 2 4-6" />,
  messages: <path d="M3 5h18v12H9l-5 4V5ZM7 9h10M7 13h6" />,
  announcements: <path d="M4 9a8 8 0 0 1 16 0v6h2v2H2v-2h2v-6Zm6 11h4" />,
  fees: <path d="M12 2v20M7 6h10M9 18h6M5 9c0-1 1-2 7-2s7 1 7 2-1 2-7 2-7-1-7-2Zm0 6c0-1 1-2 7-2s7 1 7 2-1 2-7 2-7-1-7-2Z" />,
  hostel: <path d="M3 21h18M4 21V9l8-4 8 4v12M9 21v-6h6v6M9 10h1M14 10h1M9 14h1M14 14h1" />,
  timetable: <path d="M4 5h16v16H4zM4 10h16M8 3v4M16 3v4M8 15h3M13 15h3M8 18h6" />,
  bus: <path d="M4 7h12v9H4zM16 7h3v9h-3zM6 11h6M6 15h6M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm9-1a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />,
  reports: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7-3a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 2.6a7 7 0 0 0-1.7 1l-2.4-1-2 3.5L5 11a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.7 1l.3 2.6h5l.3-2.6a7 7 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5a7 7 0 0 0 .1-1Z" />,
  audit: <path d="M5 3h14v18H5zM9 7h6M9 11h6M9 15h4M8 19h8" />,
  applications: <path d="M6 3h12v18H6zM9 3h6M10 17h4M9 8h6M9 12h6" />,
  notifications: <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Zm6 12a2.5 2.5 0 0 1-2.4-2h4.8a2.5 2.5 0 0 1-2.4 2Z" />,
  logout: <path d="M9 4h5v16H9M14 9l3 3-3 3M6 12h11" />,
  back: <path d="M15 5l-7 7 7 7M8 12h12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  check: <path d="M5 13l4 4L19 7" />,
  clock: <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-14v5l3 3" />,
  home: <path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V10Z" />,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  trophy: <path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4ZM7 6H4a1 1 0 0 0-1 1 4 4 0 0 0 4 4M17 6h3a1 1 0 0 1 1 1 4 4 0 0 1-4 4" />,
};

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {paths[name]}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// NavLink
// ---------------------------------------------------------------------------
export function NavLink({ active, onClick, icon, children }: { active?: boolean; onClick?: () => void; icon?: IconName; children: ReactNode }) {
  return (
    <a className={`duga-nav-link${active ? " duga-nav-link--active" : ""}`} onClick={onClick} href="#">
      {icon && <Icon name={icon} size={17} />}
      {children}
    </a>
  );
}

export const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");
