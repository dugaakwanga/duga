"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  photoUrl?: string | null;
  mustChangePassword: boolean;
  teacherSignatureUrl?: string | null;
  adminDesignation?: string | null;
  adminSignatureUrl?: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState("");
  const [designation, setDesignation] = useState("");
  const [uploadingSig, setUploadingSig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const canEditPhoto = me ? me.role !== "STUDENT" : false;
  const photo = canEditPhoto ? avatarUrl : (me?.photoUrl ?? me?.avatarUrl ?? "");
  const isSignatory = me ? me.role === "TEACHER" || me.role === "ADMIN" || me.role === "OWNER" : false;
  const isPrincipalCandidate = me ? me.role === "ADMIN" || me.role === "OWNER" : false;

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
        setSignatureUrl(j.user.teacherSignatureUrl ?? j.user.adminSignatureUrl ?? "");
        setDesignation(j.user.adminDesignation ?? "");
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

  async function uploadSignature(file: File | undefined) {
    if (!file) return;
    setUploadingSig(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload?purpose=signature", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
      setSignatureUrl(json.data.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploadingSig(false);
    }
  }

  async function saveProfile() {
    setError(null);
    setSaved(false);
    try {
      const body: Record<string, unknown> = { firstName, lastName, phone, avatarUrl: avatarUrl || null };
      if (isSignatory) body.signatureUrl = signatureUrl || "";
      if (me?.role === "ADMIN" || me?.role === "OWNER") body.designation = designation || "";
      await api("profile", { method: "PATCH", body });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function changePassword() {
    setPwMsg(null);
    if (pw.newPassword.length < 8) {
      setPwMsg("New password must be at least 8 characters.");
      return;
    }
    if (pw.newPassword !== pw.confirmPassword) {
      setPwMsg("Passwords do not match.");
      return;
    }
    try {
      await api("profile/changePassword", { method: "POST", body: { currentPassword: pw.currentPassword, newPassword: pw.newPassword } });
      setPw({ currentPassword: "", newPassword: "", confirmPassword: "" });
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
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="Avatar" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--duga-border)" }} />
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
          {canEditPhoto ? (
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
          ) : (
            <Alert tone="info">Your profile photo is set by the school. Contact the office if it needs to change.</Alert>
          )}
          {isSignatory && (
            <>
              {isPrincipalCandidate && (
                <Field label="Designation" hint={'Printed on every report card — e.g. "Principal" or "Head Teacher". The admin whose designation contains "Principal" is used as the school-wide signatory.'}>
                  <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Principal" />
                </Field>
              )}
              <Field
                label="Signature"
                hint={
                  me.role === "TEACHER"
                    ? "Uploaded once, auto-attached to every report card for your class."
                    : "Uploaded once, auto-attached to every report card school-wide if your designation above is Principal."
                }
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {signatureUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={signatureUrl} alt="Signature" style={{ height: 40, maxWidth: 140, objectFit: "contain", border: "1px solid var(--duga-border)", borderRadius: 6, background: "#fff" }} />
                  )}
                  <label className="duga-btn duga-btn--outline duga-btn--sm" style={{ flexShrink: 0, cursor: "pointer", margin: 0 }}>
                    <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(e) => uploadSignature(e.target.files?.[0])} />
                    {uploadingSig ? "Uploading…" : "Upload"}
                  </label>
                  {signatureUrl && (
                    <Button variant="ghost" size="sm" onClick={() => setSignatureUrl("")} style={{ flexShrink: 0 }}>Remove</Button>
                  )}
                </div>
              </Field>
            </>
          )}
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
          <Field label="Confirm new password">
            <Input type="password" value={pw.confirmPassword} onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })} />
          </Field>
          {pwMsg && <Alert tone={pwMsg.includes("successfully") ? "success" : "danger"}>{pwMsg}</Alert>}
          <Button onClick={changePassword} style={{ marginTop: 14 }}>Update password</Button>
        </Card>
      </div>
    </div>
  );
}
