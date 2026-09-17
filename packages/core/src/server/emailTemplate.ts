const PORTAL_BASE_URL = process.env.NEXT_PUBLIC_PORTAL_URL || "https://portal.dugaakwanga.com";
const LOGO_URL = `${PORTAL_BASE_URL}/images/logo.png`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// A plain-text notification body/title rendered as a branded HTML email —
// table-based layout with inline styles throughout, since email clients
// strip <style> blocks and don't reliably support flex/grid. Every provider
// gets the same look regardless of which one ends up sending a given email.
export function renderEmailHtml(opts: { title: string; body: string; link?: string }): string {
  const title = escapeHtml(opts.title);
  const body = escapeHtml(opts.body).replace(/\n/g, "<br>");
  const linkHref = opts.link ? (opts.link.startsWith("http") ? opts.link : `${PORTAL_BASE_URL}${opts.link}`) : null;
  const button = linkHref
    ? `<tr><td style="padding:22px 28px 4px;">
         <a href="${linkHref}" style="display:inline-block;background:#c8a448;color:#0f1b2e;font-weight:700;font-size:14px;padding:11px 22px;border-radius:8px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Open in Portal</a>
       </td></tr>`
    : "";
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f2;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #dedede;font-family:Arial,Helvetica,sans-serif;">
            <tr>
              <td style="background:#1e3a5f;padding:22px 28px;text-align:center;">
                <img src="${LOGO_URL}" width="52" height="52" alt="De Ultimate Glory Academy" style="display:block;margin:0 auto 8px;border-radius:8px;" />
                <div style="color:#ffffff;font-size:14.5px;font-weight:700;letter-spacing:0.02em;">De Ultimate Glory Academy</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 6px;">
                <div style="font-size:18px;font-weight:700;color:#0f1b2e;margin-bottom:12px;">${title}</div>
                <div style="font-size:14.5px;line-height:1.65;color:#222c3a;">${body}</div>
              </td>
            </tr>
            ${button}
            <tr>
              <td style="padding:22px 28px 20px;">
                <hr style="border:none;border-top:1px solid #dedede;margin:0 0 16px;" />
                <div style="font-size:11.5px;color:#6b7280;line-height:1.5;">
                  This is an automated message from De Ultimate Glory Academy's School Portal. Please do not reply directly to this email.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
