import { prisma } from "@duga/core/server";
import { logAudit, dispatchNotification } from "@duga/core/server";
import { verifyGateToken, signGateToken } from "@duga/core";
import type { Module } from ".";
import { can, str, isOwnerOrAdmin } from "../helpers";

function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// In-app only — gate events fire up to twice per student per day (arrival +
// departure), which for a school this size can exceed Resend's free-tier
// 100-emails/day cap before the school day is even over. Email would then
// silently stop working for the rest of the day with no visible sign to
// staff. In-app notifications have no such ceiling, so they're the reliable
// channel for this specific, high-volume event type.
async function notifyParents(schoolId: string, studentId: string, title: string, body: string) {
  const links = await prisma.studentParent.findMany({ where: { studentId }, select: { parent: { select: { userId: true } } } });
  const userIds = links.map((l) => l.parent.userId);
  await Promise.all(
    userIds.map((userId) =>
      dispatchNotification({ schoolId, userId, type: "gate", title, body, channels: ["IN_APP"] }).catch(() => undefined),
    ),
  );
}

// The QR now encodes a public verify URL (.../verify/<token>) rather than a
// bare token, so it does something useful in an ordinary camera/QR app too —
// see app/verify/[token]. The in-app scanner decodes that same URL text, so
// pull the token back out of it here before verifying.
function extractGateToken(code: string): string {
  if (!/^https?:\/\//i.test(code)) return code;
  const parts = code.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? code;
}

async function findStudentByCodeOrAdmission(schoolId: string, code: string) {
  const token = await verifyGateToken(extractGateToken(code));
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
    // Scan (camera QR) or manually enter a student's admission number at the
    // gate. The security guard picks an explicit mode — Clock In or Clock
    // Out — before scanning, so every scan in a session records the same
    // direction; there is no time-of-day window and no auto-toggling on
    // scan count. Re-scanning someone already recorded for that direction
    // today returns status "ALREADY" instead of erroring, so a continuous
    // scan loop doesn't stall on an accidental repeat scan.
    scan: async (ctx) => {
      can(ctx, "gate:scan");
      const schoolId = ctx.session.user.schoolId;
      const code = str(ctx.body.code);
      const mode = ctx.body.mode === "OUT" ? "OUT" : "IN";
      if (!code) throw new Error("Scan a QR code or enter an admission number");
      const student = await findStudentByCodeOrAdmission(schoolId, code);
      if (!student) throw new Error("No matching student found");
      if (student.user.status !== "ACTIVE") throw new Error(`${student.user.firstName} ${student.user.lastName}'s account is not active`);

      const date = todayUTC();
      const existing = await prisma.gateLog.findUnique({ where: { studentId_date: { studentId: student.id, date } } });
      const name = `${student.user.firstName} ${student.user.lastName}`;

      if (mode === "IN") {
        if (existing?.checkInAt) {
          return { status: "ALREADY" as const, direction: "IN" as const, student: name, admissionNumber: student.admissionNumber, at: existing.checkInAt };
        }
        const log = await prisma.gateLog.upsert({
          where: { studentId_date: { studentId: student.id, date } },
          update: { checkInAt: new Date(), checkInMethod: "QR", checkInByUserId: ctx.session.user.id },
          create: { schoolId, studentId: student.id, date, checkInAt: new Date(), checkInMethod: "QR", checkInByUserId: ctx.session.user.id },
        });
        await logAudit({ schoolId, userId: ctx.session.user.id, action: "gate.checkIn", entityType: "GateLog", entityId: log.id, meta: { studentId: student.id } });
        await notifyParents(schoolId, student.id, "Arrived at school", `${name} clocked in at the school gate at ${new Date().toLocaleTimeString()}.`);
        return { status: "OK" as const, direction: "IN" as const, student: name, admissionNumber: student.admissionNumber, at: log.checkInAt };
      }

      if (existing?.checkOutAt) {
        return { status: "ALREADY" as const, direction: "OUT" as const, student: name, admissionNumber: student.admissionNumber, at: existing.checkOutAt };
      }
      const log = await prisma.gateLog.upsert({
        where: { studentId_date: { studentId: student.id, date } },
        update: { checkOutAt: new Date(), checkOutMethod: "QR", checkOutByUserId: ctx.session.user.id },
        create: { schoolId, studentId: student.id, date, checkOutAt: new Date(), checkOutMethod: "QR", checkOutByUserId: ctx.session.user.id },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "gate.checkOut", entityType: "GateLog", entityId: log.id, meta: { studentId: student.id } });
      await notifyParents(schoolId, student.id, "Left school", `${name} clocked out at the school gate at ${new Date().toLocaleTimeString()}.`);
      return { status: "OK" as const, direction: "OUT" as const, student: name, admissionNumber: student.admissionNumber, at: log.checkOutAt };
    },

    // Early/permitted exit — a distinct, reasoned departure, separate from
    // the routine Clock In / Clock Out modes.
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
        update: { permittedExitAt: new Date(), permittedExitReason: reason, permittedExitByUserId: ctx.session.user.id, permittedReturnAt: null, permittedReturnByUserId: null },
        create: { schoolId, studentId: student.id, date, permittedExitAt: new Date(), permittedExitReason: reason, permittedExitByUserId: ctx.session.user.id },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "gate.permittedExit", entityType: "GateLog", entityId: log.id, meta: { studentId: student.id, reason } });
      await notifyParents(schoolId, student.id, "Permitted early exit", `${name} left school early (${reason}) at ${new Date().toLocaleTimeString()}.`);
      return { student: name, admissionNumber: student.admissionNumber, at: log.permittedExitAt };
    },

    // Records the student's return after a permitted exit — a distinct event
    // from the routine Clock In, since they never left the building via the
    // normal gate flow that morning.
    permittedReturn: async (ctx) => {
      can(ctx, "gate:scan");
      const schoolId = ctx.session.user.schoolId;
      const code = str(ctx.body.code);
      if (!code) throw new Error("Enter the student's admission number or scan their code");
      const student = await findStudentByCodeOrAdmission(schoolId, code);
      if (!student) throw new Error("No matching student found");
      const name = `${student.user.firstName} ${student.user.lastName}`;

      const date = todayUTC();
      const existing = await prisma.gateLog.findUnique({ where: { studentId_date: { studentId: student.id, date } } });
      if (!existing?.permittedExitAt) throw new Error(`${name} has no recorded permitted exit today.`);
      if (existing.permittedReturnAt) throw new Error(`${name} was already marked as returned at ${existing.permittedReturnAt.toLocaleTimeString()}.`);

      const log = await prisma.gateLog.update({
        where: { id: existing.id },
        data: { permittedReturnAt: new Date(), permittedReturnByUserId: ctx.session.user.id },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "gate.permittedReturn", entityType: "GateLog", entityId: log.id, meta: { studentId: student.id } });
      await notifyParents(schoolId, student.id, "Returned to school", `${name} returned to school at ${new Date().toLocaleTimeString()} after their permitted exit.`);
      return { student: name, admissionNumber: student.admissionNumber, at: log.permittedReturnAt };
    },

    // Registered staff/admin/owner accounts a visitor could be here to see —
    // powers the "who they're visiting" search. Kept on the gate:scan
    // permission (rather than staff:view, which SECURITY doesn't hold) since
    // it's purely for picking a notification target, not staff management.
    staffDirectory: async (ctx) => {
      can(ctx, "gate:scan");
      const schoolId = ctx.session.user.schoolId;
      const users = await prisma.user.findMany({
        where: { schoolId, role: { in: ["OWNER", "ADMIN", "BURSAR", "TEACHER"] }, status: "ACTIVE" },
        select: { id: true, role: true, firstName: true, lastName: true },
        orderBy: [{ role: "asc" }, { firstName: "asc" }],
        take: 500,
      });
      return users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`, role: u.role }));
    },

    logVisitor: async (ctx) => {
      can(ctx, "gate:scan");
      const schoolId = ctx.session.user.schoolId;
      const name = str(ctx.body.name);
      if (!name) throw new Error("Visitor name is required");
      const hostUserId = str(ctx.body.hostUserId);
      let hostName = str(ctx.body.hostName);
      let host: { firstName: string; lastName: string } | null = null;
      if (hostUserId) {
        host = await prisma.user.findFirst({ where: { id: hostUserId, schoolId }, select: { firstName: true, lastName: true } });
        if (host) hostName = `${host.firstName} ${host.lastName}`;
      }
      const visitor = await prisma.visitorLog.create({
        data: {
          schoolId,
          name,
          phone: str(ctx.body.phone),
          purpose: str(ctx.body.purpose),
          hostName,
          hostUserId: host ? hostUserId : null,
          recordedByUserId: ctx.session.user.id,
        },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "visitor.logged", entityType: "VisitorLog", entityId: visitor.id });
      if (host && hostUserId) {
        await dispatchNotification({
          schoolId,
          userId: hostUserId,
          type: "visitor",
          title: "You have a visitor",
          body: `${name} is at the gate to see you${visitor.purpose ? ` — ${visitor.purpose}` : ""}.`,
          channels: ["IN_APP", "EMAIL"],
        }).catch(() => undefined);
      }
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
