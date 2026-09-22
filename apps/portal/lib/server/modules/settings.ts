import { prisma } from "@duga/core/server";
import { logAudit, effectiveGatedFeatures } from "@duga/core/server";
import type { Module } from ".";
import { can } from "../helpers";

const SCHOOL_DAYS_KEY = "schoolDays";
const RESTRICTIONS_KEY = "restrictions";
const PERIOD_TEMPLATE_KEY = "periodTemplate";

export interface SchoolDaysConfig {
  /** Weekly pattern — keys are ISO weekday names (monday..sunday). */
  weekdays: Record<string, boolean>;
  /** One-off closures, e.g. public holidays. */
  holidays: Array<{ date: string; name: string }>;
  /** 1 (default) or 2 — whether the school takes attendance once a day or
   * twice (morning + afternoon). Purely a counting convention: attendance is
   * still recorded once per student per day either way, but "days school
   * opened" on report cards and the school-wide stat is doubled when this is
   * 2, matching how the school itself counts a day. */
  sessionsPerDay: 1 | 2;
}

export interface RestrictionsConfig {
  /** Deprecated — "results" is now just another entry in feeGatedFeatures,
   * unified with the other fee-gated features under the same date-aware fee
   * window instead of its own separate paid/unpaid switch. Kept only so old
   * saved settings (from before that merge) still enforce results-gating the
   * way they used to; see effectiveGatedFeatures in school.ts. */
  resultsRequirePayment: boolean;
  /** Accept new online applications on the public website. */
  applicationsOpen: boolean;
  /** Which features are blocked for students whose fee-access window has
   * lapsed. Subset of "tests" | "assignments" | "elearn" | "games" | "live" | "results". */
  feeGatedFeatures: string[];
  /** Off by default: students may only message a teacher or admin, never
   * each other. An admin can open student-to-student direct messaging here
   * — student-to-parent messaging is never allowed regardless of this
   * setting, in either direction. */
  allowStudentToStudentChat: boolean;
  /** Off by default: a teacher may only take/correct student attendance for
   * today. An admin can open this to let teachers also record a past date —
   * e.g. to catch up a new intake's historical attendance mid-term. An
   * owner/admin can always backdate regardless of this setting. */
  allowTeacherBackdatedAttendance: boolean;
}

const DEFAULT_RESTRICTIONS: RestrictionsConfig = {
  resultsRequirePayment: true,
  applicationsOpen: true,
  feeGatedFeatures: ["tests", "assignments", "elearn", "games", "live", "results"],
  allowStudentToStudentChat: false,
  allowTeacherBackdatedAttendance: false,
};

// Read by messaging.ts to decide whether student-to-student chat is open
// for this school, without messaging.ts needing to know the settings
// storage shape (schoolSetting key/value rows) itself.
export async function getRestrictionsConfig(schoolId: string): Promise<RestrictionsConfig> {
  return readSetting<RestrictionsConfig>(schoolId, RESTRICTIONS_KEY, DEFAULT_RESTRICTIONS);
}

async function readSetting<T>(schoolId: string, key: string, fallback: T): Promise<T> {
  const row = await prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId, key } } });
  if (!row || !row.value || typeof row.value !== "object") return fallback;
  return { ...fallback, ...(row.value as object) } as T;
}

async function writeSetting(schoolId: string, key: string, value: object) {
  await prisma.schoolSetting.upsert({
    where: { schoolId_key: { schoolId, key } },
    update: { value: value as never },
    create: { schoolId, key, value: value as never },
  });
}

