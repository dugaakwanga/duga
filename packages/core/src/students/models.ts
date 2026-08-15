export type ApplicationType = "ONLINE" | "OFFLINE";

export interface AdmissionStudent {
  id: string;
  name: string;
  fathers_name: string;
  mothers_name: string;
  date_of_birth: string | null;
  gender: "M" | "F";
  mobile_number: string;
  guardian_mobile_number: string;
  email: string;
  city: string | null;
  current_address: string;
  permanent_address: string;
  tribal_status: boolean;
  children_of_freedom_fighter: boolean;
  exam_name: string | null;
  passing_year: string | null;
  group: string | null;
  board: string | null;
  ssc_roll: string | null;
  ssc_registration: string | null;
  gpa: number | null;
  admission_policy_agreement: boolean;
  admitted: boolean;
  admission_date: string | null;
  paid: boolean;
  application_type: ApplicationType;
  rejected: boolean;
  assigned_as_student: boolean;
  applying_for_class: number | null;
  admit_to_semester: number | null;
  migration_status: string | null;
}

export interface AdmissionFormData {
  name: string;
  fathers_name: string;
  mothers_name: string;
  date_of_birth: string;
  gender: "M" | "F";
  mobile_number: string;
  guardian_mobile_number: string;
  email: string;
  current_address: string;
  permanent_address: string;
  tribal_status: boolean;
  children_of_freedom_fighter: boolean;
  exam_name: string | null;
  passing_year: string | null;
  group: string | null;
  board: string | null;
  applying_for_class: number | null;
}

export function createAdmissionStudent(data: AdmissionFormData): AdmissionStudent {
  return {
    id: Date.now().toString(),
    name: data.name,
    fathers_name: data.fathers_name,
    mothers_name: data.mothers_name,
    date_of_birth: data.date_of_birth,
    gender: data.gender,
    mobile_number: data.mobile_number,
    guardian_mobile_number: data.guardian_mobile_number,
    email: data.email,
    city: null,
    current_address: data.current_address,
    permanent_address: data.permanent_address,
    tribal_status: data.tribal_status,
    children_of_freedom_fighter: data.children_of_freedom_fighter,
    exam_name: data.exam_name,
    passing_year: data.passing_year,
    group: data.group,
    board: data.board,
    ssc_roll: null,
    ssc_registration: null,
    gpa: null,
    admission_policy_agreement: false,
    admitted: false,
    admission_date: null,
    paid: false,
    application_type: "ONLINE",
    rejected: false,
    assigned_as_student: false,
    applying_for_class: data.applying_for_class,
    admit_to_semester: null,
    migration_status: null,
  };
}