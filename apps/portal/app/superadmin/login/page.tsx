"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { postForm } from "@/lib/client/api";
import { siteHomeUrl } from "@/lib/client/site";
import { PasswordInput } from "@/components/PasswordInput";

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await postForm("/api/superadmin/login", { username, password });
    setLoading(false);
    if (!res.ok) {
      setError(res.error || "Login failed");
      return;
    }
    router.push("/superadmin/dashboard");
    router.refresh();
  }

  return (
    <div className="login-wrap">
      <div className="login-visual">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/group pupils.png" alt="" aria-hidden="true" />
        <div className="login-visual-content">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "#ffffff", textShadow: "0 1px 8px rgba(0,0,0,0.45)" }}>
            Platform Administration
          </span>
          <h2>
            Managing schools, <em>at a glance</em>
          </h2>
          <p>
            Subscription plans, school metrics and system logs — the full DUGA platform, in one console.
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
            <h1>Platform Admin Console</h1>
            <p>De Ultimate Glory Academy — super admin</p>
          </div>
          <form onSubmit={submit} autoComplete="off">
            <label className="duga-field__label">Username</label>
            <input className="duga-input" name="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" required />

            <label className="duga-field__label" style={{ marginTop: 14 }}>Password</label>
            <PasswordInput value={password} onChange={setPassword} autoComplete="off" name="password" />

            {error && <div className="duga-alert duga-alert--danger" style={{ marginTop: 14 }}>{error}</div>}

            <button className="duga-btn duga-btn--primary" type="submit" disabled={loading} style={{ width: "100%", marginTop: 18, justifyContent: "center" }}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
