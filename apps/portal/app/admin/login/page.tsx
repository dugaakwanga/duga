"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { postForm } from "@/lib/client/api";
import { ArrowRight } from "@/components/icons";
import LoginCarousel from "@/components/LoginCarousel";
import { PasswordInput } from "@/components/PasswordInput";
import { siteHomeUrl } from "@/lib/client/site";

const DEMO_ACCOUNTS: Record<string, { email: string; password: string; label: string }> = {
  OWNER: { email: "owner@deultimateglory.com", password: "password123", label: "Proprietor" },
  ADMIN: { email: "admin@deultimateglory.com", password: "password123", label: "Admin" },
};

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLogin />
    </Suspense>
  );
}

function AdminLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = (searchParams.get("role") ?? "ADMIN").toUpperCase();
  const [role, setRole] = useState<string>(Object.keys(DEMO_ACCOUNTS).find((k) => k === initialRole) ?? "ADMIN");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function pickRole(r: string) {
    setRole(r);
    setIdentifier("");
    setPassword("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await postForm("/api/auth/login", { email: identifier, identifier, password, portal: "admin" });
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
        <LoginCarousel type="ADMIN" />
        <div className="login-visual-content">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "#ffffff", textShadow: "0 1px 8px rgba(0,0,0,0.45)" }}>
            Admin Console
          </span>
          <h2>
            Run the school, <em>securely</em>
          </h2>
          <p>
            Registration, hostels, transport, fees, results publishing and full school reporting —
            a single place for the staff who keep DUGA running.
          </p>
        </div>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <div className="login-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <Link href={siteHomeUrl} aria-label="De Ultimate Glory Academy home">
              <img src="/images/logo.png" alt="De Ultimate Glory Academy logo" />
            </Link>
            <h1>De Ultimate Glory Academy</h1>
            <p>School Administration — sign in to continue</p>
          </div>

          <div className="role-picker">
            {Object.entries(DEMO_ACCOUNTS).map(([key, acc]) => (
              <button key={key} type="button" className={role === key ? "active" : ""} onClick={() => pickRole(key)}>
                {acc.label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} autoComplete="off">
            <label className="duga-field__label">Email, phone or staff ID</label>
            <input className="duga-input" type="text" name="identifier" inputMode="text" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Email, phone or staff number" spellCheck={false} autoCorrect="off" autoCapitalize="off" required />

            <label className="duga-field__label" style={{ marginTop: 14 }}>Password</label>
            <PasswordInput value={password} onChange={setPassword} placeholder="••••••••" autoComplete="off" name="password" />

            {error && <div className="duga-alert" style={{ background: "var(--duga-danger-soft)", color: "var(--duga-danger)", marginTop: 14 }}>{error}</div>}

            <button className="duga-btn duga-btn--primary duga-btn--lg duga-btn--arrow" type="submit" disabled={loading} style={{ width: "100%", marginTop: 20, justifyContent: "center" }}>
              {loading ? "Signing in…" : <>Sign in <ArrowRight size={16} className="mkt-arrow" /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}