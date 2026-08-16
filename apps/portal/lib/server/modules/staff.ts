import bcrypt from "bcryptjs";
import { prisma } from "@duga/core/server";
import { logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str, assertContactFree, resolveSection, sectionArray, sectionsOfAdmin, sectionsOfTeacher } from "../helpers";

function assertStaffTargetAccess(actorRole: string, targetRole: string) {
  if (actorRole !== "OWNER" && ["OWNER", "ADMIN", "BURSAR"].includes(targetRole)) {
    throw new Error("Only the school owner can manage administrator or bursar accounts");
  }
}

function subjectIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

function teacherSections(value: unknown): string[] {
  return sectionArray(value);
}

// Every staff member gets a staff number (their login ID). Teachers use the
// STF- prefix; administrators/bursars the ADM- prefix. When one is not given,
// the next sequential number is generated.
async function nextStaffNumber(schoolId: string, prefix: "STF" | "ADM", model: "teacher" | "admin"): Promise<string> {
  const count =
    model === "teacher"
      ? await prisma.teacher.count({ where: { schoolId } })
      : await prisma.admin.count({ where: { schoolId } });
  return `${prefix}-${String(count + 1).padStart(3, "0")}`;
}

export const staffModule: Module = {
  async list(ctx) {
    can(ctx, "staff:view");
    const section = await resolveSection(ctx);
    const schoolId = ctx.session.user.schoolId;
    const [users, subjects, schoolSections] = await Promise.all([
      prisma.user.findMany({
        where: {
          schoolId,
          role: { in: ["TEACHER", "ADMIN", "BURSAR", "OWNER"] },
          status: { not: "DEACTIVATED" },
        },
        select: {
          id: true,
          role: true,
          email: true,
          phone: true,
          avatarUrl: true,
          status: true,
          firstName: true,
          lastName: true,
          teacher: true,
          admin: true,
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
      prisma.subject.findMany({ where: { schoolId, ...(section ? { section } : {}) }, select: { id: true, name: true, section: true }, orderBy: [{ section: "asc" }, { name: "asc" }] }),
      prisma.schoolSection.findMany({ where: { schoolId }, select: { name: true }, orderBy: [{ order: "asc" }, { name: "asc" }] }),
    ]);
    const scopedUsers = section
      ? await Promise.all(users.map(async (user) => {
          const sections = user.teacher
            ? await sectionsOfTeacher(user.teacher.id)
            : user.admin
              ? await sectionsOfAdmin(user.admin.id, schoolId)
              : [];
          // Compare section names case-insensitively. Staff with no explicit
          // section assignment, or whose stored section names no longer match
          // any existing school section (e.g. legacy "PRIMARY"/"SECONDARY"
          // values after sections were renamed), work across the whole school
          // and stay visible in every section view.
          const valid = schoolSections.map((s) => s.name.trim().toLowerCase());
          const assigned = sections.map((s) => s.trim().toLowerCase());
          const overlap = assigned.filter((s) => valid.includes(s));
          const fullSchool = assigned.length === 0 || overlap.length === 0;
          return fullSchool || overlap.includes(section.trim().toLowerCase()) ? user : null;
        })).then((rows) => rows.filter((row): row is typeof users[number] => !!row))
      : users;
    return { items: scopedUsers, subjects, sections: schoolSections.map((s) => s.name), total: scopedUsers.length, role: ctx.session.user.role };
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
    const tempPassword = str(b.tempPassword);
    const assignedSubjectIds = subjectIds(b.subjectIds);
    const assignedSections = teacherSections(b.sections);
    // The teacher can be created with any single identifier — email, phone or staff number.
    if (!role || !firstName || !lastName) throw new Error("role, firstName and lastName are required");
    if (!email && !phone && !staffNumber) throw new Error("Provide at least one of email, phone number or staff ID");
    if (!["TEACHER", "ADMIN", "BURSAR"].includes(role)) throw new Error("Invalid staff role");
    assertStaffTargetAccess(ctx.session.user.role, role);
    if (tempPassword && tempPassword.length < 8) throw new Error("Temporary password must be at least 8 characters");
    if (role !== "TEACHER" && assignedSubjectIds.length) throw new Error("Only teachers can be assigned subjects");
    if (ctx.session.user.role !== "OWNER" && role !== "TEACHER" && assignedSections.length) throw new Error("Only the school owner can assign sections to administrators or bursars");
    if (role === "TEACHER" && assignedSections.length === 0) throw new Error("Assign the teacher to Primary, Secondary, or both");
    if (assignedSubjectIds.length) {
      const count = await prisma.subject.count({ where: { schoolId, id: { in: assignedSubjectIds }, section: { in: assignedSections } } });
      if (count !== assignedSubjectIds.length) throw new Error("One or more selected subjects were not found");
    }

    const existing = await prisma.user.findFirst({
      where: { schoolId, OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
      include: { teacher: true, admin: true },
    });
    if (existing && existing.status !== "DEACTIVATED") {
      throw new Error("A user with this email, phone or staff ID already exists");
    }
    if (staffNumber && role === "TEACHER") {
      // On reactivation the existing user's own teacher record must not count
      // as a conflict when they keep their staff number.
      const takenNo = await prisma.teacher.findFirst({
        where: { schoolId, staffNumber, ...(existing ? { userId: { not: existing.id } } : {}) },
      });
      if (takenNo) throw new Error("A teacher with this staff number already exists");
    }

    // A removed account (soft delete) still holds its email/phone, so re-adding
    // the same staff member reactivates that row instead of creating a
    // duplicate (which would violate the school/email uniqueness constraint).
    if (existing) {
      const user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          status: "ACTIVE",
          role: role as "TEACHER" | "ADMIN" | "BURSAR",
          firstName,
          lastName,
          email: email ?? null,
          phone,
          passwordHash: await bcrypt.hash(tempPassword ?? "password123", 10),
          mustChangePassword: true,
        },
      });
      if (role === "TEACHER") {
        await prisma.admin.deleteMany({ where: { userId: existing.id, schoolId } });
        if (existing.teacher) {
          await prisma.teacher.update({
            where: { userId: existing.id },
            data: {
              staffNumber: staffNumber ?? existing.teacher.staffNumber,
              specialty: str(b.specialty),
              subjectIds: assignedSubjectIds,
              sections: assignedSections,
              designation: str(b.designation) ?? "Teacher",
            },
          });
        } else {
          await prisma.teacher.create({
            data: {
              userId: existing.id,
              schoolId,
              staffNumber: staffNumber ?? (await nextStaffNumber(schoolId, "STF", "teacher")),
              specialty: str(b.specialty),
              subjectIds: assignedSubjectIds,
              sections: assignedSections,
              designation: str(b.designation) ?? "Teacher",
            },
          });
        }
      } else {
        await prisma.teacher.deleteMany({ where: { userId: existing.id, schoolId } });
        if (existing.admin) {
          await prisma.admin.update({
            where: { userId: existing.id },
            data: {
              designation: str(b.designation) ?? "Staff",
              sections: assignedSections.length ? assignedSections : undefined,
              staffNumber: staffNumber ?? existing.admin.staffNumber,
            },
          });
        } else {
          await prisma.admin.create({
            data: {
              userId: existing.id,
              schoolId,
              designation: str(b.designation) ?? "Staff",
              sections: assignedSections.length ? assignedSections : undefined,
              staffNumber: staffNumber ?? (await nextStaffNumber(schoolId, "ADM", "admin")),
            },
          });
        }
      }
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "staff.reactivated", entityType: "User", entityId: existing.id, meta: { role } });
      return { id: existing.id, email: user.email, reactivated: true };
    }

    const user = await prisma.user.create({
      data: {
        schoolId,
        role: role as "TEACHER" | "ADMIN" | "BURSAR",
        email: email ?? null,
        phone,
        passwordHash: await bcrypt.hash(tempPassword ?? "password123", 10),
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
          staffNumber: staffNumber ?? (await nextStaffNumber(schoolId, "STF", "teacher")),
          specialty: str(b.specialty),
          subjectIds: assignedSubjectIds,
          sections: assignedSections,
          designation: str(b.designation) ?? "Teacher",
        },
      });
    } else {
      await prisma.admin.create({
        data: {
          userId: user.id,
          schoolId,
          designation: str(b.designation) ?? "Staff",
          sections: assignedSections.length ? assignedSections : undefined,
          staffNumber: staffNumber ?? (await nextStaffNumber(schoolId, "ADM", "admin")),
        },
      });
    }

    await logAudit({ schoolId, userId: ctx.session.user.id, action: "staff.created", entityType: "User", entityId: user.id, meta: { role } });
    return { id: user.id, email: user.email };
  },

  async update(ctx) {
    can(ctx, "staff:manage");
    const schoolId = ctx.session.user.schoolId;
    const target = await prisma.user.findFirst({
      where: { id: ctx.id, schoolId },
      include: { teacher: true, admin: true },
    });
    if (!target) throw new Error("Staff member not found");
    if (!["TEACHER", "ADMIN", "BURSAR", "OWNER"].includes(target.role)) throw new Error("Not a staff member");
    assertStaffTargetAccess(ctx.session.user.role, target.role);
    if (target.role === "OWNER" && ctx.session.user.role !== "OWNER") throw new Error("Only the school owner can update the owner account");
    const data: Record<string, unknown> = {};
    const b = ctx.body;
    if (typeof b.firstName === "string" && b.firstName) data.firstName = String(b.firstName);
    if (typeof b.lastName === "string" && b.lastName) data.lastName = String(b.lastName);
    if (typeof b.email === "string") data.email = b.email ? String(b.email).toLowerCase() : null;
    if (typeof b.phone === "string") data.phone = b.phone ? String(b.phone) : null;
    if (b.avatarUrl) data.avatarUrl = String(b.avatarUrl);
    if (b.status) data.status = String(b.status);
    const newRole = str(b.role);
    if (newRole && ["TEACHER", "ADMIN", "BURSAR"].includes(newRole) && newRole !== target.role) {
      if (target.role === "OWNER") throw new Error("The owner account role cannot be changed");
      assertStaffTargetAccess(ctx.session.user.role, newRole);
      data.role = newRole;
    }
    if (Object.keys(data).length) {
      await assertContactFree(schoolId, target.id, data.email as string | null | undefined, data.phone as string | null | undefined);
      await prisma.user.update({ where: { id: ctx.id }, data });
    }

    const finalRole = (data.role as string) ?? target.role;
    const assignedSubjectIds = subjectIds(b.subjectIds);
    const assignedSections = teacherSections(b.sections);

    if (finalRole === "TEACHER") {
      if (!target.teacher) {
        // Transitioning admin/bursar -> teacher: build the teacher profile.
        const staffNumber = str(b.staffNumber) ?? (await nextStaffNumber(schoolId, "STF", "teacher"));
        const takenNo = await prisma.teacher.findUnique({ where: { schoolId_staffNumber: { schoolId, staffNumber } } });
        if (takenNo) throw new Error("A teacher with this staff number already exists");
        await prisma.teacher.create({
          data: {
            userId: target.id,
            schoolId,
            staffNumber,
            specialty: str(b.specialty),
            subjectIds: assignedSubjectIds,
            sections: assignedSections,
            designation: str(b.designation) ?? "Teacher",
          },
        });
      } else {
        const staffNumber = str(b.staffNumber);
        if (staffNumber) {
          const taken = staffNumber !== target.teacher.staffNumber
            ? await prisma.teacher.findFirst({ where: { schoolId, staffNumber, userId: { not: ctx.id } } })
            : null;
          if (taken) throw new Error("A teacher with this staff number already exists");
          await prisma.teacher.updateMany({ where: { userId: ctx.id, schoolId }, data: { staffNumber } });
        }
        if (b.specialty) await prisma.teacher.updateMany({ where: { userId: ctx.id, schoolId }, data: { specialty: String(b.specialty) } });
        if (b.designation) await prisma.teacher.updateMany({ where: { userId: ctx.id, schoolId }, data: { designation: String(b.designation) } });
      }
      if (b.subjectIds !== undefined) {
        const effectiveSections = b.sections !== undefined ? assignedSections : sectionArray(target.teacher?.sections);
        if (effectiveSections.length === 0) throw new Error("Assign the teacher to a school section before assigning subjects");
        const count = await prisma.subject.count({ where: { schoolId, id: { in: assignedSubjectIds }, section: { in: effectiveSections } } });
        if (count !== assignedSubjectIds.length) throw new Error("One or more selected subjects were not found");
        await prisma.teacher.updateMany({ where: { userId: ctx.id, schoolId }, data: { subjectIds: assignedSubjectIds } });
      }
      if (b.sections !== undefined && target.teacher) {
        if (assignedSections.length === 0) throw new Error("Assign the teacher to Primary, Secondary, or both");
        const assignedClasses = await prisma.classSubject.findMany({ where: { teacherId: target.teacher.id }, select: { classGroup: { select: { level: { select: { section: true } } } } } });
        if (assignedClasses.some((row) => !assignedSections.includes(row.classGroup.level.section))) {
          throw new Error("This teacher still has class assignments in a section you are removing");
        }
        const currentSubjects = b.subjectIds !== undefined ? assignedSubjectIds : ((target.teacher.subjectIds as string[] | null) ?? []);
        const validSubjectCount = await prisma.subject.count({ where: { schoolId, id: { in: currentSubjects }, section: { in: assignedSections } } });
        if (validSubjectCount !== currentSubjects.length) throw new Error("Remove subjects outside the selected school section first");
        await prisma.teacher.updateMany({ where: { userId: ctx.id, schoolId }, data: { sections: assignedSections } });
      }
      if (data.role) await prisma.admin.deleteMany({ where: { userId: ctx.id, schoolId } });
    } else {
      if (b.designation) {
        await prisma.admin.updateMany({ where: { userId: ctx.id, schoolId }, data: { designation: String(b.designation) } });
        await prisma.teacher.updateMany({ where: { userId: ctx.id, schoolId }, data: { designation: String(b.designation) } });
      }
      const adminStaffNumber = str(b.staffNumber);
      if (adminStaffNumber) {
        const taken = await prisma.admin.findFirst({ where: { schoolId, staffNumber: adminStaffNumber, userId: { not: ctx.id } } });
        if (taken) throw new Error("A staff member with this staff number already exists");
        await prisma.admin.updateMany({ where: { userId: ctx.id, schoolId }, data: { staffNumber: adminStaffNumber } });
      }
      if (!target.admin) await prisma.admin.create({ data: { userId: target.id, schoolId, designation: str(b.designation) ?? "Staff", staffNumber: str(b.staffNumber) ?? (await nextStaffNumber(schoolId, "ADM", "admin")) } });
      if (b.sections !== undefined) {
        if (ctx.session.user.role !== "OWNER") throw new Error("Only the school owner can assign sections to administrators or bursars");
        await prisma.admin.updateMany({ where: { userId: ctx.id, schoolId }, data: { sections: assignedSections } });
      }
      if (data.role && target.teacher) {
        // Teacher profile may have dependencies (class subjects etc.); drop it
        // when possible, otherwise it is kept harmless for history.
        try {
          await prisma.teacher.deleteMany({ where: { userId: ctx.id, schoolId } });
        } catch {
          /* keep stale teacher profile */
        }
      }
    }

    const user = await prisma.user.findUnique({ where: { id: ctx.id }, include: { teacher: true, admin: true } });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "staff.updated", entityType: "User", entityId: ctx.id, meta: data });
    return user;
  },

  async remove(ctx) {
    can(ctx, "staff:manage");
    const schoolId = ctx.session.user.schoolId;
    const target = await prisma.user.findFirst({ where: { id: ctx.id, schoolId } });
    if (!target) throw new Error("Staff member not found");
    assertStaffTargetAccess(ctx.session.user.role, target.role);
    if (target.role === "OWNER") throw new Error("The school owner cannot be removed");
    if (target.id === ctx.session.user.id) throw new Error("You cannot remove your own account");
    await prisma.user.update({ where: { id: ctx.id }, data: { status: "DEACTIVATED" } });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "staff.deleted", entityType: "User", entityId: ctx.id, meta: { role: target.role } });
    return { ok: true };
  },

  actions: {
    // Owner/admin can issue a temporary password so the staff member can sign
    // in; they must then change it on first login (mustChangePassword = true).
    setTempPassword: async (ctx) => {
      can(ctx, "staff:manage");
      const targetId = ctx.id ?? ctx.body.userId;
      if (!targetId) throw new Error("Staff member id required");
      const tempPassword = str(ctx.body.tempPassword);
      if (!tempPassword) throw new Error("Temporary password is required");
      if (tempPassword.length < 8) throw new Error("Temporary password must be at least 8 characters");
      const target = await prisma.user.findFirst({ where: { id: targetId, schoolId: ctx.session.user.schoolId } });
      if (!target) throw new Error("Staff member not found");
      if (!["TEACHER", "ADMIN", "BURSAR", "OWNER"].includes(target.role)) throw new Error("Not a staff member");
      assertStaffTargetAccess(ctx.session.user.role, target.role);
      if (target.role === "OWNER" && ctx.session.user.role !== "OWNER") throw new Error("Only the school owner can reset the owner password");
      await prisma.user.update({
        where: { id: target.id },
        data: { passwordHash: await bcrypt.hash(tempPassword, 10), mustChangePassword: true },
      });
      await logAudit({
        schoolId: ctx.session.user.schoolId,
        userId: ctx.session.user.id,
        action: "staff.tempPasswordSet",
        entityType: "User",
        entityId: target.id,
        meta: { resetBy: ctx.session.user.id },
      });
      return { ok: true };
    },
  },
};
