import { prisma } from "@duga/core/server";
import { withinRadiusMeters, schoolConfig } from "@duga/core";
import { logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, todayUTC, isoDay, str, num, resolveSection, sectionsOfTeacher } from "../helpers";
import type { Ctx } from "@/app/api/v1/[...path]/route";

// Resolve the staff member to clock for. When `targetUserId` is supplied the
// caller clocks in/out on behalf of that staff member (a colleague standing
// right there with them — not an office override, so this is still fully
// geofenced and photo-verified like a self clock). An owner/admin may target
// any staff account; a teacher may only target another teacher who shares at
// least one of their sections, matching how the rest of the app scopes a
// teacher's reach.
async function resolveClockTarget(ctx: Ctx, raw: unknown): Promise<{ userId: string; proxyByUserId?: string }> {
  const schoolId = ctx.session.user.schoolId;
  const actingUserId = ctx.session.user.id;
  const actingRole = ctx.session.user.role;
  const targetUserId = str(raw);
  if (!targetUserId || targetUserId === actingUserId) return { userId: actingUserId };

  if (actingRole === "OWNER" || actingRole === "ADMIN") {
    const target = await prisma.user.findFirst({
      where: { id: targetUserId, schoolId, role: { in: ["TEACHER", "ADMIN", "BURSAR", "OWNER"] } },
      select: { id: true },
    });
    if (!target) throw new Error("Selected staff member not found in this school");
    return { userId: target.id, proxyByUserId: actingUserId };
  }

  if (actingRole === "TEACHER" && ctx.session.user.teacher) {
    const mySections = await sectionsOfTeacher(ctx.session.user.teacher.id);
    const target = await prisma.user.findFirst({
      where: { id: targetUserId, schoolId, role: "TEACHER" },
      select: { id: true, teacher: { select: { id: true } } },
    });
    if (!target?.teacher) throw new Error("Selected staff member not found in this school");
    const theirSections = await sectionsOfTeacher(target.teacher.id);
    if (!mySections.some((s) => theirSections.includes(s))) {
      throw new Error("You can only clock in a teacher who shares one of your sections");
    }
    return { userId: target.id, proxyByUserId: actingUserId };
  }

  const err = new Error("Only an owner, admin or teacher can clock in or out for another staff member") as Error & { status?: number };
  err.status = 403;
  throw err;
}

function parseAttendanceDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Use a valid attendance date");
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Use a valid attendance date");
  return date;
}

// Who may mark/edit a given class's attendance: a teacher only for a class
// where they are the form teacher, or an owner/admin for any class in the
// school (school-wide "admin attendance management" — including retroactive
// correction of a date already taken by the class teacher).
async function resolveMarkableClass(schoolId: string, classGroupId: string, role: string, teacherId?: string) {
  const classGroup = await prisma.classGroup.findFirst({ where: { id: classGroupId, schoolId }, include: { level: true } });
  if (!classGroup) throw new Error("Class not found");
  if (role === "OWNER" || role === "ADMIN") return classGroup;
  if (role === "TEACHER" && teacherId && classGroup.formTeacherId === teacherId) return classGroup;
  const err = new Error("You can only take attendance for a class where you are the class teacher") as Error & { status?: number };
  err.status = 403;
  throw err;
}

