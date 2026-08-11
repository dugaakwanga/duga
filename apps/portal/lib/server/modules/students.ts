import bcrypt from "bcryptjs";
import { prisma } from "@duga/core/server";
import type { Module } from ".";
import { can, pick, str, num, studentScope, feeInfoOf } from "../helpers";
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
    return { items: students.map((s) => ({ ...s, fee: feeInfoOf(s) })), total: students.length };
  },

  async get(ctx) {
    can(ctx, "students:view");
    const role = ctx.session.user.role;
    const student = await prisma.student.findFirst({
      where: {
        id: ctx.id,
        schoolId: ctx.session.user.schoolId,
        // Parents can only view their own children's profiles.
        ...(role === "PARENT" ? await studentScope(ctx) : {}),
      },
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
    return { ...student, fee: feeInfoOf(student) };
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
    const feeAmount = num(b.feeAmount) ?? 0;
    const feeDays = Math.max(0, num(b.feeDays) ?? 0);

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

    // Fee window: if the admin sets an amount + days, the paid-through date is
    // today + days. The app auto-calculates remaining days and locks access on
    // expiry. If no fee is set, the student is not gated.
    const feePaidThrough = feeAmount > 0 && feeDays > 0 ? new Date(Date.now() + feeDays * 86400000) : null;

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
        feeAmount,
        feeDays,
        feePaidThrough,
      },
    });

    await prisma.placementHistory.create({
      data: { schoolId, studentId: student.id, toClassGroupId: classGroup.id, changedBy: ctx.session.user.id },
    });

    if (b.parentEmail || b.parentName) {
      // Link parent (create parent account if new)
      const parentEmail = str(b.parentEmail);
      const parentName = str(b.parentName);
      const parentPhone = b.parentPhone ? str(b.parentPhone) : "";
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
              phone: parentPhone || null,
              mustChangePassword: true,
            },
          });
          await prisma.parent.create({ data: { userId: parentUser.id, schoolId } });
        } else if (parentPhone && !parentUser.phone) {
          parentUser = await prisma.user.update({ where: { id: parentUser.id }, data: { phone: parentPhone } });
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
    const schoolId = ctx.session.user.schoolId;
    const data = pick(ctx.body, ["gender", "dateOfBirth", "isBoarding", "status", "currentClassGroupId", "photoUrl", "admissionNumber", "feeAmount", "feeDays"]);
    if (data.dateOfBirth) data.dateOfBirth = new Date(String(data.dateOfBirth));
    if (data.feeAmount !== undefined) data.feeAmount = num(ctx.body.feeAmount) ?? 0;
    if (data.feeDays !== undefined) data.feeDays = Math.max(0, num(ctx.body.feeDays) ?? 0);
    // Must exist in the caller's school.
    const existing = await prisma.student.findFirst({ where: { id: ctx.id, schoolId } });
    if (!existing) throw new Error("Student not found");
    // The destination class group must belong to the caller's school.
    if (data.currentClassGroupId) {
      const cg = await prisma.classGroup.findFirst({ where: { id: String(data.currentClassGroupId), schoolId } });
      if (!cg) throw new Error("Class not found");
    }
    // If the fee amount/days changed, extend the paid-through window from now.
    if (data.feeAmount !== undefined || data.feeDays !== undefined) {
      const feeDays = (data.feeDays as number) ?? existing.feeDays;
      const feeAmount = (data.feeAmount as number) ?? Number(existing.feeAmount);
      data.feePaidThrough = feeAmount > 0 && feeDays > 0 ? new Date(Date.now() + feeDays * 86400000) : existing.feePaidThrough;
    }
    const student = await prisma.student.update({ where: { id: ctx.id }, data });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "student.updated", entityType: "Student", entityId: ctx.id, meta: data });
    return { ...student, fee: feeInfoOf(student) };
  },

  // Promote / change class
  actions: {
    // Set / renew a student's fee window (amount, days) and reopen access.
    setFee: async (ctx) => {
      can(ctx, "students:manage");
      const schoolId = ctx.session.user.schoolId;
      const feeAmount = num(ctx.body.feeAmount) ?? 0;
      const feeDays = Math.max(0, num(ctx.body.feeDays) ?? 0);
      const student = await prisma.student.findFirst({ where: { id: ctx.id, schoolId } });
      if (!student) throw new Error("Student not found");
      const paidThrough = feeAmount > 0 && feeDays > 0 ? new Date(Date.now() + feeDays * 86400000) : null;
      const updated = await prisma.student.update({
        where: { id: ctx.id },
        data: { feeAmount, feeDays, feePaidThrough: paidThrough },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "student.fee.set", entityType: "Student", entityId: ctx.id, meta: { feeAmount, feeDays } });
      return { ...updated, fee: feeInfoOf(updated) };
    },
    promote: async (ctx) => {
      can(ctx, "students:promote");
      const schoolId = ctx.session.user.schoolId;
      const classGroupId = str(ctx.body.classGroupId);
      const reason = str(ctx.body.reason);
      if (!classGroupId) throw new Error("classGroupId required");
      const student = await prisma.student.findFirst({ where: { id: ctx.id, schoolId } });
      if (!student) throw new Error("Student not found");
      const cg = await prisma.classGroup.findFirst({ where: { id: classGroupId, schoolId } });
      if (!cg) throw new Error("Class not found");
      await prisma.student.update({ where: { id: ctx.id }, data: { currentClassGroupId: classGroupId } });
      await prisma.placementHistory.create({
        data: {
          schoolId,
          studentId: ctx.id!,
          fromClassGroupId: student.currentClassGroupId,
          toClassGroupId: classGroupId,
          changedBy: ctx.session.user.id,
          reason,
        },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "student.promoted", entityType: "Student", entityId: ctx.id, meta: { classGroupId } });
      return { ok: true };
    },
  },
};
