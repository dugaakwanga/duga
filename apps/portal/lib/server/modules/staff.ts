import bcrypt from "bcryptjs";
import { prisma } from "@duga/core/server";
import { logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str } from "../helpers";

export const staffModule: Module = {
  async list(ctx) {
    can(ctx, "staff:view");
    const users = await prisma.user.findMany({
      where: {
        schoolId: ctx.session.user.schoolId,
        role: { in: ["TEACHER", "ADMIN", "OWNER"] },
      },
      include: { teacher: true, admin: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    return { items: users, total: users.length };
  },

  async get(ctx) {
    can(ctx, "staff:view");
    const user = await prisma.user.findUnique({
      where: { id: ctx.id },
      include: { teacher: true, admin: true },
    });
    if (!user || user.schoolId !== ctx.session.user.schoolId) throw new Error("Staff not found");
    return user;
  },

  async create(ctx) {
    can(ctx, "staff:manage");
    const schoolId = ctx.session.user.schoolId;
    const b = ctx.body;
    const role = str(b.role);
    const firstName = str(b.firstName);
    const lastName = str(b.lastName);
    const email = str(b.email)?.toLowerCase();
    const phone = str(b.phone);
    const staffNumber = str(b.staffNumber);
    // The teacher can be created with any single identifier — email, phone or staff number.
    if (!role || !firstName || !lastName) throw new Error("role, firstName and lastName are required");
    if (!email && !phone && !staffNumber) throw new Error("Provide at least one of email, phone number or staff ID");
    if (!["TEACHER", "ADMIN"].includes(role)) throw new Error("Invalid staff role");

    const emailOrGenerated = email ?? (staffNumber ? `${staffNumber}@staff.local` : `${phone}@phone.local`);
    const existing = await prisma.user.findFirst({
      where: { schoolId, OR: [{ email: emailOrGenerated }, ...(phone ? [{ phone }] : [])] },
    });
    if (existing) throw new Error("A user with this email, phone or staff ID already exists");
    if (staffNumber && role === "TEACHER") {
      const takenNo = await prisma.teacher.findUnique({ where: { schoolId_staffNumber: { schoolId, staffNumber } } });
      if (takenNo) throw new Error("A teacher with this staff number already exists");
    }

    const user = await prisma.user.create({
      data: {
        schoolId,
        role: role as "TEACHER" | "ADMIN",
        email: emailOrGenerated,
        phone,
        passwordHash: await bcrypt.hash(str(b.tempPassword) ?? "password123", 10),
        firstName,
        lastName,
        mustChangePassword: true,
      },
    });

    if (role === "TEACHER") {
      await prisma.teacher.create({
        data: {
          userId: user.id,
          schoolId,
          staffNumber: staffNumber ?? `STF-${String((await prisma.teacher.count({ where: { schoolId } })) + 1).padStart(3, "0")}`,
          specialty: str(b.specialty),
          designation: str(b.designation) ?? "Teacher",
        },
      });
    } else {
      await prisma.admin.create({ data: { userId: user.id, schoolId, designation: str(b.designation) ?? "Staff" } });
    }

    await logAudit({ schoolId, userId: ctx.session.user.id, action: "staff.created", entityType: "User", entityId: user.id, meta: { role } });
    return { id: user.id, email: user.email };
  },

  async update(ctx) {
    can(ctx, "staff:manage");
    const data: Record<string, unknown> = {};
    const b = ctx.body;
    if (b.status) data.status = String(b.status);
    if (b.phone) data.phone = String(b.phone);
    const user = await prisma.user.update({ where: { id: ctx.id }, data });
    if (b.specialty) await prisma.teacher.updateMany({ where: { userId: ctx.id }, data: { specialty: String(b.specialty) } });
    if (b.designation) await prisma.teacher.updateMany({ where: { userId: ctx.id }, data: { designation: String(b.designation) } });
    await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "staff.updated", entityType: "User", entityId: ctx.id, meta: data });
    return user;
  },
};
