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
    // fallback scale: simple A-F letter grades
    return [
      { min: 80, max: 100, grade: "A", remark: "Excellent", gp: 5 },
      { min: 70, max: 79, grade: "B", remark: "Very Good", gp: 4 },
      { min: 60, max: 69, grade: "C", remark: "Good", gp: 3 },
      { min: 50, max: 59, grade: "D", remark: "Fair", gp: 2 },
      { min: 40, max: 49, grade: "E", remark: "Poor", gp: 1 },
      { min: 0, max: 39, grade: "F", remark: "Fail", gp: 0 },
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

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DEFAULT_SCHOOL_WEEKDAY: Record<string, boolean> = {
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: false,
  sunday: false,
};

export interface DaysOpenedResult {
  /** Distinct eligible days attendance was actually taken, × sessionsPerDay. */
  daysOpened: number;
  sessionsPerDay: number;
}

// "Days school opened": every distinct day within the term that (a) falls on
// a configured school day of the week (Settings → School days), (b) isn't a
// declared holiday there, AND (c) attendance was actually recorded that day
// — for the whole school when classGroupId is omitted, or scoped to one
// class when given. A day nobody took attendance on is never counted,
// holiday or not; the calendar only ever narrows the count down, it never
// invents a day. Multiplied by the admin's configured sessions-per-day
// (e.g. a school marking morning + afternoon separately counts each
// calendar day twice).
export async function computeDaysSchoolOpened(
  schoolId: string,
  termId: string,
  classGroupId?: string,
): Promise<DaysOpenedResult> {
  const term = await prisma.term.findFirst({ where: { id: termId, schoolId } });
  if (!term) return { daysOpened: 0, sessionsPerDay: 1 };

  const [schoolDaysRaw, attendanceDays] = await Promise.all([
    getSetting(schoolId, "schoolDays"),
    prisma.studentAttendance.findMany({
      where: { schoolId, termId, ...(classGroupId ? { classGroupId } : {}) },
      select: { date: true },
      distinct: ["date"],
    }),
  ]);

  const cfg = schoolDaysRaw && typeof schoolDaysRaw === "object" ? (schoolDaysRaw as Record<string, unknown>) : {};
  const weekdaysCfg = cfg.weekdays && typeof cfg.weekdays === "object" ? (cfg.weekdays as Record<string, unknown>) : {};
  const sessionsPerDay = cfg.sessionsPerDay === 2 ? 2 : 1;
  const holidayDates = new Set(
    Array.isArray(cfg.holidays)
      ? (cfg.holidays as unknown[])
          .map((h) => (h && typeof h === "object" ? String((h as Record<string, unknown>).date ?? "") : ""))
          .filter(Boolean)
      : [],
  );

  const isSchoolWeekday = (d: Date) => {
    const name = WEEKDAY_NAMES[d.getUTCDay()]!;
    const configured = weekdaysCfg[name];
    return typeof configured === "boolean" ? configured : DEFAULT_SCHOOL_WEEKDAY[name];
  };

  let count = 0;
  for (const { date } of attendanceDays) {
    if ((term.startDate && date < term.startDate) || (term.endDate && date > term.endDate)) continue;
    if (!isSchoolWeekday(date)) continue;
    if (holidayDates.has(date.toISOString().slice(0, 10))) continue;
    count++;
  }
  return { daysOpened: count * sessionsPerDay, sessionsPerDay };
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
  feesDueDate: string | null;
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
  feesDueDate?: Date | null;
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
    feesDueDate: student.feesDueDate ? student.feesDueDate.toISOString() : null,
    feePaidThrough: paidThrough ? paidThrough.toISOString() : null,
    usedDays,
    daysRemaining,
    expired,
  };
}

export interface SchoolFeeLedger {
  feeAmount: number;
  paid: number;
  owing: number;
}

// The ₦ ledger for a student's CORE school fee — set per-student via "Set
// school fees" (Student.feeAmount/feeStartDate), never via the Invoice/
// FeeStructure system, which is reserved for supplementary fees (PTA levy,
// excursions, etc.) that are billed and tracked completely separately.
// Sums only standalone payments (invoiceId: null) recorded since the
// student's own feeStartDate — an invoice-linked payment is for one of
// those other fees and must never count toward this ledger, and a payment
// from a PRIOR fee window (before the admin last reset feeStartDate for a
// new term) must never count toward the current one either.
export async function schoolFeeLedgerFor(
  schoolId: string,
  students: Array<{ id: string; feeAmount: { toString(): string } | string | null; feeStartDate: Date | null }>,
): Promise<Map<string, SchoolFeeLedger>> {
  const ids = students.map((s) => s.id);
  const payments = ids.length
    ? await prisma.payment.findMany({
        where: { schoolId, studentId: { in: ids }, status: "SUCCESS", invoiceId: null },
        select: { studentId: true, amount: true, paidAt: true },
      })
    : [];
  const map = new Map<string, SchoolFeeLedger>();
  for (const s of students) {
    const feeAmount = Number(s.feeAmount ?? 0);
    // A missing feeStartDate (a fee amount set with no date window — a data
    // gap, not a reason to hide the student's payments) falls back to
    // counting every standalone payment ever made for them, rather than
    // silently reporting ₦0 paid.
    const paid = payments
      .filter((p) => p.studentId === s.id && p.paidAt && (!s.feeStartDate || p.paidAt >= s.feeStartDate!))
      .reduce((a, p) => a + Number(p.amount), 0);
    map.set(s.id, { feeAmount, paid, owing: Math.max(0, feeAmount - paid) });
  }
  return map;
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
      ? (obj.feeGatedFeatures as unknown[]).filter((f: unknown): f is FeeGatedFeature => ALL_GATED_FEATURES.includes(f as FeeGatedFeature))
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
