import { prisma, logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str, resolveSection } from "../helpers";

// ---------------------------------------------------------------------------
// Central school calendar — term dates, holidays/breaks, and assessment
// windows. Created/edited by OWNER/ADMIN only ("calendar:manage"); viewable
// by every other staff/student/parent role ("calendar:view"). Security is
// deliberately excluded — its scope stays limited to the gate.
//
// ASSESSMENT_WINDOW events are also the enforcement source for auto-lockout:
// learning.ts (assignment submit / CBT start) and results.ts (score entry /
// submit) both call assessmentWindowOpen() before allowing the action.
// ---------------------------------------------------------------------------

const VALID_TYPES = ["HOLIDAY", "MIDTERM_BREAK", "ASSESSMENT_WINDOW", "GENERIC"] as const;
const VALID_TARGETS = ["ASSIGNMENT", "TEST", "CBT", "RESULTS"] as const;

/**
 * True when there is no ASSESSMENT_WINDOW event for the given target (no
 * window configured means "always open" — the calendar is opt-in scoping,
 * not a requirement), or the current time falls inside a matching window.
 */
export async function assessmentWindowOpen(
  schoolId: string,
  targetType: (typeof VALID_TARGETS)[number],
  opts: { classSubjectId?: string; section?: string | null } = {},
): Promise<boolean> {
  const now = new Date();
  const windows = await prisma.calendarEvent.findMany({
    where: {
      schoolId,
      type: "ASSESSMENT_WINDOW",
      targetType,
      ...(opts.classSubjectId ? { OR: [{ classSubjectId: opts.classSubjectId }, { classSubjectId: null }] } : { classSubjectId: null }),
    },
    select: { startDate: true, endDate: true, appliesToSection: true },
  });
  if (!windows.length) return true;
  const relevant = windows.filter((w) => !w.appliesToSection || !opts.section || w.appliesToSection === opts.section);
  if (!relevant.length) return true;
  return relevant.some((w) => now >= w.startDate && now <= w.endDate);
}

export const calendarModule: Module = {
  async list(ctx) {
    can(ctx, "calendar:view");
    const schoolId = ctx.session.user.schoolId;
    const section = await resolveSection(ctx);
    const termId = ctx.query.get("termId");
    const events = await prisma.calendarEvent.findMany({
      where: {
        schoolId,
        ...(termId ? { termId } : {}),
        ...(section ? { OR: [{ appliesToSection: section }, { appliesToSection: null }] } : {}),
      },
      include: { term: { select: { id: true, name: true } } },
      orderBy: { startDate: "asc" },
    });
    const terms = await prisma.term.findMany({ where: { schoolId }, orderBy: { name: "asc" }, take: 100 });
    return { role: ctx.session.user.role, events, terms };
  },

  async create(ctx) {
    can(ctx, "calendar:manage");
    const schoolId = ctx.session.user.schoolId;
    const title = str(ctx.body.title);
    const type = str(ctx.body.type);
    const startDate = str(ctx.body.startDate);
    const endDate = str(ctx.body.endDate);
    if (!title || !startDate || !endDate) throw new Error("title, startDate and endDate are required");
    if (type && !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) throw new Error("Invalid calendar event type");
    const targetType = str(ctx.body.targetType);
    if (targetType && !VALID_TARGETS.includes(targetType as (typeof VALID_TARGETS)[number])) throw new Error("Invalid assessment target type");
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) throw new Error("Choose a valid start and end date");

    const event = await prisma.calendarEvent.create({
      data: {
        schoolId,
        termId: str(ctx.body.termId),
        title,
        type: (type as (typeof VALID_TYPES)[number]) ?? "GENERIC",
        startDate: start,
        endDate: end,
        appliesToSection: str(ctx.body.appliesToSection),
        targetType: targetType as (typeof VALID_TARGETS)[number] | undefined,
        classSubjectId: str(ctx.body.classSubjectId),
        createdByUserId: ctx.session.user.id,
      },
    });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "calendar.eventCreated", entityType: "CalendarEvent", entityId: event.id, meta: { title, type: event.type } });
    return event;
  },

  async update(ctx) {
    can(ctx, "calendar:manage");
    const schoolId = ctx.session.user.schoolId;
    const existing = await prisma.calendarEvent.findFirst({ where: { id: ctx.id, schoolId } });
    if (!existing) throw new Error("Calendar event not found");
    const data: Record<string, unknown> = {};
    if (str(ctx.body.title)) data.title = str(ctx.body.title);
    if (ctx.body.type !== undefined) {
      const type = str(ctx.body.type);
      if (type && !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) throw new Error("Invalid calendar event type");
      data.type = type ?? "GENERIC";
    }
    if (ctx.body.startDate !== undefined) {
      const d = new Date(String(ctx.body.startDate));
      if (Number.isNaN(d.getTime())) throw new Error("Invalid start date");
      data.startDate = d;
    }
    if (ctx.body.endDate !== undefined) {
      const d = new Date(String(ctx.body.endDate));
      if (Number.isNaN(d.getTime())) throw new Error("Invalid end date");
      data.endDate = d;
    }
    if (ctx.body.termId !== undefined) data.termId = str(ctx.body.termId) ?? null;
    if (ctx.body.appliesToSection !== undefined) data.appliesToSection = str(ctx.body.appliesToSection) ?? null;
    if (ctx.body.targetType !== undefined) {
      const targetType = str(ctx.body.targetType);
      if (targetType && !VALID_TARGETS.includes(targetType as (typeof VALID_TARGETS)[number])) throw new Error("Invalid assessment target type");
      data.targetType = targetType ?? null;
    }
    if (ctx.body.classSubjectId !== undefined) data.classSubjectId = str(ctx.body.classSubjectId) ?? null;
    const event = await prisma.calendarEvent.update({ where: { id: ctx.id }, data });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "calendar.eventUpdated", entityType: "CalendarEvent", entityId: ctx.id });
    return event;
  },

  async remove(ctx) {
    can(ctx, "calendar:manage");
    const schoolId = ctx.session.user.schoolId;
    const existing = await prisma.calendarEvent.findFirst({ where: { id: ctx.id, schoolId } });
    if (!existing) throw new Error("Calendar event not found");
    await prisma.calendarEvent.delete({ where: { id: ctx.id } });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "calendar.eventDeleted", entityType: "CalendarEvent", entityId: ctx.id });
    return { ok: true };
  },
};
