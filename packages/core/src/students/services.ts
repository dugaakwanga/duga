import { AdmissionStudent, AdmissionFormData, ApplicationType, createAdmissionStudent } from "./models";
import { user_is_verified } from "../accounts/mixins";

export interface AdmissionStudentListItem {
  id: string;
  name: string;
  exam_name: string | null;
  applying_for_class: number | null;
  application_type: ApplicationType;
  admitted: boolean;
  paid: boolean;
}

export class StudentsService {
  private students: AdmissionStudentListItem[] = [];

  getAllStudents(): AdmissionStudentListItem[] {
    return this.students;
  }

  getStudentById(id: string): AdmissionStudentListItem | undefined {
    return this.students.find((s) => s.id === id);
  }

  addStudent(data: AdmissionFormData, applicationType: ApplicationType): AdmissionStudent {
    const student = createAdmissionStudent(data);
    student.application_type = applicationType;
    this.students.push({
      id: student.id,
      name: student.name,
      exam_name: student.exam_name,
      applying_for_class: student.applying_for_class,
      application_type: student.application_type,
      admitted: student.admitted,
      paid: student.paid,
    });
    return student;
  }

  updateStudent(id: string, data: Partial<AdmissionFormData>): AdmissionStudentListItem | undefined {
    const index = this.students.findIndex((s) => s.id === id);
    if (index === -1) return undefined;
    
    // In production, would update the full student record
    return this.students[index];
  }

  deleteStudent(id: string): boolean {
    const index = this.students.findIndex((s) => s.id === id);
    if (index === -1) return false;
    this.students.splice(index, 1);
    return true;
  }

  canManageStudents(userRole: string): boolean {
    return user_is_verified({ approval_status: 'approved' });
  }
}

export const studentsService = new StudentsService();