import { prisma } from "@duga/core/server";
import { logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str, isoDay } from "../helpers";

export const hostelModule: Module = {
  async list(ctx) {
    can(ctx, "hostel:view");
    const schoolId = ctx.session.user.schoolId;
    const role = ctx.session.user.role;

    if (role === "STUDENT") {
      const allocations = await prisma.hostelAllocation.findMany({
        where: { schoolId, studentId: ctx.session.user.student!.id, status: "ACTIVE" },
        include: { hostel: true, room: true, bed: true },
      });
      const nightAttendance = await prisma.nightAttendance.findMany({
        where: { schoolId, studentId: ctx.session.user.student!.id },
        orderBy: { date: "desc" },
        take: 30,
      });
      return { role, allocations, nightAttendance };
    }
    if (role === "PARENT") {
      const links = await prisma.studentParent.findMany({ where: { parentId: ctx.session.user.parent!.id }, select: { studentId: true } });
      const allocations = await prisma.hostelAllocation.findMany({
        where: { schoolId, studentId: { in: links.map((l) => l.studentId) }, status: "ACTIVE" },
        include: { student: { include: { user: { select: { firstName: true, lastName: true } } } }, hostel: true, room: true, bed: true },
      });
      return { role, allocations };
    }

    const hostels = await prisma.hostel.findMany({
      where: { schoolId },
      include: {
        rooms: { include: { beds: { include: { allocations: { where: { status: "ACTIVE" }, include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } } } } } } },
        allocations: { where: { status: "ACTIVE" }, include: { student: { include: { user: { select: { firstName: true, lastName: true } } } }, room: true, bed: true } },
        nightAttendance: true,
      },
    });
    const boardingStudents = await prisma.student.findMany({
      where: { schoolId, isBoarding: true, status: "ACTIVE" },
      include: { user: { select: { firstName: true, lastName: true } }, hostelAllocations: { where: { status: "ACTIVE" } } },
    });
    const incidents = await prisma.hostelIncident.findMany({ where: { schoolId }, orderBy: { date: "desc" }, take: 50 });
    return { role, hostels, boardingStudents, incidents };
  },

  actions: {
    // Admin: create hostel
    addHostel: async (ctx) => {
      can(ctx, "hostel:manage");
      const name = str(ctx.body.name);
      if (!name) throw new Error("name required");
      return prisma.hostel.create({
        data: {
          schoolId: ctx.session.user.schoolId,
          name,
          gender: str(ctx.body.gender) as "MALE" | "FEMALE" | undefined,
          capacity: Number(ctx.body.capacity) || 0,
          wardenUserId: str(ctx.body.wardenUserId),
        },
      });
    },

    updateHostel: async (ctx) => {
      can(ctx, "hostel:manage");
      const schoolId = ctx.session.user.schoolId;
      const hostel = await prisma.hostel.findFirst({ where: { id: ctx.id, schoolId } });
      if (!hostel) throw new Error("Hostel not found");
      const data: Record<string, unknown> = {};
      if (ctx.body.name !== undefined) data.name = str(ctx.body.name) ?? hostel.name;
      if (ctx.body.gender !== undefined) data.gender = str(ctx.body.gender) as "MALE" | "FEMALE" | undefined;
      if (ctx.body.capacity !== undefined) data.capacity = Number(ctx.body.capacity) || 0;
      if (ctx.body.wardenUserId !== undefined) data.wardenUserId = str(ctx.body.wardenUserId);
      return prisma.hostel.update({ where: { id: ctx.id }, data });
    },

    deleteHostel: async (ctx) => {
      can(ctx, "hostel:manage");
      const schoolId = ctx.session.user.schoolId;
      const hostel = await prisma.hostel.findFirst({ where: { id: ctx.id, schoolId } });
      if (!hostel) throw new Error("Hostel not found");
      const active = await prisma.hostelAllocation.count({ where: { hostelId: ctx.id, status: "ACTIVE" } });
      if (active > 0) throw new Error("This hostel still has active room allocations — release them first");
      const total = await prisma.hostelRoom.count({ where: { hostelId: ctx.id } });
      if (total > 0) throw new Error("Delete the rooms inside this hostel first");
      await prisma.hostel.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "hostel.deleted", entityType: "Hostel", entityId: ctx.id });
      return { ok: true };
    },

    addRoom: async (ctx) => {
      can(ctx, "hostel:manage");
      const schoolId = ctx.session.user.schoolId;
      const hostelId = str(ctx.body.hostelId);
      const roomNumber = str(ctx.body.roomNumber);
      const capacity = Number(ctx.body.capacity) || 1;
      if (!hostelId || !roomNumber) throw new Error("hostelId and roomNumber required");
      const hostel = await prisma.hostel.findFirst({ where: { id: hostelId, schoolId } });
      if (!hostel) throw new Error("Hostel not found");
      const room = await prisma.hostelRoom.create({ data: { hostelId, roomNumber, capacity, floor: Number(ctx.body.floor) || undefined } });
      await prisma.hostelBed.createMany({
        data: Array.from({ length: capacity }, (_, i) => ({ roomId: room.id, bedNumber: String(i + 1) })),
      });
      return room;
    },

    updateRoom: async (ctx) => {
      can(ctx, "hostel:manage");
      const room = await prisma.hostelRoom.findFirst({
        where: { id: ctx.id, hostel: { schoolId: ctx.session.user.schoolId } },
        include: { hostel: true },
      });
      if (!room) throw new Error("Room not found");
      const roomId = room.id;
      const data: Record<string, unknown> = {};
      if (ctx.body.roomNumber !== undefined) data.roomNumber = str(ctx.body.roomNumber) ?? room.roomNumber;
      if (ctx.body.floor !== undefined) data.floor = Number(ctx.body.floor) || undefined;
      if (ctx.body.capacity !== undefined && Number(ctx.body.capacity) > 0) {
        data.capacity = Number(ctx.body.capacity);
        const existingBeds = await prisma.hostelBed.count({ where: { roomId } });
        const diff = Number(ctx.body.capacity) - existingBeds;
        if (diff > 0) {
          await prisma.hostelBed.createMany({
            data: Array.from({ length: diff }, (_, i) => ({ roomId, bedNumber: String(existingBeds + i + 1) })),
          });
        }
      }
      return prisma.hostelRoom.update({ where: { id: roomId }, data });
    },

    deleteRoom: async (ctx) => {
      can(ctx, "hostel:manage");
      const room = await prisma.hostelRoom.findFirst({
        where: { id: ctx.id, hostel: { schoolId: ctx.session.user.schoolId } },
      });
      if (!room) throw new Error("Room not found");
      const occupied = await prisma.hostelBed.count({ where: { roomId: ctx.id, isOccupied: true } });
      if (occupied > 0) throw new Error("This room still has occupied beds — release them first");
      await prisma.hostelRoom.delete({ where: { id: ctx.id } });
      return { ok: true };
    },

    // Admin: allocate a bed to a boarding student
    allocate: async (ctx) => {
      can(ctx, "hostel:manage");
      const schoolId = ctx.session.user.schoolId;
      const studentId = str(ctx.body.studentId);
      const bedId = str(ctx.body.bedId);
      if (!studentId || !bedId) throw new Error("studentId and bedId required");
      const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
      if (!student) throw new Error("Student not found");
      const bed = await prisma.hostelBed.findFirst({
        where: { id: bedId, room: { hostel: { schoolId } } },
        include: { room: { include: { hostel: true } }, allocations: { where: { status: "ACTIVE" } } },
      });
      if (!bed) throw new Error("Bed not found");
      if (bed.allocations.length > 0) throw new Error("Bed is occupied");
      const allocation = await prisma.hostelAllocation.create({
        data: {
          schoolId,
          studentId,
          hostelId: bed.room.hostelId,
          roomId: bed.roomId,
          bedId,
          termId: str(ctx.body.termId),
          allocatedBy: ctx.session.user.id,
        },
      });
      await prisma.hostelBed.update({ where: { id: bedId }, data: { isOccupied: true } });
      await prisma.student.update({ where: { id: studentId }, data: { isBoarding: true } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "hostel.allocated", entityType: "HostelAllocation", entityId: allocation.id });
      return allocation;
    },

    release: async (ctx) => {
      can(ctx, "hostel:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.hostelAllocation.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Allocation not found");
      const allocation = await prisma.hostelAllocation.update({ where: { id: ctx.id }, data: { status: "ENDED" } });
      await prisma.hostelBed.updateMany({ where: { id: allocation.bedId }, data: { isOccupied: false } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "hostel.released", entityType: "HostelAllocation", entityId: ctx.id });
      return allocation;
    },

    // Night attendance roll call
    nightAttendance: async (ctx) => {
      can(ctx, "hostel:manage");
      const schoolId = ctx.session.user.schoolId;
      const date = str(ctx.body.date) ?? isoDay(new Date());
      const entries = Array.isArray(ctx.body.entries) ? (ctx.body.entries as Array<{ studentId: string; status: string }>) : [];
      const dateObj = new Date(`${date}T00:00:00Z`);
      let count = 0;
      const hostelId = typeof ctx.body.hostelId === "string" ? ctx.body.hostelId : "";
      for (const e of entries) {
        await prisma.nightAttendance.upsert({
          where: { studentId_date_hostelId: { studentId: e.studentId, date: dateObj, hostelId } },
          update: { status: e.status as "PRESENT", checkedByUserId: ctx.session.user.id },
          create: { schoolId, hostelId, studentId: e.studentId, date: dateObj, status: e.status as "PRESENT", checkedByUserId: ctx.session.user.id },
        });
        count += 1;
      }
      return { count };
    },

    // Incident log
    logIncident: async (ctx) => {
      can(ctx, "hostel:manage");
      const incident = await prisma.hostelIncident.create({
        data: {
          schoolId: ctx.session.user.schoolId,
          hostelId: str(ctx.body.hostelId) ?? "",
          reportedByUserId: ctx.session.user.id,
          studentId: str(ctx.body.studentId),
          severity: str(ctx.body.severity) ?? "LOW",
          title: str(ctx.body.title) ?? "Incident",
          description: str(ctx.body.description) ?? "",
        },
      });
      return incident;
    },

    resolveIncident: async (ctx) => {
      can(ctx, "hostel:manage");
      const incident = await prisma.hostelIncident.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
      if (!incident) throw new Error("Incident not found");
      return prisma.hostelIncident.update({
        where: { id: ctx.id },
        data: { status: "RESOLVED", actionTaken: str(ctx.body.actionTaken), resolvedAt: new Date() },
      });
    },

    deleteIncident: async (ctx) => {
      can(ctx, "hostel:manage");
      const incident = await prisma.hostelIncident.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
      if (!incident) throw new Error("Incident not found");
      await prisma.hostelIncident.delete({ where: { id: ctx.id } });
      return { ok: true };
    },
  },
};
