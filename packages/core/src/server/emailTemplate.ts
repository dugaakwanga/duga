const PORTAL_BASE_URL = process.env.NEXT_PUBLIC_PORTAL_URL || "https://portal.dugaakwanga.com";
const LOGO_URL = `${PORTAL_BASE_URL}/images/logo.png`;
const CAROUSEL_URL = `${PORTAL_BASE_URL}/images/email-carousel.gif`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EmailCopy {
  greeting: string;
  intro: string;
  closing: string;
  signOff: string;
}

// Every notification type gets a sensible built-in letter — greeting, an
// intro line, the actual fact (inserted separately, bolded), a closing
// line, and a sign-off. {{name}} is replaced with the recipient's real
// name when known, or a role-shaped fallback otherwise. Types not listed
// here (most of them — messages, assignments, library, gate alerts, ...)
// use DEFAULT_COPY: a short, generic wrapper, since those are meant to
// stay brief. A school can override any of the four fields per type (see
// EmailTemplate in schema.prisma / lib/server/modules/emailTemplates.ts);
// whatever they leave blank keeps falling back to what's defined here.
const DEFAULT_COPY: Record<string, EmailCopy> = {
  fee_reminder: {
    greeting: "Dear {{name}},",
    intro: "We hope this message finds you and your family well. This is a friendly reminder from our finance office regarding your child's school account.",
    closing:
      "Payments can sometimes take a day or two to reflect, so if you've already settled this, please accept our thanks and disregard the reminder. If anything about the balance looks off, or you'd like to arrange a payment plan, our office is always glad to talk it through.<br><br>We're grateful for your continued trust and partnership in your child's education.",
    signOff: "De Ultimate Glory Academy",
  },
  payment: {
    greeting: "Dear {{name}},",
    intro: "Thank you — we've recorded a payment on your child's school account.",
    closing:
      "You're welcome to review the full payment history and current balance at any time from the Fees section of the school portal.<br><br>We appreciate your continued support.",
    signOff: "De Ultimate Glory Academy",
  },
  application_admitted: {
    greeting: "Dear {{name}},",
    intro: "🎉 Congratulations! We are delighted to offer your child a place at De Ultimate Glory Academy — thank you for trusting us with such an important step in their education.",
    closing: "We're looking forward to meeting your family in person and helping your child settle in.",
    signOff: "DUGA Admissions",
  },
  application: {
    greeting: "Dear {{name}},",
    intro: "Thank you for applying to De Ultimate Glory Academy — we're grateful for your interest in joining our school community.",
    closing: "If you have any questions at all about your application or the admissions process, we're always happy to help — just reply to this email.",
    signOff: "DUGA Admissions",
  },
};

const DEFAULT_COPY_FALLBACK: EmailCopy = {
  greeting: "Dear {{name}},",
  intro: "",
  closing: "",
  signOff: "De Ultimate Glory Academy",
};

// "application" covers both a plain status update and the admitted email,
// which read very differently — keyed separately above by title so each
// gets its own default copy, but both are edited under one "Admissions"
// entry in the admin UI (see lib/server/modules/emailTemplates.ts).
export function defaultCopyFor(type: string, title?: string): EmailCopy {
  if (type === "application" && title?.toLowerCase().includes("admitted")) {
    return DEFAULT_COPY.application_admitted ?? DEFAULT_COPY_FALLBACK;
  }
  return DEFAULT_COPY[type] ?? DEFAULT_COPY_FALLBACK;
}

function applyName(s: string, recipientName?: string): string {
  return s.replace(/\{\{\s*name\s*\}\}/gi, recipientName || "Parent/Guardian");
}

