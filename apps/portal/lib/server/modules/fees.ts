import { prisma, initializePayment, verifyPayment, logAudit, dispatchNotification } from "@duga/core/server";
import { generateReference, formatNaira } from "@duga/core";
import type { Module } from ".";
import { can, str, num, studentScope, resolveSection, financeManager, feeInfoOf } from "../helpers";

async function assertFinanceManager(ctx: { session: { user: { role: string; schoolId: string } } }) {
  if (!(await financeManager(ctx as Parameters<typeof financeManager>[0]))) {
    const err = new Error("Finance is managed only by the bursar and school owner, or an admin granted access") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}

// Recompute a student's fee-access window from scratch after a payment.
// Coverage is always calculated from the term's start date (feeStartDate)
// using the TOTAL amount paid since then — not from whenever the family
// happens to pay — so a partial payment can leave feePaidThrough already in
// the past relative to today if it doesn't fully cover the period elapsed
// so far. This is recomputed fresh every time (not incrementally extended),
// so it's self-correcting regardless of payment order or timing, and it's
// the single source of truth for feePaidThrough for BOTH the invoice/
// payment system and the standalone fee-access window.
//
// A bursar can still explicitly declare what period a payment covers (e.g.
// "this covers Term 2") via Payment.coversTo — when any payment in the
// current billing window has one, the latest such date wins outright over
// the proportional math (never moving the window backward from feeStartDate).
//
// Once feesDueDate has passed, proration stops applying entirely — the
// school needs fees fully in hand a few weeks before exams, not a partial
// credit that happens to reach into the exam period. Before that date,
// nothing changes: a partial payment still opens an intermittent window
// exactly as it always has.
export async function recomputeFeeAccess(schoolId: string, studentId: string): Promise<{ paidThrough: Date | null; totalPaid: number; pastDueDateUnpaid: boolean }> {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student || !student.feeStartDate || Number(student.feeAmount) <= 0 || student.feeDays <= 0) {
    return { paidThrough: student?.feePaidThrough ?? null, totalPaid: 0, pastDueDateUnpaid: false };
  }

  const payments = await prisma.payment.findMany({
    where: { schoolId, studentId, status: "SUCCESS", paidAt: { gte: student.feeStartDate } },
    select: { amount: true, coversTo: true },
  });
  const totalPaid = payments.reduce((a, p) => a + Number(p.amount), 0);
  const explicitCoversTo = payments
    .map((p) => p.coversTo)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const fullyPaid = totalPaid >= Number(student.feeAmount);
  const pastDueDate = Boolean(student.feesDueDate && Date.now() >= student.feesDueDate.getTime());
  const pastDueDateUnpaid = pastDueDate && !fullyPaid;

  const paidThrough = pastDueDateUnpaid
    ? student.feeStartDate
    : explicitCoversTo
      ? (explicitCoversTo > student.feeStartDate ? explicitCoversTo : student.feeStartDate)
      : pastDueDate
        ? (student.feeEndDate ?? new Date(student.feeStartDate.getTime() + student.feeDays * 86400000))
        : new Date(student.feeStartDate.getTime() + Math.floor((totalPaid / Number(student.feeAmount)) * student.feeDays) * 86400000);

  await prisma.student.update({ where: { id: student.id }, data: { feePaidThrough: paidThrough } });
  return { paidThrough, totalPaid, pastDueDateUnpaid };
}

// A one-line addition to a payment notification stating exactly what date
// the family's fees now cover through — the whole point of computing
// coverage from the term's start date is being able to say this plainly,
// including when it's still behind today's date after a partial payment.
// Once the term's fees-due deadline has passed unpaid, that framing no
// longer applies (there's no partial "covers through" anymore) — say so
// plainly instead.
function coverageSuffix(access: { paidThrough: Date | null; pastDueDateUnpaid?: boolean }): string {
  if (access.pastDueDateUnpaid) return " The fee deadline for this term has passed — full payment is required to restore access.";
  if (!access.paidThrough) return "";
  const d = access.paidThrough.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return access.paidThrough.getTime() < Date.now()
    ? ` School fees cover through ${d} so far — that's still behind today's date.`
    : ` School fees now cover through ${d}.`;
}

async function notifyParentsOfBalance(schoolId: string, studentId: string, invoice: { invoiceNumber: string; balance: unknown }) {
  const links = await prisma.studentParent.findMany({
    where: { schoolId, studentId },
    include: { parent: true, student: { select: { user: { select: { firstName: true, lastName: true } } } } },
  });
  await Promise.all(links.map((link) => dispatchNotification({
    schoolId,
    userId: link.parent.userId,
    type: "fee_reminder",
    title: "Outstanding school fees",
    body: `Outstanding balance for ${link.student.user.firstName} ${link.student.user.lastName}: ${formatNaira(Number(invoice.balance))} (${invoice.invoiceNumber}).`,
    link: "/portal/fees",
    channels: ["IN_APP", "EMAIL", "SMS", "PUSH"],
  })));
  return links.length;
}

// Every fee-related notification is routed to the parent's email (not just
// in-app/push) — money matters need a channel a parent actually checks and
// can find again later, unlike a push that scrolls away. The child's name
// is prefixed since a parent with more than one child at the school needs
// to know which account this is about at a glance.
async function notifyParentsOfPayment(schoolId: string, studentId: string, studentName: string, title: string, body: string) {
  const links = await prisma.studentParent.findMany({ where: { schoolId, studentId }, include: { parent: true } });
  await Promise.all(links.map((link) => dispatchNotification({
    schoolId,
    userId: link.parent.userId,
    type: "payment",
    title,
    body: `${studentName}: ${body}`,
    link: "/portal/fees",
    channels: ["IN_APP", "EMAIL", "PUSH"],
  })));
}

