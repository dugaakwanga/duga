import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@duga/core/server";
import { normalizeContent } from "@/lib/server/modules/content";
import { getWebsiteConfig } from "@/lib/server/site-settings";

async function loadPta(schoolId: string) {
  try {
    const [executives, meetings] = await Promise.all([
      prisma.ptaExecutive.findMany({
        where: { schoolId, isActive: true },
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: { id: true, name: true, role: true, phone: true, email: true, photoUrl: true },
      }),
      prisma.ptaMeeting.findMany({
        where: { schoolId, date: { gte: new Date(new Date().getTime() - 120 * 86400000) } },
        orderBy: { date: "desc" },
        take: 12,
        select: { id: true, title: true, date: true, venue: true, agenda: true },
      }),
    ]);
    return { executives, meetings };
  } catch {
    // PTA tables may not exist yet on older databases — never let that
    // break the rest of the site's content.
    return { executives: [], meetings: [] };
  }
}

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

    const [gallery, news, contentRow, website, pta] = await Promise.all([
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
      getWebsiteConfig(school.id),
      loadPta(school.id),
    ]);

    return cors(
      NextResponse.json({
        ok: true,
        data: {
          school,
          gallery,
          news,
          website,
          content: contentRow?.value ? normalizeContent(contentRow.value) : null,
          pta,
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
