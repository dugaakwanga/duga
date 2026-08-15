export type ResultStatus = "PENDING" | "ENTERED" | "PUBLISHED";

export interface SubjectResult {
  subject_id: string;
  subject_name: string;
  theory_marks: number;
  practical_marks: number;
  total_marks: number;
  grade: string;
  grade_point: number;
}

export interface StudentResult {
  student_id: string;
  student_name: string;
  semester_id: string;
  semester_name: string;
  results: SubjectResult[];
  overall_grade: string;
  overall_grade_point: number;
  position: number;
}

export interface ResultEntryForm {
  student_id: string;
  semester_id: string;
  subject_id: string;
  theory_marks: number;
  practical_marks: number;
}

// Re-export grading types and functions from the grading module to avoid conflicts
export type { GradeBand, GradingScale } from "../grading";
export { computeGrade, computeAverage, classAverage, positionInClass, ordinal, attendanceRate } from "../grading";