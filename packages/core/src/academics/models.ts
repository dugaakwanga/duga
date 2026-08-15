export type SemesterNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface Semester {
  id: string;
  number: SemesterNumber;
  name: string;
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
  short_name: string;
  code: number;
  institute: string;
  created_at: string;
}

export interface AcademicSession {
  id: string;
  year: number;
  term: "FIRST" | "SECOND" | "ANNUAL";
  is_current: boolean;
  created_at: string;
}

export interface Batch {
  id: string;
  name: string;
  number: string;
  department_id: string;
  year_id: string;
  student_count: number;
  created_at: string;
}

export interface Subject {
  id: string;
  name: string;
  subject_code: string;
  theory_marks: number;
  practical_marks: number;
  instructor: string | null;
  created_at: string;
}

export interface SubjectGroup {
  id: string;
  department_id: string;
  semester_id: string;
  subjects: Subject[];
  created_at: string;
}

export interface CreateSemesterForm {
  number: SemesterNumber;
  name: string;
}

export interface CreateDepartmentForm {
  name: string;
  short_name: string;
  code: number;
}

export interface CreateAcademicSessionForm {
  year: number;
  term: "FIRST" | "SECOND" | "ANNUAL";
}

export interface CreateBatchForm {
  name: string;
  number: string;
  department_id: string;
  year_id: string;
}

export interface CreateSubjectForm {
  name: string;
  subject_code: string;
  theory_marks: number;
  practical_marks: number;
  instructor: string | null;
}

export interface CreateSubjectGroupForm {
  department_id: string;
  semester_id: string;
  subject_ids: string[];
}