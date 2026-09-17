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

// Push/in-app notifications are deliberately terse — one glanceable line.
// Email can carry more, and a bare one-liner reads as unfinished in an
// inbox, so each notification type gets wrapped in a short greeting, the
// actual fact, a bit of standing context, and a sign-off — without
// inventing any specifics (dates, policies, amounts) beyond what the
// caller already passed in.
function paragraphsFor(type: string, title: string, body: string): string[] {
  if (type === "fee_reminder") {
    return [
      "Dear Parent/Guardian,",
      "We hope this message finds you and your family well. This is a friendly reminder from our finance office regarding your child's school account.",
      `<strong>${body}</strong>`,
      "Payments can sometimes take a day or two to reflect, so if you've already settled this, please accept our thanks and disregard the reminder. If anything about the balance looks off, or you'd like to arrange a payment plan, our office is always glad to talk it through.",
      "We're grateful for your continued trust and partnership in your child's education.",
      "Warm regards,<br>De Ultimate Glory Academy",
    ];
  }
  if (type === "payment") {
    return [
      "Dear Parent/Guardian,",
      "Thank you — we've recorded a payment on your child's school account.",
      `<strong>${body}</strong>`,
      "You're welcome to review the full payment history and current balance at any time from the Fees section of the school portal.",
      "We appreciate your continued support.",
      "Warm regards,<br>De Ultimate Glory Academy",
    ];
  }
  if (type === "application") {
    if (title.toLowerCase().includes("admitted")) {
      return [
        "Dear Parent/Guardian,",
        "🎉 Congratulations! We are delighted to offer your child a place at De Ultimate Glory Academy — thank you for trusting us with such an important step in their education.",
        `<strong>${body}</strong>`,
        "We're looking forward to meeting your family in person and helping your child settle in.",
        "Warm regards,<br>DUGA Admissions",
      ];
    }
    return [
      "Dear Applicant/Parent,",
      "Thank you for applying to De Ultimate Glory Academy — we're grateful for your interest in joining our school community.",
      `<strong>${body}</strong>`,
      "If you have any questions at all about your application or the admissions process, we're always happy to help — just reply to this email.",
      "Warm regards,<br>DUGA Admissions",
    ];
  }
  return [body];
}

// A plain-text notification body/title rendered as a branded HTML email —
// table-based layout with inline styles throughout, since email clients
// strip <style> blocks and don't reliably support flex/grid/box-shadow.
// Every provider gets the same look regardless of which one ends up
// sending a given email. The header carries an animated GIF (a handful of
// the same student photos used in the site's own hero carousel, played as
// frames) since email clients run no CSS/JS — a GIF is the one animation
// technique that actually renders in an inbox.
export function renderEmailHtml(opts: { type: string; title: string; body: string; link?: string }): string {
  const title = escapeHtml(opts.title);
  const paragraphs = paragraphsFor(opts.type, opts.title, escapeHtml(opts.body).replace(/\n/g, "<br>"));
  const bodyHtml = paragraphs.map((p) => `<div style="margin-bottom:12px;">${p}</div>`).join("");
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
