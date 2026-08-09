import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@duga/core/server";

export async function GET(request: NextRequest) {
  try {
    const domain = String(request.nextUrl.searchParams.get("domain") || "").trim().toLowerCase() || "deultimateglory.com";
    const school = await prisma.school.findFirst({
      where: { domain },
      select: {
        id: true,
        name: true,
        shortName: true,
        address: true,
        phone: true,
        email: true,
        logoUrl: true,
      },
    });
    if (!school) {
      return cors(NextResponse.json({ ok: false, error: "School not found" }, { status: 404 }));
    }

    const [gallery, news, contentRow] = await Promise.all([
      prisma.galleryImage.findMany({
        where: { schoolId: school.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, category: true, url: true, alt: true, createdAt: true },
      }),
      prisma.newsPost.findMany({
        where: { schoolId: school.id, isPublished: true },
        orderBy: { publishedAt: "desc" },
        select: { id: true, slug: true, title: true, category: true, excerpt: true, body: true, coverUrl: true, publishedAt: true },
      }),
      prisma.schoolSetting.findUnique({
        where: { schoolId_key: { schoolId: school.id, key: "siteContent" } },
        select: { value: true },
      }),
    ]);

    return cors(
      NextResponse.json({
        ok: true,
        data: {
          school,
          gallery,
          news,
          content: contentRow?.value ?? null,
        },
      }),
    );
  } catch (e) {
    console.error("public site error:", e);
    return cors(NextResponse.json({ ok: false, error: "Could not load site content" }, { status: 500 }));
  }
}

function cors(res: NextResponse): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}
