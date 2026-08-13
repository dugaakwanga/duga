import bcrypt from "bcryptjs";
import { prisma } from "@duga/core/server";
import type { Module } from ".";
import { can, pick, str, num, bool, studentScope, feeInfoOf, assertContactFree } from "../helpers";

// Create or update the primary linked parent for a student. If an email is
// given that matches the current parent, only name/phone are updated; otherwise
// a new (or existing) parent account is linked and made primary.
async function upsertParent(
  schoolId: string,
  studentId: string,
  opts: { email?: string; name?: string; phone?: string; tempPassword?: string },
): Promise<void> {
  const email = opts.email ? opts.email.toLowerCase() : undefined;
  const current = await prisma.studentParent.findFirst({
    where: { studentId },
    orderBy: { isPrimary: "desc" },
    include: { parent: { include: { user: true } } },
  });

  // Same parent already linked — just refresh name/phone.
  if (current && email && current.parent.user.email?.toLowerCase() === email) {
    const userData: Record<string, unknown> = {};
    if (opts.name) {
      const [fn, ...ln] = opts.name.trim().split(/\s+/);
      userData.firstName = fn ?? "Parent";
      userData.lastName = ln.join(" ") || "Guardian";
    }
    if (opts.phone) userData.phone = opts.phone;
    if (opts.tempPassword) {
      if (opts.tempPassword.length < 8) throw new Error("Parent password must be at least 8 characters");
      userData.passwordHash = await bcrypt.hash(opts.tempPassword, 10);
      userData.mustChangePassword = true;
    }
    if (Object.keys(userData).length) await prisma.user.update({ where: { id: current.parent.user.id }, data: userData });
    return;
  }

  // A parent email is required to link a (new) parent.
  if (!email) return;
  let parentUser = await prisma.user.findUnique({ where: { schoolId_email: { schoolId, email } } });
  if (!parentUser) {
    const name = opts.name?.trim() ?? "";
    parentUser = await prisma.user.create({
      data: {
        schoolId,
        role: "PARENT",
        email,
        passwordHash: await bcrypt.hash(opts.tempPassword ?? "parent123", 10),
        firstName: name.split(/\s+/)[0] ?? "Parent",
        lastName: name.split(/\s+/).slice(1).join(" ") || "Guardian",
        phone: opts.phone || null,
        mustChangePassword: !opts.tempPassword,
      },
    });
    await prisma.parent.create({ data: { userId: parentUser.id, schoolId } });
  } else if (opts.tempPassword) {
    if (opts.tempPassword.length < 8) throw new Error("Parent password must be at least 8 characters");
    await prisma.user.update({
      where: { id: parentUser.id },
      data: { passwordHash: await bcrypt.hash(opts.tempPassword, 10), mustChangePassword: true },
    });
  } else if (opts.phone && !parentUser.phone) {
    await prisma.user.update({ where: { id: parentUser.id }, data: { phone: opts.phone } });
  }
  const parentProfile = await prisma.parent.findUnique({ where: { userId: parentUser.id } });
  if (parentProfile) {
    await prisma.studentParent.updateMany({ where: { studentId }, data: { isPrimary: false } });
    await prisma.studentParent.upsert({
      where: { parentId_studentId: { parentId: parentProfile.id, studentId } },
      update: { isPrimary: true, relation: "GUARDIAN" },
      create: { parentId: parentProfile.id, studentId, schoolId, relation: "GUARDIAN", isPrimary: true },
    });
  }
}
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
        parentLinks: { include: { parent: { include: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } } } } },
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
    const isBoarding = bool(b.isBoarding) ?? false;
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
        email: email ?? null,
        phone,
        passwordHash,
        firstName,
        lastName,
        mustChangePassword: true,
      },
    });

    // This config is a price and duration, not a payment. Access begins only
    // when a successful payment is recorded.
    const feePaidThrough = null;

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
      await upsertParent(schoolId, student.id, {
        email: str(b.parentEmail),
        name: str(b.parentName),
        phone: b.parentPhone ? str(b.parentPhone) : undefined,
        tempPassword: b.parentTempPassword ? str(b.parentTempPassword) : undefined,
      });
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
    // Empty sentinel values must never reach Prisma (empty FK / date / photo).
    if (data.currentClassGroupId === "" || data.currentClassGroupId === undefined) delete data.currentClassGroupId;
    if (data.photoUrl === "") data.photoUrl = null;
    if (data.dateOfBirth) data.dateOfBirth = new Date(String(data.dateOfBirth));
    else if (data.dateOfBirth === "") delete data.dateOfBirth;
    if (data.gender !== undefined) data.gender = str(data.gender) ?? null;
    if (data.isBoarding !== undefined) data.isBoarding = bool(ctx.body.isBoarding);
    if (data.feeAmount !== undefined) data.feeAmount = num(ctx.body.feeAmount) ?? 0;
    if (data.feeDays !== undefined) data.feeDays = Math.max(0, num(ctx.body.feeDays) ?? 0);
    // Must exist in the caller's school.
    const existing = await prisma.student.findFirst({ where: { id: ctx.id, schoolId }, include: { user: true } });
    if (!existing) throw new Error("Student not found");
    // The destination class group must belong to the caller's school.
    if (data.currentClassGroupId) {
      const cg = await prisma.classGroup.findFirst({ where: { id: String(data.currentClassGroupId), schoolId } });
      if (!cg) throw new Error("Class not found");
    }
    // Changing the plan must not silently grant free access. A later payment
    // calculates and grants the appropriate number of days.
    if (data.feeAmount !== undefined || data.feeDays !== undefined) {
      const feeDays = (data.feeDays as number) ?? existing.feeDays;
      const feeAmount = (data.feeAmount as number) ?? Number(existing.feeAmount);
      if (feeAmount <= 0 || feeDays <= 0) data.feePaidThrough = null;
    }
    const student = await prisma.student.update({ where: { id: ctx.id }, data });

    // Editable user-level details (name, contact). A no-email account stays
    // email-free — never fabricate a placeholder address.
    const userData: Record<string, unknown> = {};
    if (typeof ctx.body.firstName === "string" && ctx.body.firstName) userData.firstName = String(ctx.body.firstName);
    if (typeof ctx.body.lastName === "string" && ctx.body.lastName) userData.lastName = String(ctx.body.lastName);
    if (typeof ctx.body.email === "string") userData.email = ctx.body.email ? String(ctx.body.email).toLowerCase() : null;
    if (typeof ctx.body.phone === "string") userData.phone = ctx.body.phone ? String(ctx.body.phone) : null;
    if (Object.keys(userData).length) {
      await assertContactFree(schoolId, existing.user.id, userData.email as string | null | undefined, userData.phone as string | null | undefined);
      await prisma.user.update({ where: { id: existing.userId }, data: userData });
    }

    // Parent contact — create or update the primary linked parent.
    const parentEmail = typeof ctx.body.parentEmail === "string" ? ctx.body.parentEmail : undefined;
    const parentName = typeof ctx.body.parentName === "string" ? ctx.body.parentName : undefined;
    const parentPhone = typeof ctx.body.parentPhone === "string" ? ctx.body.parentPhone : undefined;
    if (parentEmail || parentName || parentPhone) {
      await upsertParent(schoolId, existing.id, {
        email: parentEmail,
        name: parentName,
        phone: parentPhone,
        tempPassword: typeof ctx.body.parentTempPassword === "string" && ctx.body.parentTempPassword ? String(ctx.body.parentTempPassword) : undefined,
      });
    }

    await logAudit({ schoolId, userId: ctx.session.user.id, action: "student.updated", entityType: "Student", entityId: ctx.id, meta: data });
    const updated = await prisma.student.findFirst({
      where: { id: ctx.id, schoolId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true } }, classGroup: { include: { level: true } } },
    });
    return { ...(updated ?? student), fee: feeInfoOf(updated ?? student) };
  },

  // Soft delete: deactivate the account so the student can no longer sign in,
  // and mark the student withdrawn. Records (invoices, results, attendance)
  // are preserved for history.
  async remove(ctx) {
    can(ctx, "students:manage");
    const schoolId = ctx.session.user.schoolId;
    const student = await prisma.student.findFirst({ where: { id: ctx.id, schoolId }, include: { user: true } });
    if (!student) throw new Error("Student not found");
    await prisma.user.update({ where: { id: student.userId }, data: { status: "DEACTIVATED" } });
    await prisma.student.update({ where: { id: ctx.id }, data: { status: "WITHDRAWN" } });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "student.deleted", entityType: "Student", entityId: ctx.id });
    return { ok: true };
  },

  // Promote / change class
  actions: {
    // Configure a student's fee plan. Payments, not configuration, reopen access.
    setFee: async (ctx) => {
      can(ctx, "students:manage");
      const schoolId = ctx.session.user.schoolId;
      const feeAmount = num(ctx.body.feeAmount) ?? 0;
      const feeDays = Math.max(0, num(ctx.body.feeDays) ?? 0);
      const student = await prisma.student.findFirst({ where: { id: ctx.id, schoolId } });
      if (!student) throw new Error("Student not found");
      const updated = await prisma.student.update({
        where: { id: ctx.id },
        data: { feeAmount, feeDays, ...(feeAmount <= 0 || feeDays <= 0 ? { feePaidThrough: null } : {}) },
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
