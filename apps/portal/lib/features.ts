// ---------------------------------------------------------------------------
// App feature registry — every function the platform offers, grouped the way
// the portal navigation groups them. Superadmin can disable features per
// school; the owner decides what the admin sees; the admin decides what
// teachers and students see. Disabling never deletes data — it only hides
// the function (the API blocks it too, server-side).
// ---------------------------------------------------------------------------

import type { Role } from "@duga/core";

export interface FeatureDef {
  id: string;
  label: string;
  group: string;
  /** Which API resources belong to this feature (server enforcement). */
  resources: string[];
  /** Roles that use this feature by default (owner is always all-access). */
  roles: Role[];
  /** Optional finer-grained sub-features the superadmin can switch off on top of the whole feature. */
  subfeatures?: SubFeatureDef[];
}

export interface SubFeatureDef {
  /** Fully-qualified sub-feature id, e.g. "learning:cbt". */
  id: string;
  label: string;
  hint?: string;
  /** Parent feature id when this sub-feature lives under a single feature. */
  feature?: string;
  /** Group heading in the superadmin UI (defaults to the feature's group). */
  group?: string;
}

export const FEATURES: FeatureDef[] = [
  {
    id: "students",
    label: "Students",
    group: "Academics",
    resources: ["students"],
    roles: ["ADMIN", "TEACHER", "PARENT", "STUDENT"],
  },
  {
    id: "classes",
    label: "Classes & subjects",
    group: "Academics",
    resources: ["classes", "promotion"],
    roles: ["ADMIN", "TEACHER", "PARENT", "STUDENT"],
  },
  {
    id: "timetable",
    label: "Timetable",
    group: "Academics",
    resources: ["timetable"],
    roles: ["ADMIN", "TEACHER", "PARENT", "STUDENT"],
  },
  {
    id: "attendance",
    label: "Attendance",
    group: "Academics",
    resources: ["attendance"],
    roles: ["ADMIN", "TEACHER", "PARENT", "STUDENT"],
  },
  {
    id: "results",
    label: "Results & report cards",
    group: "Academics",
    resources: ["results"],
    roles: ["ADMIN", "TEACHER", "PARENT", "STUDENT"],
  },
  {
    id: "learning",
    label: "Learning (notes, assignments, CBT)",
    group: "Academics",
    resources: ["learning", "teacher"],
    roles: ["ADMIN", "TEACHER", "PARENT", "STUDENT"],
    subfeatures: [
      { id: "learning:notes", label: "Lesson notes", hint: "Teachers' daily notes shared with students." },
      { id: "learning:assignments", label: "Assignments", hint: "Assignments, submissions and grading." },
      { id: "learning:cbt", label: "CBT / tests", hint: "Computer-based tests and exams." },
      { id: "learning:live", label: "Live classes", hint: "Live video classes." },
    ],
  },
  {
    id: "elearn",
    label: "E-Learning & rewards",
    group: "Academics",
    resources: ["elearn"],
    roles: ["ADMIN", "TEACHER", "PARENT", "STUDENT"],
  },
  {
    id: "games",
    label: "Educational games",
    group: "Academics",
    resources: ["games"],
    roles: ["ADMIN", "TEACHER", "PARENT", "STUDENT"],
  },
  {
    id: "fees",
    label: "Fees & payments",
    group: "Operations",
    resources: ["fees"],
    roles: ["BURSAR", "PARENT", "STUDENT"],
  },
  {
    id: "hostel",
    label: "Hostel",
    group: "Operations",
    resources: ["hostel"],
    roles: ["ADMIN", "PARENT", "STUDENT"],
  },
  {
    id: "transport",
    label: "Transport",
    group: "Operations",
    resources: ["transport"],
    roles: ["ADMIN", "PARENT", "STUDENT"],
  },
  {
    id: "applications",
    label: "Admissions",
    group: "Operations",
    resources: ["applications", "admissionsTest"],
    roles: ["ADMIN"],
  },
  {
    id: "pta",
    label: "Parent-Teacher Association",
    group: "Operations",
    resources: ["pta"],
    roles: ["ADMIN", "PARENT", "STUDENT"],
  },
  {
    id: "library",
    label: "Library",
    group: "Operations",
    resources: ["library"],
    roles: ["ADMIN", "TEACHER", "PARENT", "STUDENT"],
  },
  {
    id: "ai",
    label: "AI assistant",
    group: "Academics",
    resources: ["ai"],
    roles: ["ADMIN", "BURSAR", "TEACHER", "PARENT", "STUDENT"],
  },
  {
    id: "reports",
    label: "Reports & financials",
    group: "Operations",
    resources: ["reports"],
    roles: ["BURSAR"],
  },
  {
    id: "payroll",
    label: "Payroll",
    group: "Operations",
    resources: ["payroll"],
    roles: ["BURSAR"],
  },
  {
    id: "messaging",
    label: "Messages & notifications",
    group: "Communication",
    resources: ["messages"],
    roles: ["ADMIN", "TEACHER", "PARENT", "STUDENT"],
  },
  {
    id: "content",
    label: "Website content",
    group: "Website",
    resources: ["content", "gallery", "news"],
    roles: ["ADMIN"],
  },
  {
    id: "staff",
    label: "Staff management",
    group: "Administration",
    resources: ["staff"],
    roles: ["ADMIN"],
  },
  {
    id: "settings",
    label: "School settings",
    group: "Administration",
    resources: ["settings"],
    roles: ["ADMIN"],
  },
  {
    id: "security",
    label: "Gate & security",
    group: "Administration",
    resources: ["security"],
    roles: ["ADMIN"],
  },
  {
    id: "audit",
    label: "Audit log",
    group: "Administration",
    resources: ["audit"],
    roles: ["ADMIN"],
  },
];

