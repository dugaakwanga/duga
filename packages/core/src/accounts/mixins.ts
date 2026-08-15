export function user_is_verified(user: { approval_status: string }): boolean {
  return user.approval_status === 'approved';
}

export function user_is_admin_or_su(user: { is_superuser: boolean; role: string }): boolean {
  return user.is_superuser || user.role === 'superadmin';
}

export function user_is_teacher_or_administrative(user: { role: string }): boolean {
  return ['TEACHER', 'ADMIN', 'BURSAR', 'OWNER'].includes(user.role);
}

export function can_access_dashboard(user: { approval_status: string }): boolean {
  return user.approval_status === 'approved';
}