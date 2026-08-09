import { redirect } from "next/navigation";
import { getSession } from "@duga/core/server";
import { PortalShell } from "@/components/PortalShell";
import { prisma } from "@duga/core/server";
import { featuresForRole } from "@/lib/server/features";

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
  }
  const features = await featuresForRole(user.schoolId, user.role);
  return (
    <PortalShell
      user={{
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        schoolId: user.schoolId,
        financeAccess,
        features,
      }}
    >
      {children}
    </PortalShell>
  );
}