export const FEATURE_BY_RESOURCE: Record<string, string> = {};
for (const f of FEATURES) for (const r of f.resources) FEATURE_BY_RESOURCE[r] = f.id;

/**
 * Global sub-features that are not tied to a single portal feature but still
 * narrow the platform for a whole school (superadmin-controlled).
 */
export const GLOBAL_SUBFEATURES: SubFeatureDef[] = [
  {
    id: "finance",
    label: "Finance",
    hint: "Master switch: when off, all finance-touching functions (fees, payments, reports, financial columns) are hidden and API-blocked for every role.",
    group: "Student environment",
  },
];

/** Every sub-feature in the platform (feature-nested ones plus global ones). */
export const SUBFEATURES: SubFeatureDef[] = [
  ...FEATURES.flatMap((f) => (f.subfeatures ?? []).map((s) => ({ ...s }))),
  ...GLOBAL_SUBFEATURES,
];

export const SUBFEATURE_BY_ID: Record<string, SubFeatureDef> = {};
for (const s of SUBFEATURES) SUBFEATURE_BY_ID[s.id] = s;

/** Sub-feature id that gates a given resource, if any (e.g. fees -> finance). */
export const SUBFEATURE_BY_RESOURCE: Record<string, string> = {
  fees: "finance",
  reports: "finance",
  payroll: "finance",
};

export function subfeatureById(id: string): SubFeatureDef | undefined {
  return SUBFEATURE_BY_ID[id];
}

export function featureById(id: string): FeatureDef | undefined {
  return FEATURES.find((f) => f.id === id);
}

/** Feature ids a role is allowed to use by default (OWNER = everything). */
export function defaultFeaturesFor(role: Role): string[] {
  if (role === "OWNER") return FEATURES.map((f) => f.id);
  return FEATURES.filter((f) => f.roles.includes(role)).map((f) => f.id);
}

/** Roles that can be configured by a given role (who configures whom). */
export const CONFIGURES: Partial<Record<Role, Role[]>> = {
  OWNER: ["ADMIN", "BURSAR", "TEACHER", "PARENT", "STUDENT"],
  ADMIN: ["TEACHER", "PARENT", "STUDENT"],
};
