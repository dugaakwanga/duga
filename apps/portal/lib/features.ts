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
    resources: ["classes"],
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
    roles: ["ADMIN", "PARENT", "STUDENT"],
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
    resources: ["applications"],
    roles: ["ADMIN"],
  },
  {
    id: "reports",
    label: "Reports & financials",
    group: "Operations",
    resources: ["reports"],
    roles: ["ADMIN"],
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
    id: "audit",
    label: "Audit log",
    group: "Administration",
    resources: ["audit"],
    roles: ["ADMIN"],
  },
];

export const FEATURE_BY_RESOURCE: Record<string, string> = {};
for (const f of FEATURES) for (const r of f.resources) FEATURE_BY_RESOURCE[r] = f.id;

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
  OWNER: ["ADMIN", "TEACHER", "PARENT", "STUDENT"],
  ADMIN: ["TEACHER", "PARENT", "STUDENT"],
};
