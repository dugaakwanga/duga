import bcrypt from "bcryptjs";
import { prisma } from "@duga/core/server";
import type { Module } from ".";
import { can, pick, str } from "../helpers";
import { logAudit } from "@duga/core/server";

export const studentsModule: Module = {
  async list(ctx) {
    can(ctx, "students:view");
    const schoolId = ctx.session.user.schoolId;
    const level = ctx.query.get("level");
    const search = ctx.query.get("search");
    const students = await prisma.student.findMany({
      where: {
        schoolId,
        ...(level ? { classGroup: { levelId: level } } : {}),
        ...(search
          ? {
              OR: [
                { user: { firstName: { contains: search } } },
                { user: { lastName: { contains: search } } },
                { admissionNumber: { contains: search } },
              ],
            }
          : {}),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true } },
        classGroup: { include: { level: true } },
      },
      orderBy: { admissionNumber: "asc" },
      take: 300,
    });
    return { items: students, total: students.length };
  },

  async get(ctx) {
    can(ctx, "students:view");
    const student = await prisma.student.findUnique({
      where: { id: ctx.id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true, mustChangePassword: true } },
        classGroup: { include: { level: true, session: true } },
        parentLinks: { include: { parent: { include: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } } } } },
        invoices: { include: { payments: true } },
        hostelAllocations: { include: { hostel: true, room: true, bed: true } },
        transportAssignments: { include: { route: true, stop: true } },
        feeOverrides: true,
        reportCards: { include: { term: true } },
      },
    });
    if (!student) throw new Error("Student not found");
    return student;
  },

  // Enroll a new student (creates user account).
  async create(ctx) {
    can(ctx, "students:manage");
    const schoolId = ctx.session.user.schoolId;
    const b = ctx.body;
    const firstName = str(b.firstName);
    const lastName = str(b.lastName);
    const email = str(b.email);
    const phone = str(b.phone);
    const classGroupId = str(b.classGroupId);
    const gender = str(b.gender) as "MALE" | "FEMALE" | undefined;
    const dateOfBirth = str(b.dateOfBirth) ? new Date(String(b.dateOfBirth)) : undefined;
    const isBoarding = Boolean(b.isBoarding);

    if (!firstName || !lastName || !classGroupId) throw new Error("firstName, lastName and classGroupId are required");

    const classGroup = await prisma.classGroup.findFirst({ where: { id: classGroupId, schoolId }, include: { level: true } });
    if (!classGroup) throw new Error("Class not found");

    const admissionNumber =
      str(b.admissionNumber) ??
      `DUGA/${classGroup.levelId.slice(0, 3).toUpperCase()}/${new Date().getFullYear()}/${String(
        (await prisma.student.count({ where: { schoolId } })) + 1,
      ).padStart(4, "0")}`;

    const passwordHash = await bcrypt.hash(str(b.tempPassword) ?? "password123", 10);

    const user = await prisma.user.create({
      data: {
        schoolId,
        role: "STUDENT",
        email: email ?? `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(Math.random() * 1000)}@duga.local`,
        phone,
        passwordHash,
        firstName,
        lastName,
        mustChangePassword: true,
      },
    });

    const student = await prisma.student.create({
      data: {
        userId: user.id,
        schoolId,
        admissionNumber,
        section: classGroup.level.section,
        gender,
        dateOfBirth,
        isBoarding,
        currentClassGroupId: classGroup.id,
      },
    });

    await prisma.placementHistory.create({
      data: { schoolId, studentId: student.id, toClassGroupId: classGroup.id, changedBy: ctx.session.user.id },
    });

    if (b.parentEmail || b.parentName) {
      // Link parent (create parent account if new)
      const parentEmail = str(b.parentEmail);
      const parentName = str(b.parentName);
      if (parentEmail && parentName) {
        let parentUser = await prisma.user.findUnique({ where: { schoolId_email: { schoolId, email: parentEmail } } });
        if (!parentUser) {
          parentUser = await prisma.user.create({
            data: {
              schoolId,
              role: "PARENT",
              email: parentEmail,
              passwordHash: await bcrypt.hash("parent123", 10),
              firstName: parentName.split(" ")[0] ?? "Parent",
              lastName: parentName.split(" ").slice(1).join(" ") || "Guardian",
              mustChangePassword: true,
            },
          });
          await prisma.parent.create({ data: { userId: parentUser.id, schoolId } });
        }
        const parentProfile = await prisma.parent.findUnique({ where: { userId: parentUser.id } });
        if (parentProfile) {
          await prisma.studentParent.upsert({
            where: { parentId_studentId: { parentId: parentProfile.id, studentId: student.id } },
            update: {},
            create: { parentId: parentProfile.id, studentId: student.id, schoolId, relation: "GUARDIAN", isPrimary: true },
          });
        }
      }
    }

    await logAudit({
      schoolId,
      userId: ctx.session.user.id,
      action: "student.created",
      entityType: "Student",
      entityId: student.id,
      meta: { admissionNumber },
    });

    return { id: student.id, admissionNumber, tempEmail: user.email };
  },

  async update(ctx) {
    can(ctx, "students:manage");
    const data = pick(ctx.body, ["gender", "dateOfBirth", "isBoarding", "status", "currentClassGroupId", "photoUrl", "admissionNumber"]);
    if (data.dateOfBirth) data.dateOfBirth = new Date(String(data.dateOfBirth));
    const student = await prisma.student.update({ where: { id: ctx.id }, data });
    await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "student.updated", entityType: "Student", entityId: ctx.id, meta: data });
    return student;
  },

  // Promote / change class
  actions: {
    promote: async (ctx) => {
      can(ctx, "students:promote");
      const classGroupId = str(ctx.body.classGroupId);
      const reason = str(ctx.body.reason);
      if (!classGroupId) throw new Error("classGroupId required");
      const student = await prisma.student.findUnique({ where: { id: ctx.id } });
      if (!student) throw new Error("Student not found");
      await prisma.student.update({ where: { id: ctx.id }, data: { currentClassGroupId: classGroupId } });
      await prisma.placementHistory.create({
        data: {
          schoolId: ctx.session.user.schoolId,
          studentId: ctx.id!,
          fromClassGroupId: student.currentClassGroupId,
          toClassGroupId: classGroupId,
          changedBy: ctx.session.user.id,
          reason,
        },
      });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "student.promoted", entityType: "Student", entityId: ctx.id, meta: { classGroupId } });
      return { ok: true };
    },
  },
};
