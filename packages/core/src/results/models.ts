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

export interface GradeBand {
  min: number;
  max: number;
  grade: string;
  remark: string;
  gp: number;
}

export interface GradingScale {
  bands: GradeBand[];
}

export function computeGrade(score: number | null, scale: GradeBand[]): { grade: string; remark: string; gp: number } {
  if (score === null || score === undefined) {
    return { grade: "-", remark: "No score", gp: 0 };
  }
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  for (const band of scale) {
    if (clamped >= band.min && clamped <= band.max) {
      return { grade: band.grade, remark: band.remark, gp: band.gp };
    }
  }
  return { grade: "-", remark: "No grade", gp: 0 };
}

export function computeAverage(items: (number | null | undefined)[]): number | null {
  const valid = items.filter((x): x is number => typeof x === "number");
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function classAverage(items: (number | null | undefined)[]): number {
  const valid = items.filter((x): x is number => typeof x === "number");
  if (valid.length === 0) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function positionInClass(score: number, scores: number[]): number {
  const sorted = [...scores].sort((a, b) => b - a);
  const idx = sorted.indexOf(score);
  return idx === -1 ? scores.length : idx + 1;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? "th");
}

export function attendanceRate(present: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((present / total) * 100)}%`;
}