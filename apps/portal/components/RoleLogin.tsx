"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { postForm } from "@/lib/client/api";
import { ArrowRight } from "@/components/icons";
import LoginCarousel from "@/components/LoginCarousel";
import { PasswordInput } from "@/components/PasswordInput";

export interface RoleLoginConfig {
  /** Auth role sent to the API */
  role: "STUDENT" | "PARENT" | "TEACHER";
  /** Section for students (primary / secondary) */
  section?: "PRIMARY" | "SECONDARY";
  /** Carousel set to show (strictly matches this role) */
  carouselType: "PRIMARY" | "SECONDARY" | "PARENT" | "TEACHER";
  /** Demo credentials shown on this page */
  email: string;
  password: string;
  /** Card heading */
  title: string;
  /** Breadcrumb-ish label on top of the panel */
  tag: string;
  /** Headline on the visual side */
  kicker: string;
}

const DEMO: RoleLoginConfig = {
  role: "STUDENT",
  section: "PRIMARY",
  carouselType: "PRIMARY",
  email: "student@deultimateglory.com",
  password: "password123",
  title: "Student Portal",
  tag: "Student · Primary",
  kicker: "Primary Portal",
};

export default function RoleLogin({ config = DEMO }: { config?: Partial<RoleLoginConfig> }) {
  const cfg: RoleLoginConfig = { ...DEMO, ...config };
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await postForm("/api/auth/login", { email: identifier, identifier, password, portal: "family" });
    setLoading(false);
    if (!res.ok) {
      setError(res.error || "Login failed");
      return;
    }
    if (res.user?.mustChangePassword) {
      router.push("/portal/set-password");
      router.refresh();
      return;
    }
    router.push("/portal/dashboard");
    router.refresh();
  }

  return (
    <div className="login-wrap">
      <div className="login-visual">
        <LoginCarousel type={cfg.carouselType} />
        <div className="login-visual-content">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "#ffffff", textShadow: "0 1px 8px rgba(0,0,0,0.45)" }}>
            Welcome back
          </span>
          <h2>{cfg.kicker} — everything you need, <em>in one place</em></h2>
          <p>
            Securely sign in to view results, fees, attendance, timetables, assignments and school
            messages — a private space for the De Ultimate Glory Academy family.
          </p>
        </div>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <div className="login-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <Link href="/" aria-label="Back to portal home">
              <img src="/images/logo.png" alt="De Ultimate Glory Academy logo" />
            </Link>
            <h1>De Ultimate Glory Academy</h1>
            <p>{cfg.tag} — sign in to continue</p>
          </div>

          <form onSubmit={submit} autoComplete="off">
            <label className="duga-field__label" htmlFor="role-email">Email, phone or ID</label>
            <input
              className="duga-input"
              id="role-email"
              name="identifier"
              type="text"
              inputMode="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Email, phone or admission number"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              required
            />

            <label className="duga-field__label" htmlFor="role-password" style={{ marginTop: 14 }}>Password</label>
            <PasswordInput
              id="role-password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete="off"
              name="password"
            />

            {error && (
              <div className="duga-alert" style={{ background: "var(--duga-danger-soft)", color: "var(--duga-danger)", marginTop: 14 }}>
                {error}
              </div>
            )}

            <button
              className="duga-btn duga-btn--primary duga-btn--lg duga-btn--arrow"
              type="submit"
              disabled={loading}
              style={{ width: "100%", marginTop: 20, justifyContent: "center" }}
            >
              {loading ? "Signing in…" : <>Sign in <ArrowRight size={16} className="mkt-arrow" /></>}
            </button>
          </form>

          <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--duga-ink-1)", marginTop: 20, textAlign: "center" }}>
            <Link href="/" className="mkt-link-arrow" style={{ display: "inline-flex", fontWeight: 800 }}>
              Choose a different role
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}