"use client";

import { useState } from "react";
import { Field, Input, Select, Textarea, Button } from "@duga/ui";

interface ApplyForm {
  applicantName: string;
  email: string;
  phone: string;
  section: string;
  levelApplied: string;
  previousSchool: string;
  guardianName: string;
  guardianPhone: string;
  gender: string;
  dateOfBirth: string;
  message: string;
}

const LEVELS_PRIMARY = ["Nursery", "Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6"];
const LEVELS_SECONDARY = ["JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"];

export default function ApplicationForm() {
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001";
  const [section, setSection] = useState("SECONDARY");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");

  const levels = section === "PRIMARY" ? LEVELS_PRIMARY : LEVELS_SECONDARY;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const payload: ApplyForm = {
      applicantName: String(data.get("applicantName")),
      email: String(data.get("email")),
      phone: String(data.get("phone")),
      section,
      levelApplied: String(data.get("levelApplied")),
      previousSchool: String(data.get("previousSchool") ?? ""),
      guardianName: String(data.get("guardianName") ?? ""),
      guardianPhone: String(data.get("guardianPhone") ?? ""),
      gender: String(data.get("gender") ?? ""),
      dateOfBirth: String(data.get("dateOfBirth") ?? ""),
      message: String(data.get("message") ?? ""),
    };
    setStatus("sending");
    setError("");
    try {
      const res = await fetch(`${portalUrl}/api/public/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Request failed");
      setRef(json.data?.id ?? json.reference ?? "");
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Application could not be submitted.");
    }
  }

  if (status === "sent") {
    return (
      <div className="mkt-form-card">
        <div className="duga-alert duga-alert--success" style={{ marginBottom: 16 }}>
          Your application has been received successfully!
        </div>
        <p style={{ color: "var(--duga-ink-2)" }}>
          {ref ? <>Your application reference is <strong>{ref}</strong>. </> : null}
          Our admissions team will contact you shortly to schedule an assessment.
        </p>
      </div>
    );
  }

  return (
    <form className="mkt-form-card" onSubmit={onSubmit}>
      <h3 style={{ marginBottom: 18 }}>Student Application Form</h3>
      <Field label="Applicant full name" required>
        <Input name="applicantName" required placeholder="e.g. Chiamaka Adewale" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label="Email" required>
          <Input name="email" type="email" required placeholder="parent@example.com" />
        </Field>
        <Field label="Phone" required>
          <Input name="phone" required placeholder="+234 800 000 0000" />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label="Section applying for" required>
          <Select
            name="section"
            value={section}
            onChange={(e) => setSection(e.target.value)}
            required
          >
            <option value="PRIMARY">Primary</option>
            <option value="SECONDARY">Secondary</option>
          </Select>
        </Field>
        <Field label="Class / level" required>
          <Select name="levelApplied" required>
            {levels.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label="Gender">
          <Select name="gender">
            <option value="">Select...</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </Select>
        </Field>
        <Field label="Date of birth">
          <Input name="dateOfBirth" type="date" />
        </Field>
      </div>
      <Field label="Previous school (if any)">
        <Input name="previousSchool" placeholder="Name of previous school" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label="Guardian / parent name" required>
          <Input name="guardianName" required placeholder="Parent or guardian full name" />
        </Field>
        <Field label="Guardian / parent phone" required>
          <Input name="guardianPhone" required placeholder="+234 800 000 0000" />
        </Field>
      </div>
      <Field label="Additional notes">
        <Textarea name="message" placeholder="Anything else we should know?" />
      </Field>
      {status === "error" && <div className="duga-alert duga-alert--danger">{error}</div>}
      <Button type="submit" loading={status === "sending"} block size="lg">
        {status === "sending" ? "Submitting..." : "Submit Application"}
      </Button>
    </form>
  );
}
