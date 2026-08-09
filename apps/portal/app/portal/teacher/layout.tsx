import { redirect } from "next/navigation";
import { getSession } from "@duga/core/server";

export default async function TeacherSectionLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (session.user.role !== "TEACHER" && session.user.role !== "ADMIN" && session.user.role !== "OWNER") {
    redirect("/portal/student");
  }
  return <>{children}</>;
}
