import { assertPermission, type Permission, type Role } from "@duga/core";
import type { Ctx } from "@/app/api/v1/[...path]/route";
import { prisma } from "@duga/core/server";

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

// Throw 403 for STUDENT/PARENT callers when the child's fee window has lapsed.
export function assertFeeAccess(student: { feeAmount: { toString(): string } | string | null; feeDays: number | null; feePaidThrough: Date | null }): void {
  const feeAmount = Number(student.feeAmount ?? 0);
  const configured = feeAmount > 0 && (student.feeDays ?? 0) > 0;
  if (configured && (!student.feePaidThrough || student.feePaidThrough.getTime() < Date.now())) {
    const err = new Error(
      "Access suspended — payment is required or the school fee period has ended. Please contact the school to renew.",
    ) as Error & { status?: number };
    err.status = 403;
    throw err;
  }
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
