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

// Grant fee-access days for a payment. By default this is proportional
// (amount/feeAmount*feeDays), extending from the current expiry so an
// instalment never overwrites unused days. When a bursar explicitly declares
// what period a payment covers (e.g. "this covers Term 2"), coversTo is used
// instead of the proportional math — still never moving the window backward.
async function grantFeeAccessForPayment(schoolId: string, studentId: string, amount: number, coversTo?: Date) {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) return { daysGranted: 0, paidThrough: null };
  const start = student.feePaidThrough && student.feePaidThrough > new Date() ? student.feePaidThrough : new Date();

  if (coversTo) {
    const paidThrough = coversTo > start ? coversTo : start;
    await prisma.student.update({ where: { id: student.id }, data: { feePaidThrough: paidThrough } });
    const daysGranted = Math.round((paidThrough.getTime() - start.getTime()) / 86400000);
    return { daysGranted, paidThrough };
  }

  if (Number(student.feeAmount) <= 0 || student.feeDays <= 0) return { daysGranted: 0, paidThrough: student.feePaidThrough };
  const daysGranted = Math.floor((amount / Number(student.feeAmount)) * student.feeDays);
  if (daysGranted <= 0) return { daysGranted: 0, paidThrough: student.feePaidThrough };
  const paidThrough = new Date(start.getTime() + daysGranted * 86400000);
  await prisma.student.update({ where: { id: student.id }, data: { feePaidThrough: paidThrough } });
  return { daysGranted, paidThrough };
}

