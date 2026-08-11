import { prisma } from "@duga/core/server";
import { logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str } from "../helpers";

export const transportModule: Module = {
  async list(ctx) {
    can(ctx, "transport:view");
    const schoolId = ctx.session.user.schoolId;
    const role = ctx.session.user.role;

    const routes = await prisma.transportRoute.findMany({
      where: { schoolId },
      include: { stops: { orderBy: { order: "asc" } }, vehicles: true, assignments: { where: { status: "ACTIVE" }, include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } } } },
    });
    const vehicles = await prisma.vehicle.findMany({ where: { schoolId }, include: { route: true, driver: true, locations: { orderBy: { recordedAt: "desc" }, take: 1 } } });
    const drivers = await prisma.driver.findMany({ where: { schoolId } });

    if (role === "STUDENT") {
      const my = await prisma.transportAssignment.findMany({
        where: { schoolId, studentId: ctx.session.user.student!.id, status: "ACTIVE" },
        include: { route: { include: { vehicles: { include: { locations: { orderBy: { recordedAt: "desc" }, take: 1 } } } } }, stop: true },
      });
      return { role, routes, vehicles, drivers, my };
    }
    if (role === "PARENT") {
      const links = await prisma.studentParent.findMany({ where: { parentId: ctx.session.user.parent!.id }, select: { studentId: true } });
      const my = await prisma.transportAssignment.findMany({
        where: { schoolId, studentId: { in: links.map((l) => l.studentId) }, status: "ACTIVE" },
        include: { student: { include: { user: { select: { firstName: true, lastName: true } } } }, route: { include: { vehicles: { include: { locations: { orderBy: { recordedAt: "desc" }, take: 1 } } } } }, stop: true },
      });
      return { role, routes, vehicles, drivers, my };
    }
    return { role, routes, vehicles, drivers };
  },

  actions: {
    addRoute: async (ctx) => {
      can(ctx, "transport:manage");
      const name = str(ctx.body.name);
      if (!name) throw new Error("name required");
      return prisma.transportRoute.create({
        data: { schoolId: ctx.session.user.schoolId, name, description: str(ctx.body.description), fee: ctx.body.fee ? Number(ctx.body.fee) : undefined },
      });
    },

    updateRoute: async (ctx) => {
      can(ctx, "transport:manage");
      const schoolId = ctx.session.user.schoolId;
      const route = await prisma.transportRoute.findFirst({ where: { id: ctx.id, schoolId } });
      if (!route) throw new Error("Route not found");
      const data: Record<string, unknown> = {};
      if (ctx.body.name !== undefined) data.name = str(ctx.body.name) ?? route.name;
      if (ctx.body.description !== undefined) data.description = str(ctx.body.description);
      if (ctx.body.fee !== undefined) data.fee = ctx.body.fee === "" || ctx.body.fee === null ? null : Number(ctx.body.fee);
      return prisma.transportRoute.update({ where: { id: ctx.id }, data });
    },

    deleteRoute: async (ctx) => {
      can(ctx, "transport:manage");
      const schoolId = ctx.session.user.schoolId;
      const route = await prisma.transportRoute.findFirst({ where: { id: ctx.id, schoolId } });
      if (!route) throw new Error("Route not found");
      await prisma.transportRoute.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "transport.routeDeleted", entityType: "TransportRoute", entityId: ctx.id });
      return { ok: true };
    },

    addStop: async (ctx) => {
      can(ctx, "transport:manage");
      const routeId = str(ctx.body.routeId);
      const name = str(ctx.body.name);
      if (!routeId || !name) throw new Error("routeId and name required");
      const order = (await prisma.transportStop.count({ where: { routeId } })) + 1;
      return prisma.transportStop.create({
        data: { routeId, name, order, lat: ctx.body.lat ? Number(ctx.body.lat) : undefined, lng: ctx.body.lng ? Number(ctx.body.lng) : undefined, pickupTime: str(ctx.body.pickupTime) },
      });
    },

    updateStop: async (ctx) => {
      can(ctx, "transport:manage");
      const stop = await prisma.transportStop.findUnique({ where: { id: ctx.id } });
      if (!stop) throw new Error("Stop not found");
      const data: Record<string, unknown> = {};
      if (ctx.body.name !== undefined) data.name = str(ctx.body.name) ?? stop.name;
      if (ctx.body.pickupTime !== undefined) data.pickupTime = str(ctx.body.pickupTime);
      if (ctx.body.order !== undefined) data.order = Number(ctx.body.order);
      return prisma.transportStop.update({ where: { id: ctx.id }, data });
    },

    deleteStop: async (ctx) => {
      can(ctx, "transport:manage");
      const stop = await prisma.transportStop.findUnique({ where: { id: ctx.id } });
      if (!stop) throw new Error("Stop not found");
      const used = await prisma.transportAssignment.count({ where: { stopId: ctx.id, status: "ACTIVE" } });
      if (used > 0) throw new Error("This stop is still assigned to students");
      await prisma.transportStop.delete({ where: { id: ctx.id } });
      return { ok: true };
    },

    addVehicle: async (ctx) => {
      can(ctx, "transport:manage");
      const schoolId = ctx.session.user.schoolId;
      const plateNumber = str(ctx.body.plateNumber);
      if (!plateNumber) throw new Error("plateNumber required");
      const vehicle = await prisma.vehicle.create({
        data: { schoolId, plateNumber, model: str(ctx.body.model), capacity: Number(ctx.body.capacity) || 15, routeId: str(ctx.body.routeId) },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "transport.vehicleCreated", entityType: "Vehicle", entityId: vehicle.id });
      return vehicle;
    },

    updateVehicle: async (ctx) => {
      can(ctx, "transport:manage");
      const schoolId = ctx.session.user.schoolId;
      const vehicle = await prisma.vehicle.findFirst({ where: { id: ctx.id, schoolId } });
      if (!vehicle) throw new Error("Vehicle not found");
      const data: Record<string, unknown> = {};
      if (ctx.body.plateNumber !== undefined) data.plateNumber = str(ctx.body.plateNumber) ?? vehicle.plateNumber;
      if (ctx.body.model !== undefined) data.model = str(ctx.body.model);
      if (ctx.body.capacity !== undefined) data.capacity = Number(ctx.body.capacity) || 15;
      if (ctx.body.routeId !== undefined) data.routeId = str(ctx.body.routeId);
      return prisma.vehicle.update({ where: { id: ctx.id }, data });
    },

    deleteVehicle: async (ctx) => {
      can(ctx, "transport:manage");
      const schoolId = ctx.session.user.schoolId;
      const vehicle = await prisma.vehicle.findFirst({ where: { id: ctx.id, schoolId } });
      if (!vehicle) throw new Error("Vehicle not found");
      const used = await prisma.driver.count({ where: { vehicleId: ctx.id } });
      if (used > 0) throw new Error("Assign the driver to another vehicle first");
      await prisma.vehicle.delete({ where: { id: ctx.id } });
      return { ok: true };
    },

    addDriver: async (ctx) => {
      can(ctx, "transport:manage");
      const name = str(ctx.body.name);
      if (!name) throw new Error("name required");
      return prisma.driver.create({
        data: { schoolId: ctx.session.user.schoolId, name, phone: str(ctx.body.phone), licenseNumber: str(ctx.body.licenseNumber), vehicleId: str(ctx.body.vehicleId) },
      });
    },

    updateDriver: async (ctx) => {
      can(ctx, "transport:manage");
      const driver = await prisma.driver.findUnique({ where: { id: ctx.id } });
      if (!driver) throw new Error("Driver not found");
      const data: Record<string, unknown> = {};
      if (ctx.body.name !== undefined) data.name = str(ctx.body.name) ?? driver.name;
      if (ctx.body.phone !== undefined) data.phone = str(ctx.body.phone);
      if (ctx.body.licenseNumber !== undefined) data.licenseNumber = str(ctx.body.licenseNumber);
      if (ctx.body.vehicleId !== undefined) data.vehicleId = str(ctx.body.vehicleId);
      return prisma.driver.update({ where: { id: ctx.id }, data });
    },

    deleteDriver: async (ctx) => {
      can(ctx, "transport:manage");
      const driver = await prisma.driver.findUnique({ where: { id: ctx.id } });
      if (!driver) throw new Error("Driver not found");
      await prisma.driver.delete({ where: { id: ctx.id } });
      return { ok: true };
    },

    assignStudent: async (ctx) => {
      can(ctx, "transport:manage");
      const schoolId = ctx.session.user.schoolId;
      const studentId = str(ctx.body.studentId);
      const routeId = str(ctx.body.routeId);
      if (!studentId || !routeId) throw new Error("studentId and routeId required");
      await prisma.transportAssignment.updateMany({ where: { studentId, status: "ACTIVE" }, data: { status: "ENDED" } });
      const assignment = await prisma.transportAssignment.create({
        data: { schoolId, studentId, routeId, stopId: str(ctx.body.stopId), termId: str(ctx.body.termId) },
      });
      return assignment;
    },

    removeAssignment: async (ctx) => {
      can(ctx, "transport:manage");
      const schoolId = ctx.session.user.schoolId;
      const assignment = await prisma.transportAssignment.findFirst({ where: { id: ctx.id, schoolId } });
      if (!assignment) throw new Error("Assignment not found");
      await prisma.transportAssignment.update({ where: { id: ctx.id }, data: { status: "ENDED" } });
      return { ok: true };
    },

    // Driver/GPS: report current bus location
    updateBusLocation: async (ctx) => {
      can(ctx, "transport:manage");
      const vehicleId = str(ctx.body.vehicleId);
      const lat = Number(ctx.body.lat);
      const lng = Number(ctx.body.lng);
      if (!vehicleId || !lat || !lng) throw new Error("vehicleId, lat and lng required");
      const loc = await prisma.busLocation.create({
        data: { vehicleId, lat, lng, heading: ctx.body.heading ? Number(ctx.body.heading) : undefined, speed: ctx.body.speed ? Number(ctx.body.speed) : undefined },
      });
      return loc;
    },
  },
};
