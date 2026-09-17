import { prisma, renderEmailHtml, defaultCopyFor } from "@duga/core/server";
import type { Module } from ".";
import { can, str } from "../helpers";

// One entry per admin-editable notification type — the label shown in the
// UI, and sample data so both the "what does this look like" preview and
// the initial page load (before anything is customized) render something
// real rather than an empty shell. Sample data never reaches an actual
// recipient; it's only ever passed to renderEmailHtml for a preview.
const EDITABLE_TYPES: Array<{ type: string; label: string; sampleTitle: string; sampleBody: string }> = [
  { type: "fee_reminder", label: "Fee Reminder", sampleTitle: "Fee payment reminder", sampleBody: "Outstanding balance for Jane Doe: ₦45,000.00 (INV-2026-0142)." },
  { type: "payment", label: "Payment Confirmation", sampleTitle: "Payment received", sampleBody: "Jane Doe: ₦20,000 received. Balance: ₦25,000." },
  { type: "application", label: "Admissions", sampleTitle: "Congratulations — you've been admitted!", sampleBody: "Your admission number is DUGA/PRI/2026/0142. Please visit the school to complete the full enrollment and onboarding process. For any questions, please call us on 07066160481." },
  { type: "message", label: "New Message", sampleTitle: "New message", sampleBody: "You have a new message from Mrs. Sunday." },
  { type: "announcement", label: "Announcement", sampleTitle: "School announcement", sampleBody: "Mid-term break begins Friday, October 2nd." },
  { type: "assignment", label: "New Assignment", sampleTitle: "New assignment: Basic Science", sampleBody: "A new assignment has been posted for JSS1A. Submit before the due date." },
  { type: "test", label: "CBT Test", sampleTitle: "CBT available: Mid-Term Test", sampleBody: "A CBT exam has been assigned. Complete it before it closes." },
  { type: "result", label: "CBT Result", sampleTitle: "Test result ready: Mid-Term Test", sampleBody: "Your CBT result has been shared. Check your learning page." },
  { type: "grade", label: "Assignment Graded", sampleTitle: "Assignment graded", sampleBody: "Your assignment scored 85." },
  { type: "results", label: "Report Card / Results", sampleTitle: "Report cards published", sampleBody: "Your child's report card is now available on the portal." },
  { type: "content", label: "New Learning Content", sampleTitle: "New content available", sampleBody: "New learning content has been posted for your class." },
  { type: "library", label: "Library", sampleTitle: "Book assigned", sampleBody: `"The Wind in the Willows" was assigned to you. Please return it by 2026-10-01.` },
  { type: "timetable", label: "Timetable Published", sampleTitle: "Timetable published", sampleBody: "The school timetable is now available for your class or subject." },
  { type: "gate", label: "Gate Clock In/Out", sampleTitle: "Arrived at school", sampleBody: "Jane Doe arrived at school at 7:45 AM." },
  { type: "visitor", label: "Visitor at Gate", sampleTitle: "You have a visitor", sampleBody: "John Smith is at the gate to see you — parent meeting." },
];

function findType(type: string | undefined) {
  const meta = EDITABLE_TYPES.find((t) => t.type === type);
  if (!meta) throw new Error("Unknown notification type");
  return meta;
}

export const emailTemplatesModule: Module = {
  async list(ctx) {
    can(ctx, "emailTemplates:manage");
    const schoolId = ctx.session.user.schoolId;
    const rows = await prisma.emailTemplate.findMany({ where: { schoolId } });
    const byType = new Map(rows.map((r) => [r.type, r]));
    return {
      items: EDITABLE_TYPES.map((t) => {
        const row = byType.get(t.type);
        return {
          type: t.type,
          label: t.label,
          default: defaultCopyFor(t.type, t.sampleTitle),
          custom: row ? { greeting: row.greeting, intro: row.intro, closing: row.closing, signOff: row.signOff } : null,
        };
      }),
    };
  },

  actions: {
    save: async (ctx) => {
      can(ctx, "emailTemplates:manage");
      const schoolId = ctx.session.user.schoolId;
      const meta = findType(str(ctx.body.type));
      // Leaving a field blank clears any previous customization for it and
      // falls back to the built-in default — not "an intentionally empty
      // line" — much simpler for an admin to reason about than the two
      // being different things.
      const data = {
        greeting: str(ctx.body.greeting) ?? null,
        intro: str(ctx.body.intro) ?? null,
        closing: str(ctx.body.closing) ?? null,
        signOff: str(ctx.body.signOff) ?? null,
      };
      await prisma.emailTemplate.upsert({
        where: { schoolId_type: { schoolId, type: meta.type } },
        update: data,
        create: { schoolId, type: meta.type, ...data },
      });
      return { ok: true };
    },

    reset: async (ctx) => {
      can(ctx, "emailTemplates:manage");
      const schoolId = ctx.session.user.schoolId;
      const meta = findType(str(ctx.body.type));
      await prisma.emailTemplate.deleteMany({ where: { schoolId, type: meta.type } });
      return { ok: true };
    },

    // Renders the exact same function a real send uses, with sample data —
    // so what the admin sees while editing is what actually goes out, not
    // an approximation of it.
    preview: async (ctx) => {
      can(ctx, "emailTemplates:manage");
      const meta = findType(str(ctx.body.type));
      const html = renderEmailHtml({
        type: meta.type,
        title: meta.sampleTitle,
        body: meta.sampleBody,
        recipientName: "Chioma Okafor",
        copyOverride: {
          greeting: str(ctx.body.greeting),
          intro: str(ctx.body.intro),
          closing: str(ctx.body.closing),
          signOff: str(ctx.body.signOff),
        },
      });
      return { html };
    },
  },
};
