import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@duga/core/server";
import { dispatchToMany } from "@duga/core/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const domain = String(body.domain || "").trim().toLowerCase() || "deultimateglory.com";
    const school = await prisma.school.findFirst({
      where: { domain },
      include: { subscription: true },
    });
    if (!school) {
      return NextResponse.json({ ok: false, error: "School not found" }, { status: 404 });
    }

    const applicantName = String(body.applicantName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    if (!applicantName || !email || !phone) {
      return NextResponse.json({ ok: false, error: "applicantName, email and phone are required" }, { status: 400 });
    }

    const section = String(body.section || "SECONDARY").toUpperCase();
    if (!["PRIMARY", "SECONDARY"].includes(section)) {
      return NextResponse.json({ ok: false, error: "Invalid section" }, { status: 400 });
    }

    const dateOfBirth = body.dateOfBirth ? new Date(String(body.dateOfBirth)) : undefined;

    // Link to an existing parent account if the email matches
    const existingUser = await prisma.user.findFirst({
      where: { email, role: "PARENT" },
      include: { parent: true },
    });

    const application = await prisma.application.create({
      data: {
        schoolId: school.id,
        applicantName,
        applicantType: String(body.applicantType || "STUDENT"),
        email,
        phone,
        section: section as never,
        levelApplied: body.levelApplied ? String(body.levelApplied) : undefined,
        previousSchool: body.previousSchool ? String(body.previousSchool) : undefined,
        guardianName: body.guardianName ? String(body.guardianName) : undefined,
        guardianPhone: body.guardianPhone ? String(body.guardianPhone) : undefined,
        guardianRelation: body.guardianRelation ? String(body.guardianRelation).toUpperCase() as never : undefined,
        gender: body.gender ? String(body.gender).toUpperCase() as never : undefined,
        dateOfBirth,
        parentId: existingUser?.parent?.id,
        status: "RECEIVED",
      },
    });

    // Notify the owner/admin accounts
    const staff = await prisma.user.findMany({
      where: { schoolId: school.id, role: { in: ["OWNER", "ADMIN"] } },
      select: { id: true },
    });
    if (staff.length) {
      await dispatchToMany(staff.map((s) => s.id), {
        schoolId: school.id,
        type: "application",
        title: "New admission application",
        body: `${applicantName} applied for ${section === "PRIMARY" ? "Primary" : "Secondary"} admission (${levelApplied(body)})`,
        link: "/portal/applications",
      });
    }

    return NextResponse.json({ ok: true, data: { id: application.id, status: application.status, message: "Application received. We will contact you shortly." } });
  } catch (e) {
    console.error("public apply error:", e);
    return NextResponse.json({ ok: false, error: "Could not submit application" }, { status: 500 });
  }
}

function levelApplied(body: Record<string, unknown>): string {
  return String(body.levelApplied || "");
}
