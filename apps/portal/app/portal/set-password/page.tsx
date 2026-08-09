"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, Input, Button, Alert, Spinner } from "@duga/ui";
import { api } from "@/lib/client/api";

export default function SetPasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [mustChange, setMustChange] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) {
          router.replace("/login");
          return;
        }
        setMustChange(!!j.user.mustChangePassword);
        if (!j.user.mustChangePassword) router.replace("/portal/dashboard");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (pw !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setSaving(true);
    try {
      await api("profile/setPassword", { method: "POST", body: { newPassword: pw } });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner size={28} />;
  if (!mustChange) return null;

  return (
    <div style={{ maxWidth: 460, margin: "40px auto" }}>
      <Card title="Set your password">
        <div style={{ fontSize: 13.5, color: "var(--duga-muted)", marginBottom: 16 }}>
          This is your first login. Please choose the password you want to use from now on.
        </div>
        {done ? (
          <div>
            <Alert tone="success">Password set. You&apos;re all set.</Alert>
            <Button onClick={() => router.push("/portal/dashboard")} style={{ marginTop: 14 }}>Go to dashboard</Button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <Field label="New password">
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" required />
            </Field>
            <Field label="Confirm password">
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat your password" required />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" loading={saving} block style={{ marginTop: 14 }}>Set password</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