export const settingsModule: Module = {
  async list(ctx) {
    can(ctx, "settings:manage");
    const school = await prisma.school.findUnique({ where: { id: ctx.session.user.schoolId } });
    const settings = await prisma.schoolSetting.findMany({ where: { schoolId: ctx.session.user.schoolId } });
    const subscription = await prisma.subscription.findUnique({ where: { schoolId: ctx.session.user.schoolId } });
    const terms = await prisma.term.findMany({ where: { schoolId: ctx.session.user.schoolId }, include: { session: true }, orderBy: [{ session: { createdAt: "desc" } }, { termNumber: "asc" }] });
    const sessions = await prisma.academicSession.findMany({ where: { schoolId: ctx.session.user.schoolId }, orderBy: { createdAt: "desc" } });
    const gradingSchemes = await prisma.gradingScheme.findMany({ where: { schoolId: ctx.session.user.schoolId } });
    const financeAccess = await prisma.schoolSetting.findUnique({
      where: { schoolId_key: { schoolId: ctx.session.user.schoolId, key: "adminFinanceAccess" } },
    });
    const bursarFinanceAccess = await prisma.schoolSetting.findUnique({
      where: { schoolId_key: { schoolId: ctx.session.user.schoolId, key: "bursarFinanceAccess" } },
    });
    // Independent of the finance-access toggle above — lets the owner grant
    // JUST the ability to manage supplementary fees (book purchases, PTA
    // levy, etc.) without handing over payroll/financial-reports visibility.
    const adminOtherFeesAccess = await prisma.schoolSetting.findUnique({
      where: { schoolId_key: { schoolId: ctx.session.user.schoolId, key: "adminOtherFeesAccess" } },
    });
    const bursarOtherFeesAccess = await prisma.schoolSetting.findUnique({
      where: { schoolId_key: { schoolId: ctx.session.user.schoolId, key: "bursarOtherFeesAccess" } },
    });
    const [schoolDays, restrictions, gatedFeatures] = await Promise.all([
      readSetting<SchoolDaysConfig>(ctx.session.user.schoolId, SCHOOL_DAYS_KEY, {
        weekdays: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false },
        holidays: [],
        sessionsPerDay: 1,
      }),
      readSetting<RestrictionsConfig>(ctx.session.user.schoolId, RESTRICTIONS_KEY, DEFAULT_RESTRICTIONS),
      effectiveGatedFeatures(ctx.session.user.schoolId),
    ]);
    // Always the fully-migrated list (folds the old, separate
    // resultsRequirePayment boolean in) so the UI's "results" checkbox
    // reflects true current enforcement even for a school that saved
    // restrictions before results joined this list.
    restrictions.feeGatedFeatures = [...gatedFeatures];
    return {
      school,
      settings,
      subscription,
      terms,
      sessions,
      gradingSchemes,
      role: ctx.session.user.role,
      financeAccess: financeAccess?.value === true || financeAccess?.value === "true",
      bursarFinanceAccess: bursarFinanceAccess?.value === true || bursarFinanceAccess?.value === "true",
      adminOtherFeesAccess: adminOtherFeesAccess?.value === true || adminOtherFeesAccess?.value === "true",
      bursarOtherFeesAccess: bursarOtherFeesAccess?.value === true || bursarOtherFeesAccess?.value === "true",
      schoolDays,
      restrictions,
    };
  },

  async update(ctx) {
    can(ctx, "settings:manage");
    const schoolId = ctx.session.user.schoolId;
    const data: Record<string, unknown> = {};
    const b = ctx.body;
    if (b.name) data.name = String(b.name);
    if (b.phone) data.phone = String(b.phone);
    if (b.email) data.email = String(b.email);
    if (b.address) data.address = String(b.address);
    if (b.logoUrl) data.logoUrl = String(b.logoUrl);
    if (b.gpsLat) data.gpsLat = Number(b.gpsLat);
    if (b.gpsLng) data.gpsLng = Number(b.gpsLng);
    const school = await prisma.school.update({ where: { id: schoolId }, data });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "settings.updated", entityType: "School", entityId: schoolId, meta: data });
    return school;
  },

  actions: {
    setSetting: async (ctx) => {
      can(ctx, "settings:manage");
      const schoolId = ctx.session.user.schoolId;
      const key = String(ctx.body.key ?? "");
      const value = ctx.body.value;
      if (!key || value === undefined) throw new Error("key and value required");
      const row = await prisma.schoolSetting.upsert({
        where: { schoolId_key: { schoolId, key } },
        update: { value: value as never },
        create: { schoolId, key, value: value as never },
      });
      return row;
    },

    activateTerm: async (ctx) => {
      can(ctx, "settings:manage");
      const schoolId = ctx.session.user.schoolId;
      const termId = String(ctx.body.termId ?? "");
      if (!termId) throw new Error("termId required");
      const term = await prisma.term.findFirst({ where: { id: termId, schoolId } });
      if (!term) throw new Error("Term not found");
      await prisma.term.updateMany({ where: { schoolId }, data: { status: "CLOSED" } });
      await prisma.term.update({ where: { id: term.id }, data: { status: "ACTIVE" } });
      return { ok: true };
    },

    // Owner-only: grant or revoke an admin/bursar's access to finance.
    setFinanceAccess: async (ctx) => {
      if (ctx.session.user.role !== "OWNER") {
        const err = new Error("Only the school owner can grant finance access") as Error & { status?: number };
        err.status = 403;
        throw err;
      }
      const schoolId = ctx.session.user.schoolId;
      const role = ctx.body.role === "bursar" ? "bursar" : "admin";
      const value = ctx.body.value === true || ctx.body.value === "true";
      await prisma.schoolSetting.upsert({
        where: { schoolId_key: { schoolId, key: role === "bursar" ? "bursarFinanceAccess" : "adminFinanceAccess" } },
        update: { value: value as never },
        create: { schoolId, key: role === "bursar" ? "bursarFinanceAccess" : "adminFinanceAccess", value: value as never },
      });
      return { granted: value };
    },

    // Owner-only: grant or revoke JUST supplementary-fees access (book
    // purchases, PTA levy, etc.) — independent of full finance access above,
    // so an admin/bursar can be given one without the other.
    setOtherFeesAccess: async (ctx) => {
      if (ctx.session.user.role !== "OWNER") {
        const err = new Error("Only the school owner can grant other-fees access") as Error & { status?: number };
        err.status = 403;
        throw err;
      }
      const schoolId = ctx.session.user.schoolId;
      const role = ctx.body.role === "bursar" ? "bursar" : "admin";
      const value = ctx.body.value === true || ctx.body.value === "true";
      await prisma.schoolSetting.upsert({
        where: { schoolId_key: { schoolId, key: role === "bursar" ? "bursarOtherFeesAccess" : "adminOtherFeesAccess" } },
        update: { value: value as never },
        create: { schoolId, key: role === "bursar" ? "bursarOtherFeesAccess" : "adminOtherFeesAccess", value: value as never },
      });
      return { granted: value };
    },

    addTerm: async (ctx) => {
      can(ctx, "settings:manage");
      const schoolId = ctx.session.user.schoolId;
      const sessionId = String(ctx.body.sessionId ?? "");
      const termNumber = Number(ctx.body.termNumber);
      if (!sessionId || !termNumber) throw new Error("sessionId and termNumber required");
      const session = await prisma.academicSession.findFirst({ where: { id: sessionId, schoolId } });
      if (!session) throw new Error("Session not found");
      const name = String(ctx.body.name ?? `${["", "First", "Second", "Third"][termNumber] ?? termNumber} Term`);
      const startDate = ctx.body.startDate ? new Date(String(ctx.body.startDate)) : undefined;
      const endDate = ctx.body.endDate ? new Date(String(ctx.body.endDate)) : undefined;
      const feesDueDate = ctx.body.feesDueDate ? new Date(String(ctx.body.feesDueDate)) : undefined;
      return prisma.term.create({ data: { schoolId, sessionId, termNumber, name, startDate, endDate, feesDueDate } });
    },

    // Lets an admin set/correct a term's start, end and fees-due date after
    // creation — installment plans, printed report cards (term-ends-on) and
    // the fee-access hard deadline (see recomputeFeeAccess in fees.ts) are
    // all computed from these, so they need to stay editable, not just
    // settable once at term creation.
    updateTermDates: async (ctx) => {
      can(ctx, "settings:manage");
      const schoolId = ctx.session.user.schoolId;
      const termId = String(ctx.body.termId ?? "");
      if (!termId) throw new Error("termId required");
      const existing = await prisma.term.findFirst({ where: { id: termId, schoolId } });
      if (!existing) throw new Error("Term not found");
      const startDate = ctx.body.startDate ? new Date(String(ctx.body.startDate)) : null;
      const endDate = ctx.body.endDate ? new Date(String(ctx.body.endDate)) : null;
      const feesDueDate = ctx.body.feesDueDate ? new Date(String(ctx.body.feesDueDate)) : null;
      if (startDate && endDate && endDate <= startDate) throw new Error("End date must be after start date");
      if (feesDueDate && endDate && feesDueDate > endDate) throw new Error("Fees-due date must not be after the term's end date");
      if (feesDueDate && startDate && feesDueDate < startDate) throw new Error("Fees-due date must not be before the term's start date");
      return prisma.term.update({ where: { id: termId }, data: { startDate, endDate, feesDueDate } });
    },

    saveSchoolDays: async (ctx) => {
      can(ctx, "settings:manage");
      const schoolId = ctx.session.user.schoolId;
      const current = await readSetting<SchoolDaysConfig>(schoolId, SCHOOL_DAYS_KEY, { weekdays: {}, holidays: [], sessionsPerDay: 1 });
      const raw = ctx.body.weekdays && typeof ctx.body.weekdays === "object" ? (ctx.body.weekdays as Record<string, unknown>) : current.weekdays;
      const holidaysRaw = Array.isArray(ctx.body.holidays) ? ctx.body.holidays : current.holidays;
      const holidays = holidaysRaw
        .map((h) => {
          const hh = h as Record<string, unknown>;
          return { date: String(hh.date ?? ""), name: String(hh.name ?? "") };
        })
        .filter((h) => h.date && h.name);
      const weekdays: Record<string, boolean> = {};
      for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]) {
        weekdays[day] = typeof raw[day] === "boolean" ? raw[day] : typeof raw[day] === "string" ? raw[day] === "true" : Boolean(current.weekdays[day]);
      }
      const sessionsPerDay: 1 | 2 = ctx.body.sessionsPerDay === 2 ? 2 : ctx.body.sessionsPerDay === 1 ? 1 : current.sessionsPerDay;
      const cfg: SchoolDaysConfig = { weekdays, holidays, sessionsPerDay };
      await writeSetting(schoolId, SCHOOL_DAYS_KEY, cfg);
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "settings.schoolDaysUpdated", entityType: "School", entityId: schoolId, meta: { weekdays, holidayCount: holidays.length, sessionsPerDay } });
      return cfg;
    },

    saveRestrictions: async (ctx) => {
      can(ctx, "settings:manage");
      const schoolId = ctx.session.user.schoolId;
      const current = await readSetting<RestrictionsConfig>(schoolId, RESTRICTIONS_KEY, DEFAULT_RESTRICTIONS);
      const validFeatures = new Set(["tests", "assignments", "elearn", "games", "live", "results"]);
      const feeGatedFeatures = Array.isArray(ctx.body.feeGatedFeatures)
        ? ctx.body.feeGatedFeatures.filter((f: unknown): f is string => typeof f === "string" && validFeatures.has(f))
        : current.feeGatedFeatures;
      const cfg: RestrictionsConfig = {
        // The frontend no longer has a separate results toggle — it's just
        // "results" in/out of feeGatedFeatures now — but this field stays in
        // sync with that so old code paths reading it directly still agree.
        resultsRequirePayment: feeGatedFeatures.includes("results"),
        applicationsOpen: typeof ctx.body.applicationsOpen === "boolean" ? ctx.body.applicationsOpen : current.applicationsOpen,
        feeGatedFeatures,
        allowStudentToStudentChat: typeof ctx.body.allowStudentToStudentChat === "boolean" ? ctx.body.allowStudentToStudentChat : current.allowStudentToStudentChat,
        allowTeacherBackdatedAttendance: typeof ctx.body.allowTeacherBackdatedAttendance === "boolean" ? ctx.body.allowTeacherBackdatedAttendance : current.allowTeacherBackdatedAttendance,
      };
      await writeSetting(schoolId, RESTRICTIONS_KEY, cfg);
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "settings.restrictionsUpdated", entityType: "School", entityId: schoolId, meta: cfg as unknown as Record<string, unknown> });
      return cfg;
    },
  },
};
