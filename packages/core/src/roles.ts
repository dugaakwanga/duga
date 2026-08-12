// ----------------------------------------------------------------------------
// RBAC — role model and permission matrix.
// Enforced at the API layer (every server handler checks permissions), never
// only in the UI.
// ----------------------------------------------------------------------------

export type Role = "OWNER" | "ADMIN" | "BURSAR" | "TEACHER" | "PARENT" | "STUDENT";

export const ROLES: Role[] = ["OWNER", "ADMIN", "BURSAR", "TEACHER", "PARENT", "STUDENT"];

export type Permission =
  // Students
  | "students:view"
  | "students:manage"
  | "students:promote"
  // Staff
  | "staff:view"
  | "staff:manage"
  // Classes / subjects
  | "classes:view"
  | "classes:manage"
  | "subjects:view"
  | "subjects:manage"
  // Learning
  | "learning:manage" // notes, assignments, tests for owned classes
  | "learning:view"
  | "assignments:submit"
  | "tests:take"
  | "learning:grade"
  | "live:schedule"
  | "live:join"
  // Attendance
  | "attendance:take"
  | "attendance:view"
  | "staff:clock"
  | "staff:attendance:view"
  // Results
  | "results:enter"
  | "results:view"
  | "results:publish"
  | "reportcards:view"
  // Fees
  | "fees:view"
  | "fees:manage"
  | "fees:collect"
  | "payments:make"
  | "overrides:manage"
  // Messaging / announcements
  | "messaging:use"
  | "announcements:view"
  | "announcements:manage"
  // Hostel
  | "hostel:view"
  | "hostel:manage"
  // Timetable
  | "timetable:view"
  | "timetable:manage"
  // Transport
  | "transport:view"
  | "transport:manage"
  // Reports / financials (owner-level)
  | "reports:view"
  | "financials:view"
  | "payroll:view"
  | "payroll:manage"
  // Settings / subscription
  | "settings:manage"
  // Applications (admissions inbox)
  | "applications:view"
  | "applications:manage"
  // Website content (gallery + news managed from the portal)
  | "gallery:manage"
  | "news:manage"
  | "content:manage"
  // Teacher digital classroom (online content + educational games)
  | "elearn:manage"
  | "elearn:view"
  | "games:manage"
  | "games:play"
  // PTA
  | "pta:view"
  | "pta:manage"
  // Library
  | "library:view"
  | "library:manage"
  // Audit
  | "audit:view";

export const PERMISSIONS: Permission[] = [
  "students:view",
  "students:manage",
  "students:promote",
  "staff:view",
  "staff:manage",
  "classes:view",
  "classes:manage",
  "subjects:view",
  "subjects:manage",
  "learning:manage",
  "learning:view",
  "assignments:submit",
  "tests:take",
  "learning:grade",
  "live:schedule",
  "live:join",
  "attendance:take",
  "attendance:view",
  "staff:clock",
  "staff:attendance:view",
  "results:enter",
  "results:view",
  "results:publish",
  "reportcards:view",
  "fees:view",
  "fees:manage",
  "fees:collect",
  "payments:make",
  "overrides:manage",
  "messaging:use",
  "announcements:view",
  "announcements:manage",
  "hostel:view",
  "hostel:manage",
  "timetable:view",
  "timetable:manage",
  "transport:view",
  "transport:manage",
  "reports:view",
  "financials:view",
  "payroll:view",
  "payroll:manage",
  "settings:manage",
  "applications:view",
  "applications:manage",
  "gallery:manage",
  "news:manage",
  "content:manage",
  "elearn:manage",
  "elearn:view",
  "games:manage",
  "games:play",
  "pta:view",
  "pta:manage",
  "library:view",
  "library:manage",
  "audit:view",
];

const rolePermissions: Record<Role, Permission[]> = {
  OWNER: [
    ...PERMISSIONS.filter((p) => p !== "overrides:manage"), // owner has it too, listed below
  ],
  ADMIN: [
    "students:view",
    "students:manage",
    "students:promote",
    "staff:view",
    "staff:manage",
    "classes:view",
    "classes:manage",
    "subjects:view",
    "subjects:manage",
    "learning:manage",
    "learning:view",
    "learning:grade",
    "live:schedule",
    "live:join",
    "attendance:take",
    "attendance:view",
    "staff:attendance:view",
    "results:enter",
    "results:view",
    "results:publish",
    "reportcards:view",
    "fees:view",
    "fees:manage",
    "fees:collect",
    "overrides:manage",
    "messaging:use",
    "announcements:view",
    "announcements:manage",
    "hostel:view",
    "hostel:manage",
    "timetable:view",
    "timetable:manage",
    "transport:view",
    "transport:manage",
    "applications:view",
    "applications:manage",
    "gallery:manage",
    "news:manage",
    "content:manage",
    "audit:view",
    "staff:clock",
    "pta:view",
    "pta:manage",
    "library:view",
    "library:manage",
    "elearn:manage",
    "elearn:view",
    "games:manage",
    "games:play",
  ],
  // Bursar access is intentionally limited to finance. The owner can narrow
  // this further through the bursar permission setting in Payroll.
  BURSAR: ["fees:view", "fees:manage", "fees:collect", "financials:view", "payroll:view", "payroll:manage"],
  TEACHER: [
    "learning:manage",
    "learning:view",
    "assignments:submit",
    "tests:take",
    "learning:grade",
    "live:schedule",
    "live:join",
    "attendance:take",
    "attendance:view",
    "results:enter",
    "results:view",
    "messaging:use",
    "announcements:view",
    "timetable:view",
    "staff:clock",
    "classes:view",
    "subjects:view",
    "reportcards:view",
    "elearn:manage",
    "elearn:view",
    "games:manage",
    "games:play",
    "library:view",
  ],
  PARENT: [
    "students:view",
    "learning:view",
    "attendance:view",
    "results:view",
    "reportcards:view",
    "fees:view",
    "payments:make",
    "messaging:use",
    "announcements:view",
    "timetable:view",
    "hostel:view",
    "transport:view",
    "live:join",
    "tests:take",
    "assignments:submit",
    "elearn:view",
    "games:play",
    "pta:view",
    "library:view",
  ],
  STUDENT: [
    "learning:view",
    "assignments:submit",
    "tests:take",
    "live:join",
    "attendance:view",
    "results:view",
    "reportcards:view",
    "fees:view",
    "payments:make",
    "messaging:use",
    "announcements:view",
    "timetable:view",
    "hostel:view",
    "transport:view",
    "elearn:view",
    "games:play",
    "pta:view",
    "library:view",
  ],
};

// Owner gets every permission.
rolePermissions.OWNER = [...PERMISSIONS] as Permission[];

export function hasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}

export function permissionsFor(role: Role): Permission[] {
  return rolePermissions[role] ?? [];
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to perform this action") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new ForbiddenError();
  }
}

// Portal routes are only accessible to school roles.
export const isSchoolRole = (role: string): role is Role =>
  ROLES.includes(role as Role);