export const attendanceModule: Module = {
  // Student attendance records
  async list(ctx) {
    can(ctx, "attendance:view");
    const schoolId = ctx.session.user.schoolId;
    const role = ctx.session.user.role;
    const classGroupId = ctx.query.get("classGroupId");

    // STUDENT/PARENT get a date-range history (defaults to the last 30 days)
    // — a single-day filter isn't useful for "how has my child been doing".
    // Staff keep the original single-day roster view.
    const isRangeView = role === "STUDENT" || role === "PARENT";
    const fromParam = ctx.query.get("from");
    const toParam = ctx.query.get("to");
    const date = ctx.query.get("date") ?? isoDay(new Date());
    const where: Record<string, unknown> = { schoolId };
    if (isRangeView) {
      const to = toParam ? new Date(`${toParam}T00:00:00Z`) : new Date(`${isoDay(new Date())}T00:00:00Z`);
      const from = fromParam ? new Date(`${fromParam}T00:00:00Z`) : new Date(to.getTime() - 29 * 86400000);
      where.date = { gte: from, lte: to };
    } else {
      where.date = new Date(`${date}T00:00:00Z`);
    }

    if (classGroupId) where.classGroupId = classGroupId;

    // Role scoping
    let childIds: string[] | undefined;
    if (role === "STUDENT") where.studentId = ctx.session.user.student!.id;
    if (role === "PARENT") {
      const links = await prisma.studentParent.findMany({ where: { parentId: ctx.session.user.parent!.id }, select: { studentId: true } });
      childIds = links.map((l) => l.studentId);
      where.studentId = { in: childIds };
    }
    if (role === "TEACHER") {
      const teacher = ctx.session.user.teacher!;
      const formClasses = await prisma.classGroup.findMany({ where: { formTeacherId: teacher.id }, select: { id: true } });
      where.classGroupId = { in: formClasses.map((c) => c.id) };
    }

    // Scope to the active school section (Primary/Secondary) when set.
    const section = await resolveSection(ctx);
    if (section) where.classGroup = { is: { level: { section } } };

    const records = await prisma.studentAttendance.findMany({
      where,
      include: { student: { include: { user: { select: { firstName: true, lastName: true } } } }, classGroup: { include: { level: true } } },
      orderBy: { date: "desc" },
      take: 1000,
    });

    const summary = records.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});

    // Per-child breakdown for a parent with multiple linked children.
    let byChild: Array<{ studentId: string; name: string; summary: Record<string, number>; total: number }> | undefined;
    if (role === "PARENT" && childIds) {
      const map = new Map<string, { studentId: string; name: string; summary: Record<string, number>; total: number }>();
      for (const r of records) {
        const entry = map.get(r.studentId) ?? { studentId: r.studentId, name: `${r.student.user.firstName} ${r.student.user.lastName}`, summary: {}, total: 0 };
        entry.summary[r.status] = (entry.summary[r.status] ?? 0) + 1;
        entry.total += 1;
        map.set(r.studentId, entry);
      }
      byChild = childIds.map((id) => map.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
    }

    return { role, items: records, summary, byChild, date, isRangeView };
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

    // Attendance is taken by the class teacher, or school-wide by an
    // owner/admin — including retroactively correcting a date already taken.
    const role = ctx.session.user.role;
    if (!["TEACHER", "OWNER", "ADMIN"].includes(role)) throw new Error("Only class teachers or admins can take student attendance");
    const classGroup = await resolveMarkableClass(schoolId, classGroupId, role, teacher?.id);
    const section = await resolveSection(ctx);
    if (section && classGroup.level.section !== section) throw new Error("You can only take attendance in your active section");

    const dateObj = parseAttendanceDate(date);
    const roster = await prisma.student.findMany({ where: { schoolId, currentClassGroupId: classGroupId, status: "ACTIVE" }, select: { id: true } });
    const rosterIds = new Set(roster.map((student) => student.id));
    if (entries.some((entry) => !rosterIds.has(entry.studentId))) throw new Error("Attendance can only be recorded for active students in this class");
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
    const isAdminOverride = (role === "OWNER" || role === "ADMIN") && dateObj.getTime() < todayUTC().getTime();
    await logAudit({
      schoolId,
      userId: ctx.session.user.id,
      action: isAdminOverride ? "attendance.overridden" : "attendance.taken",
      entityType: "StudentAttendance",
      meta: { classGroupId, date, count: results.length, actorRole: role },
    });
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
      const dateObj = parseAttendanceDate(date);

      // The class teacher, or an owner/admin (school-wide), may load an
      // attendance-taking roster — including for a past date, to correct it.
      const role = ctx.session.user.role;
      if (!["TEACHER", "OWNER", "ADMIN"].includes(role)) throw new Error("Only class teachers or admins can take student attendance");
      const classGroup = await resolveMarkableClass(schoolId, classGroupId, role, ctx.session.user.teacher?.id);
      const section = await resolveSection(ctx);
      if (section && classGroup.level.section !== section) throw new Error("You can only take attendance in your active section");

      const students = await prisma.student.findMany({
        where: { schoolId, currentClassGroupId: classGroupId, status: "ACTIVE" },
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { admissionNumber: "asc" },
      });
      const existing = await prisma.studentAttendance.findMany({ where: { schoolId, classGroupId, date: dateObj } });
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
      const schoolId = ctx.session.user.schoolId;
      const role = ctx.session.user.role;
      let studentId = ctx.query.get("studentId") ?? ctx.session.user.student?.id;
      if (!studentId) throw new Error("studentId required");
      if (role === "STUDENT") studentId = ctx.session.user.student!.id;
      const student = await prisma.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true, currentClassGroupId: true } });
      if (!student) throw new Error("Student not found");
      if (role === "PARENT") {
        const linked = await prisma.studentParent.findFirst({ where: { parentId: ctx.session.user.parent!.id, studentId } });
        if (!linked) throw new Error("You can only view attendance for your own children");
      }
      if (role === "TEACHER") {
        const classGroup = student.currentClassGroupId ? await prisma.classGroup.findFirst({ where: { id: student.currentClassGroupId, formTeacherId: ctx.session.user.teacher!.id } }) : null;
        if (!classGroup) throw new Error("You can only view attendance for students in your class-teacher class");
      }
      const records = await prisma.studentAttendance.findMany({ where: { studentId, schoolId } });
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
    // the caller clocks in/out on behalf of that staff member — a colleague
    // standing right there with them, so this is still fully geofenced and
    // requires a live photo of the person being clocked in, same as a self
    // clock. Every such action is recorded on the target's attendance row AND
    // in the audit log so it is visible to the owner/admin side.
    staffClockIn: async (ctx) => {
      can(ctx, "staff:clock");
      const schoolId = ctx.session.user.schoolId;
      const lat = num(ctx.body.lat);
      const lng = num(ctx.body.lng);
      if (lat === undefined || lng === undefined) throw new Error("Location is required to clock in");
      const photoUrl = str(ctx.body.photoUrl);
      const photoKey = str(ctx.body.photoKey);
      if (!photoUrl) throw new Error("A live camera photo is required to clock in");

      const target = await resolveClockTarget(ctx, ctx.body.targetUserId);

      const school = await prisma.school.findUnique({ where: { id: schoolId } });
      const schoolLat = school?.gpsLat ?? schoolConfig.lat;
      const schoolLng = school?.gpsLng ?? schoolConfig.lng;
      const radius = schoolConfig.attendanceRadiusMeters;
      const check = withinRadiusMeters(lat, lng, schoolLat, schoolLng, radius);
      // Always geofenced — whoever is physically clocking in (self or a
      // colleague standing with them) must be on school grounds. No office
      // override; that's what the photo + radius check together replace.
      if (!check.within) {
        throw new Error(`You're too far from the school to clock in (${Math.round(check.distanceM)}m away, must be within ${radius}m).`);
      }

      const record = await prisma.staffAttendance.upsert({
        where: { userId_date: { userId: target.userId, date: todayUTC() } },
        update: {
          checkInAt: new Date(),
          checkInLat: lat,
          checkInLng: lng,
          checkInDistanceM: check.distanceM,
          checkInWithinRadius: check.within,
          checkInPhotoUrl: photoUrl,
          checkInPhotoKey: photoKey,
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
          checkInPhotoUrl: photoUrl,
          checkInPhotoKey: photoKey,
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
      const photoUrl = str(ctx.body.photoUrl);
      const photoKey = str(ctx.body.photoKey);
      if (!photoUrl) throw new Error("A live camera photo is required to clock out");

      const target = await resolveClockTarget(ctx, ctx.body.targetUserId);

      const school = await prisma.school.findUnique({ where: { id: schoolId } });
      const check = withinRadiusMeters(lat, lng, school?.gpsLat ?? schoolConfig.lat, school?.gpsLng ?? schoolConfig.lng, schoolConfig.attendanceRadiusMeters);
      if (!check.within) {
        throw new Error(`You're too far from the school to clock out (${Math.round(check.distanceM)}m away, must be within ${schoolConfig.attendanceRadiusMeters}m).`);
      }
      const record = await prisma.staffAttendance.upsert({
        where: { userId_date: { userId: target.userId, date: todayUTC() } },
        update: { checkOutAt: new Date(), checkOutLat: lat, checkOutLng: lng, checkOutDistanceM: check.distanceM, checkOutWithinRadius: check.within, checkOutPhotoUrl: photoUrl, checkOutPhotoKey: photoKey },
        create: { schoolId, userId: target.userId, date: todayUTC(), checkOutAt: new Date(), checkOutLat: lat, checkOutLng: lng, checkOutDistanceM: check.distanceM, checkOutWithinRadius: check.within, checkOutPhotoUrl: photoUrl, checkOutPhotoKey: photoKey },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "staff.clockOut", entityType: "StaffAttendance", entityId: record.id, meta: { within: check.within, distanceM: check.distanceM, targetUserId: target.userId, proxyByUserId: target.proxyByUserId } });
      return { ...record, withinRadius: check.within, distanceMeters: check.distanceM, proxyByUserId: target.proxyByUserId ?? null };
    },

    // List of staff members a staff account may clock in/out for — an
    // owner/admin can pick any staff account; a teacher can only pick another
    // teacher who shares one of their sections (mirrors resolveClockTarget).
    staffClockTargets: async (ctx) => {
      can(ctx, "staff:clock");
      const role = ctx.session.user.role;
      if (role === "OWNER" || role === "ADMIN") {
        const items = await prisma.user.findMany({
          where: { schoolId: ctx.session.user.schoolId, status: "ACTIVE", role: { in: ["TEACHER", "ADMIN", "BURSAR", "OWNER"] } },
          select: { id: true, firstName: true, lastName: true, role: true, teacher: { select: { staffNumber: true } }, admin: { select: { designation: true } } },
          orderBy: { firstName: "asc" },
        });
        return { items };
      }
      if (role === "TEACHER" && ctx.session.user.teacher) {
        const mySections = await sectionsOfTeacher(ctx.session.user.teacher.id);
        const candidates = await prisma.user.findMany({
          where: { schoolId: ctx.session.user.schoolId, status: "ACTIVE", role: "TEACHER", id: { not: ctx.session.user.id } },
          select: { id: true, firstName: true, lastName: true, role: true, teacher: { select: { id: true, staffNumber: true } } },
          orderBy: { firstName: "asc" },
        });
        const items = [];
        for (const c of candidates) {
          if (!c.teacher) continue;
          const theirSections = await sectionsOfTeacher(c.teacher.id);
          if (mySections.some((s) => theirSections.includes(s))) items.push(c);
        }
        return { items };
      }
      return { items: [] };
    },

    staffStatus: async (ctx) => {
      can(ctx, "staff:clock");
      const target = await resolveClockTarget(ctx, ctx.body.targetUserId);
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
