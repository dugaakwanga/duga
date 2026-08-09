import RoleLogin from "@/components/RoleLogin";

export default function TeacherLoginPage() {
  return (
    <RoleLogin
      config={{
        role: "TEACHER",
        carouselType: "TEACHER",
        email: "math@deultimateglory.com",
        password: "password123",
        title: "Teacher Portal",
        tag: "Teacher",
        kicker: "Teacher Portal",
      }}
    />
  );
}