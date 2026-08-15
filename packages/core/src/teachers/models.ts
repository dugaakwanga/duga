export type Designation = "PRINCIPAL" | "VICE_PRINCIPAL" | "HOD" | "TEACHER" | "LIBRARIAN" | "COUNSELOR";

export interface TeachersListItem {
  id: string;
  name: string;
  designation: Designation;
  mobile: string;
  email: string;
}

export const DESIGNATIONS: Designation[] = [
  "PRINCIPAL",
  "VICE_PRINCIPAL",
  "HOD",
  "TEACHER",
  "LIBRARIAN",
  "COUNSELOR",
];

export interface Teacher {
  id: string;
  name: string;
  employee_id: string;
  designation: Designation;
  photo_url: string | null;
  expertise: string[];
  mobile: string;
  email: string;
  date_of_birth: string | null;
  joining_date: string;
  address: string | null;
  institute: string;
  created_at: string;
}

export interface TeacherFormData {
  name: string;
  employee_id: string;
  designation: Designation;
  photo_url: string | null;
  expertise: string[];
  mobile: string;
  email: string;
  date_of_birth: string | null;
  joining_date: string;
  address: string | null;
}

export function createTeacher(data: TeacherFormData): Teacher {
  return {
    id: Date.now().toString(),
    name: data.name,
    employee_id: data.employee_id,
    designation: data.designation,
    photo_url: data.photo_url,
    expertise: data.expertise,
    mobile: data.mobile,
    email: data.email,
    date_of_birth: data.date_of_birth,
    joining_date: data.joining_date,
    address: data.address,
    institute: "",
    created_at: new Date().toISOString(),
  };
}

export function updateTeacher(id: string, data: Partial<TeacherFormData>): Teacher {
  // In production, this would update the teacher record
  return {} as Teacher;
}