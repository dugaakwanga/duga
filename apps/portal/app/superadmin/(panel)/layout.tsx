import { redirect } from "next/navigation";
import { getSuperAdminSession } from "@/lib/server/superadmin";

export default async function SuperAdminPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getSuperAdminSession();
  if (!session) {
    redirect("/superadmin/login");
  }
  return <>{children}</>;
}