// A plain-text notification body/title rendered as a branded HTML email —
// table-based layout with inline styles throughout, since email clients
// strip <style> blocks and don't reliably support flex/grid/box-shadow.
// Every provider gets the same look regardless of which one ends up
// sending a given email. The header carries an animated GIF (a handful of
// the same student photos used in the site's own hero carousel, played as
// frames) since email clients run no CSS/JS — a GIF is the one animation
// technique that actually renders in an inbox.
export function renderEmailHtml(opts: {
  type: string;
  title: string;
  body: string;
  link?: string;
  recipientName?: string;
  copyOverride?: Partial<EmailCopy>;
}): string {
  const title = escapeHtml(opts.title);
  const fallback = defaultCopyFor(opts.type, opts.title);
  const copy: EmailCopy = {
    greeting: opts.copyOverride?.greeting || fallback.greeting,
    intro: opts.copyOverride?.intro ?? fallback.intro,
    closing: opts.copyOverride?.closing ?? fallback.closing,
    signOff: opts.copyOverride?.signOff || fallback.signOff,
  };
  const name = opts.recipientName ? escapeHtml(opts.recipientName) : undefined;
  const factHtml = escapeHtml(opts.body).replace(/\n/g, "<br>");

  const paragraphs = [applyName(copy.greeting, name)];
  if (copy.intro) paragraphs.push(applyName(copy.intro, name));
  paragraphs.push(`<strong>${factHtml}</strong>`);
  if (copy.closing) paragraphs.push(applyName(copy.closing, name));
  paragraphs.push(`Warm regards,<br>${applyName(copy.signOff, name)}`);
  const bodyHtml = paragraphs.map((p: string) => `<div style="margin-bottom:12px;">${p}</div>`).join("");

  const linkHref = opts.link ? (opts.link.startsWith("http") ? opts.link : `${PORTAL_BASE_URL}${opts.link}`) : null;
  const button = linkHref
    ? `<tr>
        <td style="padding:6px 32px 4px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:999px;background:linear-gradient(135deg,#d9a92a,#a9852a);background-color:#c8a448;">
              <a href="${linkHref}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:700;color:#0f1b2e;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Open in Portal →</a>
            </td>
          </tr></table>
        </td>
      </tr>`
    : "";
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#eae9e6;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eae9e6;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dedede;font-family:Arial,Helvetica,sans-serif;box-shadow:0 18px 40px rgba(15,27,46,0.12);">
            <!-- Gold accent bar -->
            <tr><td style="height:6px;line-height:6px;font-size:0;background:linear-gradient(90deg,#c8a448,#e8cd7a,#c8a448);background-color:#c8a448;">&nbsp;</td></tr>

            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(160deg,#1e3a5f,#14263f);background-color:#1e3a5f;padding:28px 28px 24px;text-align:center;">
                <img src="${LOGO_URL}" width="60" height="60" alt="De Ultimate Glory Academy" style="display:block;margin:0 auto 12px;border-radius:10px;" />
                <div style="color:#ffffff;font-size:17px;font-weight:800;letter-spacing:0.02em;font-family:Georgia,'Times New Roman',serif;">De Ultimate Glory Academy</div>
                <div style="color:#c8a448;font-size:10.5px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;margin-top:5px;">Imparting the Winning Wisdom</div>
              </td>
            </tr>

            <!-- Animated student carousel -->
            <tr>
              <td style="line-height:0;font-size:0;">
                <img src="${CAROUSEL_URL}" width="480" alt="Students of De Ultimate Glory Academy" style="display:block;width:100%;height:auto;" />
              </td>
            </tr>

            <!-- Message -->
            <tr>
              <td style="padding:30px 32px 6px;">
                <div style="font-size:19px;font-weight:800;color:#0f1b2e;margin-bottom:14px;">${title}</div>
                <div style="font-size:14.5px;line-height:1.7;color:#222c3a;">${bodyHtml}</div>
              </td>
            </tr>

            ${button}

            <!-- Footer -->
            <tr>
              <td style="padding:26px 32px 24px;">
                <hr style="border:none;border-top:1px solid #eee;margin:0 0 16px;" />
                <div style="font-size:11.5px;color:#8a8a8a;line-height:1.6;">
                  This is an automated message from De Ultimate Glory Academy's School Portal. Please do not reply directly to this email.
                </div>
              </td>
            </tr>
          </table>
          <div style="font-size:11px;color:#a8a8a8;margin-top:18px;font-family:Arial,Helvetica,sans-serif;">
            De Ultimate Glory Academy · Akwanga
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
