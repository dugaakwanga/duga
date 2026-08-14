import { prisma } from "@duga/core/server";
import { withinRadiusMeters, schoolConfig } from "@duga/core";
import { logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, todayUTC, isoDay, str, num, resolveSection } from "../helpers";

// Resolve the staff member to clock for. When `targetUserId` is supplied the
// caller clocks in/out on behalf of that staff member (proxy clock). The target
// must be a staff account in the same school.
async function resolveClockTarget(
  schoolId: string,
  actingUserId: string,
  raw: unknown,
): Promise<{ userId: string; proxyByUserId?: string }> {
  const targetUserId = str(raw);
  if (!targetUserId || targetUserId === actingUserId) return { userId: actingUserId };
  const target = await prisma.user.findFirst({
    where: { id: targetUserId, schoolId, role: { in: ["TEACHER", "ADMIN", "BURSAR", "OWNER"] } },
    select: { id: true },
  });
  if (!target) throw new Error("Selected staff member not found in this school");
  return { userId: target.id, proxyByUserId: actingUserId };
}

export const attendanceModule: Module = {
  // Student attendance records
  async list(ctx) {
    can(ctx, "attendance:view");
    const schoolId = ctx.session.user.schoolId;
    const date = ctx.query.get("date") ?? isoDay(new Date());
    const classGroupId = ctx.query.get("classGroupId");
    const where: Record<string, unknown> = { schoolId, date: new Date(`${date}T00:00:00Z`) };

    if (classGroupId) where.classGroupId = classGroupId;

    // Role scoping
    const role = ctx.session.user.role;
    if (role === "STUDENT") where.studentId = ctx.session.user.student!.id;
    if (role === "PARENT") {
      const links = await prisma.studentParent.findMany({ where: { parentId: ctx.session.user.parent!.id }, select: { studentId: true } });
      where.studentId = { in: links.map((l) => l.studentId) };
    }
    if (role === "TEACHER") {
      const teacher = ctx.session.user.teacher!;
      // A class teacher (form teacher) can see attendance for the class(es) they
      // are the class teacher of, plus classes they teach.
      const classes = await prisma.classSubject.findMany({ where: { teacherId: teacher.id }, select: { classGroupId: true } });
      const formClasses = await prisma.classGroup.findMany({ where: { formTeacherId: teacher.id }, select: { id: true } });
      const groups = [...new Set([...classes.map((c) => c.classGroupId), ...formClasses.map((c) => c.id)])];
      where.classGroupId = { in: groups };
    }

    // Scope to the active school section (Primary/Secondary) when set.
    const section = await resolveSection(ctx);
    if (section) where.classGroup = { is: { level: { section } } };

    const records = await prisma.studentAttendance.findMany({
      where,
      include: { student: { include: { user: { select: { firstName: true, lastName: true } } } }, classGroup: { include: { level: true } } },
      orderBy: { takenAt: "asc" },
      take: 1000,
    });

    const summary = records.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});

    return { items: records, summary, date };
  },

  // Take student attendance for a class/period
  async create(ctx) {
    can(ctx, "attendance:take");
    const schoolId = ctx.session.user.schoolId;
    const teacher = ctx.session.user.teacher;
    const date = str(ctx.body.date) ?? isoDay(new Date());
    const classGroupId = str(ctx.body.classGroupId);
    if (!classGroupId) throw new Error("classGroupId required");
    const entries = Array.isArray(ctx.body.entries) ? (ctx.body.entries as Array<{ studentId: string; status: string; remark?: string }>) : [];
    if (entries.length === 0) throw new Error("No attendance entries provided");

    // Only the class teacher (form teacher) of this class may take attendance
    // for it. Admins/owner may take for any class.
    const role = ctx.session.user.role;
    if (role === "TEACHER") {
      const cls = await prisma.classGroup.findFirst({ where: { id: classGroupId, schoolId } });
      if (!cls || cls.formTeacherId !== teacher?.id) {
        const err = new Error("You can only take attendance for the class you are the class teacher of") as Error & { status?: number };
        err.status = 403;
        throw err;
      }
    }

    const dateObj = new Date(`${date}T00:00:00Z`);
    const results = [];
    for (const e of entries) {
      if (!["PRESENT", "ABSENT", "LATE", "EXCUSED"].includes(e.status)) continue;
      const row = await prisma.studentAttendance.upsert({
        where: { studentId_date_classGroupId: { studentId: e.studentId, date: dateObj, classGroupId } },
        update: { status: e.status as "PRESENT", remark: e.remark, takenByTeacherId: teacher?.id, takenAt: new Date() },
        create: {
          schoolId,
          studentId: e.studentId,
          date: dateObj,
          classGroupId,
          status: e.status as "PRESENT",
          remark: e.remark,
          takenByTeacherId: teacher?.id,
        },
      });
      results.push(row);
    }
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "attendance.taken", entityType: "StudentAttendance", meta: { classGroupId, date, count: results.length } });
    return { count: results.length };
  },

  // Attendance summary for a student (term-wise)
  actions: {
    // Students of a class with their existing attendance status for a date —
    // powers the "take attendance" roster so a teacher can mark per class/day.
    roster: async (ctx) => {
      can(ctx, "attendance:take");
      const schoolId = ctx.session.user.schoolId;
      const classGroupId = String(ctx.query.get("classGroupId") ?? "");
      if (!classGroupId) throw new Error("classGroupId required");
      const date = ctx.query.get("date") ?? isoDay(new Date());
      const dateObj = new Date(`${date}T00:00:00Z`);

      // Only the class teacher (form teacher) of this class may load its roster
      // to take attendance. Admins/owner may for any class.
      const role = ctx.session.user.role;
      if (role === "TEACHER") {
        const cls = await prisma.classGroup.findFirst({ where: { id: classGroupId, schoolId } });
        if (!cls || cls.formTeacherId !== ctx.session.user.teacher?.id) {
          const err = new Error("You can only take attendance for the class you are the class teacher of") as Error & { status?: number };
          err.status = 403;
          throw err;
        }
      }

      const students = await prisma.student.findMany({
        where: { schoolId, currentClassGroupId: classGroupId, status: "ACTIVE" },
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { admissionNumber: "asc" },
      });
      const existing = await prisma.studentAttendance.findMany({ where: { classGroupId, date: dateObj } });
      const byStudent = new Map(existing.map((r) => [r.studentId, r]));

      const roster = students.map((s) => {
        const row = byStudent.get(s.id);
        return {
          studentId: s.id,
          admissionNumber: s.admissionNumber,
          name: `${s.user.firstName} ${s.user.lastName}`,
          status: row?.status ?? "UNMARKED",
          remark: row?.remark ?? null,
        };
      });
      return { classGroupId, date, roster, summary: existing.reduce<Record<string, number>>((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {}) };
    },

    report: async (ctx) => {
      can(ctx, "attendance:view");
      const studentId = ctx.query.get("studentId") ?? ctx.session.user.student?.id;
      if (!studentId) throw new Error("studentId required");
      const records = await prisma.studentAttendance.findMany({ where: { studentId, schoolId: ctx.session.user.schoolId } });
      const present = records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
      return {
        studentId,
        total: records.length,
        present,
        absent: records.filter((r) => r.status === "ABSENT").length,
        late: records.filter((r) => r.status === "LATE").length,
        excused: records.filter((r) => r.status === "EXCUSED").length,
        rate: records.length ? Math.round((present / records.length) * 100) : 0,
      };
    },

    // Resolve the staff member to clock for. When `targetUserId` is supplied
    // the caller clocks in/out on behalf of that staff member (proxy clock).
    // The target must be a staff account in the same school. Every proxy action
    // is recorded on the target's attendance row AND in the audit log so it is
    // visible to the owner/admin side.
    staffClockIn: async (ctx) => {
      can(ctx, "staff:clock");
      const schoolId = ctx.session.user.schoolId;
      const lat = num(ctx.body.lat);
      const lng = num(ctx.body.lng);
      if (lat === undefined || lng === undefined) throw new Error("Location is required to clock in");

      const target = await resolveClockTarget(schoolId, ctx.session.user.id, ctx.body.targetUserId);

      const school = await prisma.school.findUnique({ where: { id: schoolId } });
      const schoolLat = school?.gpsLat ?? schoolConfig.lat;
      const schoolLng = school?.gpsLng ?? schoolConfig.lng;
      const radius = schoolConfig.attendanceRadiusMeters;
      const check = withinRadiusMeters(lat, lng, schoolLat, schoolLng, radius);

      const record = await prisma.staffAttendance.upsert({
        where: { userId_date: { userId: target.userId, date: todayUTC() } },
        update: {
          checkInAt: new Date(),
          checkInLat: lat,
          checkInLng: lng,
          checkInDistanceM: check.distanceM,
          checkInWithinRadius: check.within,
          locationLabel: str(ctx.body.locationLabel),
          deviceInfo: str(ctx.body.deviceInfo),
        },
        create: {
          schoolId,
          userId: target.userId,
          date: todayUTC(),
          checkInAt: new Date(),
          checkInLat: lat,
          checkInLng: lng,
          checkInDistanceM: check.distanceM,
          checkInWithinRadius: check.within,
          locationLabel: str(ctx.body.locationLabel),
          deviceInfo: str(ctx.body.deviceInfo),
        },
      });

      await logAudit({ schoolId, userId: ctx.session.user.id, action: "staff.clockIn", entityType: "StaffAttendance", entityId: record.id, meta: { within: check.within, distanceM: check.distanceM, targetUserId: target.userId, proxyByUserId: target.proxyByUserId } });
      return { ...record, withinRadius: check.within, distanceMeters: check.distanceM, proxyByUserId: target.proxyByUserId ?? null };
    },

    staffClockOut: async (ctx) => {
      can(ctx, "staff:clock");
      const schoolId = ctx.session.user.schoolId;
      const lat = num(ctx.body.lat);
      const lng = num(ctx.body.lng);
      if (lat === undefined || lng === undefined) throw new Error("Location is required to clock out");

      const target = await resolveClockTarget(schoolId, ctx.session.user.id, ctx.body.targetUserId);

      const school = await prisma.school.findUnique({ where: { id: schoolId } });
      const check = withinRadiusMeters(lat, lng, school?.gpsLat ?? schoolConfig.lat, school?.gpsLng ?? schoolConfig.lng, schoolConfig.attendanceRadiusMeters);
      const record = await prisma.staffAttendance.upsert({
        where: { userId_date: { userId: target.userId, date: todayUTC() } },
        update: { checkOutAt: new Date(), checkOutLat: lat, checkOutLng: lng, checkOutDistanceM: check.distanceM, checkOutWithinRadius: check.within },
        create: { schoolId, userId: target.userId, date: todayUTC(), checkOutAt: new Date(), checkOutLat: lat, checkOutLng: lng, checkOutDistanceM: check.distanceM, checkOutWithinRadius: check.within },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "staff.clockOut", entityType: "StaffAttendance", entityId: record.id, meta: { within: check.within, distanceM: check.distanceM, targetUserId: target.userId, proxyByUserId: target.proxyByUserId } });
      return { ...record, withinRadius: check.within, distanceMeters: check.distanceM, proxyByUserId: target.proxyByUserId ?? null };
    },

    // List of staff members a staff account may clock in/out for.
    staffClockTargets: async (ctx) => {
      can(ctx, "staff:clock");
      const items = await prisma.user.findMany({
        where: { schoolId: ctx.session.user.schoolId, role: { in: ["TEACHER", "ADMIN", "BURSAR", "OWNER"] }, status: "ACTIVE" },
        select: { id: true, firstName: true, lastName: true, role: true, teacher: { select: { staffNumber: true } }, admin: { select: { designation: true } } },
        orderBy: { firstName: "asc" },
      });
      return { items };
    },

    staffStatus: async (ctx) => {
      can(ctx, "staff:clock");
      const target = await resolveClockTarget(ctx.session.user.schoolId, ctx.session.user.id, ctx.body.targetUserId);
      const record = await prisma.staffAttendance.findUnique({
        where: { userId_date: { userId: target.userId, date: todayUTC() } },
      });
      const school = await prisma.school.findUnique({ where: { id: ctx.session.user.schoolId } });
      const radius = schoolConfig.attendanceRadiusMeters;
      return {
        userId: target.userId,
        radius,
        schoolLat: school?.gpsLat ?? schoolConfig.lat,
        schoolLng: school?.gpsLng ?? schoolConfig.lng,
        today: record,
      };
    },

    staffRecords: async (ctx) => {
      can(ctx, "staff:attendance:view");
      const from = ctx.query.get("from");
      const to = ctx.query.get("to");
      const records = await prisma.staffAttendance.findMany({
        where: { schoolId: ctx.session.user.schoolId, ...(from || to ? { date: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } } : {}) },
        include: { user: { select: { firstName: true, lastName: true, role: true } } },
        orderBy: { date: "desc" },
        take: 500,
      });
      return { items: records };
    },
  },
};
