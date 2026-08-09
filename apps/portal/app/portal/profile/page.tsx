"use client";

import { useEffect, useState } from "react";
import { Card, PageHeader, Field, Input, Button, Alert, Spinner, Badge } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Me {
  id: string;
  schoolId: string;
  role: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  mustChangePassword: boolean;
}

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || "Not authenticated");
        setMe(j.user);
        setPhone(j.user.phone ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!me) return <Spinner size={28} />;

  async function saveProfile() {
    setError(null);
    setSaved(false);
    try {
      await api("profile", { method: "PATCH", body: { phone } });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function changePassword() {
    setPwMsg(null);
    try {
      await api("profile/changePassword", { method: "POST", body: pw });
      setPw({ currentPassword: "", newPassword: "" });
      setPwMsg("Password updated successfully.");
    } catch (e) {
      setPwMsg((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader title="My profile" subtitle="Manage your account details." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 }}>
        <Card title="Account">
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{me.name}</div>
            <Badge tone="accent">{me.role.toLowerCase()}</Badge>
            <div style={{ fontSize: 13, color: "var(--duga-muted)", marginTop: 6 }}>{me.email}</div>
          </div>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 000 0000" />
          </Field>
          {saved && <Alert tone="success">Profile updated.</Alert>}
          {error && <Alert tone="danger">{error}</Alert>}
          <Button onClick={saveProfile} style={{ marginTop: 14 }}>Save changes</Button>
        </Card>

        <Card title="Change password">
          {me.mustChangePassword && <Alert tone="warning">You must change your password on first login.</Alert>}
          <Field label="Current password">
            <Input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </Field>
          <Field label="New password">
            <Input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </Field>
          {pwMsg && <Alert tone={pwMsg.includes("successfully") ? "success" : "danger"}>{pwMsg}</Alert>}
          <Button onClick={changePassword} style={{ marginTop: 14 }}>Update password</Button>
        </Card>
      </div>
    </div>
  );
}
