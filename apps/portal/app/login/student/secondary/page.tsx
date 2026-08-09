import RoleLogin from "@/components/RoleLogin";

export default function SecondaryLoginPage() {
  return (
    <RoleLogin
      config={{
        role: "STUDENT",
        section: "SECONDARY",
        carouselType: "SECONDARY",
        email: "student@deultimateglory.com",
        password: "password123",
        title: "Student Portal",
        tag: "Student · Secondary",
        kicker: "Secondary Portal",
      }}
    />
  );
}