import { prisma } from "@duga/core/server";
import { logAudit, dispatchNotification } from "@duga/core/server";
import { verifyGateToken, signGateToken } from "@duga/core";
import type { Module } from ".";
import { can, str, isOwnerOrAdmin } from "../helpers";

function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function notifyParents(schoolId: string, studentId: string, title: string, body: string) {
  const links = await prisma.studentParent.findMany({ where: { studentId }, select: { parent: { select: { userId: true } } } });
  const userIds = links.map((l) => l.parent.userId);
  await Promise.all(
    userIds.map((userId) =>
      dispatchNotification({ schoolId, userId, type: "gate", title, body, channels: ["IN_APP", "EMAIL"] }).catch(() => undefined),
    ),
  );
}

async function findStudentByCodeOrAdmission(schoolId: string, code: string) {
  const token = await verifyGateToken(code);
  if (token && token.schoolId === schoolId) {
    return prisma.student.findFirst({ where: { id: token.sub, schoolId }, include: { user: { select: { firstName: true, lastName: true, status: true } } } });
  }
  // Manual fallback: staff can type the admission number when the camera
  // isn't available or the card can't be scanned.
  return prisma.student.findFirst({ where: { schoolId, admissionNumber: { equals: code, mode: "insensitive" } }, include: { user: { select: { firstName: true, lastName: true, status: true } } } });
}

