import { redirect } from "next/navigation";
import { getSession } from "@duga/core/server";

export default async function PortalHome() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (session.user.role === "STUDENT") {
    redirect("/portal/student");
  }
  redirect("/portal/dashboard");
}