// Shared by the manual "Send reminders" button (fees/remind) and the
// automatic Mon/Wed/Fri cron job (app/api/cron/fee-reminders) — one place
// for what a fee reminder actually says and who it goes to.
export async function sendFeeReminders(schoolId: string): Promise<number> {
  const unpaid = await prisma.invoice.findMany({
    where: { schoolId, status: { in: ["UNPAID", "PARTIAL"] } },
    include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } },
  });
  let sent = 0;
  for (const inv of unpaid) {
    const studentName = `${inv.student.user.firstName} ${inv.student.user.lastName}`;
    const parentLinks = await prisma.studentParent.findMany({ where: { studentId: inv.studentId }, include: { parent: true } });
    for (const link of parentLinks) {
      await dispatchNotification({
        schoolId,
        userId: link.parent.userId,
        type: "fee_reminder",
        title: "Fee payment reminder",
        body: `Outstanding balance for ${studentName}: ${formatNaira(Number(inv.balance))} (${inv.invoiceNumber}).`,
        link: "/portal/fees",
        channels: ["IN_APP", "EMAIL", "SMS", "PUSH"],
      });
      sent += 1;
    }
  }
  return sent;
}

async function paystackConfigured(): Promise<boolean> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  return Boolean(key && !key.startsWith("sk_test_xxx"));
}

function updateInvoiceFromPayments(invoiceId: string) {
  return prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
}

async function refreshInvoice(invoiceId: string) {
  const invoice = await updateInvoiceFromPayments(invoiceId);
  if (!invoice) return invoice;
  const paid = invoice.payments.filter((p) => p.status === "SUCCESS").reduce((a, p) => a + Number(p.amount), 0);
  const balance = Number(invoice.totalAmount) - paid - Number(invoice.discountAmount ?? 0);
  const status = paid <= 0 ? "UNPAID" : balance <= 0 ? (paid > Number(invoice.totalAmount) ? "OVERPAID" : "PAID") : "PARTIAL";
  return prisma.invoice.update({ where: { id: invoiceId }, data: { paidAmount: paid, balance: Math.max(balance, 0), status } });
}

// Recompute one installment's paid amount / status from its successful
// payments, flagging it OVERDUE once its due date has passed unpaid.
async function refreshInstallment(installmentId: string) {
  const installment = await prisma.installment.findUnique({ where: { id: installmentId }, include: { payments: true } });
  if (!installment) return installment;
  const paid = installment.payments.filter((p) => p.status === "SUCCESS").reduce((a, p) => a + Number(p.amount), 0);
  const remaining = Number(installment.amount) - paid;
  const status = remaining <= 0 ? "PAID" : paid > 0 ? "PARTIAL" : installment.dueDate < new Date() ? "OVERDUE" : "PENDING";
  return prisma.installment.update({ where: { id: installmentId }, data: { paidAmount: paid, status } });
}

