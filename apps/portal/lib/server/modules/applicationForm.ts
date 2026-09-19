import { prisma, logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str } from "../helpers";

const FORM_KEY = "applicationForm";

export type ApplicationFieldType = "text" | "email" | "tel" | "textarea" | "select" | "date";

export interface ApplicationFieldDef {
  id: string;
  key: string;
  label: string;
  type: ApplicationFieldType;
  required: boolean;
  options?: string[];
  builtin: boolean;
  enabled: boolean;
}

// The form as it exists today — every applicant sees exactly this, in this
// order, until an admin changes it. applicantName/email/phone are locked
// required+enabled because /api/public/apply rejects a submission without
// them; section/levelApplied are locked enabled because the applicant form's
// section -> level cascade is wired to those two keys specifically.
export const DEFAULT_APPLICATION_FORM: ApplicationFieldDef[] = [
  { id: "f-applicantName", key: "applicantName", label: "Applicant full name", type: "text", required: true, builtin: true, enabled: true },
  { id: "f-email", key: "email", label: "Email", type: "email", required: true, builtin: true, enabled: true },
  { id: "f-phone", key: "phone", label: "Phone", type: "tel", required: true, builtin: true, enabled: true },
  { id: "f-section", key: "section", label: "Section applying for", type: "select", required: true, options: ["PRIMARY", "SECONDARY"], builtin: true, enabled: true },
  { id: "f-levelApplied", key: "levelApplied", label: "Class / level", type: "select", required: true, builtin: true, enabled: true },
  { id: "f-gender", key: "gender", label: "Gender", type: "select", required: false, options: ["MALE", "FEMALE"], builtin: true, enabled: true },
  { id: "f-dateOfBirth", key: "dateOfBirth", label: "Date of birth", type: "date", required: false, builtin: true, enabled: true },
  { id: "f-previousSchool", key: "previousSchool", label: "Previous school (if any)", type: "text", required: false, builtin: true, enabled: true },
  { id: "f-guardianName", key: "guardianName", label: "Guardian / parent name", type: "text", required: true, builtin: true, enabled: true },
  { id: "f-guardianPhone", key: "guardianPhone", label: "Guardian / parent phone", type: "tel", required: true, builtin: true, enabled: true },
  { id: "f-message", key: "message", label: "Additional notes", type: "textarea", required: false, builtin: true, enabled: true },
];

// Keys that stay locked required+enabled no matter what an admin saves,
// because the public /api/public/apply endpoint hard-requires them.
const ALWAYS_REQUIRED_KEYS = new Set(["applicantName", "email", "phone"]);
const ALWAYS_ENABLED_KEYS = new Set(["applicantName", "email", "phone", "section", "levelApplied"]);
const FIELD_TYPES: ApplicationFieldType[] = ["text", "email", "tel", "textarea", "select", "date"];

function slugify(label: string): string {
  const base = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || "field";
}

function sanitizeField(raw: unknown, usedKeys: Set<string>): ApplicationFieldDef | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const builtin = src.builtin === true;
  const label = str(src.label)?.slice(0, 120) ?? "";
  if (!label) return null;

  let key = builtin ? str(src.key) ?? "" : "";
  if (!key) {
    const base = slugify(label);
    key = base;
    let n = 2;
    while (usedKeys.has(key)) key = `${base}_${n++}`;
  }
  if (!builtin && usedKeys.has(key)) return null;
  usedKeys.add(key);

  const type: ApplicationFieldType = FIELD_TYPES.includes(src.type as ApplicationFieldType) ? (src.type as ApplicationFieldType) : "text";
  const options = type === "select" && Array.isArray(src.options)
    ? src.options.map(String).map((o) => o.trim()).filter(Boolean)
    : undefined;

  return {
    id: str(src.id) ?? `f-${key}`,
    key,
    label,
    type,
    required: ALWAYS_REQUIRED_KEYS.has(key) ? true : src.required === true,
    options,
    builtin,
    enabled: ALWAYS_ENABLED_KEYS.has(key) ? true : src.enabled !== false,
  };
}

export function normalizeApplicationForm(value: unknown): ApplicationFieldDef[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_APPLICATION_FORM;
  const usedKeys = new Set<string>();
  const fields = value.map((f) => sanitizeField(f, usedKeys)).filter((f): f is ApplicationFieldDef => !!f);
  // Every builtin key that was dropped by a bad save is restored at the end,
  // disabled rather than lost outright, so a save can never silently make a
  // structurally-required key (e.g. applicantName) disappear.
  for (const def of DEFAULT_APPLICATION_FORM) {
    if (!fields.some((f) => f.key === def.key)) fields.push({ ...def, enabled: ALWAYS_ENABLED_KEYS.has(def.key) });
  }
  return fields;
}

export async function loadApplicationForm(schoolId: string): Promise<ApplicationFieldDef[]> {
  const row = await prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId, key: FORM_KEY } } });
  return normalizeApplicationForm(row?.value);
}

export const applicationFormModule: Module = {
  async list(ctx) {
    can(ctx, "content:manage");
    return { fields: await loadApplicationForm(ctx.session.user.schoolId) };
  },

  actions: {
    save: async (ctx) => {
      can(ctx, "content:manage");
      const schoolId = ctx.session.user.schoolId;
      const fields = normalizeApplicationForm(ctx.body.fields);
      const row = await prisma.schoolSetting.upsert({
        where: { schoolId_key: { schoolId, key: FORM_KEY } },
        update: { value: fields as never },
        create: { schoolId, key: FORM_KEY, value: fields as never },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "applicationForm.updated", entityType: "SchoolSetting", entityId: row.id });
      return { fields };
    },

    reset: async (ctx) => {
      can(ctx, "content:manage");
      const schoolId = ctx.session.user.schoolId;
      await prisma.schoolSetting.deleteMany({ where: { schoolId, key: FORM_KEY } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "applicationForm.reset", entityType: "SchoolSetting", entityId: schoolId });
      return { fields: DEFAULT_APPLICATION_FORM };
    },
  },
};
