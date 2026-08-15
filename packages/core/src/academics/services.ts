import { 
  Semester, Department, AcademicSession, Batch, Subject, SubjectGroup,
  CreateSemesterForm, CreateDepartmentForm, CreateAcademicSessionForm,
  CreateBatchForm, CreateSubjectForm, CreateSubjectGroupForm
} from "./models";
import { user_is_teacher_or_administrative } from "../accounts/mixins";

export class AcademicsService {
  private semesters: Semester[] = [];
  private departments: Department[] = [];
  private sessions: AcademicSession[] = [];
  private batches: Batch[] = [];
  private subjects: Subject[] = [];
  private subjectGroups: SubjectGroup[] = [];

  // Semesters
  getSemesters(): Semester[] { return this.semesters; }
  addSemester(data: CreateSemesterForm): Semester {
    const semester: Semester = {
      id: Date.now().toString(),
      number: data.number,
      name: data.name,
      created_at: new Date().toISOString(),
    };
    this.semesters.push(semester);
    return semester;
  }
  updateSemester(id: string, data: Partial<CreateSemesterForm>): Semester | undefined {
    const idx = this.semesters.findIndex((s) => s.id === id);
    if (idx < 0) return undefined;
    // Use non-null assertion since idx >= 0 is guaranteed
    const s = this.semesters[idx]!;
    const semester: Semester = {
      id: s.id,
      number: data.number != null ? data.number : s.number,
      name: data.name != null ? data.name : s.name,
      created_at: s.created_at,
    };
    this.semesters[idx] = semester;
    return semester;
  }
  deleteSemester(id: string): boolean {
    const idx = this.semesters.findIndex((s) => s.id === id);
    if (idx < 0) return false;
    this.semesters.splice(idx, 1);
    return true;
  }

  // Departments
  getDepartments(): Department[] { return this.departments; }
  addDepartment(data: CreateDepartmentForm): Department {
    const dept: Department = {
      id: Date.now().toString(),
      name: data.name,
      short_name: data.short_name,
      code: data.code,
      institute: "",
      created_at: new Date().toISOString(),
    };
    this.departments.push(dept);
    return dept;
  }
  deleteDepartment(id: string): boolean {
    const idx = this.departments.findIndex((d) => d.id === id);
    if (idx < 0) return false;
    this.departments.splice(idx, 1);
    return true;
  }

  // Academic Sessions
  getSessions(): AcademicSession[] { return this.sessions; }
  addSession(data: CreateAcademicSessionForm): AcademicSession {
    const session: AcademicSession = {
      id: Date.now().toString(),
      year: data.year,
      term: data.term,
      is_current: false,
      created_at: new Date().toISOString(),
    };
    this.sessions.push(session);
    return session;
  }
  setCurrentSession(id: string): boolean {
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx < 0) return false;
    this.sessions[idx]!.is_current = true;
    return true;
  }

  // Batches
  getBatches(): Batch[] { return this.batches; }
  addBatch(data: CreateBatchForm): Batch {
    const batch: Batch = {
      id: Date.now().toString(),
      name: data.name,
      number: data.number,
      department_id: data.department_id,
      year_id: data.year_id,
      student_count: 0,
      created_at: new Date().toISOString(),
    };
    this.batches.push(batch);
    return batch;
  }
  deleteBatch(id: string): boolean {
    const idx = this.batches.findIndex((b) => b.id === id);
    if (idx < 0) return false;
    this.batches.splice(idx, 1);
    return true;
  }

  // Subjects
  getSubjects(): Subject[] { return this.subjects; }
  addSubject(data: CreateSubjectForm): Subject {
    const subject: Subject = {
      id: Date.now().toString(),
      name: data.name,
      subject_code: data.subject_code,
      theory_marks: data.theory_marks,
      practical_marks: data.practical_marks,
      instructor: data.instructor,
      created_at: new Date().toISOString(),
    };
    this.subjects.push(subject);
    return subject;
  }
  deleteSubject(id: string): boolean {
    const idx = this.subjects.findIndex((s) => s.id === id);
    if (idx < 0) return false;
    this.subjects.splice(idx, 1);
    return true;
  }

  // Subject Groups
  getSubjectGroups(): SubjectGroup[] { return this.subjectGroups; }
  addSubjectGroup(data: CreateSubjectGroupForm): SubjectGroup {
    const group: SubjectGroup = {
      id: Date.now().toString(),
      department_id: data.department_id,
      semester_id: data.semester_id,
      subjects: data.subject_ids.map(() => ({} as Subject)),
      created_at: new Date().toISOString(),
    };
    this.subjectGroups.push(group);
    return group;
  }

  canManageAcademics(userRole: string): boolean {
    return user_is_teacher_or_administrative({ role: userRole });
  }
}

export const academicsService = new AcademicsService();