export const securityModule: Module = {
  // Today's gate activity + a running visitor list, for the gate dashboard.
  async list(ctx) {
    can(ctx, "gate:view");
    const schoolId = ctx.session.user.schoolId;
    const [gateLogs, visitors] = await Promise.all([
      prisma.gateLog.findMany({
        where: { schoolId, date: todayUTC() },
        include: { student: { select: { admissionNumber: true, user: { select: { firstName: true, lastName: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
      prisma.visitorLog.findMany({ where: { schoolId, timeIn: { gte: todayUTC() } }, orderBy: { timeIn: "desc" }, take: 100 }),
    ]);
    return { gateLogs, visitors };
  },

  actions: {
    // Scan (QR) or manually enter a student's admission number at the gate.
    // First scan of the day = clock-in; a second scan = clock-out. Parents
    // are emailed + notified in-app either way.
    scan: async (ctx) => {
      can(ctx, "gate:scan");
      const schoolId = ctx.session.user.schoolId;
      const code = str(ctx.body.code);
      if (!code) throw new Error("Scan a QR code or enter an admission number");
      const student = await findStudentByCodeOrAdmission(schoolId, code);
      if (!student) throw new Error("No matching student found");
      if (student.user.status !== "ACTIVE") throw new Error(`${student.user.firstName} ${student.user.lastName}'s account is not active`);

      const date = todayUTC();
      const existing = await prisma.gateLog.findUnique({ where: { studentId_date: { studentId: student.id, date } } });
      const name = `${student.user.firstName} ${student.user.lastName}`;

      if (!existing || !existing.checkInAt) {
        const log = await prisma.gateLog.upsert({
          where: { studentId_date: { studentId: student.id, date } },
          update: { checkInAt: new Date(), checkInMethod: "QR", checkInByUserId: ctx.session.user.id },
          create: { schoolId, studentId: student.id, date, checkInAt: new Date(), checkInMethod: "QR", checkInByUserId: ctx.session.user.id },
        });
        await logAudit({ schoolId, userId: ctx.session.user.id, action: "gate.checkIn", entityType: "GateLog", entityId: log.id, meta: { studentId: student.id } });
        await notifyParents(schoolId, student.id, "Arrived at school", `${name} clocked in at the school gate at ${new Date().toLocaleTimeString()}.`);
        return { direction: "IN", student: name, admissionNumber: student.admissionNumber, at: log.checkInAt };
      }

      if (!existing.checkOutAt) {
        const log = await prisma.gateLog.update({
          where: { id: existing.id },
          data: { checkOutAt: new Date(), checkOutMethod: "QR", checkOutByUserId: ctx.session.user.id },
        });
        await logAudit({ schoolId, userId: ctx.session.user.id, action: "gate.checkOut", entityType: "GateLog", entityId: log.id, meta: { studentId: student.id } });
        await notifyParents(schoolId, student.id, "Left school", `${name} clocked out at the school gate at ${new Date().toLocaleTimeString()}.`);
        return { direction: "OUT", student: name, admissionNumber: student.admissionNumber, at: log.checkOutAt };
      }

      throw new Error(`${name} has already clocked in and out today. Use "Permitted exit" if they need to leave again.`);
    },

    // Early/permitted exit — a distinct, reasoned departure, separate from
    // the routine end-of-day clock-out.
    permittedExit: async (ctx) => {
      can(ctx, "gate:scan");
      const schoolId = ctx.session.user.schoolId;
      const code = str(ctx.body.code);
      const reason = str(ctx.body.reason);
      if (!code) throw new Error("Enter the student's admission number or scan their code");
      if (!reason) throw new Error("A reason is required for a permitted exit");
      const student = await findStudentByCodeOrAdmission(schoolId, code);
      if (!student) throw new Error("No matching student found");
      const name = `${student.user.firstName} ${student.user.lastName}`;

      const date = todayUTC();
      const log = await prisma.gateLog.upsert({
        where: { studentId_date: { studentId: student.id, date } },
        update: { permittedExitAt: new Date(), permittedExitReason: reason, permittedExitByUserId: ctx.session.user.id },
        create: { schoolId, studentId: student.id, date, permittedExitAt: new Date(), permittedExitReason: reason, permittedExitByUserId: ctx.session.user.id },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "gate.permittedExit", entityType: "GateLog", entityId: log.id, meta: { studentId: student.id, reason } });
      await notifyParents(schoolId, student.id, "Permitted early exit", `${name} left school early (${reason}) at ${new Date().toLocaleTimeString()}.`);
      return { student: name, admissionNumber: student.admissionNumber, at: log.permittedExitAt };
    },

    logVisitor: async (ctx) => {
      can(ctx, "gate:scan");
      const schoolId = ctx.session.user.schoolId;
      const name = str(ctx.body.name);
      if (!name) throw new Error("Visitor name is required");
      const visitor = await prisma.visitorLog.create({
        data: {
          schoolId,
          name,
          phone: str(ctx.body.phone),
          purpose: str(ctx.body.purpose),
          hostName: str(ctx.body.hostName),
          recordedByUserId: ctx.session.user.id,
        },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "visitor.logged", entityType: "VisitorLog", entityId: visitor.id });
      return visitor;
    },

    checkOutVisitor: async (ctx) => {
      can(ctx, "gate:scan");
      const schoolId = ctx.session.user.schoolId;
      const id = str(ctx.body.id);
      if (!id) throw new Error("id required");
      const visitor = await prisma.visitorLog.findFirst({ where: { id, schoolId } });
      if (!visitor) throw new Error("Visitor record not found");
      const updated = await prisma.visitorLog.update({ where: { id }, data: { timeOut: new Date() } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "visitor.checkedOut", entityType: "VisitorLog", entityId: id });
      return updated;
    },

    // The student's own QR payload, for printing on an ID card. Owner/admin
    // only — this is meant for administration, not general staff use.
    qrCode: async (ctx) => {
      if (!isOwnerOrAdmin(ctx)) throw new Error("Only the proprietor or school admin can generate ID card codes");
      const schoolId = ctx.session.user.schoolId;
      const studentId = str(ctx.body.studentId) ?? ctx.id;
      if (!studentId) throw new Error("studentId required");
      const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
      if (!student) throw new Error("Student not found");
      const token = await signGateToken(student.id, schoolId);
      return { studentId: student.id, code: token };
    },
  },
};
