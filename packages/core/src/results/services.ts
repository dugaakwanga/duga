import { 
  ResultStatus, StudentResult, SubjectResult, ResultEntryForm,
  GradeBand, GradingScale, computeGrade, computeAverage, classAverage,
  positionInClass, ordinal, attendanceRate
} from "./models";
import { user_is_teacher_or_administrative } from "../accounts/mixins";

export class ResultsService {
  private results: StudentResult[] = [];

  getResults(): StudentResult[] { return this.results; }

  getResultByStudent(studentId: string): StudentResult | undefined {
    return this.results.find((r) => r.student_id === studentId);
  }

  enterResult(form: ResultEntryForm, gradingScale: GradeBand[]): { studentResult: StudentResult; subjectResult: SubjectResult } | null {
    // Find or create student result
    let studentResult = this.results.find((r) => r.student_id === form.student_id);
    
    if (!studentResult) {
      studentResult = {
        student_id: form.student_id,
        student_name: `Student ${form.student_id}`,
        semester_id: form.semester_id,
        semester_name: `Semester ${form.semester_id}`,
        results: [],
        overall_grade: "-",
        overall_grade_point: 0,
        position: 0,
      };
      this.results.push(studentResult);
    }

    // Compute grade for the subject
    const gradeInfo = computeGrade(form.theory_marks, gradingScale);
    
    const subjectResult: SubjectResult = {
      subject_id: form.subject_id,
      subject_name: `Subject ${form.subject_id}`,
      theory_marks: form.theory_marks,
      practical_marks: form.practical_marks,
      total_marks: form.theory_marks + form.practical_marks,
      grade: gradeInfo.grade,
      grade_point: gradeInfo.gp,
    };

    // Add to student results if not already present
    const existing = studentResult.results.find((r) => r.subject_id === form.subject_id);
    if (existing) {
      // Update existing
      existing.theory_marks = form.theory_marks;
      existing.practical_marks = form.practical_marks;
      existing.total_marks = form.theory_marks + form.practical_marks;
      existing.grade = gradeInfo.grade;
      existing.grade_point = gradeInfo.gp;
    } else {
      studentResult.results.push(subjectResult);
    }

    // Recompute overall grade
    const allMarks = studentResult.results.map((r) => r.total_marks);
    studentResult.overall_grade_point = computeAverage(allMarks) || 0;
    
    // Simple overall grade based on average
    if (studentResult.overall_grade_point > 0) {
      studentResult.overall_grade = computeGrade(Math.round(studentResult.overall_grade_point), gradingScale).grade;
    }

    return { studentResult, subjectResult };
  }

  publishResults(semesterId: string): boolean {
    // In production, would mark results as published for the given semester
    return true;
  }

  calculateClassPosition(studentId: string, allStudents: string[]): number {
    const studentResult = this.results.find((r) => r.student_id === studentId);
    if (!studentResult) return 0;
    
    // Get all total marks
    const allMarks = this.results
      .filter((r) => r.student_id !== studentId)
      .map((r) => r.overall_grade_point || 0);
    
    if (allMarks.length === 0) return 1;
    
    return positionInClass(studentResult.overall_grade_point || 0, allMarks);
  }

  getAttendanceRate(present: number, total: number): string {
    return attendanceRate(present, total);
  }

  canManageResults(userRole: string): boolean {
    return user_is_teacher_or_administrative({ role: userRole });
  }
}

export const resultsService = new ResultsService();