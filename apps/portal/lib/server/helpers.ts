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
