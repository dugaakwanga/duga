import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@duga/core/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const domain = String(body.domain || "").trim().toLowerCase() || "deultimateglory.com";
    const school = await prisma.school.findFirst({ where: { domain } });
    if (!school) {
      return cors(NextResponse.json({ ok: false, error: "School not found" }, { status: 404 }));
    }

    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return cors(NextResponse.json({ ok: false, error: "A valid email is required" }, { status: 400 }));
    }

    const name = String(body.name || "").trim() || null;
    const subscriber = await prisma.newsletterSubscriber.upsert({
      where: { schoolId_email: { schoolId: school.id, email } },
      update: { name, status: "SUBSCRIBED" },
      create: { schoolId: school.id, email, name },
    });

    return cors(NextResponse.json({ ok: true, data: { id: subscriber.id, status: subscriber.status } }));
  } catch (e) {
    console.error("newsletter subscribe error:", e);
    return cors(NextResponse.json({ ok: false, error: "Could not subscribe" }, { status: 500 }));
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