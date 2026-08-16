import { prisma } from "@duga/core/server";
import { logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can } from "../helpers";

const SCHOOL_DAYS_KEY = "schoolDays";
const RESTRICTIONS_KEY = "restrictions";

export interface SchoolDaysConfig {
  /** Weekly pattern — keys are ISO weekday names (monday..sunday). */
  weekdays: Record<string, boolean>;
  /** One-off closures, e.g. public holidays. */
  holidays: Array<{ date: string; name: string }>;
}

export interface RestrictionsConfig {
  /** Gate published results behind a settled fee invoice for students/parents. */
  resultsRequirePayment: boolean;
  /** Accept new online applications on the public website. */
  applicationsOpen: boolean;
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
    const [schoolDays, restrictions] = await Promise.all([
      readSetting<SchoolDaysConfig>(ctx.session.user.schoolId, SCHOOL_DAYS_KEY, {
        weekdays: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false },
        holidays: [],
      }),
      readSetting<RestrictionsConfig>(ctx.session.user.schoolId, RESTRICTIONS_KEY, {
        resultsRequirePayment: true,
        applicationsOpen: true,
      }),
    ]);
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
      await prisma.term.updateMany({ where: { schoolId }, data: { status: "CLOSED" } });
      await prisma.term.update({ where: { id: termId }, data: { status: "ACTIVE" } });
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

    addTerm: async (ctx) => {
      can(ctx, "settings:manage");
      const schoolId = ctx.session.user.schoolId;
      const sessionId = String(ctx.body.sessionId ?? "");
      const termNumber = Number(ctx.body.termNumber);
      if (!sessionId || !termNumber) throw new Error("sessionId and termNumber required");
      const name = String(ctx.body.name ?? `${["", "First", "Second", "Third"][termNumber] ?? termNumber} Term`);
      return prisma.term.create({ data: { schoolId, sessionId, termNumber, name } });
    },

    saveSchoolDays: async (ctx) => {
      can(ctx, "settings:manage");
      const schoolId = ctx.session.user.schoolId;
      const current = await readSetting<SchoolDaysConfig>(schoolId, SCHOOL_DAYS_KEY, { weekdays: {}, holidays: [] });
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
      const cfg: SchoolDaysConfig = { weekdays, holidays };
      await writeSetting(schoolId, SCHOOL_DAYS_KEY, cfg);
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "settings.schoolDaysUpdated", entityType: "School", entityId: schoolId, meta: { weekdays, holidayCount: holidays.length } });
      return cfg;
    },

    saveRestrictions: async (ctx) => {
      can(ctx, "settings:manage");
      const schoolId = ctx.session.user.schoolId;
      const current = await readSetting<RestrictionsConfig>(schoolId, RESTRICTIONS_KEY, { resultsRequirePayment: true, applicationsOpen: true });
      const cfg: RestrictionsConfig = {
        resultsRequirePayment: typeof ctx.body.resultsRequirePayment === "boolean" ? ctx.body.resultsRequirePayment : current.resultsRequirePayment,
        applicationsOpen: typeof ctx.body.applicationsOpen === "boolean" ? ctx.body.applicationsOpen : current.applicationsOpen,
      };
      await writeSetting(schoolId, RESTRICTIONS_KEY, cfg);
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "settings.restrictionsUpdated", entityType: "School", entityId: schoolId, meta: cfg as unknown as Record<string, unknown> });
      return cfg;
    },
  },
};