async function notifyParentsOfBalance(schoolId: string, studentId: string, invoice: { invoiceNumber: string; balance: unknown }) {
  const links = await prisma.studentParent.findMany({ where: { schoolId, studentId }, include: { parent: true } });
  await Promise.all(links.map((link) => dispatchNotification({
    schoolId,
    userId: link.parent.userId,
    type: "fee_reminder",
    title: "Outstanding school fees",
    body: `Outstanding balance: ${formatNaira(Number(invoice.balance))} for ${invoice.invoiceNumber}.`,
    link: "/portal/fees",
    channels: ["IN_APP", "EMAIL", "SMS"],
  })));
  return links.length;
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

export const feesModule: Module = {
  async list(ctx) {
    can(ctx, "fees:view");
    const schoolId = ctx.session.user.schoolId;
    const role = ctx.session.user.role;

    if (role === "STUDENT") {
      const invoices = await prisma.invoice.findMany({
        where: { schoolId, studentId: ctx.session.user.student!.id },
        include: { items: true, payments: { orderBy: { createdAt: "desc" } }, term: true },
        orderBy: { createdAt: "desc" },
      });
      return { role, invoices };
    }
    if (role === "PARENT") {
      const links = await prisma.studentParent.findMany({ where: { parentId: ctx.session.user.parent!.id }, select: { studentId: true } });
      const invoices = await prisma.invoice.findMany({
        where: { schoolId, studentId: { in: links.map((l) => l.studentId) } },
        include: { items: true, student: { include: { user: { select: { firstName: true, lastName: true } } } }, payments: { orderBy: { createdAt: "desc" } }, term: true },
        orderBy: { createdAt: "desc" },
      });
      return { role, invoices };
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
      include: { student: { include: { user: { select: { firstName: true, lastName: true } } } }, term: true, payments: true, items: true },
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
      include: { items: true, payments: true, student: { include: { user: { select: { firstName: true, lastName: true } } } }, term: true },
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
      const [classGroups, existingInvoices] = await Promise.all([
        prisma.classGroup.findMany({ where: { schoolId, id: { in: students.map((s) => s.currentClassGroupId).filter((id): id is string => Boolean(id)) } }, select: { id: true, levelId: true } }),
        prisma.invoice.findMany({ where: { schoolId, termId, studentId: { in: students.map((s) => s.id) } }, select: { studentId: true } }),
      ]);
      const levelByClassGroup = new Map(classGroups.map((group) => [group.id, group.levelId]));
      const invoicedStudentIds = new Set(existingInvoices.map((invoice) => invoice.studentId));

      let created = 0;
      let invoiceSeq = (await prisma.invoice.count({ where: { schoolId } })) + 1;

      for (const student of students) {
        // determine applicable structures by level/section/class
        const studentLevelId = student.currentClassGroupId ? levelByClassGroup.get(student.currentClassGroupId) : undefined;
        const applicable = structures.filter(
          (s) =>
            (!s.classGroupId || s.classGroupId === student.currentClassGroupId) &&
            (!s.levelId || s.levelId === studentLevelId) &&
            (!s.section || s.section === student.section),
        );
        if (applicable.length === 0) continue;

        if (invoicedStudentIds.has(student.id)) continue;

        const totalAmount = applicable.reduce((a, s) => a + Number(s.amount), 0);
        await prisma.invoice.create({
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
            items: {
              create: applicable.map((s) => ({
                feeTypeId: s.feeTypeId,
                description: s.feeType.name,
                amount: s.amount,
              })),
            },
          },
        });
        invoiceSeq += 1;
        created += 1;
      }
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.invoicesGenerated", entityType: "Invoice", meta: { termId, classGroupId, created } });
      return { created };
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
      const fs = await prisma.feeStructure.create({
        data: {
          schoolId,
          feeTypeId,
          termId: str(ctx.body.termId),
          section: str(ctx.body.section) as "PRIMARY" | "SECONDARY" | undefined,
          levelId: str(ctx.body.levelId),
          classGroupId: str(ctx.body.classGroupId),
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

      const payAmount = amount ?? Number(invoice.balance);
      if (payAmount <= 0) throw new Error("Invoice already settled");
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
        },
      });

      if (!(await paystackConfigured())) {
        // Development mock: treat as success immediately and return a mock URL.
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "SUCCESS", paidAt: new Date(), gatewayRef: `MOCK-${reference}`, receiptNumber: `RCPT-${reference.slice(-6)}` } });
        const access = await grantFeeAccessForPayment(schoolId, invoice.studentId, payAmount);
        await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.paymentMocked", entityType: "Payment", entityId: payment.id, meta: { reference, amount: payAmount } });
        const updated = await refreshInvoice(invoice.id);
        if (Number(updated?.balance ?? 0) > 0 && updated) await notifyParentsOfBalance(schoolId, invoice.studentId, updated);
        const student = await prisma.student.findUnique({ where: { id: invoice.studentId }, include: { user: true } });
        if (student) {
          await dispatchNotification({ schoolId, userId: student.userId, type: "payment", title: "Payment received", body: `₦${payAmount.toLocaleString()} received. Balance: ₦${(updated?.balance ?? 0).toLocaleString()}`, link: "/portal/fees" });
        }
        return { mock: true, reference, authorization_url: "/portal/fees", status: "SUCCESS", access };
      }

      const data = await initializePayment({
        email: invoice.student.user.email ?? "noreply@duga.school",
        amountKobo: Math.round(payAmount * 100),
        reference,
        callbackUrl: `${process.env.PAYSTACK_CALLBACK_URL ?? `https://duga-portal.vercel.app/portal/fees`}?reference=${reference}`,
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
      const access = await grantFeeAccessForPayment(ctx.session.user.schoolId, payment.studentId, Number(payment.amount));
      if (invoice && Number(invoice.balance) > 0) await notifyParentsOfBalance(ctx.session.user.schoolId, payment.studentId, invoice);
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "fees.paymentVerified", entityType: "Payment", entityId: payment.id, meta: { reference } });
      const student = await prisma.student.findUnique({ where: { id: payment.studentId }, include: { user: true } });
      if (student) {
        await dispatchNotification({ schoolId: ctx.session.user.schoolId, userId: student.userId, type: "payment", title: "Payment confirmed", body: `₦${Number(payment.amount).toLocaleString()} confirmed. Balance: ₦${(invoice?.balance ?? 0).toLocaleString()}`, link: "/portal/fees" });
      }
      return { status: "SUCCESS", payment, invoice, access };
    },

    // Send fee reminders to parents with unpaid/partial invoices
    remind: async (ctx) => {
      await assertFinanceManager(ctx);
      const schoolId = ctx.session.user.schoolId;
      const unpaid = await prisma.invoice.findMany({
        where: { schoolId, status: { in: ["UNPAID", "PARTIAL"] } },
        include: { student: true },
      });
      let sent = 0;
      for (const inv of unpaid) {
        const parentLinks = await prisma.studentParent.findMany({ where: { studentId: inv.studentId }, include: { parent: true } });
        for (const link of parentLinks) {
          await dispatchNotification({
            schoolId,
            userId: link.parent.userId,
            type: "fee_reminder",
            title: "Fee payment reminder",
            body: `Outstanding balance: ${formatNaira(Number(inv.balance))} for ${inv.invoiceNumber}.`,
            link: "/portal/fees",
            channels: ["IN_APP", "EMAIL", "SMS"],
          });
          sent += 1;
        }
      }
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

      let studentId: string;
      let invoiceRow: Awaited<ReturnType<typeof prisma.invoice.findFirst>> = null;
      if (invoiceId) {
        invoiceRow = await prisma.invoice.findFirst({ where: { id: invoiceId, schoolId } });
        if (!invoiceRow) throw new Error("Invoice not found");
        if (amount > Number(invoiceRow.balance)) throw new Error("Amount must not exceed the outstanding balance on this invoice");
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
        },
      });
      const invoice = invoiceRow ? await refreshInvoice(invoiceRow.id) : null;
      const access = await grantFeeAccessForPayment(schoolId, studentId, amount, coversTo);
      if (invoice && Number(invoice.balance) > 0) await notifyParentsOfBalance(schoolId, studentId, invoice);
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "fees.manualPayment", entityType: "Payment", entityId: payment.id, meta: { amount, coversTo: coversTo?.toISOString() } });
      return { payment, invoice, access };
    },
  },
};
