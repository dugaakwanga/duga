import { NextRequest, NextResponse } from "next/server";
import { prisma, dispatchToMany, sendRawEmail, signApplicationTestToken, checkRateLimit, clientIp } from "@duga/core/server";
import { loadApplicationForm } from "@/lib/server/modules/applicationForm";

export async function POST(request: NextRequest) {
  try {
    const rl = checkRateLimit(`apply:${clientIp(request)}`, 5, 10 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many applications submitted. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
      );
    }

    const body = await request.json();

    const domain = String(body.domain || "").trim().toLowerCase() || "dugaakwanga.com";
    const school = await prisma.school.findFirst({
      where: { domain },
      include: { subscription: true },
    });
    if (!school) {
      return NextResponse.json({ ok: false, error: "School not found" }, { status: 404 });
    }

    // School-level restriction: when applications are closed, block submissions.
    const restrictionsRow = await prisma.schoolSetting.findUnique({
      where: { schoolId_key: { schoolId: school.id, key: "restrictions" } },
    });
    const restrictions = restrictionsRow?.value && typeof restrictionsRow.value === "object" ? restrictionsRow.value : {};
    const applicationsOpen = (restrictions as { applicationsOpen?: unknown }).applicationsOpen !== false;
    if (!applicationsOpen) {
      return NextResponse.json({ ok: false, error: "Online applications are currently closed." }, { status: 403 });
    }

    const applicantName = String(body.applicantName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    if (!applicantName || !email || !phone) {
      return NextResponse.json({ ok: false, error: "applicantName, email and phone are required" }, { status: 400 });
    }

    // Enforce whatever the admin has currently marked as required — both
    // builtin fields (e.g. guardianName) and admin-added custom fields.
    const formFields = await loadApplicationForm(school.id);
    const rawCustomFields = body.customFields && typeof body.customFields === "object" ? (body.customFields as Record<string, unknown>) : {};
    const customFields: Record<string, string> = {};
    for (const f of formFields) {
      if (!f.enabled) continue;
      if (f.builtin) {
        if (f.required && !["applicantName", "email", "phone"].includes(f.key) && !String((body as Record<string, unknown>)[f.key] ?? "").trim()) {
          return NextResponse.json({ ok: false, error: `${f.label} is required` }, { status: 400 });
        }
        continue;
      }
      const value = String(rawCustomFields[f.label] ?? "").trim();
      if (f.required && !value) {
        return NextResponse.json({ ok: false, error: `${f.label} is required` }, { status: 400 });
      }
      if (value) customFields[f.label] = value;
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
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
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

    // If the school has an active entrance test for this section, issue a
    // signed link right away so the applicant can take it immediately after
    // applying instead of waiting on a separate admin action.
    let testPath: string | undefined;
    const admissionsTest = await prisma.admissionsTest.findFirst({
      where: { schoolId: school.id, isActive: true, OR: [{ section: application.section }, { section: null }] },
      orderBy: { section: { sort: "desc", nulls: "last" } },
    });
    if (admissionsTest) {
      const testToken = await signApplicationTestToken(application.id, school.id);
      testPath = `/apply/test/${testToken}`;
      if (email) {
        const testUrl = `${new URL(request.url).origin}${testPath}`;
        await sendRawEmail(
          email,
          "Your entrance test link",
          `Thank you for applying, ${applicantName}. Please complete the entrance test at: ${testUrl}`,
          school.id,
        ).catch(() => undefined);
      }
    }

    return NextResponse.json({
      ok: true,
      data: { id: application.id, status: application.status, testPath, message: "Application received. We will contact you shortly." },
    });
  } catch (e) {
    console.error("public apply error:", e);
    return NextResponse.json({ ok: false, error: "Could not submit application" }, { status: 500 });
  }
}

function levelApplied(body: Record<string, unknown>): string {
  return String(body.levelApplied || "");
}
