import { assertPermission, type Permission, type Role } from "@duga/core";
import type { Ctx } from "@/app/api/v1/[...path]/route";
import { prisma, getSetting } from "@duga/core/server";
import type { Section } from "@/lib/sections";

export function sectionOf(v: unknown): Section | undefined {
  const s = str(v)?.trim();
  return s || undefined;
}

export function sectionArray(v: unknown): Section[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))];
}

export function isStaff(role: string): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "BURSAR" || role === "TEACHER";
}

// Distinct school sections a teacher is assigned to, derived from their classes.
// Explicit teacher sections are kept only when they match a school section the
// owner created (legacy free-form values like "PRIMARY"/"SECONDARY" are dropped).
export async function sectionsOfTeacher(teacherId: string): Promise<Section[]> {
  const [teacher, rows] = await Promise.all([
    prisma.teacher.findUnique({ where: { id: teacherId }, select: { sections: true, schoolId: true } }),
    prisma.classSubject.findMany({
    where: { teacherId },
    select: { classGroup: { select: { level: { select: { section: true } } } } },
    distinct: ["classGroupId"],
    }),
  ]);
  const fromClasses = rows.map((r) => r.classGroup.level.section);
  if (!teacher) return [...new Set(fromClasses)];
  const saved = await prisma.schoolSection.findMany({ where: { schoolId: teacher.schoolId }, select: { name: true } });
  const canonical = new Map(saved.map((s) => [s.name.trim().toLowerCase(), s.name]));
  const seen = new Set<string>();
  // Existing schools may have teachers created before explicit sections were
  // introduced. Keep their existing class assignments visible while new
  // assignments are always validated against the explicit setting.
  const explicit = sectionArray(teacher.sections)
    .map((s) => canonical.get(s.trim().toLowerCase()))
    .filter((s): s is string => !!s && !seen.has(s) && (seen.add(s), true));
  return [...new Set([...explicit, ...fromClasses])];
}

// Admin and bursar section assignments. A missing profile or empty assignment
// preserves the legacy full-school scope; an explicit assignment is restrictive.
// Only sections the owner actually created count — legacy free-form values
// (e.g. "PRIMARY"/"SECONDARY") and case-duplicates are filtered out and each
// value is normalised to the owner-created casing (e.g. "PRIMARY" -> "Primary")
// so section-scoped queries actually match the stored rows.
export async function sectionsOfAdmin(adminId: string, schoolId: string): Promise<Section[]> {
  const [admin, saved] = await Promise.all([
    prisma.admin.findFirst({ where: { id: adminId, schoolId }, select: { sections: true } }),
    prisma.schoolSection.findMany({ where: { schoolId }, select: { name: true } }),
  ]);
  const canonical = new Map(saved.map((s) => [s.name.trim().toLowerCase(), s.name]));
  const seen = new Set<string>();
  const assigned = sectionArray(admin?.sections)
    .map((s) => canonical.get(s.trim().toLowerCase()))
    .filter((s): s is string => !!s && !seen.has(s) && (seen.add(s), true));
  return assigned.length ? assigned : schoolSections(schoolId);
}

// Sections that actually have data in the school — used for the admin switcher.
export async function schoolSections(schoolId: string): Promise<Section[]> {
  const saved = await prisma.schoolSection.findMany({ where: { schoolId }, select: { name: true }, orderBy: [{ order: "asc" }, { name: "asc" }] });
  if (saved.length) return saved.map((section) => section.name);
  const rows = await prisma.classLevel.findMany({ where: { schoolId }, select: { section: true }, distinct: ["section"] });
  return rows.length ? rows.map((row) => row.section) : ["PRIMARY", "SECONDARY"];
}

// The effective section scope for a request:
// - OWNER/ADMIN/BURSAR: the `section` query/body value (validated), else all.
// - TEACHER: the requested section if they teach it, else their sole section, else all their classes.
// - STUDENT: their own section. PARENT: all linked children.
export async function resolveSection(ctx: Ctx): Promise<Section | undefined> {
  const role = ctx.session.user.role;
  if (role === "STUDENT") return sectionOf(ctx.session.user.student?.section);
  const asked = sectionOf(ctx.query.get("section") ?? ctx.body.section);
  if (role === "OWNER") return asked;
  if (role === "ADMIN" || role === "BURSAR") {
    const admin = ctx.session.user.admin;
    const secs = admin ? await sectionsOfAdmin(admin.id, ctx.session.user.schoolId) : await schoolSections(ctx.session.user.schoolId);
    if (asked && !secs.includes(asked)) {
      const err = new Error("This section is not assigned to your account") as Error & { status?: number };
      err.status = 403;
      throw err;
    }
    return asked ?? (secs.length === 1 ? secs[0] : undefined);
  }
  if (role === "TEACHER") {
    const teacher = ctx.session.user.teacher;
    if (!teacher) return undefined;
    const secs = await sectionsOfTeacher(teacher.id);
    if (asked && secs.includes(asked)) return asked;
    return secs.length === 1 ? secs[0] : undefined;
  }
  return undefined;
}

