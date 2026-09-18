import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "@duga/core/server";
import { PortalShell } from "@/components/PortalShell";
import { prisma } from "@duga/core/server";
import { featuresForRole, subfeaturesForRole } from "@/lib/server/features";
import { schoolSections, sectionsOfAdmin, sectionsOfTeacher } from "@/lib/server/helpers";
import type { Section } from "@/lib/sections";

type User = SessionUser["user"];

// Owner always sees the finance dashboard; admin/bursar only when the owner granted it.
async function computeFinanceAccess(user: User): Promise<boolean> {
  if (user.role === "OWNER") return true;
  const key = user.role === "ADMIN" ? "adminFinanceAccess" : user.role === "BURSAR" ? "bursarFinanceAccess" : null;
  if (!key) return false;
  const row = await prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId: user.schoolId, key } } });
  return row?.value === true || row?.value === "true";
}

// Section scope: admins (owner/admin/bursar) can switch between Secondary and
// Primary; teachers are auto-scoped to the sections of the classes assigned to them.
async function computeSections(user: User): Promise<{ sections: Section[]; canSwitchSection: boolean }> {
  if (user.role === "OWNER") {
    const sections = await schoolSections(user.schoolId);
    return { sections, canSwitchSection: true };
  }
  if (user.role === "ADMIN" || user.role === "BURSAR") {
    const sections = user.admin ? await sectionsOfAdmin(user.admin.id, user.schoolId) : await schoolSections(user.schoolId);
    return { sections, canSwitchSection: sections.length > 1 };
  }
  if (user.role === "TEACHER") {
    const sections = user.teacher ? await sectionsOfTeacher(user.teacher.id) : [];
    return { sections, canSwitchSection: sections.length > 1 };
  }
  return { sections: [], canSwitchSection: false };
}

// "My Class" (a homeroom performance dashboard) only means something for
// a teacher who is actually the form/class teacher of at least one class.
async function computeIsClassTeacher(user: User): Promise<boolean> {
  if (user.role !== "TEACHER" || !user.teacher) return false;
  const formClassCount = await prisma.classGroup.count({ where: { schoolId: user.schoolId, formTeacherId: user.teacher.id } });
  return formClassCount > 0;
}

// Hostel is meaningless for a family with no boarding child — hide the nav
// link entirely rather than showing an empty "no allocation" page.
function computeHasBoarding(user: User): boolean {
  if (user.role === "STUDENT") return user.student?.isBoarding ?? false;
  if (user.role === "PARENT" && user.parent) return user.parent.students.some((link) => link.student.isBoarding);
  return true; // staff always see Hostel (they manage it for whoever is boarding)
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  const user = session.user;

  // None of these depend on each other's result — run them concurrently
  // instead of one after another. This layout wraps every /portal/* page,
  // so the saved round trips add up across every single navigation.
  const [financeAccess, features, subfeatures, sectionInfo, isClassTeacher] = await Promise.all([
    computeFinanceAccess(user),
    featuresForRole(user.schoolId, user.role),
    subfeaturesForRole(user.schoolId, user.role),
    computeSections(user),
    computeIsClassTeacher(user),
  ]);
  const { sections, canSwitchSection } = sectionInfo;
  const hasBoarding = computeHasBoarding(user);

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
        // An admin can also hold a Teacher profile ("also teaches") — this
        // surfaces teacher-only nav entries (e.g. "My Subjects") for them
        // too, on top of whatever their primary role already shows.
        hasTeacherProfile: Boolean(user.teacher),
      }}
    >
      {children}
    </PortalShell>
  );
}
