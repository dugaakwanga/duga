import { prisma, logAudit } from "@duga/core/server";
import { formatNaira } from "@duga/core";
import type { Module } from ".";
import { can, str, bool, financeManager } from "../helpers";

async function assertLedgerAccess(ctx: Parameters<NonNullable<Module["list"]>>[0], manage = false) {
  can(ctx, manage ? "ledger:manage" : "ledger:view");
  if (!(await financeManager(ctx))) {
    const err = new Error("Finance is managed only by the bursar and school owner, or an admin granted access") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}

// The fixed catalogue of system books a school can provision — shown as
// "suggested books" until created, then behave per their kind (see below).
const SYSTEM_BOOK_CATALOGUE: Array<{ kind: "SYSTEM_FEES" | "SYSTEM_PAYROLL" | "SYSTEM_EXPENSE"; name: string; description: string }> = [
  { kind: "SYSTEM_FEES", name: "Fees & Payments Book", description: "Every fee payment recorded in the app — updates automatically, read-only." },
  { kind: "SYSTEM_PAYROLL", name: "Payroll & Salaries Book", description: "Every payroll entry generated in the app — updates automatically, read-only." },
  { kind: "SYSTEM_EXPENSE", name: "Expenses Book", description: "School expenses — there's no other record of these in the app, so entries are added here by hand." },
];

// Starter columns seeded onto a freshly-provisioned Expenses book. From then
// on it behaves exactly like a custom book — the bursar can add/remove
// columns and tabs on it freely.
const EXPENSE_STARTER_COLUMNS: Array<{ label: string; kind: "TEXT" | "NUMBER" | "CURRENCY" | "DATE"; required: boolean; totals: boolean }> = [
  { label: "Date", kind: "DATE", required: true, totals: false },
  { label: "Category", kind: "TEXT", required: true, totals: false },
  { label: "Description", kind: "TEXT", required: false, totals: false },
  { label: "Paid to", kind: "TEXT", required: false, totals: false },
  { label: "Amount", kind: "CURRENCY", required: true, totals: true },
];

function columnKind(v: unknown): "TEXT" | "NUMBER" | "CURRENCY" | "DATE" | "SELECT" {
  const s = str(v);
  return s === "NUMBER" || s === "CURRENCY" || s === "DATE" || s === "SELECT" ? s : "TEXT";
}

async function assertBookInSchool(schoolId: string, bookId: string) {
  const book = await prisma.ledgerBook.findFirst({ where: { id: bookId, schoolId } });
  if (!book) throw new Error("Book not found");
  return book;
}

async function assertTabInSchool(schoolId: string, tabId: string) {
  const tab = await prisma.ledgerBookTab.findFirst({ where: { id: tabId, schoolId }, include: { book: true, columns: true } });
  if (!tab) throw new Error("Tab not found");
  return tab;
}

export const booksModule: Module = {
  async list(ctx) {
    await assertLedgerAccess(ctx);
    const schoolId = ctx.session.user.schoolId;
    const books = await prisma.ledgerBook.findMany({
      where: { schoolId },
      include: { tabs: { orderBy: { order: "asc" }, include: { columns: { orderBy: { order: "asc" } } } } },
      orderBy: { createdAt: "asc" },
    });
    const provisionedKinds = new Set(books.map((b) => b.kind).filter((k) => k !== "CUSTOM"));
    const suggested = SYSTEM_BOOK_CATALOGUE.filter((c) => !provisionedKinds.has(c.kind));
    return { books, suggested, canManage: await financeManager(ctx) };
  },

  actions: {
    createBook: async (ctx) => {
      await assertLedgerAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const name = str(ctx.body.name);
      if (!name) throw new Error("name required");
      const book = await prisma.ledgerBook.create({
        data: {
          schoolId,
          name,
          description: str(ctx.body.description),
          kind: "CUSTOM",
          section: str(ctx.body.section),
          createdByUserId: ctx.session.user.id,
          tabs: { create: [{ schoolId, name: "Sheet 1", order: 0 }] },
        },
        include: { tabs: { include: { columns: true } } },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "books.created", entityType: "LedgerBook", entityId: book.id, meta: { name } });
      return book;
    },

    // Idempotent: returns the existing system book if it's already been
    // created rather than making a duplicate.
    provisionSystemBook: async (ctx) => {
      await assertLedgerAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const kind = str(ctx.body.kind);
      const entry = SYSTEM_BOOK_CATALOGUE.find((c) => c.kind === kind);
      if (!entry) throw new Error("Unknown system book");
      const existing = await prisma.ledgerBook.findFirst({ where: { schoolId, kind: entry.kind } });
      if (existing) return existing;
      const book = await prisma.ledgerBook.create({
        data: {
          schoolId,
          name: entry.name,
          kind: entry.kind,
          createdByUserId: ctx.session.user.id,
          tabs:
            entry.kind === "SYSTEM_EXPENSE"
              ? { create: [{ schoolId, name: "Sheet 1", order: 0, columns: { create: EXPENSE_STARTER_COLUMNS.map((c, i) => ({ schoolId, ...c, order: i })) } }] }
              : undefined,
        },
        include: { tabs: { include: { columns: true } } },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "books.provisioned", entityType: "LedgerBook", entityId: book.id, meta: { kind: entry.kind } });
      return book;
    },

    renameBook: async (ctx) => {
      await assertLedgerAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const name = str(ctx.body.name);
      if (!name) throw new Error("name required");
      await assertBookInSchool(schoolId, ctx.id!);
      const book = await prisma.ledgerBook.update({ where: { id: ctx.id }, data: { name, description: ctx.body.description !== undefined ? str(ctx.body.description) : undefined } });
      return book;
    },

    deleteBook: async (ctx) => {
      await assertLedgerAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const book = await assertBookInSchool(schoolId, ctx.id!);
      if (book.kind !== "CUSTOM" && book.kind !== "SYSTEM_EXPENSE") throw new Error("A live system book can't be deleted");
      const rowCount = await prisma.ledgerBookRow.count({ where: { tab: { bookId: ctx.id } } });
      if (rowCount > 0) throw new Error("This book has entries recorded — remove them first");
      await prisma.ledgerBook.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "books.deleted", entityType: "LedgerBook", entityId: ctx.id });
      return { ok: true };
    },

    addTab: async (ctx) => {
      await assertLedgerAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const bookId = str(ctx.body.bookId);
      const name = str(ctx.body.name);
      if (!bookId || !name) throw new Error("bookId and name required");
      await assertBookInSchool(schoolId, bookId);
      const order = await prisma.ledgerBookTab.count({ where: { bookId } });
      return prisma.ledgerBookTab.create({ data: { schoolId, bookId, name, order }, include: { columns: true } });
    },

    renameTab: async (ctx) => {
      await assertLedgerAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const name = str(ctx.body.name);
      if (!name) throw new Error("name required");
      await assertTabInSchool(schoolId, ctx.id!);
      return prisma.ledgerBookTab.update({ where: { id: ctx.id }, data: { name } });
    },

    deleteTab: async (ctx) => {
      await assertLedgerAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const tab = await assertTabInSchool(schoolId, ctx.id!);
      const siblingCount = await prisma.ledgerBookTab.count({ where: { bookId: tab.bookId } });
      if (siblingCount <= 1) throw new Error("A book needs at least one tab");
      const rowCount = await prisma.ledgerBookRow.count({ where: { tabId: ctx.id } });
      if (rowCount > 0) throw new Error("This tab has entries recorded — remove them first");
      await prisma.ledgerBookTab.delete({ where: { id: ctx.id } });
      return { ok: true };
    },

    addColumn: async (ctx) => {
      await assertLedgerAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const tabId = str(ctx.body.tabId);
      const label = str(ctx.body.label);
      if (!tabId || !label) throw new Error("tabId and label required");
      const tab = await assertTabInSchool(schoolId, tabId);
      const parentId = str(ctx.body.parentId);
      if (parentId && !tab.columns.some((c) => c.id === parentId)) throw new Error("Parent heading not found on this tab");
      const order = tab.columns.length;
      return prisma.ledgerBookColumn.create({
        data: {
          schoolId,
          tabId,
          label,
          kind: columnKind(ctx.body.kind),
          order,
          required: bool(ctx.body.required) ?? false,
          totals: bool(ctx.body.totals) ?? false,
          parentId,
          optionsJson: Array.isArray(ctx.body.options) ? ctx.body.options : undefined,
        },
      });
    },

    updateColumn: async (ctx) => {
      await assertLedgerAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.ledgerBookColumn.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Column not found");
      const data: Record<string, unknown> = {};
      if (str(ctx.body.label)) data.label = str(ctx.body.label);
      if (ctx.body.kind !== undefined) data.kind = columnKind(ctx.body.kind);
      if (ctx.body.required !== undefined) data.required = bool(ctx.body.required) ?? false;
      if (ctx.body.totals !== undefined) data.totals = bool(ctx.body.totals) ?? false;
      return prisma.ledgerBookColumn.update({ where: { id: ctx.id }, data });
    },

    deleteColumn: async (ctx) => {
      await assertLedgerAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.ledgerBookColumn.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Column not found");
      // Children (subheadings under this column) are un-grouped, not deleted
      // — enforced by the parentId FK's ON DELETE SET NULL.
      await prisma.ledgerBookColumn.delete({ where: { id: ctx.id } });
      return { ok: true };
    },

    getTabData: async (ctx) => {
      await assertLedgerAccess(ctx);
      const schoolId = ctx.session.user.schoolId;
      const tabId = str(ctx.query.get("tabId")) ?? ctx.id;
      if (!tabId) throw new Error("tabId required");
      const tab = await prisma.ledgerBookTab.findFirst({
        where: { id: tabId, schoolId },
        include: { columns: { orderBy: { order: "asc" } }, rows: { orderBy: { createdAt: "asc" } }, book: true },
      });
      if (!tab) throw new Error("Tab not found");
      const totals: Record<string, number> = {};
      for (const col of tab.columns.filter((c) => c.totals)) {
        totals[col.id] = tab.rows.reduce((a, r) => a + (Number((r.valuesJson as Record<string, unknown>)?.[col.id]) || 0), 0);
      }
      return { tab, totals };
    },

    addRow: async (ctx) => {
      await assertLedgerAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const tabId = str(ctx.body.tabId);
      if (!tabId) throw new Error("tabId required");
      const tab = await assertTabInSchool(schoolId, tabId);
      const values = (ctx.body.values && typeof ctx.body.values === "object" ? ctx.body.values : {}) as Record<string, unknown>;
      for (const col of tab.columns.filter((c) => c.required)) {
        const v = values[col.id];
        if (v === undefined || v === null || v === "") throw new Error(`"${col.label}" is required`);
      }
      const row = await prisma.ledgerBookRow.create({ data: { schoolId, tabId, valuesJson: values as object, createdByUserId: ctx.session.user.id } });
      return row;
    },

    updateRow: async (ctx) => {
      await assertLedgerAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.ledgerBookRow.findFirst({ where: { id: ctx.id, schoolId }, include: { tab: { include: { columns: true } } } });
      if (!existing) throw new Error("Entry not found");
      const values = (ctx.body.values && typeof ctx.body.values === "object" ? ctx.body.values : {}) as Record<string, unknown>;
      for (const col of existing.tab.columns.filter((c) => c.required)) {
        const v = values[col.id];
        if (v === undefined || v === null || v === "") throw new Error(`"${col.label}" is required`);
      }
      return prisma.ledgerBookRow.update({ where: { id: ctx.id }, data: { valuesJson: values as object } });
    },

    deleteRow: async (ctx) => {
      await assertLedgerAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.ledgerBookRow.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Entry not found");
      await prisma.ledgerBookRow.delete({ where: { id: ctx.id } });
      return { ok: true };
    },

    // Live, read-only view of the Fees & Payments book — computed straight
    // from Payment/Invoice, never duplicated into LedgerBookRow.
    getSystemFeesData: async (ctx) => {
      await assertLedgerAccess(ctx);
      const schoolId = ctx.session.user.schoolId;
      const payments = await prisma.payment.findMany({
        where: { schoolId, status: "SUCCESS" },
        include: { student: { include: { user: { select: { firstName: true, lastName: true } } } }, invoice: { select: { invoiceNumber: true } } },
        orderBy: { paidAt: "desc" },
        take: 500,
      });
      const rows = payments.map((p) => ({
        id: p.id,
        date: p.paidAt,
        student: `${p.student.user.firstName} ${p.student.user.lastName}`,
        invoice: p.invoice?.invoiceNumber ?? "—",
        method: p.method,
        amount: Number(p.amount),
        amountLabel: formatNaira(Number(p.amount)),
        reference: p.reference,
      }));
      return { rows, total: rows.reduce((a, r) => a + r.amount, 0) };
    },

    // Live, read-only view of the Payroll & Salaries book — computed from
    // PayrollEntry.
    getSystemPayrollData: async (ctx) => {
      await assertLedgerAccess(ctx);
      const schoolId = ctx.session.user.schoolId;
      const entries = await prisma.payrollEntry.findMany({
        where: { schoolId },
        include: { user: { select: { firstName: true, lastName: true, role: true } } },
        orderBy: [{ month: "desc" }, { user: { firstName: "asc" } }],
        take: 500,
      });
      const rows = entries.map((e) => ({
        id: e.id,
        month: e.month,
        staff: `${e.user.firstName} ${e.user.lastName}`,
        role: e.user.role,
        base: Number(e.baseSalary),
        deductions: Number(e.lateDeduction) + Number(e.extraDeduction),
        reward: Number(e.reward),
        netPay: Number(e.netPay),
        netPayLabel: formatNaira(Number(e.netPay)),
        status: e.status,
      }));
      return { rows, total: rows.reduce((a, r) => a + r.netPay, 0) };
    },
  },
};
