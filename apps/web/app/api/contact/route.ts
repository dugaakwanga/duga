import { NextResponse } from "next/server";

const portalUrl =
  process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, phone, subject, message, domain } = body ?? {};
    if (!name || !email || !subject || !message) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    // Persist the message to the school portal DB so it is never lost, then
    // attempt an email via Resend when configured.
    const portalRes = await fetch(`${portalUrl}/api/public/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone, subject, message, domain }),
    });
    if (!portalRes.ok) {
      const errJson = await portalRes.json().catch(() => ({}));
      throw new Error(errJson?.error ?? "portal contact failed");
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM || "website@deultimateglory.com";
    const to = process.env.NEXT_PUBLIC_SCHOOL_EMAIL || "info@deultimateglory.com";

    if (apiKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          reply_to: email,
          subject: `[Website] ${subject}`,
          text: `Name: ${name}\nPhone: ${phone ?? "-"}\nEmail: ${email}\n\n${message}`,
        }),
      });
      if (!res.ok) throw new Error("email failed");
    } else {
      console.log("[contact:dev]", { name, email, phone, subject, message });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("contact form error:", e);
    return NextResponse.json({ ok: false, error: "Failed to send" }, { status: 500 });
  }
}