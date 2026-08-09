import { NextRequest, NextResponse } from "next/server";
import { prisma, dispatchToMany } from "@duga/core/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const domain = String(body.domain || "").trim().toLowerCase() || "deultimateglory.com";
    const school = await prisma.school.findFirst({ where: { domain } });
    if (!school) {
      return cors(NextResponse.json({ ok: false, error: "School not found" }, { status: 404 }));
    }

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();
    if (!name || !email || !subject || !message) {
      return cors(NextResponse.json({ ok: false, error: "name, email, subject and message are required" }, { status: 400 }));
    }

    const saved = await prisma.contactMessage.create({
      data: {
        schoolId: school.id,
        name,
        email,
        phone: body.phone ? String(body.phone).trim() : null,
        subject,
        message,
        status: "NEW",
      },
    });

    // Notify the school's admins/owners so they can respond
    const staff = await prisma.user.findMany({
      where: { schoolId: school.id, role: { in: ["OWNER", "ADMIN"] } },
      select: { id: true },
    });
    if (staff.length) {
      await dispatchToMany(staff.map((s) => s.id), {
        schoolId: school.id,
        type: "message",
        title: "New website message",
        body: `${name} (${subject})`,
        link: "/portal/messages",
      });
    }

    return cors(NextResponse.json({ ok: true, data: { id: saved.id, status: saved.status } }));
  } catch (e) {
    console.error("public contact error:", e);
    return cors(NextResponse.json({ ok: false, error: "Could not send message" }, { status: 500 }));
  }
}

function cors(res: NextResponse): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}