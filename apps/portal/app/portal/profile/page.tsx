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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
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
        setFirstName(j.user.firstName ?? "");
        setLastName(j.user.lastName ?? "");
        setPhone(j.user.phone ?? "");
        setAvatarUrl(j.user.avatarUrl ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!me) return <Spinner size={28} />;

  async function uploadAvatar(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload?purpose=avatar", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
      setAvatarUrl(json.data.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile() {
    setError(null);
    setSaved(false);
    try {
      await api("profile", { method: "PATCH", body: { firstName, lastName, phone, avatarUrl: avatarUrl || null } });
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
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Avatar" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--duga-border)" }} />
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg, var(--duga-teal), var(--duga-sky))", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 20 }}>
                {me.name
                  .split(" ")
                  .map((w) => w[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{firstName || lastName ? `${firstName} ${lastName}`.trim() : me.name}</div>
              <Badge tone="accent">{me.role.toLowerCase()}</Badge>
              <div style={{ fontSize: 13, color: "var(--duga-muted)", marginTop: 4 }}>{me.email}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="First name">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
            </Field>
            <Field label="Last name">
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
            </Field>
          </div>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 000 0000" />
          </Field>
          <Field label="Profile photo">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="Paste image URL or upload" />
              <label className="duga-btn duga-btn--outline duga-btn--sm" style={{ flexShrink: 0, cursor: "pointer", margin: 0 }}>
                <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(e) => uploadAvatar(e.target.files?.[0])} />
                {uploading ? "Uploading…" : "Upload"}
              </label>
              {avatarUrl && (
                <Button variant="ghost" size="sm" onClick={() => setAvatarUrl("")} style={{ flexShrink: 0 }}>Remove</Button>
              )}
            </div>
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
