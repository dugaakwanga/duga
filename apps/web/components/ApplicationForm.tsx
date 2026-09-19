"use client";

import { useState } from "react";
import { Field, Input, Select, Textarea, Button } from "@duga/ui";
import { portalUrl } from "@/lib/content";
import { useSiteContent } from "@/lib/use-site";
import type { ApplicationFieldDef } from "@/lib/site-data";

const LEVELS_PRIMARY = ["Nursery", "Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6"];
const LEVELS_SECONDARY = ["JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"];

function fieldByKey(fields: ApplicationFieldDef[], key: string): ApplicationFieldDef | undefined {
  return fields.find((f) => f.key === key && f.enabled);
}

function CustomField({
  def,
  value,
  onChange,
}: {
  def: ApplicationFieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={def.label} required={def.required}>
      {def.type === "textarea" ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} required={def.required} />
      ) : def.type === "select" ? (
        <Select value={value} onChange={(e) => onChange(e.target.value)} required={def.required}>
          <option value="">Select...</option>
          {(def.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </Select>
      ) : (
        <Input
          type={def.type === "date" ? "date" : def.type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={def.required}
        />
      )}
    </Field>
  );
}

export default function ApplicationForm() {
  const { applicationForm } = useSiteContent();
  const [section, setSection] = useState("SECONDARY");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [ref, setRef] = useState("");
  const [testPath, setTestPath] = useState("");
  const [error, setError] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  const levels = section === "PRIMARY" ? LEVELS_PRIMARY : LEVELS_SECONDARY;
  const f = (key: string) => fieldByKey(applicationForm, key);
  const emailField = f("email");
  const phoneField = f("phone");
  const sectionField = f("section");
  const levelField = f("levelApplied");
  const genderField = f("gender");
  const dobField = f("dateOfBirth");
  const prevSchoolField = f("previousSchool");
  const guardianNameField = f("guardianName");
  const guardianPhoneField = f("guardianPhone");
  const messageField = f("message");
  const customFields = applicationForm.filter((x) => !x.builtin && x.enabled);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const payload = {
      applicantName: String(data.get("applicantName") ?? ""),
      email: String(data.get("email") ?? ""),
      phone: String(data.get("phone") ?? ""),
      section,
      levelApplied: String(data.get("levelApplied") ?? ""),
      previousSchool: String(data.get("previousSchool") ?? ""),
      guardianName: String(data.get("guardianName") ?? ""),
      guardianPhone: String(data.get("guardianPhone") ?? ""),
      gender: String(data.get("gender") ?? ""),
      dateOfBirth: String(data.get("dateOfBirth") ?? ""),
      message: String(data.get("message") ?? ""),
      customFields: customValues,
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
      setTestPath(json.data?.testPath ?? "");
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
        {testPath && (
          <div style={{ marginTop: 16 }}>
            <p style={{ color: "var(--duga-ink-2)", marginBottom: 10 }}>
              You can also take the entrance test right now — no account needed.
            </p>
            <a href={`${portalUrl.replace(/\/$/, "")}${testPath}`} target="_blank" rel="noreferrer">
              <Button size="lg">Take the entrance test</Button>
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <form className="mkt-form-card" onSubmit={onSubmit}>
      <h3 style={{ marginBottom: 18 }}>Student Application Form</h3>
      <Field label="Applicant full name" required>
        <Input name="applicantName" required placeholder="e.g. Chiamaka Adewale" />
      </Field>
      <div className="duga-form-row">
        {emailField && (
          <Field label={emailField.label} required={emailField.required}>
            <Input name="email" type="email" required={emailField.required} placeholder="parent@example.com" />
          </Field>
        )}
        {phoneField && (
          <Field label={phoneField.label} required={phoneField.required}>
            <Input name="phone" required={phoneField.required} placeholder="+234 800 000 0000" />
          </Field>
        )}
      </div>
      {(sectionField || levelField) && (
        <div className="duga-form-row">
          {sectionField && (
            <Field label={sectionField.label} required={sectionField.required}>
              <Select name="section" value={section} onChange={(e) => setSection(e.target.value)} required={sectionField.required}>
                <option value="PRIMARY">Primary</option>
                <option value="SECONDARY">Secondary</option>
              </Select>
            </Field>
          )}
          {levelField && (
            <Field label={levelField.label} required={levelField.required}>
              <Select name="levelApplied" required={levelField.required}>
                {levels.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      )}
      {(genderField || dobField) && (
        <div className="duga-form-row">
          {genderField && (
            <Field label={genderField.label} required={genderField.required}>
              <Select name="gender" required={genderField.required}>
                <option value="">Select...</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </Select>
            </Field>
          )}
          {dobField && (
            <Field label={dobField.label} required={dobField.required}>
              <Input name="dateOfBirth" type="date" required={dobField.required} />
            </Field>
          )}
        </div>
      )}
      {prevSchoolField && (
        <Field label={prevSchoolField.label} required={prevSchoolField.required}>
          <Input name="previousSchool" required={prevSchoolField.required} placeholder="Name of previous school" />
        </Field>
      )}
      {(guardianNameField || guardianPhoneField) && (
        <div className="duga-form-row">
          {guardianNameField && (
            <Field label={guardianNameField.label} required={guardianNameField.required}>
              <Input name="guardianName" required={guardianNameField.required} placeholder="Parent or guardian full name" />
            </Field>
          )}
          {guardianPhoneField && (
            <Field label={guardianPhoneField.label} required={guardianPhoneField.required}>
              <Input name="guardianPhone" required={guardianPhoneField.required} placeholder="+234 800 000 0000" />
            </Field>
          )}
        </div>
      )}
      {customFields.map((cf) => (
        <CustomField
          key={cf.id}
          def={cf}
          value={customValues[cf.label] ?? ""}
          onChange={(v) => setCustomValues((c) => ({ ...c, [cf.label]: v }))}
        />
      ))}
      {messageField && (
        <Field label={messageField.label} required={messageField.required}>
          <Textarea name="message" required={messageField.required} placeholder="Anything else we should know?" />
        </Field>
      )}
      {status === "error" && <div className="duga-alert duga-alert--danger">{error}</div>}
      <Button type="submit" loading={status === "sending"} block size="lg">
        {status === "sending" ? "Submitting..." : "Submit Application"}
      </Button>
    </form>
  );
}
