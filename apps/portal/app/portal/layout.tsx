import { redirect } from "next/navigation";
import { getSession } from "@duga/core/server";
import { PortalShell } from "@/components/PortalShell";
import { prisma } from "@duga/core/server";
import { featuresForRole, subfeaturesForRole } from "@/lib/server/features";
import { schoolSections, sectionsOfAdmin, sectionsOfTeacher } from "@/lib/server/helpers";
import type { Section } from "@/lib/sections";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  const user = session.user;
  // Owner always sees the finance dashboard; admin only when the owner granted it.
  let financeAccess = false;
  if (user.role === "OWNER") {
    financeAccess = true;
  } else if (user.role === "ADMIN") {
    const row = await prisma.schoolSetting.findUnique({
      where: { schoolId_key: { schoolId: user.schoolId, key: "adminFinanceAccess" } },
    });
    financeAccess = row?.value === true || row?.value === "true";
  } else if (user.role === "BURSAR") {
    const row = await prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId: user.schoolId, key: "bursarFinanceAccess" } } });
    financeAccess = row?.value === true || row?.value === "true";
  }
  const features = await featuresForRole(user.schoolId, user.role);
  const subfeatures = await subfeaturesForRole(user.schoolId, user.role);
  // Section scope: admins (owner/admin/bursar) can switch between Secondary and
  // Primary; teachers are auto-scoped to the sections of the classes assigned to them.
  let sections: Section[] = [];
  let canSwitchSection = false;
  if (user.role === "OWNER") {
    sections = await schoolSections(user.schoolId);
    canSwitchSection = true;
  } else if (user.role === "ADMIN" || user.role === "BURSAR") {
    sections = user.admin ? await sectionsOfAdmin(user.admin.id, user.schoolId) : await schoolSections(user.schoolId);
    canSwitchSection = sections.length > 1;
  } else if (user.role === "TEACHER") {
    sections = user.teacher ? await sectionsOfTeacher(user.teacher.id) : [];
    canSwitchSection = sections.length > 1;
  }

  // Hostel is meaningless for a family with no boarding child — hide the nav
  // link entirely rather than showing an empty "no allocation" page.
  let hasBoarding = false;
  if (user.role === "STUDENT") {
    hasBoarding = user.student?.isBoarding ?? false;
  } else if (user.role === "PARENT" && user.parent) {
    hasBoarding = user.parent.students.some((link) => link.student.isBoarding);
  } else {
    hasBoarding = true; // staff always see Hostel (they manage it for whoever is boarding)
  }

  // "My Class" (a homeroom performance dashboard) only means something for
  // a teacher who is actually the form/class teacher of at least one class.
  let isClassTeacher = false;
  if (user.role === "TEACHER" && user.teacher) {
    const formClassCount = await prisma.classGroup.count({ where: { schoolId: user.schoolId, formTeacherId: user.teacher.id } });
    isClassTeacher = formClassCount > 0;
  }

  return (
    <PortalShell
      user={{
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        schoolId: user.schoolId,
        photoUrl: user.avatarUrl ?? user.student?.photoUrl ?? null,
        designation: user.teacher?.designation ?? user.admin?.designation ?? null,
        financeAccess,
        features,
        subfeatures,
        sections,
        canSwitchSection,
        hasBoarding,
        isClassTeacher,
      }}
    >
      {children}
    </PortalShell>
  );
}
