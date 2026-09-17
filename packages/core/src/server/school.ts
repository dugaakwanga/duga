import { prisma } from "./prisma";

export async function getActiveSession(schoolId: string) {
  return prisma.academicSession.findFirst({
    where: { schoolId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}

export async function getActiveTerm(schoolId: string) {
  return prisma.term.findFirst({
    where: { schoolId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCurrentTerm() {
  // Convenience: first active term in the whole platform (single-school dev).
  return prisma.term.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
}

// A section-specific default grading scheme (section = e.g. "Primary") is
// preferred; the school-wide default (section = "") is the fallback.
export async function getDefaultGradingScale(schoolId: string, section?: string) {
  const scheme = section
    ? (await prisma.gradingScheme.findFirst({ where: { schoolId, section, isDefault: true } })) ??
      (await prisma.gradingScheme.findFirst({ where: { schoolId, section: "", isDefault: true } }))
    : await prisma.gradingScheme.findFirst({ where: { schoolId, section: "", isDefault: true } });
  if (!scheme) {
    // fallback WAEC-ish scale
    return [
      { min: 75, max: 100, grade: "A1", remark: "Excellent", gp: 8 },
      { min: 70, max: 74, grade: "B2", remark: "Very Good", gp: 7 },
      { min: 65, max: 69, grade: "B3", remark: "Good", gp: 6 },
      { min: 60, max: 64, grade: "C4", remark: "Credit", gp: 5 },
      { min: 55, max: 59, grade: "C5", remark: "Credit", gp: 4 },
      { min: 50, max: 54, grade: "C6", remark: "Credit", gp: 3 },
      { min: 45, max: 49, grade: "D7", remark: "Pass", gp: 2 },
      { min: 40, max: 44, grade: "E8", remark: "Pass", gp: 1 },
      { min: 0, max: 39, grade: "F9", remark: "Fail", gp: 0 },
    ];
  }
  return (scheme.scale as Array<{ min: number; max: number; grade: string; remark: string; gp: number }>) ?? [];
}

export async function getSchool(schoolId: string) {
  return prisma.school.findUnique({ where: { id: schoolId } });
}

export async function getSetting(schoolId: string, key: string): Promise<unknown | null> {
  const row = await prisma.schoolSetting.findUnique({
    where: { schoolId_key: { schoolId, key } },
  });
  return row?.value ?? null;
}

// ---------------------------------------------------------------------------
// Per-child fee / access window.
// The bursar sets a fee amount and a start/end date (typically a term's
// dates) when billing a child. The covered-through date (feePaidThrough) is
// derived from ALL successful payments recorded since feeStartDate,
// prorated against the total fee — not from whenever the family happens to
// pay — so a partial payment can leave a family already behind relative to
// today, the way a real termly fee ledger works. See fees.ts's
// recomputeFeeAccess for how feePaidThrough actually gets set.
// ---------------------------------------------------------------------------

export interface StudentFeeInfo {
  feeAmount: string;
  feeDays: number;
  feeStartDate: string | null;
  feeEndDate: string | null;
  feePaidThrough: string | null;
  usedDays: number;
  daysRemaining: number;
  expired: boolean;
}

// The fee-setting UI collects a start/end date (typically a term's dates,
// not an arbitrary day count) — this derives the day count the payment-
// proration math runs on.
export function feeDaysBetween(start: Date | null, end: Date | null): number {
  if (!start || !end) return 0;
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  return Math.max(0, days);
}

export function feeInfoOf(student: {
  feeAmount: { toString(): string } | string | null;
  feeDays: number | null;
  feeStartDate?: Date | null;
  feeEndDate?: Date | null;
  feePaidThrough: Date | null;
  enrollmentDate: Date;
}): StudentFeeInfo {
  const amount = typeof student.feeAmount === "string" ? student.feeAmount : (student.feeAmount as { toString(): string })?.toString() ?? "0";
  const feeDays = student.feeDays ?? 0;
  const paidThrough = student.feePaidThrough;
  const start = student.feeStartDate ?? student.enrollmentDate;
  const now = Date.now();
  const end = paidThrough ? paidThrough.getTime() : now;
  const usedDays = Math.max(0, Math.floor((Math.min(now, end) - start.getTime()) / 86400000));
  const daysRemaining = paidThrough ? Math.ceil((end - now) / 86400000) : feeDays;
  // A configured fee plan requires a successful payment before access starts.
  // Schools which have not configured a plan (zero amount/days) remain ungated.
  const expired = feeDays > 0 && Number(amount) > 0 && (!paidThrough || now > end);
  return {
    feeAmount: amount,
    feeDays,
    feeStartDate: student.feeStartDate ? student.feeStartDate.toISOString() : null,
    feeEndDate: student.feeEndDate ? student.feeEndDate.toISOString() : null,
    feePaidThrough: paidThrough ? paidThrough.toISOString() : null,
    usedDays,
    daysRemaining,
    expired,
  };
}

// Which fee-gated features are currently blocked for owing students — admin
// configurable via Settings → Restrictions (schoolSetting key "restrictions",
// field feeGatedFeatures). "results" (published report cards) used to be its
// own separate resultsRequirePayment boolean; it's now unified into this
// same list so every gated feature shares one date-aware rule instead of
// results alone being a strict binary paid/unpaid switch.
export type FeeGatedFeature = "tests" | "assignments" | "elearn" | "games" | "live" | "results";
const ALL_GATED_FEATURES: FeeGatedFeature[] = ["tests", "assignments", "elearn", "games", "live", "results"];
const DEFAULT_FEE_GATED_FEATURES: FeeGatedFeature[] = ["tests", "assignments", "elearn", "games", "live", "results"];

// The full, merged set of features currently blocked for owing students. A
// school whose restrictions were saved before "results" joined this list
// still had its own resultsRequirePayment boolean (default true) — folding
// that in here means existing enforcement carries over automatically rather
// than silently unlocking results for everyone the first time this runs.
export async function effectiveGatedFeatures(schoolId: string): Promise<Set<FeeGatedFeature>> {
  const restrictions = await getSetting(schoolId, "restrictions");
  const obj = restrictions && typeof restrictions === "object" ? (restrictions as Record<string, unknown>) : {};
  const list = new Set<FeeGatedFeature>(
    Array.isArray(obj.feeGatedFeatures)
      ? (obj.feeGatedFeatures as unknown[]).filter((f): f is FeeGatedFeature => ALL_GATED_FEATURES.includes(f as FeeGatedFeature))
      : DEFAULT_FEE_GATED_FEATURES,
  );
  if (obj.resultsRequirePayment !== false) list.add("results");
  return list;
}

// An active, unexpired FeeOverride for this student — a scholarship, payment
// plan or other admin-approved exception that grants access regardless of
// the fee window. A null termId on the override means "applies to every
// term", not "applies to no term".
async function activeOverride(studentId: string, termId?: string) {
  const override = await prisma.feeOverride.findFirst({
    where: { studentId, isActive: true, OR: [{ termId: null }, { termId: termId ?? undefined }] },
    orderBy: { createdAt: "desc" },
  });
  if (!override) return null;
  if (override.expiresAt && override.expiresAt.getTime() <= Date.now()) return null;
  return override;
}

// Throw 403 for STUDENT/PARENT callers when the child's fee window has
// lapsed, the school has this specific feature configured as fee-gated, and
// there's no active FeeOverride covering them.
export async function assertFeeAccess(
  schoolId: string,
  student: { id: string; feeAmount: { toString(): string } | string | null; feeDays: number | null; feePaidThrough: Date | null },
  feature: FeeGatedFeature,
  termId?: string,
): Promise<void> {
  const feeAmount = Number(student.feeAmount ?? 0);
  const configured = feeAmount > 0 && (student.feeDays ?? 0) > 0;
  const expired = configured && (!student.feePaidThrough || student.feePaidThrough.getTime() < Date.now());
  if (!expired) return;
  const gated = await effectiveGatedFeatures(schoolId);
  if (!gated.has(feature)) return;
  if (await activeOverride(student.id, termId)) return;
  const err = new Error(
    "Access suspended — payment is required or the school fee period has ended. Please contact the school to renew.",
  ) as Error & { status?: number };
  err.status = 403;
  throw err;
}

// Effective access gate: is this student allowed to view a published report
// card? Unified with the other fee-gated features — blocked only once the
// child's fee-access window has actually lapsed, with an active FeeOverride
// always granting access regardless.
export async function resolveResultsAccess(studentId: string, termId?: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { schoolId: true, feeAmount: true, feeDays: true, feePaidThrough: true },
  });
  if (!student) return { allowed: false, override: null, reason: "unpaid" as const };

  const gated = await effectiveGatedFeatures(student.schoolId);
  if (!gated.has("results")) return { allowed: true, override: null, reason: "open" as const };

  const override = await activeOverride(studentId, termId);
  if (override) return { allowed: true, override, reason: "override" as const };

  const feeAmount = Number(student.feeAmount ?? 0);
  const configured = feeAmount > 0 && (student.feeDays ?? 0) > 0;
  const expired = configured && (!student.feePaidThrough || student.feePaidThrough.getTime() < Date.now());
  return { allowed: !expired, override: null, reason: expired ? ("unpaid" as const) : ("paid" as const) };
}