export function can(ctx: Ctx, permission: Permission): void {
  assertPermission(ctx.session.user.role as Role, permission);
}

export function isOwnerOrAdmin(ctx: Ctx): boolean {
  return ["OWNER", "ADMIN"].includes(ctx.session.user.role);
}

export function requireOwnerOrAdmin(ctx: Ctx): void {
  if (!isOwnerOrAdmin(ctx)) {
    const err = new Error("Only the proprietor or school admin can perform this action") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}

// Whether an account may view and manage school financials. The owner always
// can; an admin or bursar only when the owner explicitly granted them access.
export async function financeManager(ctx: Ctx): Promise<boolean> {
  const role = ctx.session.user.role;
  if (role === "OWNER") return true;
  const key = role === "ADMIN" ? "adminFinanceAccess" : role === "BURSAR" ? "bursarFinanceAccess" : null;
  if (!key) return false;
  const row = await prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId: ctx.session.user.schoolId, key } } });
  return row?.value === true || row?.value === "true";
}

// studentId scoping by role. For PARENT: all linked children; for STUDENT: self.
export async function studentScope(ctx: Ctx): Promise<{ studentId?: { in: string[] } }> {
  const role = ctx.session.user.role;
  if (role === "ADMIN" || role === "OWNER") return {};
  if (role === "STUDENT") {
    return { studentId: { in: [ctx.session.user.student?.id ?? "none"] } };
  }
  if (role === "PARENT") {
    const links = await prisma.studentParent.findMany({
      where: { parent: { userId: ctx.session.user.id } },
      select: { studentId: true },
    });
    return { studentId: { in: links.map((l) => l.studentId) } };
  }
  return {};
}

