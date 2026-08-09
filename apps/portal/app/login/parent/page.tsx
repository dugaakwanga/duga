import RoleLogin from "@/components/RoleLogin";

export default function ParentLoginPage() {
  return (
    <RoleLogin
      config={{
        role: "PARENT",
        carouselType: "PARENT",
        email: "parent@deultimateglory.com",
        password: "password123",
        title: "Parent Portal",
        tag: "Parent",
        kicker: "Parent Portal",
      }}
    />
  );
}