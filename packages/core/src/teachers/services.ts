import { Teacher, Designation, TeacherFormData, TeachersListItem, createTeacher, updateTeacher } from "./models";
import { user_is_teacher_or_administrative } from "../accounts/mixins";

export class TeachersService {
  private teachers: TeachersListItem[] = [];

  getAllTeachers(): TeachersListItem[] {
    return this.teachers;
  }

  getTeacherById(id: string): TeachersListItem | undefined {
    return this.teachers.find((t) => t.id === id);
  }

  addTeacher(data: TeacherFormData): Teacher {
    const teacher = createTeacher(data);
    this.teachers.push({
      id: teacher.id,
      name: teacher.name,
      designation: teacher.designation,
      mobile: teacher.mobile,
      email: teacher.email,
    });
    return teacher;
  }

  updateTeacher(id: string, data: Partial<TeacherFormData>): Teacher | undefined {
    const index = this.teachers.findIndex((t) => t.id === id);
    if (index === -1) return undefined;
    
    const updated = updateTeacher(id, data);
    this.teachers[index] = {
      id: updated.id,
      name: updated.name,
      designation: updated.designation,
      mobile: updated.mobile,
      email: updated.email,
    };
    return updated;
  }

  deleteTeacher(id: string): boolean {
    const index = this.teachers.findIndex((t) => t.id === id);
    if (index === -1) return false;
    this.teachers.splice(index, 1);
    return true;
  }

  canManageTeachers(userRole: string): boolean {
    return user_is_teacher_or_administrative({ role: userRole });
  }
}

export const teachersService = new TeachersService();