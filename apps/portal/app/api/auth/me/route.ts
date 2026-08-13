import { NextResponse } from "next/server";
import { getSession } from "@duga/core/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  const { user } = session;
  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      schoolId: user.schoolId,
      role: user.role,
      name: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      photoUrl: user.student?.photoUrl ?? null,
      mustChangePassword: user.mustChangePassword,
      studentId: user.student?.id ?? null,
      teacherId: user.teacher?.id ?? null,
      parentId: user.parent?.id ?? null,
    },
  });
}