export function pick(body: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

// Verify a proposed email/phone does not already belong to another active user
// in the school. Deactivated (removed) accounts do not block reuse — their
// contacts can be taken again, e.g. when a former staff member is re-hired.
// Empty/null values are ignored so accounts may stay email-free.
export async function assertContactFree(
  schoolId: string,
  exceptUserId: string,
  email: string | null | undefined,
  phone: string | null | undefined,
): Promise<void> {
  const or: { email?: string; phone?: string }[] = [];
  if (email) or.push({ email });
  if (phone) or.push({ phone });
  if (or.length === 0) return;
  const clash = await prisma.user.findFirst({
    where: { schoolId, id: { not: exceptUserId }, status: { not: "DEACTIVATED" }, OR: or },
    select: { id: true },
  });
  if (clash) throw new Error("A user with this email or phone number already exists");
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

export function num(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

export function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

// Coerce a JSON value into a list of non-empty id strings.
export function idArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

export function strArray(v: unknown): string[] | undefined {
  const arr = idArray(v);
  return arr.length > 0 ? arr : undefined;
}

// Union of students found in the given class groups plus the explicitly
// named students — used to expand assignment/CTA targeting to concrete students.
export async function resolveTargetStudentIds(
  schoolId: string,
  classGroupIds: string[],
  studentIds: string[],
): Promise<string[]> {
  const classStudents = classGroupIds.length
    ? await prisma.student.findMany({
        where: { schoolId, currentClassGroupId: { in: classGroupIds }, status: "ACTIVE" },
        select: { id: true },
      })
    : [];
  const ids = new Set<string>();
  classStudents.forEach((s) => ids.add(s.id));
  studentIds.forEach((id) => ids.add(id));
  return [...ids];
}

// Role-aware scoping rules for student-consumable records: an item is visible to
// a student if it is global (no targets) OR the student/their class is a target.
export function isAssignedTo(
  item: { targetClassGroupIds?: string[] | unknown; targetStudentIds?: string[] | unknown },
  studentId: string,
  classGroupId?: string | null,
): boolean {
  const classes = idArray(item.targetClassGroupIds);
  const students = idArray(item.targetStudentIds);
  if (classes.length === 0 && students.length === 0) return true;
  if (students.includes(studentId)) return true;
  if (classGroupId && classes.includes(classGroupId)) return true;
  return false;
}

export function dayOfWeekNames(): string[] {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
}

export function gradeOfScore(score: number): string {
  if (score >= 75) return "A1";
  if (score >= 70) return "B2";
  if (score >= 65) return "B3";
  if (score >= 60) return "C4";
  if (score >= 55) return "C5";
  if (score >= 50) return "C6";
  if (score >= 45) return "D7";
  if (score >= 40) return "E8";
  return "F9";
}

// date-only helpers (UTC midnight) to avoid tz issues with SQLite/Postgres
export function todayUTC(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Per-child fee / access window helpers.
// The admin sets a fee amount and the number of days it covers when a child is
// enrolled. The app tracks the window (feePaidThrough) and computes how many
// days remain; once the window passes the student's portal access is locked.
// ---------------------------------------------------------------------------

export interface StudentFeeInfo {
  feeAmount: string;
  feeDays: number;
  feePaidThrough: string | null;
  usedDays: number;
  daysRemaining: number;
  expired: boolean;
}

export function feeInfoOf(student: { feeAmount: { toString(): string } | string | null; feeDays: number | null; feePaidThrough: Date | null; enrollmentDate: Date }): StudentFeeInfo {
  const amount = typeof student.feeAmount === "string" ? student.feeAmount : (student.feeAmount as { toString(): string })?.toString() ?? "0";
  const feeDays = student.feeDays ?? 0;
  const paidThrough = student.feePaidThrough;
  const start = paidThrough ? new Date(paidThrough.getTime() - feeDays * 86400000) : student.enrollmentDate;
  const now = Date.now();
  const end = paidThrough ? paidThrough.getTime() : now;
  const usedDays = Math.max(0, Math.floor((Math.min(now, end) - start.getTime()) / 86400000));
  const daysRemaining = paidThrough ? Math.max(0, Math.ceil((end - now) / 86400000)) : feeDays;
  // A configured fee plan requires a successful payment before access starts.
  // Schools which have not configured a plan (zero amount/days) remain ungated.
  const expired = feeDays > 0 && Number(amount) > 0 && (!paidThrough || now > end);
  return {
    feeAmount: amount,
    feeDays,
    feePaidThrough: paidThrough ? paidThrough.toISOString() : null,
    usedDays,
    daysRemaining,
    expired,
  };
}

// Which fee-gated features are currently blocked for owing students — admin
// configurable via Settings → Restrictions (schoolSetting key "restrictions",
// field feeGatedFeatures). Matches the historical hardcoded default so
// existing schools see no behavior change until they opt out of one.
export type FeeGatedFeature = "tests" | "assignments" | "elearn" | "games" | "live";
const DEFAULT_FEE_GATED_FEATURES: FeeGatedFeature[] = ["tests", "assignments", "elearn", "games", "live"];

async function isFeeGated(schoolId: string, feature: FeeGatedFeature): Promise<boolean> {
  const restrictions = await getSetting(schoolId, "restrictions");
  const list =
    restrictions && typeof restrictions === "object" && Array.isArray((restrictions as { feeGatedFeatures?: unknown }).feeGatedFeatures)
      ? ((restrictions as { feeGatedFeatures: unknown[] }).feeGatedFeatures as string[])
      : DEFAULT_FEE_GATED_FEATURES;
  return list.includes(feature);
}

// Throw 403 for STUDENT/PARENT callers when the child's fee window has lapsed
// AND the school has this specific feature configured as fee-gated.
export async function assertFeeAccess(
  schoolId: string,
  student: { feeAmount: { toString(): string } | string | null; feeDays: number | null; feePaidThrough: Date | null },
  feature: FeeGatedFeature,
): Promise<void> {
  const feeAmount = Number(student.feeAmount ?? 0);
  const configured = feeAmount > 0 && (student.feeDays ?? 0) > 0;
  const expired = configured && (!student.feePaidThrough || student.feePaidThrough.getTime() < Date.now());
  if (!expired) return;
  if (!(await isFeeGated(schoolId, feature))) return;
  const err = new Error(
    "Access suspended — payment is required or the school fee period has ended. Please contact the school to renew.",
  ) as Error & { status?: number };
  err.status = 403;
  throw err;
}

/**
 * Ensure the caller has a Teacher record so they can author content that is
 * attributed to a teacher (lesson notes, tests, live classes, e-learning,
 * games). TEACHER users already have one; OWNER/ADMIN users who manage content
 * without being classroom teachers get one auto-created the first time.
 */
export async function ensureTeacher(ctx: Ctx): Promise<NonNullable<Ctx["session"]["user"]["teacher"]>> {
  const existing = ctx.session.user.teacher;
  if (existing) return existing;
  const schoolId = ctx.session.user.schoolId;
  return prisma.teacher.create({
    data: {
      userId: ctx.session.user.id,
      schoolId,
      staffNumber: `ADM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      designation: ctx.session.user.role === "OWNER" ? "Proprietor" : "Administrator",
    },
  });
}
