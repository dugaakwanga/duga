import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@duga/core/server";
import { verifyGateToken } from "@duga/core";

// Public, unauthenticated: the same signed code printed as the QR on a
// student's ID card. Scanned inside the DUGA app it drives gate clock-in/out
// (see security/scan); scanned by any other camera or QR app it lands here
// instead, showing just enough to confirm the card is a genuine, currently
// active enrollment — no contact details, fees, or attendance history.
export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const claims = await verifyGateToken(token);
    if (!claims) {
      return NextResponse.json({ ok: false, error: "This code is not valid." }, { status: 401 });
    }

    const student = await prisma.student.findFirst({
      where: { id: claims.sub, schoolId: claims.schoolId },
      include: { user: { select: { firstName: true, lastName: true } }, classGroup: { include: { level: true } } },
    });
    if (!student) {
      return NextResponse.json({ ok: false, error: "No matching student record." }, { status: 404 });
    }

    const school = await prisma.school.findUnique({ where: { id: claims.schoolId }, select: { name: true, shortName: true, logoUrl: true } });

    return NextResponse.json({
      ok: true,
      data: {
        active: student.status === "ACTIVE",
        firstName: student.user.firstName,
        lastName: student.user.lastName,
        admissionNumber: student.admissionNumber,
        className: student.classGroup ? `${student.classGroup.level.name} ${student.classGroup.name}` : null,
        section: student.section,
        photoUrl: student.photoUrl,
        school,
      },
    });
  } catch (e) {
    console.error("public verify-student error:", e);
    return NextResponse.json({ ok: false, error: "Could not verify this code." }, { status: 500 });
  }
}