export const feesModule: Module = {
  async list(ctx) {
    can(ctx, "fees:view");
    const schoolId = ctx.session.user.schoolId;
    const role = ctx.session.user.role;

    if (role === "STUDENT") {
      const invoices = await prisma.invoice.findMany({
        where: { schoolId, studentId: ctx.session.user.student!.id },
        include: { items: true, payments: { orderBy: { createdAt: "desc" } }, term: true, installmentPlan: { include: { installments: { orderBy: { sequence: "asc" } } } } },
        orderBy: { createdAt: "desc" },
      });
      const summary = {
        total: invoices.reduce((a, i) => a + Number(i.totalAmount), 0),
        paid: invoices.reduce((a, i) => a + Number(i.paidAmount), 0),
        balance: invoices.reduce((a, i) => a + Number(i.balance), 0),
      };
      return { role, invoices, summary };
    }
    if (role === "PARENT") {
      const links = await prisma.studentParent.findMany({
        where: { parentId: ctx.session.user.parent!.id },
        include: { student: { select: { id: true, user: { select: { firstName: true, lastName: true } } } } },
      });
      const childIds = links.map((l) => l.studentId);
      const invoices = await prisma.invoice.findMany({
        where: { schoolId, studentId: { in: childIds } },
        include: { items: true, student: { include: { user: { select: { firstName: true, lastName: true } } } }, payments: { orderBy: { createdAt: "desc" } }, term: true, installmentPlan: { include: { installments: { orderBy: { sequence: "asc" } } } } },
        orderBy: { createdAt: "desc" },
      });
      const summary = {
        total: invoices.reduce((a, i) => a + Number(i.totalAmount), 0),
        paid: invoices.reduce((a, i) => a + Number(i.paidAmount), 0),
        balance: invoices.reduce((a, i) => a + Number(i.balance), 0),
      };
      // Per-child breakdown — every linked child appears even with zero
      // invoices yet, so a parent sees "nothing billed" rather than nothing.
      const byChild = links.map((link) => {
        const childInvoices = invoices.filter((i) => i.studentId === link.studentId);
        return {
          studentId: link.studentId,
          name: `${link.student.user.firstName} ${link.student.user.lastName}`,
          total: childInvoices.reduce((a, i) => a + Number(i.totalAmount), 0),
          paid: childInvoices.reduce((a, i) => a + Number(i.paidAmount), 0),
          balance: childInvoices.reduce((a, i) => a + Number(i.balance), 0),
          invoiceCount: childInvoices.length,
        };
      });
      return { role, invoices, summary, byChild };
    }
    await assertFinanceManager(ctx);

    const section = await resolveSection(ctx);
    const studentSectionWhere = section ? { student: { is: { section } } } : {};
    const agg = await prisma.invoice.aggregate({
      where: { schoolId, ...studentSectionWhere },
      _sum: { totalAmount: true, paidAmount: true, balance: true },
    });
    const { totalAmount, paidAmount, balance } = agg._sum;
    const invoices = await prisma.invoice.findMany({
      where: { schoolId, ...studentSectionWhere },
      include: { student: { include: { user: { select: { firstName: true, lastName: true } } } }, term: true, payments: true, items: true, installmentPlan: { include: { installments: { orderBy: { sequence: "asc" } } } } },
      orderBy: { createdAt: "desc" },
      take: 400,
    });
    const [feeTypes, feeStructures, overrides, terms, levels, classGroups, feeConfiguredStudents] = await Promise.all([
      prisma.feeType.findMany({ where: { schoolId }, orderBy: { name: "asc" } }),
      prisma.feeStructure.findMany({ where: { schoolId }, include: { feeType: true, level: true, classGroup: { include: { level: true } }, term: true } }),
      prisma.feeOverride.findMany({ where: { schoolId, isActive: true }, include: { student: { include: { user: { select: { firstName: true, lastName: true } } } }, term: true } }),
      prisma.term.findMany({ where: { schoolId }, include: { session: true }, orderBy: [{ session: { createdAt: "desc" } }, { termNumber: "asc" }] }),
      prisma.classLevel.findMany({ where: { schoolId, ...(section ? { section } : {}) }, orderBy: [{ section: "asc" }, { order: "asc" }] }),
      prisma.classGroup.findMany({ where: { schoolId, ...(section ? { level: { section } } : {}) }, include: { level: true } }),
      // Every student with a fee plan configured (feeAmount/feeDays > 0) — used
      // to surface who's currently owing, independent of the per-term invoice
      // system (a student can be "owing" on their access window even with no
      // invoice generated yet, or vice versa).
      prisma.student.findMany({
        where: { schoolId, feeAmount: { gt: 0 }, feeDays: { gt: 0 }, ...studentSectionWhere, user: { status: "ACTIVE" } },
        select: { id: true, feeAmount: true, feeDays: true, feePaidThrough: true, enrollmentDate: true, admissionNumber: true, user: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    const owingStudents = feeConfiguredStudents
      .map((s) => ({ ...s, fee: feeInfoOf(s) }))
      .filter((s) => s.fee.expired);
    return {
      role,
      paymentRecordsVisible: true,
      summary: { total: totalAmount ?? 0, paid: paidAmount ?? 0, balance: balance ?? 0 },
      invoices,
      feeTypes,
      feeStructures,
      overrides,
      terms,
      levels,
      classGroups,
      owingStudents,
    };
  },

  async get(ctx) {
    can(ctx, "fees:view");
    const role = ctx.session.user.role;
    if (role !== "STUDENT" && role !== "PARENT") await assertFinanceManager(ctx);
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: ctx.id,
        schoolId: ctx.session.user.schoolId,
        // Students/parents can only reach their own invoices.
        ...(role === "STUDENT" || role === "PARENT" ? await studentScope(ctx) : {}),
      },
      include: { items: true, payments: true, student: { include: { user: { select: { firstName: true, lastName: true } } } }, term: true, installmentPlan: { include: { installments: { orderBy: { sequence: "asc" } } } } },
    });
    if (!invoice) throw new Error("Invoice not found");
    return invoice;
  },

  actions: {
    // Bursar/owner: generate invoices for all students of a class (or level) from fee structures
    generateInvoices: async (ctx) => {
      await assertFinanceManager(ctx);
      const schoolId = ctx.session.user.schoolId;
      const termId = str(ctx.body.termId);
      const classGroupId = str(ctx.body.classGroupId);
      if (!termId) throw new Error("termId required");

      const structures = await prisma.feeStructure.findMany({ where: { schoolId, termId: termId ?? undefined }, include: { feeType: true } });
      const students = classGroupId
        ? await prisma.student.findMany({ where: { schoolId, currentClassGroupId: classGroupId, status: "ACTIVE" } })
        : await prisma.student.findMany({ where: { schoolId, status: "ACTIVE" } });

      // Avoid two database round trips per student when generating a whole
      // school's invoices. This is a common source of slow admin responses.
      const [classGroups, existingInvoices, priorUnpaidInvoices] = await Promise.all([
        prisma.classGroup.findMany({ where: { schoolId, id: { in: students.map((s) => s.currentClassGroupId).filter((id): id is string => Boolean(id)) } }, select: { id: true, levelId: true } }),
        prisma.invoice.findMany({ where: { schoolId, termId, studentId: { in: students.map((s) => s.id) } }, select: { studentId: true } }),
        // Debt ledger: any earlier term's invoice this student still owes on
        // (any prior term, not just the immediately preceding one) gets
        // pulled forward as a distinct line item on the new invoice, rather
        // than silently staying billed-but-forgotten on the old one.
        prisma.invoice.findMany({
          where: { schoolId, studentId: { in: students.map((s) => s.id) }, termId: { not: termId }, balance: { gt: 0 }, status: { notIn: ["CARRIED_FORWARD", "WAIVED"] } },
          include: { term: true },
        }),
      ]);
      const levelByClassGroup = new Map(classGroups.map((group) => [group.id, group.levelId]));
      const invoicedStudentIds = new Set(existingInvoices.map((invoice) => invoice.studentId));
      const priorDebtByStudent = new Map<string, typeof priorUnpaidInvoices>();
      for (const inv of priorUnpaidInvoices) {
        priorDebtByStudent.set(inv.studentId, [...(priorDebtByStudent.get(inv.studentId) ?? []), inv]);
      }

      let created = 0;
      let invoiceSeq = (await prisma.invoice.count({ where: { schoolId } })) + 1;

      for (const student of students) {
        // determine applicable structures by level/section/class/boarding-or-day
        const studentLevelId = student.currentClassGroupId ? levelByClassGroup.get(student.currentClassGroupId) : undefined;
        const applicable = structures.filter(
          (s) =>
            (!s.classGroupId || s.classGroupId === student.currentClassGroupId) &&
            (!s.levelId || s.levelId === studentLevelId) &&
            (!s.section || s.section === student.section) &&
            (s.appliesTo === "ALL" || (s.appliesTo === "BOARDING") === student.isBoarding),
        );
        if (applicable.length === 0) continue;

        if (invoicedStudentIds.has(student.id)) continue;

        const priorDebt = priorDebtByStudent.get(student.id) ?? [];
        const broughtForward = priorDebt.reduce((a, inv) => a + Number(inv.balance), 0);

        const totalAmount = applicable.reduce((a, s) => a + Number(s.amount), 0) + broughtForward;
        const items: Array<{ feeTypeId: string | null; description: string; amount: number }> = applicable.map((s) => ({ feeTypeId: s.feeTypeId, description: s.feeType.name, amount: Number(s.amount) }));
        if (broughtForward > 0) {
          const fromTerms = [...new Set(priorDebt.map((inv) => inv.term?.name).filter((n): n is string => Boolean(n)))].join(", ");
          items.push({ feeTypeId: null, description: `Balance brought forward${fromTerms ? ` (${fromTerms})` : ""}`, amount: broughtForward });
        }

        const invoice = await prisma.invoice.create({
          data: {
            schoolId,
            studentId: student.id,
            termId,
            invoiceNumber: `INV-${String(invoiceSeq).padStart(5, "0")}`,
            totalAmount,
            paidAmount: 0,
            balance: totalAmount,
            status: "UNPAID",
            issuedAt: new Date(),
            items: { create: items },
          },
        });
        invoiceSeq += 1;
        created += 1;

        // The old invoices' debt now lives on the new one — mark them so
        // "outstanding balance" reporting doesn't count it twice.
        if (priorDebt.length) {
          await prisma.invoice.updateMany({
            where: { id: { in: priorDebt.map((inv) => inv.id) } },
            data: { balance: 0, status: "CARRIED_FORWARD" },
          });
          await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.balanceCarriedForward", entityType: "Invoice", entityId: invoice.id, meta: { studentId: student.id, broughtForward, fromInvoiceIds: priorDebt.map((inv) => inv.id) } });
        }
      }
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.invoicesGenerated", entityType: "Invoice", meta: { termId, classGroupId, created } });
      return { created };
    },

    // Split an invoice's total into N dated tranches, prorated evenly across
    // its term's calendar (or ~30-day steps when the term has no dates set)
    // unless the bursar supplies custom per-tranche amounts.
    createInstallmentPlan: async (ctx) => {
      await assertFinanceManager(ctx);
      const schoolId = ctx.session.user.schoolId;
      const invoiceId = str(ctx.body.invoiceId) ?? ctx.id;
      const installmentCount = Math.max(2, Math.min(12, Math.trunc(num(ctx.body.installmentCount) ?? 0)));
      if (!invoiceId) throw new Error("invoiceId required");
      if (!num(ctx.body.installmentCount)) throw new Error("installmentCount must be at least 2");
      const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, schoolId }, include: { term: true, installmentPlan: true } });
      if (!invoice) throw new Error("Invoice not found");
      if (invoice.installmentPlan) throw new Error("This invoice already has an installment plan");

      const total = Number(invoice.totalAmount);
      const customAmounts = Array.isArray(ctx.body.amounts) ? (ctx.body.amounts as unknown[]).map((a) => Number(a)) : null;
      let amounts: number[];
      if (customAmounts && customAmounts.length === installmentCount && customAmounts.every((a) => Number.isFinite(a) && a > 0)) {
        const sum = Math.round(customAmounts.reduce((a, b) => a + b, 0) * 100) / 100;
        if (Math.abs(sum - total) > 1) throw new Error("Custom installment amounts must sum to the invoice total");
        amounts = customAmounts;
      } else {
        const base = Math.floor((total / installmentCount) * 100) / 100;
        amounts = Array.from({ length: installmentCount }, (_, i) =>
          i === installmentCount - 1 ? Math.round((total - base * (installmentCount - 1)) * 100) / 100 : base,
        );
      }

      const start = invoice.term?.startDate ?? new Date();
      const end = invoice.term?.endDate && invoice.term.endDate > start ? invoice.term.endDate : new Date(start.getTime() + installmentCount * 30 * 86400000);
      const span = end.getTime() - start.getTime();
      const dueDates = Array.from({ length: installmentCount }, (_, i) => new Date(start.getTime() + (span * (i + 1)) / installmentCount));

      const plan = await prisma.installmentPlan.create({
        data: {
          schoolId,
          invoiceId,
          totalAmount: total,
          installmentCount,
          createdByUserId: ctx.session.user.id,
          installments: { create: amounts.map((amount, i) => ({ sequence: i + 1, amount, dueDate: dueDates[i]! })) },
        },
        include: { installments: { orderBy: { sequence: "asc" } } },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.installmentPlanCreated", entityType: "InstallmentPlan", entityId: plan.id, meta: { invoiceId, installmentCount } });
      return plan;
    },

    deleteInstallmentPlan: async (ctx) => {
      await assertFinanceManager(ctx);
      const schoolId = ctx.session.user.schoolId;
      const plan = await prisma.installmentPlan.findFirst({ where: { id: ctx.id, schoolId }, include: { installments: { include: { payments: true } } } });
      if (!plan) throw new Error("Installment plan not found");
      if (plan.installments.some((i) => i.payments.length > 0)) throw new Error("This plan has recorded payments — remove them first");
      await prisma.installmentPlan.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.installmentPlanDeleted", entityType: "InstallmentPlan", entityId: ctx.id });
      return { ok: true };
    },

    addFeeType: async (ctx) => {
      await assertFinanceManager(ctx);
      const name = str(ctx.body.name);
      if (!name) throw new Error("name required");
      const ft = await prisma.feeType.create({
        data: { schoolId: ctx.session.user.schoolId, name, description: str(ctx.body.description), isOptional: ctx.body.isOptional === true, isRecurring: ctx.body.isRecurring !== false },
      });
      return ft;
    },

    addFeeStructure: async (ctx) => {
      await assertFinanceManager(ctx);
      const schoolId = ctx.session.user.schoolId;
      const feeTypeId = str(ctx.body.feeTypeId);
      const amount = num(ctx.body.amount);
      if (!feeTypeId || amount === undefined) throw new Error("feeTypeId and amount required");
      const appliesToRaw = str(ctx.body.appliesTo);
      const appliesTo = appliesToRaw === "BOARDING" || appliesToRaw === "DAY" ? appliesToRaw : "ALL";
      const fs = await prisma.feeStructure.create({
        data: {
          schoolId,
          feeTypeId,
          termId: str(ctx.body.termId),
          section: str(ctx.body.section) as "PRIMARY" | "SECONDARY" | undefined,
          levelId: str(ctx.body.levelId),
          classGroupId: str(ctx.body.classGroupId),
          appliesTo,
          amount,
        },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.structureCreated", entityType: "FeeStructure", entityId: fs.id, meta: { amount } });
      return fs;
    },

    updateFeeType: async (ctx) => {
      await assertFinanceManager(ctx);
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.feeType.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Fee type not found");
      const data: Record<string, unknown> = {};
      if (str(ctx.body.name)) data.name = str(ctx.body.name);
      if (ctx.body.description !== undefined) data.description = str(ctx.body.description) ?? null;
      if (typeof ctx.body.isOptional === "boolean") data.isOptional = ctx.body.isOptional;
      if (typeof ctx.body.isRecurring === "boolean") data.isRecurring = ctx.body.isRecurring;
      const ft = await prisma.feeType.update({ where: { id: ctx.id }, data });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.typeUpdated", entityType: "FeeType", entityId: ctx.id });
      return ft;
    },

    deleteFeeType: async (ctx) => {
      await assertFinanceManager(ctx);
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.feeType.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Fee type not found");
      const used = await prisma.feeStructure.count({ where: { feeTypeId: ctx.id } });
      if (used > 0) throw new Error("Remove its fee structures first");
      await prisma.feeType.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.typeDeleted", entityType: "FeeType", entityId: ctx.id });
      return { ok: true };
    },

    updateFeeStructure: async (ctx) => {
      await assertFinanceManager(ctx);
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.feeStructure.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Fee structure not found");
      const data: Record<string, unknown> = {};
      if (str(ctx.body.feeTypeId)) data.feeTypeId = str(ctx.body.feeTypeId);
      if (ctx.body.termId !== undefined) data.termId = str(ctx.body.termId) ?? null;
      if (ctx.body.section !== undefined) data.section = (str(ctx.body.section) as "PRIMARY" | "SECONDARY" | undefined) ?? null;
      if (ctx.body.levelId !== undefined) data.levelId = str(ctx.body.levelId) ?? null;
      if (ctx.body.classGroupId !== undefined) data.classGroupId = str(ctx.body.classGroupId) ?? null;
      if (ctx.body.appliesTo !== undefined) {
        const appliesToRaw = str(ctx.body.appliesTo);
        data.appliesTo = appliesToRaw === "BOARDING" || appliesToRaw === "DAY" ? appliesToRaw : "ALL";
      }
      if (ctx.body.amount !== undefined) data.amount = num(ctx.body.amount) ?? existing.amount;
      const fs = await prisma.feeStructure.update({ where: { id: ctx.id }, data });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.structureUpdated", entityType: "FeeStructure", entityId: ctx.id, meta: { amount: data.amount } });
      return fs;
    },

    deleteFeeStructure: async (ctx) => {
      await assertFinanceManager(ctx);
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.feeStructure.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Fee structure not found");
      await prisma.feeStructure.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.structureDeleted", entityType: "FeeStructure", entityId: ctx.id });
      return { ok: true };
    },

    deleteInvoice: async (ctx) => {
      await assertFinanceManager(ctx);
      const schoolId = ctx.session.user.schoolId;
      const invoice = await prisma.invoice.findFirst({ where: { id: ctx.id, schoolId } });
      if (!invoice) throw new Error("Invoice not found");
      const paid = Number(invoice.paidAmount);
      const payments = await prisma.payment.count({ where: { invoiceId: ctx.id } });
      if (paid > 0 || payments > 0) throw new Error("This invoice has payments recorded — delete the payments first");
      await prisma.invoice.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.invoiceDeleted", entityType: "Invoice", entityId: ctx.id });
      return { ok: true };
    },

    // A one-off charge for a single student — a fine, a late-registration
    // fee, a damaged-book charge, anything that isn't part of the school-
    // wide FeeStructure rate table. Adds a line item to an existing invoice
    // (given invoiceId, or the student's existing invoice for that term),
    // or creates a fresh single-item invoice for that student/term if
    // neither exists yet.
    addInvoiceItem: async (ctx) => {
      await assertFinanceManager(ctx);
      const schoolId = ctx.session.user.schoolId;
      const description = str(ctx.body.description);
      const amount = num(ctx.body.amount);
      if (!description) throw new Error("A description is required");
      if (amount === undefined || amount <= 0) throw new Error("A positive amount is required");

      let invoiceId = str(ctx.body.invoiceId);
      if (!invoiceId) {
        const studentId = str(ctx.body.studentId);
        const termId = str(ctx.body.termId);
        if (!studentId || !termId) throw new Error("Provide either invoiceId, or studentId and termId");
        const existing = await prisma.invoice.findUnique({ where: { schoolId_studentId_termId: { schoolId, studentId, termId } } });
        if (existing) {
          invoiceId = existing.id;
        } else {
          const invoiceSeq = (await prisma.invoice.count({ where: { schoolId } })) + 1;
          const created = await prisma.invoice.create({
            data: {
              schoolId,
              studentId,
              termId,
              invoiceNumber: `INV-${String(invoiceSeq).padStart(5, "0")}`,
              totalAmount: amount,
              paidAmount: 0,
              balance: amount,
              status: "UNPAID",
              issuedAt: new Date(),
              items: { create: [{ feeTypeId: null, description, amount }] },
            },
          });
          await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.invoiceItemAdded", entityType: "Invoice", entityId: created.id, meta: { description, amount, createdInvoice: true } });
          return created;
        }
      }

      const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, schoolId } });
      if (!invoice) throw new Error("Invoice not found");
      await prisma.invoiceItem.create({ data: { invoiceId, feeTypeId: null, description, amount } });
      await prisma.invoice.update({ where: { id: invoiceId }, data: { totalAmount: { increment: amount } } });
      const updated = await refreshInvoice(invoiceId);
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.invoiceItemAdded", entityType: "Invoice", entityId: invoiceId, meta: { description, amount } });
      return updated;
    },

    // Initiate a Paystack payment for an invoice
    initPayment: async (ctx) => {
      can(ctx, "payments:make");
      const schoolId = ctx.session.user.schoolId;
      const invoiceId = str(ctx.body.invoiceId) ?? ctx.id;
      const amount = num(ctx.body.amount);
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, schoolId },
        include: { student: { include: { user: true } } },
      });
      if (!invoice) throw new Error("Invoice not found");

      // role check: only the invoice's student/parent or admin/owner can pay
      const role = ctx.session.user.role;
      if (role === "STUDENT" && invoice.studentId !== ctx.session.user.student!.id) throw new Error("Not your invoice");
      if (role === "PARENT") {
        const linked = await prisma.studentParent.findFirst({ where: { parentId: ctx.session.user.parent!.id, studentId: invoice.studentId } });
        if (!linked) throw new Error("Not your invoice");
      }

      // Optional: pay one tranche of the invoice's installment plan.
      const installmentId = str(ctx.body.installmentId);
      let installmentRow: Awaited<ReturnType<typeof prisma.installment.findFirst>> = null;
      if (installmentId) {
        installmentRow = await prisma.installment.findFirst({ where: { id: installmentId, plan: { invoiceId: invoice.id } } });
        if (!installmentRow) throw new Error("Installment not found on this invoice");
      }
      const remainingCap = installmentRow ? Number(installmentRow.amount) - Number(installmentRow.paidAmount) : Number(invoice.balance);
      const payAmount = amount ?? remainingCap;
      if (payAmount <= 0) throw new Error(installmentRow ? "This installment is already settled" : "Invoice already settled");
      if (payAmount > remainingCap) throw new Error(installmentRow ? "Payment amount cannot exceed this installment's outstanding balance" : "Payment amount cannot exceed the outstanding balance");
      if (payAmount > Number(invoice.balance)) throw new Error("Payment amount cannot exceed the outstanding balance");
      const reference = generateReference("PYM");

      const payment = await prisma.payment.create({
        data: {
          schoolId,
          studentId: invoice.studentId,
          invoiceId,
          termId: invoice.termId,
          amount: payAmount,
          method: "TRANSFER",
          status: "PENDING",
          reference,
          gateway: "PAYSTACK",
          meta: { initiator: ctx.session.user.id },
          installmentId: installmentRow?.id,
        },
      });

      if (!(await paystackConfigured())) {
        // Development mock: treat as success immediately and return a mock URL.
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "SUCCESS", paidAt: new Date(), gatewayRef: `MOCK-${reference}`, receiptNumber: `RCPT-${reference.slice(-6)}` } });
        const access = await recomputeFeeAccess(schoolId, invoice.studentId);
        await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.paymentMocked", entityType: "Payment", entityId: payment.id, meta: { reference, amount: payAmount, installmentId: installmentRow?.id } });
        const updated = await refreshInvoice(invoice.id);
        if (installmentRow) await refreshInstallment(installmentRow.id);
        if (Number(updated?.balance ?? 0) > 0 && updated) await notifyParentsOfBalance(schoolId, invoice.studentId, updated);
        const student = await prisma.student.findUnique({ where: { id: invoice.studentId }, include: { user: true } });
        if (student) {
          const body = `₦${payAmount.toLocaleString()} received. Balance: ₦${(updated?.balance ?? 0).toLocaleString()}.${coverageSuffix(access)}`;
          await dispatchNotification({ schoolId, userId: student.userId, type: "payment", title: "Payment received", body, link: "/portal/fees" });
          await notifyParentsOfPayment(schoolId, invoice.studentId, `${student.user.firstName} ${student.user.lastName}`, "Payment received", body);
        }
        return { mock: true, reference, authorization_url: "/portal/fees", status: "SUCCESS", access };
      }

      const data = await initializePayment({
        email: invoice.student.user.email ?? "noreply@duga.school",
        amountKobo: Math.round(payAmount * 100),
        reference,
        callbackUrl: `${process.env.PAYSTACK_CALLBACK_URL ?? `https://portal.dugaakwanga.com/portal/fees`}?reference=${reference}`,
        metadata: { invoiceId: invoice.id, studentId: invoice.studentId },
      });
      return { mock: false, reference, authorization_url: data.authorization_url };
    },

    // Verify a Paystack payment (also called by callback)
    verifyPayment: async (ctx) => {
      can(ctx, "payments:make");
      const reference = str(ctx.body.reference) ?? str(ctx.query.get("reference"));
      if (!reference) throw new Error("reference required");
      const payment = await prisma.payment.findFirst({ where: { reference, schoolId: ctx.session.user.schoolId } });
      if (!payment) throw new Error("Payment not found");
      const role = ctx.session.user.role;
      if (role === "STUDENT" && payment.studentId !== ctx.session.user.student?.id) throw new Error("Not your payment");
      if (role === "PARENT") {
        const linked = await prisma.studentParent.findFirst({ where: { parentId: ctx.session.user.parent?.id, studentId: payment.studentId } });
        if (!linked) throw new Error("Not your payment");
      }
      if (payment.status === "SUCCESS") return { status: "SUCCESS", payment };

      if (!(await paystackConfigured())) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "SUCCESS", paidAt: new Date(), receiptNumber: `RCPT-${reference.slice(-6)}` } });
      } else {
        const data = await verifyPayment(reference);
        if (data.status === "success") {
          await prisma.payment.update({ where: { id: payment.id }, data: { status: "SUCCESS", paidAt: data.paid_at ? new Date(data.paid_at) : new Date(), gatewayRef: data.reference, receiptNumber: `RCPT-${reference.slice(-6)}`, method: (data.channel as "CARD") ?? "TRANSFER" } });
        } else {
          await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
          throw new Error("Payment verification failed");
        }
      }

      const invoice = await refreshInvoice(payment.invoiceId!);
      if (payment.installmentId) await refreshInstallment(payment.installmentId);
      const access = await recomputeFeeAccess(ctx.session.user.schoolId, payment.studentId);
      if (invoice && Number(invoice.balance) > 0) await notifyParentsOfBalance(ctx.session.user.schoolId, payment.studentId, invoice);
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "fees.paymentVerified", entityType: "Payment", entityId: payment.id, meta: { reference } });
      const student = await prisma.student.findUnique({ where: { id: payment.studentId }, include: { user: true } });
      if (student) {
        const body = `₦${Number(payment.amount).toLocaleString()} confirmed. Balance: ₦${(invoice?.balance ?? 0).toLocaleString()}.${coverageSuffix(access)}`;
        await dispatchNotification({ schoolId: ctx.session.user.schoolId, userId: student.userId, type: "payment", title: "Payment confirmed", body, link: "/portal/fees" });
        await notifyParentsOfPayment(ctx.session.user.schoolId, payment.studentId, `${student.user.firstName} ${student.user.lastName}`, "Payment confirmed", body);
      }
      return { status: "SUCCESS", payment, invoice, access };
    },

    // Send fee reminders to parents with unpaid/partial invoices. Also runs
    // automatically Mon/Wed/Fri via app/api/cron/fee-reminders — this stays
    // as a manual "send now" option on top of that, not a replacement for it.
    remind: async (ctx) => {
      await assertFinanceManager(ctx);
      const sent = await sendFeeReminders(ctx.session.user.schoolId);
      return { sent };
    },

    // Record an offline payment (cash, bank transfer, etc.) taken outside the
    // app. Works two ways: against an existing invoice (reduces its balance,
    // as before), or as a standalone payment directly against a student when
    // there's no invoice to apply it to — either way it still advances the
    // student's fee-access window via grantFeeAccessForPayment.
    recordManual: async (ctx) => {
      await assertFinanceManager(ctx);
      const schoolId = ctx.session.user.schoolId;
      const invoiceId = str(ctx.body.invoiceId) ?? ctx.id;
      const amount = num(ctx.body.amount);
      if (amount === undefined || amount <= 0) throw new Error("A positive amount is required");

      // Explicit installment coverage window, e.g. "this payment covers Term
      // 2" — when given, this overrides the proportional amount-based
      // calculation for how far the student's fee-access window advances.
      const coversFromRaw = str(ctx.body.coversFrom);
      const coversToRaw = str(ctx.body.coversTo);
      const coversFrom = coversFromRaw ? new Date(coversFromRaw) : undefined;
      const coversTo = coversToRaw ? new Date(coversToRaw) : undefined;
      if (coversTo && Number.isNaN(coversTo.getTime())) throw new Error("Invalid coversTo date");
      if (coversFrom && Number.isNaN(coversFrom.getTime())) throw new Error("Invalid coversFrom date");

      // Optional: apply this payment against one tranche of the invoice's
      // installment plan instead of the invoice as a whole.
      const installmentId = str(ctx.body.installmentId);
      let installmentRow: Awaited<ReturnType<typeof prisma.installment.findFirst>> = null;

      let studentId: string;
      let invoiceRow: Awaited<ReturnType<typeof prisma.invoice.findFirst>> = null;
      if (invoiceId) {
        invoiceRow = await prisma.invoice.findFirst({ where: { id: invoiceId, schoolId } });
        if (!invoiceRow) throw new Error("Invoice not found");
        if (amount > Number(invoiceRow.balance)) throw new Error("Amount must not exceed the outstanding balance on this invoice");
        if (installmentId) {
          installmentRow = await prisma.installment.findFirst({ where: { id: installmentId, plan: { invoiceId: invoiceRow.id } } });
          if (!installmentRow) throw new Error("Installment not found on this invoice");
          const remaining = Number(installmentRow.amount) - Number(installmentRow.paidAmount);
          if (amount > remaining) throw new Error("Amount must not exceed the outstanding balance on this installment");
        }
        studentId = invoiceRow.studentId;
      } else {
        // No invoice to apply this to — a general offline payment directly
        // against a student's fee-access window (e.g. an ad-hoc installment
        // not tied to a specific term's invoice).
        const bodyStudentId = str(ctx.body.studentId);
        if (!bodyStudentId) throw new Error("Provide either invoiceId or studentId");
        const student = await prisma.student.findFirst({ where: { id: bodyStudentId, schoolId } });
        if (!student) throw new Error("Student not found");
        studentId = student.id;
      }

      const reference = generateReference("MAN");
      const payment = await prisma.payment.create({
        data: {
          schoolId,
          // An invoice, when given, belongs to exactly one student; never
          // accept a client-supplied student id alongside an invoice, which
          // could misapply fee access to the wrong student.
          studentId,
          invoiceId: invoiceRow?.id,
          termId: invoiceRow?.termId ?? str(ctx.body.termId),
          amount,
          method: (str(ctx.body.method) as "CASH") ?? "CASH",
          status: "SUCCESS",
          reference,
          gateway: "MANUAL",
          paidAt: new Date(),
          receiptNumber: `RCPT-${reference.slice(-6)}`,
          recordedByUserId: ctx.session.user.id,
          coversFrom,
          coversTo,
          installmentId: installmentRow?.id,
        },
      });
      const invoice = invoiceRow ? await refreshInvoice(invoiceRow.id) : null;
      const installment = installmentRow ? await refreshInstallment(installmentRow.id) : null;
      const access = await recomputeFeeAccess(schoolId, studentId);
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.manualPayment", entityType: "Payment", entityId: payment.id, meta: { amount, coversTo: coversTo?.toISOString(), installmentId: installmentRow?.id } });

      // Confirm the amount just accepted (not just the generic "you still
      // owe" reminder) to both the student and the parent — a bursar
      // recording a part-payment should tell the family exactly what was
      // just credited and what's left, the same way an online payment does.
      const student = await prisma.student.findUnique({ where: { id: studentId }, include: { user: true } });
      if (student) {
        const balanceText = invoice ? ` Invoice balance: ₦${Number(invoice.balance).toLocaleString()}.` : "";
        const body = `₦${amount.toLocaleString()} received.${balanceText}${coverageSuffix(access)}`;
        await dispatchNotification({ schoolId, userId: student.userId, type: "payment", title: "Payment received", body, link: "/portal/fees" });
        await notifyParentsOfPayment(schoolId, studentId, `${student.user.firstName} ${student.user.lastName}`, "Payment received", body);
      }
      return { payment, invoice, installment, access };
    },

    // Bursar/admin/owner: grant a fee-access exception for a student (a
    // scholarship, payment plan, or one-off exception) — bypasses the fee
    // window for every fee-gated feature (tests, assignments, elearn, games,
    // live, results), since assertFeeAccess/resolveResultsAccess both check
    // the same FeeOverride table. Lives here (not results.ts) so it's gated
    // by the "fees" feature bursar already has, not "results", which their
    // role's feature whitelist deliberately excludes.
    setOverride: async (ctx) => {
      can(ctx, "overrides:manage");
      const studentId = str(ctx.body.studentId);
      const termId = str(ctx.body.termId);
      const reason = str(ctx.body.reason) ?? "EXCEPTION";
      const isActive = ctx.body.isActive !== false;
      if (!studentId) throw new Error("studentId required");
      const override = await prisma.feeOverride.create({
        data: {
          schoolId: ctx.session.user.schoolId,
          studentId,
          termId,
          reason: reason as "SCHOLARSHIP",
          note: str(ctx.body.note),
          discountAmount: num(ctx.body.discountAmount),
          dueDate: str(ctx.body.dueDate) ? new Date(String(ctx.body.dueDate)) : undefined,
          expiresAt: str(ctx.body.expiresAt) ? new Date(String(ctx.body.expiresAt)) : undefined,
          isActive,
          createdByUserId: ctx.session.user.id,
        },
      });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "fees.accessOverride", entityType: "FeeOverride", entityId: override.id, meta: { studentId, reason, isActive } });
      return override;
    },

    deactivateOverride: async (ctx) => {
      can(ctx, "overrides:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.feeOverride.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Override not found");
      const override = await prisma.feeOverride.update({ where: { id: ctx.id }, data: { isActive: false } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.accessOverrideRevoked", entityType: "FeeOverride", entityId: ctx.id });
      return override;
    },
  },
};
