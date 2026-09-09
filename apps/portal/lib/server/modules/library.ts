import { prisma, logAudit, dispatchNotification } from "@duga/core/server";
import type { Module } from ".";
import type { Ctx } from "@/app/api/v1/[...path]/route";
import { can, str, num, idArray, isAssignedTo } from "../helpers";
import { removeFile } from "../storage";

const loanStatus = (loan: { borrowedAt: Date; dueDate: Date | null; returnedAt: Date | null; status: string }) => {
  if (loan.returnedAt) return "RETURNED";
  if (loan.dueDate && loan.dueDate < new Date()) return "OVERDUE";
  return loan.status;
};

function isLibraryAdmin(role: string) {
  return role === "OWNER" || role === "ADMIN";
}

async function teacherStudentIds(teacherId: string, schoolId: string) {
  const classes = await prisma.classSubject.findMany({ where: { teacherId }, select: { classGroupId: true } });
  const ids = [...new Set(classes.map((row) => row.classGroupId))];
  const students = await prisma.student.findMany({ where: { schoolId, currentClassGroupId: { in: ids }, status: "ACTIVE" }, select: { id: true } });
  return students.map((student) => student.id);
}

async function assertTeacherStudentScope(ctx: Ctx, studentId: string) {
  if (ctx.session.user.role !== "TEACHER") return;
  const ids = await teacherStudentIds(ctx.session.user.teacher!.id, ctx.session.user.schoolId);
  if (!ids.includes(studentId)) throw new Error("Teachers can only manage library loans for students they teach");
}

function assertLibraryAdmin(role: string) {
  if (!isLibraryAdmin(role)) throw new Error("Only the owner or an admin can manage the library catalogue");
}

// A teacher may only touch their own not-yet-published submissions — once a
// book is published (or belongs to someone else), only an admin can change it.
function assertOwnUnpublished(ctx: Ctx, book: { addedByUserId: string | null; isPublished: boolean }) {
  if (isLibraryAdmin(ctx.session.user.role)) return;
  if (book.addedByUserId !== ctx.session.user.id) throw new Error("You can only manage your own submissions");
  if (book.isPublished) throw new Error("This book has already been published — ask an admin to change it");
}

