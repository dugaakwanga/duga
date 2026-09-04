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

// Effective access gate: is this student allowed to view published results?
// Returns { allowed, reason, override }.
export async function resolveResultsAccess(studentId: string, termId?: string) {
  // School-level restriction: when the school does not require payment before
  // results, everyone with a published report card gets access.
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { schoolId: true } });
  const schoolId = student?.schoolId;
  const restrictions = schoolId ? await getSetting(schoolId, "restrictions") : null;
  const requirePayment =
    !restrictions || typeof restrictions !== "object"
      ? true
      : (restrictions as { resultsRequirePayment?: unknown }).resultsRequirePayment !== false;

  if (!requirePayment) {
    return { allowed: true, override: null, invoice: null, reason: "open" };
  }

  const override = await prisma.feeOverride.findFirst({
    where: {
      studentId,
      termId: termId ?? undefined,
      isActive: true,
    },
    orderBy: { createdAt: "desc" },
  });
  // A fee override only counts while it is active and, if an expiry is set,
  // has not lapsed.
  const overrideValid = override !== null && (!override.expiresAt || override.expiresAt.getTime() > Date.now());
  const invoice = await prisma.invoice.findFirst({
    where: { studentId, termId: termId ?? undefined },
  });
  const fullyPaid =
    invoice?.status === "PAID" || invoice?.status === "OVERPAID" || invoice?.status === "WAIVED";
  const allowed = overrideValid || fullyPaid;
  return {
    allowed,
    override: overrideValid ? override : null,
    invoice,
    reason: allowed
      ? overrideValid
        ? "override"
        : "paid"
      : "unpaid",
  };
}
