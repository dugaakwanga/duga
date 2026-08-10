import { prisma } from "@duga/core/server";
import type { SuperAdminSession } from "./superadmin";
import bcrypt from "bcryptjs";
import { FEATURE_SETTING_KEY, getFeatureConfig } from "./features";
import { getWebsiteConfig, setWebsiteConfig } from "./site-settings";

export interface SACtx {
  session: SuperAdminSession;
  id?: string;
  action?: string;
  body: Record<string, unknown>;
  query: URLSearchParams;
}

export type SAHandler = (ctx: SACtx) => Promise<unknown>;

export interface SAModule {
  list?: SAHandler;
  get?: SAHandler;
  actions?: Record<string, SAHandler>;
}

async function logActivity(ctx: SACtx, action: string, meta?: unknown) {
  await prisma.superAdminActivity.create({
    data: { superAdminId: ctx.session.superAdmin.id, action, meta: meta === undefined ? undefined : (meta as never) },
  });
}

function slugify(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Creates a school (name, shortName, domain) plus its default free-trial subscription.
async function createSchoolWithSubscription(opts: { name: string; shortName: string; domain?: string; address?: string; phone?: string; email?: string }) {
  let domain = String(opts.domain ?? "").trim().toLowerCase();
  if (!domain) {
    const base = slugify(opts.name) || "school";
    domain = `${base}-${Math.random().toString(36).slice(2, 6)}.duga.local`;
  }
  const existing = await prisma.school.findUnique({ where: { domain } });
  if (existing) {
    const e = new Error("A school with that domain already exists") as Error & { status?: number };
    e.status = 409;
    throw e;
  }
  const school = await prisma.school.create({
    data: {
      name: opts.name,
      shortName: opts.shortName,
      domain,
      address: opts.address || undefined,
      phone: opts.phone || undefined,
      email: opts.email || undefined,
    },
  });
  await prisma.subscription.create({
    data: { schoolId: school.id, plan: "FREE_TRIAL", status: "TRIALING" },
  });
  return school;
}

export const saModules: Record<string, SAModule> = {
  schools: {
    async list(ctx) {
      const schools = await prisma.school.findMany({
        include: {
          subscription: true,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      const userCounts = await prisma.user.groupBy({ by: ["schoolId"], _count: true });
      const countMap = new Map(userCounts.map((r) => [r.schoolId, r._count]));
      const withStats = await Promise.all(
        schools.map(async (s) => {
          const [students, invoices] = await Promise.all([
            prisma.student.count({ where: { schoolId: s.id } }),
            prisma.invoice.aggregate({ where: { schoolId: s.id }, _sum: { paidAmount: true, balance: true } }),
          ]);
          return {
            ...s,
            userCount: countMap.get(s.id) ?? 0,
            stats: {
              students,
              paid: invoices._sum.paidAmount ?? 0,
              outstanding: invoices._sum.balance ?? 0,
            },
          };
        }),
      );
      await logActivity(ctx, "schools.list");
      return { items: withStats, total: withStats.length };
    },

    async get(ctx) {
      const school = await prisma.school.findUnique({
        where: { id: ctx.id },
        include: {
          subscription: true,
          settings: true,
        },
      });
      if (!school) throw new Error("School not found");
      const [students, teachers, invoices, applications, auditLogs] = await Promise.all([
        prisma.student.count({ where: { schoolId: school.id } }),
        prisma.user.count({ where: { schoolId: school.id, role: { in: ["TEACHER", "ADMIN"] } } }),
        prisma.invoice.aggregate({ where: { schoolId: school.id }, _sum: { totalAmount: true, paidAmount: true, balance: true } }),
        prisma.application.count({ where: { schoolId: school.id } }),
        prisma.auditLog.count({ where: { schoolId: school.id } }),
      ]);
      return {
        ...school,
        stats: { students, teachers, applications, auditLogs, total: invoices._sum.totalAmount ?? 0, paid: invoices._sum.paidAmount ?? 0, outstanding: invoices._sum.balance ?? 0 },
      };
    },

    actions: {
      // POST /api/superadmin/schools/create  { name, shortName, domain?, address?, phone?, email? }
      create: async (ctx) => {
        const name = String(ctx.body.name ?? "").trim();
        const shortName = String(ctx.body.shortName ?? "").trim();
        if (!name || !shortName) {
          const e = new Error("School name and short name are required") as Error & { status?: number };
          e.status = 400;
          throw e;
        }
        const school = await createSchoolWithSubscription({
          name,
          shortName,
          domain: ctx.body.domain ? String(ctx.body.domain) : undefined,
          address: ctx.body.address ? String(ctx.body.address) : undefined,
          phone: ctx.body.phone ? String(ctx.body.phone) : undefined,
          email: ctx.body.email ? String(ctx.body.email) : undefined,
        });
        await logActivity(ctx, "school.created", { schoolId: school.id, name: school.name });
        return { ok: true, school: { id: school.id, name: school.name, shortName: school.shortName, domain: school.domain } };
      },

      setStatus: async (ctx) => {
        const schoolId = String(ctx.body.schoolId ?? "");
        const status = String(ctx.body.status ?? "").toUpperCase();
        const password = String(ctx.body.password ?? "");
        if (!schoolId) throw new Error("schoolId required");
        if (!["ACTIVE", "SUSPENDED", "SHUT_DOWN"].includes(status)) throw new Error("Invalid platform status");
        if (!password) {
          const e = new Error("Your password is required to change platform status") as Error & { status?: number };
          e.status = 400;
          throw e;
        }
        const sa = await prisma.superAdmin.findUnique({ where: { id: ctx.session.superAdmin.id } });
        if (!sa) throw new Error("Super admin not found");
        const valid = await bcrypt.compare(password, sa.passwordHash);
        if (!valid) {
          const e = new Error("Incorrect password — platform status was not changed") as Error & { status?: number };
          e.status = 403;
          throw e;
        }

        const school = await prisma.school.update({
          where: { id: schoolId },
          data: { platformStatus: status as never },
        });
        await logActivity(ctx, `schools.status.${status.toLowerCase()}`, { schoolId, status });
        return { ok: true, school: { id: school.id, platformStatus: school.platformStatus } };
      },
    },
  },

  subscriptions: {
    actions: {
      update: async (ctx) => {
        const schoolId = String(ctx.body.schoolId ?? "");
        const plan = ctx.body.plan ? String(ctx.body.plan) : undefined;
        const status = ctx.body.status ? String(ctx.body.status) : undefined;
        const expiresAt = ctx.body.expiresAt ? new Date(String(ctx.body.expiresAt)) : undefined;
        const seats = ctx.body.seats !== undefined ? Number(ctx.body.seats) : undefined;
        if (!schoolId) throw new Error("schoolId required");

        const data: Record<string, unknown> = {};
        if (plan && ["FREE_TRIAL", "BASIC", "PRO", "ENTERPRISE"].includes(plan)) data.plan = plan;
        if (status && ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"].includes(status)) data.status = status;
        if (expiresAt) data.expiresAt = expiresAt;
        if (seats) data.seats = seats;

        const sub = await prisma.subscription.upsert({
          where: { schoolId },
          update: data,
          create: { schoolId, plan: (plan as never) ?? "FREE_TRIAL", status: (status as never) ?? "TRIALING", expiresAt, seats },
        });
        await logActivity(ctx, "subscription.updated", { schoolId, plan, status });
        return sub;
      },

      create: async (ctx) => {
        const schoolId = String(ctx.body.schoolId ?? "");
        const plan = (String(ctx.body.plan ?? "FREE_TRIAL") as "FREE_TRIAL") ;
        const status = (String(ctx.body.status ?? "TRIALING") as "TRIALING");
        if (!schoolId) throw new Error("schoolId required");
        const sub = await prisma.subscription.create({
          data: {
            schoolId,
            plan,
            status,
            expiresAt: ctx.body.expiresAt ? new Date(String(ctx.body.expiresAt)) : undefined,
            seats: ctx.body.seats !== undefined ? Number(ctx.body.seats) : undefined,
          },
        });
        await logActivity(ctx, "subscription.created", { schoolId, plan });
        return sub;
      },
    },
  },

  logs: {
    async list(_ctx) {
      const [system, activities] = await Promise.all([
        prisma.systemLog.findMany({ include: { school: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
        prisma.superAdminActivity.findMany({ include: { superAdmin: { select: { username: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
      ]);
      return { system, activities };
    },
  },

  owners: {
    async list(_ctx) {
      const users = await prisma.user.findMany({
        where: { role: "OWNER" },
        include: { admin: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      const schools = await prisma.school.findMany({ select: { id: true, name: true, shortName: true } });
      const schoolMap = new Map(schools.map((s) => [s.id, s]));
      return {
        items: users.map((u) => ({
          id: u.id,
          schoolId: u.schoolId,
          schoolName: schoolMap.get(u.schoolId)?.name ?? "—",
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          phone: u.phone,
          status: u.status,
          mustChangePassword: u.mustChangePassword,
          lastLoginAt: u.lastLoginAt,
          createdAt: u.createdAt,
        })),
        total: users.length,
      };
    },

    actions: {
      // POST /api/superadmin/owners/create  { firstName, lastName, email, phone?, tempPassword?, schoolId?, schoolName?, schoolShortName?, schoolDomain? }
      // If no schoolId is given, a school is created from schoolName (or the owner's name) automatically.
      create: async (ctx) => {
        await logActivity(ctx, "owner.create.request");
        const firstName = String(ctx.body.firstName ?? "").trim();
        const lastName = String(ctx.body.lastName ?? "").trim();
        const email = String(ctx.body.email ?? "").trim().toLowerCase();
        if (!firstName || !lastName || !email) {
          const e = new Error("firstName, lastName and email are required") as Error & { status?: number };
          e.status = 400;
          throw e;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          const e = new Error("A valid email address is required") as Error & { status?: number };
          e.status = 400;
          throw e;
        }

        let schoolId = String(ctx.body.schoolId ?? "").trim();
        if (schoolId) {
          const school = await prisma.school.findUnique({ where: { id: schoolId } });
          if (!school) {
            const e = new Error("School not found") as Error & { status?: number };
            e.status = 404;
            throw e;
          }
        } else {
          const schoolName = String(ctx.body.schoolName ?? "").trim();
          const fallbackName = schoolName || `${lastName} Academy`;
          const school = await createSchoolWithSubscription({
            name: fallbackName,
            shortName: String(ctx.body.schoolShortName ?? "").trim() || fallbackName.replace(/\s+/g, "").slice(0, 5).toUpperCase(),
            domain: ctx.body.schoolDomain ? String(ctx.body.schoolDomain) : undefined,
          });
          schoolId = school.id;
        }

        const existing = await prisma.user.findUnique({ where: { schoolId_email: { schoolId, email } } });
        if (existing) {
          const e = new Error("A user with this email already exists in this school") as Error & { status?: number };
          e.status = 409;
          throw e;
        }
        const password = String(ctx.body.tempPassword ?? "password123");
        const user = await prisma.user.create({
          data: {
            schoolId,
            role: "OWNER",
            email,
            phone: ctx.body.phone ? String(ctx.body.phone) : undefined,
            passwordHash: await bcrypt.hash(password, 10),
            firstName,
            lastName,
            mustChangePassword: true,
          },
        });
        await logActivity(ctx, "owner.created", { schoolId, email });
        return { id: user.id, email: user.email, tempPassword: password };
      },

      // POST /api/superadmin/owners/edit  { id, firstName?, lastName?, phone?, status? }
      edit: async (ctx) => {
        const id = String(ctx.body.id ?? "");
        if (!id) throw new Error("id required");
        const data: Record<string, unknown> = {};
        if (ctx.body.firstName) data.firstName = String(ctx.body.firstName);
        if (ctx.body.lastName) data.lastName = String(ctx.body.lastName);
        if (ctx.body.phone !== undefined) data.phone = ctx.body.phone ? String(ctx.body.phone) : null;
        if (ctx.body.status && ["ACTIVE", "SUSPENDED", "DEACTIVATED"].includes(String(ctx.body.status))) data.status = String(ctx.body.status);
        if (Object.keys(data).length === 0) throw new Error("Nothing to update");
        const user = await prisma.user.update({ where: { id }, data });
        await logActivity(ctx, "owner.updated", { id, meta: data });
        return { id: user.id, status: user.status };
      },

      // POST /api/superadmin/owners/resetPassword  { id, tempPassword? }
      resetPassword: async (ctx) => {
        const id = String(ctx.body.id ?? "");
        const password = String(ctx.body.tempPassword ?? "password123");
        if (!id) throw new Error("id required");
        const user = await prisma.user.update({
          where: { id },
          data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true },
        });
        await logActivity(ctx, "owner.password.reset", { id });
        return { id: user.id, tempPassword: password };
      },
    },
  },

  users: {
    async list(ctx) {
      const schoolId = ctx.query.get("schoolId");
      const role = ctx.query.get("role");
      const where: Record<string, unknown> = {};
      if (schoolId) where.schoolId = schoolId;
      if (role) where.role = role as "OWNER" | "ADMIN" | "TEACHER" | "PARENT" | "STUDENT";
      const users = await prisma.user.findMany({
        where: where as never,
        include: { teacher: true, admin: true, student: { select: { admissionNumber: true } } },
        orderBy: { createdAt: "desc" },
        take: 300,
      });
      const schools = await prisma.school.findMany({ select: { id: true, name: true } });
      const schoolMap = new Map(schools.map((s) => [s.id, s]));
      return {
        items: users.map((u) => ({
          id: u.id,
          schoolId: u.schoolId,
          schoolName: schoolMap.get(u.schoolId)?.name ?? "—",
          role: u.role,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          phone: u.phone,
          status: u.status,
          mustChangePassword: u.mustChangePassword,
          lastLoginAt: u.lastLoginAt,
          createdAt: u.createdAt,
        })),
        total: users.length,
      };
    },

    actions: {
      // POST /api/superadmin/users/add  { schoolId, role: ADMIN|TEACHER|STUDENT, firstName, lastName, email?, password? }
      add: async (ctx) => {
        const schoolId = String(ctx.body.schoolId ?? "");
        const role = String(ctx.body.role ?? "").toUpperCase();
        const firstName = String(ctx.body.firstName ?? "").trim();
        const lastName = String(ctx.body.lastName ?? "").trim();
        if (!schoolId || !["ADMIN", "TEACHER", "STUDENT"].includes(role) || !firstName || !lastName) {
          const e = new Error("schoolId, role (ADMIN|TEACHER|STUDENT), firstName and lastName are required") as Error & { status?: number };
          e.status = 400;
          throw e;
        }
        const school = await prisma.school.findUnique({ where: { id: schoolId } });
        if (!school) {
          const e = new Error("School not found") as Error & { status?: number };
          e.status = 404;
          throw e;
        }
        const email = String(ctx.body.email ?? "").trim().toLowerCase() || undefined;
        let finalEmail = email;
        if (finalEmail) {
          const existing = await prisma.user.findUnique({ where: { schoolId_email: { schoolId, email: finalEmail } } });
          if (existing) {
            const e = new Error("A user with this email already exists in this school") as Error & { status?: number };
            e.status = 409;
            throw e;
          }
        } else {
          finalEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@duga.local`;
        }
        const password = String(ctx.body.tempPassword ?? "password123");
        const user = await prisma.user.create({
          data: {
            schoolId,
            role: role as "ADMIN" | "TEACHER" | "STUDENT",
            email: finalEmail,
            phone: ctx.body.phone ? String(ctx.body.phone) : undefined,
            passwordHash: await bcrypt.hash(password, 10),
            firstName,
            lastName,
            mustChangePassword: true,
          },
        });
        if (role === "ADMIN") {
          await prisma.admin.create({ data: { userId: user.id, schoolId, designation: ctx.body.designation ? String(ctx.body.designation) : "Staff" } });
        } else if (role === "TEACHER") {
          await prisma.teacher.create({
            data: {
              userId: user.id,
              schoolId,
              staffNumber: String(ctx.body.staffNumber ?? `STF-${String((await prisma.teacher.count({ where: { schoolId } })) + 1).padStart(3, "0")}`),
              specialty: ctx.body.specialty ? String(ctx.body.specialty) : undefined,
              designation: ctx.body.designation ? String(ctx.body.designation) : "Teacher",
            },
          });
        }
        await logActivity(ctx, `user.add.${role.toLowerCase()}`, { schoolId, email: finalEmail });
        return { id: user.id, email: finalEmail, tempPassword: password };
      },

      // POST /api/superadmin/users/resetPassword  { id, tempPassword? }
      resetPassword: async (ctx) => {
        const id = String(ctx.body.id ?? "");
        const password = String(ctx.body.tempPassword ?? "password123");
        if (!id) throw new Error("id required");
        const user = await prisma.user.update({
          where: { id },
          data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true },
        });
        await logActivity(ctx, "user.reset_password", { id });
        return { id: user.id, tempPassword: password };
      },

      // POST /api/superadmin/users/setStatus  { id, status: ACTIVE|SUSPENDED|DEACTIVATED }
      setStatus: async (ctx) => {
        const id = String(ctx.body.id ?? "");
        const status = String(ctx.body.status ?? "").toUpperCase();
        if (!id || !["ACTIVE", "SUSPENDED", "DEACTIVATED"].includes(status)) {
          const e = new Error("id and status (ACTIVE|SUSPENDED|DEACTIVATED) are required") as Error & { status?: number };
          e.status = 400;
          throw e;
        }
        const user = await prisma.user.update({ where: { id }, data: { status: status as never } });
        await logActivity(ctx, `user.status.${status.toLowerCase()}`, { id });
        return { id: user.id, status: user.status };
      },
    },
  },

  live: {
    async list(_ctx) {
      const items = await prisma.liveClass.findMany({
        include: {
          teacher: { include: { user: { select: { firstName: true, lastName: true } } } },
          classSubject: { include: { subject: true, classGroup: { include: { level: true } } } },
          school: { select: { id: true, name: true } },
        },
        orderBy: { scheduledAt: "desc" },
        take: 200,
      });
      return { items, total: items.length };
    },

    actions: {
      // POST /api/superadmin/live/setStatus  { id, status: SCHEDULED|LIVE|ENDED|CANCELLED }
      setStatus: async (ctx) => {
        const id = String(ctx.body.id ?? "");
        const status = String(ctx.body.status ?? "").toUpperCase();
        if (!id || !["SCHEDULED", "LIVE", "ENDED", "CANCELLED"].includes(status)) {
          const e = new Error("id and status (SCHEDULED|LIVE|ENDED|CANCELLED) are required") as Error & { status?: number };
          e.status = 400;
          throw e;
        }
        const live = await prisma.liveClass.update({ where: { id }, data: { status: status as never } });
        await logActivity(ctx, "live.status", { id, status });
        return { id: live.id, status: live.status };
      },
    },
  },

  cbt: {
    async list(ctx) {
      const schoolId = ctx.query.get("schoolId");
      const tests = await prisma.test.findMany({
        where: schoolId ? { schoolId } : {},
        include: {
          classSubject: { include: { subject: true, classGroup: { include: { level: true } } } },
          teacher: { include: { user: { select: { firstName: true, lastName: true } } } },
          school: { select: { id: true, name: true } },
          _count: { select: { questions: true, attempts: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return { items: tests, total: tests.length };
    },

    actions: {
      // POST /api/superadmin/cbt/setStatus  { id, status: DRAFT|PUBLISHED|CLOSED }
      setStatus: async (ctx) => {
        const id = String(ctx.body.id ?? "");
        const status = String(ctx.body.status ?? "").toUpperCase();
        if (!id || !["DRAFT", "PUBLISHED", "CLOSED"].includes(status)) {
          const e = new Error("id and status (DRAFT|PUBLISHED|CLOSED) are required") as Error & { status?: number };
          e.status = 400;
          throw e;
        }
        const test = await prisma.test.update({ where: { id }, data: { status: status as never } });
        await logActivity(ctx, `cbt.status.${status.toLowerCase()}`, { id });
        return { id: test.id, status: test.status };
      },
    },
  },

  features: {
    async get(ctx) {
      const schoolId = String(ctx.id ?? "");
      if (!schoolId) throw new Error("schoolId required");
      const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } });
      if (!school) throw new Error("School not found");
      return { school, config: await getFeatureConfig(schoolId) };
    },

    actions: {
      // POST /api/superadmin/features/disable  { schoolId, ids: string[] }
      disable: async (ctx) => {
        const schoolId = String(ctx.body.schoolId ?? "");
        const ids = Array.isArray(ctx.body.ids) ? ctx.body.ids.filter((x): x is string => typeof x === "string") : [];
        if (!schoolId) throw new Error("schoolId required");
        const cfg = await getFeatureConfig(schoolId);
        cfg.disabled = [...new Set(ids)];
        await prisma.schoolSetting.upsert({
          where: { schoolId_key: { schoolId, key: FEATURE_SETTING_KEY } },
          update: { value: cfg as unknown as never },
          create: { schoolId, key: FEATURE_SETTING_KEY, value: cfg as unknown as never },
        });
        await logActivity(ctx, "features.disable", { schoolId, disabled: cfg.disabled });
        return { ok: true, config: cfg };
      },

      // POST /api/superadmin/features/enable  { schoolId, ids: string[] }
      enable: async (ctx) => {
        const schoolId = String(ctx.body.schoolId ?? "");
        const ids = Array.isArray(ctx.body.ids)
          ? new Set(ctx.body.ids.filter((x): x is string => typeof x === "string"))
          : new Set<string>();
        if (!schoolId) throw new Error("schoolId required");
        const cfg = await getFeatureConfig(schoolId);
        cfg.disabled = cfg.disabled.filter((id) => !ids.has(id));
        await prisma.schoolSetting.upsert({
          where: { schoolId_key: { schoolId, key: FEATURE_SETTING_KEY } },
          update: { value: cfg as unknown as never },
          create: { schoolId, key: FEATURE_SETTING_KEY, value: cfg as unknown as never },
        });
        await logActivity(ctx, "features.enable", { schoolId, enabled: [...ids] });
        return { ok: true, config: cfg };
      },
    },
  },

  website: {
    async get(ctx) {
      const schoolId = String(ctx.id ?? "");
      if (!schoolId) throw new Error("schoolId required");
      const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } });
      if (!school) throw new Error("School not found");
      return { school, config: await getWebsiteConfig(schoolId) };
    },

    actions: {
      // POST /api/superadmin/website/update  { schoolId, enabled?, notice?, pages?, features? }
      update: async (ctx) => {
        const schoolId = String(ctx.body.schoolId ?? "");
        if (!schoolId) throw new Error("schoolId required");
        const config = await setWebsiteConfig(schoolId, {
          enabled: typeof ctx.body.enabled === "boolean" ? ctx.body.enabled : undefined,
          notice: typeof ctx.body.notice === "string" ? ctx.body.notice : undefined,
          pages: Array.isArray(ctx.body.pages) ? (ctx.body.pages as string[]) : undefined,
          features: Array.isArray(ctx.body.features) ? (ctx.body.features as string[]) : undefined,
        });
        await logActivity(ctx, "website.updated", { schoolId, ...config });
        return { ok: true, config };
      },
    },
  },
};