export const libraryModule: Module = {
  async list(ctx) {
    can(ctx, "library:view");
    const schoolId = ctx.session.user.schoolId;
    const role = ctx.session.user.role;

    const allBooks = await prisma.libraryBook.findMany({
      where: { schoolId },
      orderBy: { title: "asc" },
      include: { loans: { where: { status: { in: ["BORROWED", "OVERDUE"] }, returnedAt: null } } },
    });

    // Students/parents: only their own loans; everyone else sees all loans.
    const myIds =
      role === "STUDENT"
        ? [ctx.session.user.student!.id]
        : role === "PARENT"
          ? (await prisma.studentParent.findMany({ where: { parentId: ctx.session.user.parent!.id }, select: { studentId: true } })).map((l) => l.studentId)
          : role === "TEACHER"
            ? await teacherStudentIds(ctx.session.user.teacher!.id, schoolId)
            : undefined;

    // A book with no assignment is visible school-wide; otherwise only to the
    // classes/students it was actually given to — same convention as
    // assignments, e-learning content and games.
    let books = allBooks;
    if (role === "STUDENT" || role === "PARENT") {
      const students =
        role === "STUDENT"
          ? [ctx.session.user.student!]
          : await prisma.student.findMany({ where: { id: { in: myIds ?? [] } } });
      books = allBooks.filter((b) => b.isPublished && students.some((s) => isAssignedTo(b, s.id, s.currentClassGroupId)));
    } else if (role === "TEACHER") {
      // A teacher sees the full published catalogue plus their own
      // not-yet-published submissions (so they can track/edit them) — never
      // another teacher's pending upload.
      books = allBooks.filter((b) => b.isPublished || b.addedByUserId === ctx.session.user.id);
    }

    const loans = await prisma.bookLoan.findMany({
      where: { schoolId, ...(myIds ? { studentId: { in: myIds } } : {}) },
      include: {
        book: { select: { id: true, title: true, author: true, category: true } },
        student: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { borrowedAt: "desc" },
      take: 300,
    });

    const students = ["ADMIN", "OWNER", "TEACHER"].includes(role)
      ? await prisma.student.findMany({
          where: { schoolId, ...(role === "TEACHER" ? { id: { in: myIds ?? [] } } : {}) },
          select: { id: true, admissionNumber: true, user: { select: { firstName: true, lastName: true } }, classGroup: { include: { level: true } } },
          orderBy: { admissionNumber: "asc" },
        })
      : undefined;

    // Only needed for admins reviewing a submission queue that isn't all
    // their own — cheap enough to always fetch given how few books a school
    // has pending at once.
    const submitterIds = [...new Set(books.map((b) => b.addedByUserId).filter((id): id is string => Boolean(id)))];
    const submitters = submitterIds.length
      ? await prisma.user.findMany({ where: { id: { in: submitterIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const submitterName = new Map(submitters.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    return {
      role,
      books: books.map((b) => ({
        ...b,
        onLoanCount: b.loans.length,
        availableCopies: Math.max(b.availableCopies, 0),
        addedByName: b.addedByUserId ? submitterName.get(b.addedByUserId) ?? null : null,
      })),
      loans: loans.map((l) => ({ ...l, status: loanStatus(l) })),
      students,
    };
  },

  actions: {
    // ---- Catalog --------------------------------------------------------
    // Any teacher (or admin/owner) can submit a book — a teacher's submission
    // starts unpublished and only appears to them and admins until an admin
    // reviews and publishes it; an admin's own addition publishes immediately
    // since the admin IS the publisher.
    addBook: async (ctx) => {
      can(ctx, "library:manage");
      const role = ctx.session.user.role;
      const title = str(ctx.body.title);
      if (!title) throw new Error("title is required");
      const totalCopies = Math.max(num(ctx.body.totalCopies) ?? 1, 1);
      const fileUrl = str(ctx.body.fileUrl);
      const fileMime = str(ctx.body.fileMime);
      const fileSize = num(ctx.body.fileSize);
      const publishNow = isLibraryAdmin(role);
      const book = await prisma.libraryBook.create({
        data: {
          schoolId: ctx.session.user.schoolId,
          title,
          author: str(ctx.body.author),
          isbn: str(ctx.body.isbn),
          category: str(ctx.body.category) ?? "General",
          shelfLocation: str(ctx.body.shelfLocation),
          totalCopies,
          availableCopies: Math.max(num(ctx.body.availableCopies) ?? totalCopies, 0),
          coverUrl: str(ctx.body.coverUrl),
          coverKey: str(ctx.body.coverUrl) ? str(ctx.body.coverKey) : null,
          fileUrl,
          fileKey: fileUrl ? str(ctx.body.fileKey) : null,
          fileMime,
          fileSize: fileSize ?? null,
          description: str(ctx.body.description),
          addedByUserId: ctx.session.user.id,
          isPublished: publishNow,
          publishedByUserId: publishNow ? ctx.session.user.id : null,
          publishedAt: publishNow ? new Date() : null,
          targetClassGroupIds: idArray(ctx.body.targetClassGroupIds),
          targetStudentIds: idArray(ctx.body.targetStudentIds),
        },
      });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "library.bookCreated", entityType: "LibraryBook", entityId: book.id, meta: { title, isPublished: publishNow } });
      if (!publishNow) {
        const reviewers = await prisma.user.findMany({ where: { schoolId: ctx.session.user.schoolId, role: { in: ["OWNER", "ADMIN"] }, status: "ACTIVE" }, select: { id: true } });
        for (const r of reviewers) {
          await dispatchNotification({ schoolId: ctx.session.user.schoolId, userId: r.id, type: "library", title: "Book submitted for review", body: `"${title}" was submitted to the library and is waiting to be published.`, link: "/portal/library" });
        }
      }
      return book;
    },

    updateBook: async (ctx) => {
      can(ctx, "library:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.libraryBook.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Book not found");
      assertOwnUnpublished(ctx, existing);
      const data: Record<string, unknown> = {};
      if (str(ctx.body.title)) data.title = str(ctx.body.title);
      if (ctx.body.author !== undefined) data.author = str(ctx.body.author) ?? null;
      if (ctx.body.isbn !== undefined) data.isbn = str(ctx.body.isbn) ?? null;
      if (ctx.body.category !== undefined) data.category = str(ctx.body.category) ?? "General";
      if (ctx.body.shelfLocation !== undefined) data.shelfLocation = str(ctx.body.shelfLocation) ?? null;
      if (ctx.body.coverUrl !== undefined) data.coverUrl = str(ctx.body.coverUrl) ?? null;
      if (ctx.body.coverKey !== undefined && data.coverUrl) data.coverKey = str(ctx.body.coverKey) || null;
      if (ctx.body.fileUrl !== undefined) data.fileUrl = str(ctx.body.fileUrl) || null;
      if (ctx.body.fileKey !== undefined && data.fileUrl) data.fileKey = str(ctx.body.fileKey) || null;
      if (ctx.body.fileMime !== undefined && data.fileUrl !== null) data.fileMime = str(ctx.body.fileMime) || null;
      if (ctx.body.fileSize !== undefined && data.fileUrl !== null) data.fileSize = num(ctx.body.fileSize) ?? null;
      if (ctx.body.clearFile) {
        data.fileUrl = null;
        data.fileKey = null;
        data.fileMime = null;
        data.fileSize = null;
      }
      if (ctx.body.description !== undefined) data.description = str(ctx.body.description) ?? null;
      if (ctx.body.totalCopies !== undefined) data.totalCopies = Math.max(num(ctx.body.totalCopies) ?? existing.totalCopies, 1);
      if (ctx.body.availableCopies !== undefined) data.availableCopies = Math.max(num(ctx.body.availableCopies) ?? existing.availableCopies, 0);
      if (ctx.body.targetClassGroupIds !== undefined) data.targetClassGroupIds = idArray(ctx.body.targetClassGroupIds);
      if (ctx.body.targetStudentIds !== undefined) data.targetStudentIds = idArray(ctx.body.targetStudentIds);
      const book = await prisma.libraryBook.update({ where: { id: ctx.id }, data });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "library.bookUpdated", entityType: "LibraryBook", entityId: ctx.id });
      return book;
    },

    deleteBook: async (ctx) => {
      can(ctx, "library:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.libraryBook.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Book not found");
      assertOwnUnpublished(ctx, existing);
      const openLoans = await prisma.bookLoan.count({ where: { bookId: ctx.id, returnedAt: null } });
      if (openLoans > 0) throw new Error("Cannot delete a book with outstanding loans");
      if (existing.fileKey) await removeFile(existing.fileKey).catch(() => {});
      if (existing.coverKey) await removeFile(existing.coverKey).catch(() => {});
      await prisma.libraryBook.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "library.bookDeleted", entityType: "LibraryBook", entityId: ctx.id });
      return { ok: true };
    },

    // Admin/owner reviews a teacher's submission and publishes it to the
    // real catalogue — the only way an unpublished book becomes visible to
    // students/parents.
    publishBook: async (ctx) => {
      can(ctx, "library:manage");
      assertLibraryAdmin(ctx.session.user.role);
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.libraryBook.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Book not found");
      if (existing.isPublished) return existing;
      const book = await prisma.libraryBook.update({
        where: { id: ctx.id },
        data: { isPublished: true, publishedByUserId: ctx.session.user.id, publishedAt: new Date() },
      });
      if (existing.addedByUserId && existing.addedByUserId !== ctx.session.user.id) {
        await dispatchNotification({ schoolId, userId: existing.addedByUserId, type: "library", title: "Book published", body: `"${existing.title}" has been published to the library catalogue.`, link: "/portal/library" });
      }
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "library.bookPublished", entityType: "LibraryBook", entityId: ctx.id });
      return book;
    },

    // Admin/owner declines a submission — removed rather than left to linger,
    // with a reason relayed to whoever submitted it.
    rejectBook: async (ctx) => {
      can(ctx, "library:manage");
      assertLibraryAdmin(ctx.session.user.role);
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.libraryBook.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Book not found");
      if (existing.isPublished) throw new Error("This book is already published — delete it instead if you want it removed");
      const reason = str(ctx.body.reason);
      if (existing.fileKey) await removeFile(existing.fileKey).catch(() => {});
      if (existing.coverKey) await removeFile(existing.coverKey).catch(() => {});
      await prisma.libraryBook.delete({ where: { id: ctx.id } });
      if (existing.addedByUserId) {
        await dispatchNotification({
          schoolId,
          userId: existing.addedByUserId,
          type: "library",
          title: "Book submission declined",
          body: reason ? `"${existing.title}" was not published: ${reason}` : `"${existing.title}" was not published to the library.`,
          link: "/portal/library",
        });
      }
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "library.bookRejected", entityType: "LibraryBook", entityId: ctx.id, meta: { title: existing.title, reason } });
      return { ok: true };
    },

    // ---- Loans ----------------------------------------------------------
    addLoan: async (ctx) => {
      can(ctx, "library:manage");
      const schoolId = ctx.session.user.schoolId;
      const bookId = str(ctx.body.bookId);
      const studentId = str(ctx.body.studentId);
      if (!bookId || !studentId) throw new Error("bookId and studentId are required");
      await assertTeacherStudentScope(ctx, studentId);
      const book = await prisma.libraryBook.findFirst({ where: { id: bookId, schoolId } });
      if (!book) throw new Error("Book not found");
      if (book.availableCopies <= 0) throw new Error("No copies available");
      const due = str(ctx.body.dueDate) ? new Date(String(ctx.body.dueDate)) : null;

      const loan = await prisma.bookLoan.create({
        data: {
          schoolId,
          bookId,
          studentId,
          dueDate: due,
          note: str(ctx.body.note),
          recordedByUserId: ctx.session.user.id,
        },
      });
      await prisma.libraryBook.update({ where: { id: bookId }, data: { availableCopies: Math.max(book.availableCopies - 1, 0) } });

      const student = await prisma.student.findFirst({ where: { id: studentId, schoolId }, include: { user: true } });
      if (!student) throw new Error("Student not found");
      await dispatchNotification({
        schoolId,
        userId: student.userId,
        type: "library",
        title: "Book issued",
        body: `You borrowed "${book.title}". Please return it by ${due ? due.toLocaleDateString() : "the due date"}.`,
        link: "/portal/library",
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "library.loanCreated", entityType: "BookLoan", entityId: loan.id, meta: { bookId, studentId } });
      return loan;
    },

    returnBook: async (ctx) => {
      can(ctx, "library:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.bookLoan.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Loan not found");
      await assertTeacherStudentScope(ctx, existing.studentId);
      if (existing.returnedAt) return { ok: true, loan: existing };

      const loan = await prisma.bookLoan.update({ where: { id: ctx.id }, data: { returnedAt: new Date(), status: "RETURNED" } });
      const book = await prisma.libraryBook.findUnique({ where: { id: existing.bookId } });
      if (book) {
        await prisma.libraryBook.update({ where: { id: book.id }, data: { availableCopies: Math.min(book.availableCopies + 1, book.totalCopies) } });
      }
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "library.loanReturned", entityType: "BookLoan", entityId: ctx.id });
      return { ok: true, loan };
    },

    markLost: async (ctx) => {
      can(ctx, "library:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.bookLoan.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Loan not found");
      await assertTeacherStudentScope(ctx, existing.studentId);
      const loan = await prisma.bookLoan.update({ where: { id: ctx.id }, data: { status: "LOST", returnedAt: new Date() } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "library.loanLost", entityType: "BookLoan", entityId: ctx.id });
      return { ok: true, loan };
    },

    deleteLoan: async (ctx) => {
      can(ctx, "library:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.bookLoan.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Loan not found");
      await assertTeacherStudentScope(ctx, existing.studentId);
      if (!existing.returnedAt) {
        const book = await prisma.libraryBook.findUnique({ where: { id: existing.bookId } });
        if (book) {
          await prisma.libraryBook.update({ where: { id: book.id }, data: { availableCopies: Math.min(book.availableCopies + 1, book.totalCopies) } });
        }
      }
      await prisma.bookLoan.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "library.loanDeleted", entityType: "BookLoan", entityId: ctx.id });
      return { ok: true };
    },
  },
};
