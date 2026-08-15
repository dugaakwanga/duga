import bcrypt from "bcryptjs";
import { prisma } from "@duga/core/server";
import { logAudit, dispatchNotification } from "@duga/core/server";
import type { Module } from ".";
import { can, str } from "../helpers";

export const applicationsModule: Module = {
  async list(ctx) {
    can(ctx, "applications:view");
    const schoolId = ctx.session.user.schoolId;
    const status = ctx.query.get("status");
    const apps = await prisma.application.findMany({
      where: { schoolId, ...(status ? { status: status as never } : {}) },
      orderBy: { submittedAt: "desc" },
      take: 300,
    });
    const counts = await prisma.application.groupBy({ by: ["status"], where: { schoolId }, _count: true });
    return { items: apps, counts };
  },

  async get(ctx) {
    can(ctx, "applications:view");
    return prisma.application.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
  },

  actions: {
    updateStatus: async (ctx) => {
      can(ctx, "applications:manage");
      const schoolId = ctx.session.user.schoolId;
      const status = str(ctx.body.status);
      if (!status || !["RECEIVED", "REVIEWING", "APPROVED", "REJECTED", "WAITLISTED"].includes(status)) throw new Error("Invalid status");
      const app = await prisma.application.findFirst({ where: { id: ctx.id, schoolId } });
      if (!app) throw new Error("Application not found");
      const updated = await prisma.application.update({ where: { id: ctx.id }, data: { status: status as never, notes: str(ctx.body.notes) } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "application.updated", entityType: "Application", entityId: ctx.id, meta: { status } });

      // notify the applicant
      const user = await prisma.user.findFirst({ where: { schoolId, email: app.email }, select: { id: true } });
      if (user) {
        await dispatchNotification({ schoolId, userId: user.id, type: "application", title: `Application ${status.toLowerCase()}`, body: `Your application status is now: ${status}.`, link: "/portal/applications" });
      }
      return updated;
    },

    // Convert an APPROVED application into an enrolled student account.
    admit: async (ctx) => {
      can(ctx, "applications:manage");
      const schoolId = ctx.session.user.schoolId;
      const app = await prisma.application.findFirst({ where: { id: ctx.id, schoolId } });
      if (!app) throw new Error("Application not found");
      if (app.status !== "APPROVED") throw new Error("Only approved applications can be admitted");

      const classGroupId = str(ctx.body.classGroupId);
      if (!classGroupId) throw new Error("Choose a class to admit the student into");
      const classGroup = await prisma.classGroup.findFirst({ where: { id: classGroupId, schoolId }, include: { level: true } });
      if (!classGroup) throw new Error("Class not found");
      if (classGroup.level.section !== app.section) throw new Error("This class is in a different section from the application");

      const nameParts = app.applicantName.trim().split(/\s+/);
      const firstName = nameParts[0] ?? "Student";
      const lastName = nameParts.slice(1).join(" ") || "Applicant";
      const passwordHash = await bcrypt.hash(str(ctx.body.tempPassword) ?? "password123", 10);

      // Reuse an existing student user for this email if one already exists.
      let user = app.email ? await prisma.user.findFirst({ where: { schoolId, email: app.email, role: "STUDENT" } }) : null;
      if (!user) {
        user = await prisma.user.create({
          data: {
            schoolId,
            role: "STUDENT",
            email: app.email || null,
            phone: app.phone || null,
            passwordHash,
            firstName,
            lastName,
            mustChangePassword: true,
          },
        });
      }
      const existingStudent = await prisma.student.findFirst({ where: { userId: user.id, schoolId } });
      if (existingStudent) throw new Error("A student account already exists for this applicant");

      const admissionNumber = `DUGA/${classGroup.levelId.slice(0, 3).toUpperCase()}/${new Date().getFullYear()}/${String(
        (await prisma.student.count({ where: { schoolId } })) + 1,
      ).padStart(4, "0")}`;

      const student = await prisma.student.create({
        data: {
          userId: user.id,
          schoolId,
          admissionNumber,
          section: classGroup.level.section,
          gender: app.gender ?? undefined,
          dateOfBirth: app.dateOfBirth ?? undefined,
          currentClassGroupId: classGroup.id,
          status: "ACTIVE",
          feeAmount: 0,
          feeDays: 0,
          feePaidThrough: null,
        },
      });
      await prisma.placementHistory.create({
        data: { schoolId, studentId: student.id, toClassGroupId: classGroup.id, changedBy: ctx.session.user.id },
      });

      // Link an existing parent account when the application is tied to one.
      if (app.parentId) {
        const linked = await prisma.studentParent.findFirst({ where: { studentId: student.id, parentId: app.parentId } });
        if (!linked) {
          await prisma.studentParent.create({ data: { schoolId, studentId: student.id, parentId: app.parentId, isPrimary: true, relation: "GUARDIAN" } });
        }
      }

      const note = `Admitted on ${new Date().toISOString().slice(0, 10)} as ${admissionNumber}`;
      await prisma.application.update({ where: { id: app.id }, data: { notes: [app.notes, note].filter(Boolean).join("\n") || undefined } });

      await dispatchNotification({
        schoolId,
        userId: user.id,
        type: "application",
        title: "Congratulations — you've been admitted!",
        body: `Your admission number is ${admissionNumber}. Sign in to the student portal to begin.`,
        link: "/portal/student",
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "application.admitted", entityType: "Application", entityId: app.id, meta: { admissionNumber } });
      return { ok: true, studentId: student.id, admissionNumber, tempEmail: user.email };
    },
  },
};
