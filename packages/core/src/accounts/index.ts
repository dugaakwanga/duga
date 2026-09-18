import { ProfileApprovalStatusEnum, ProfileApprovalStatusMessages } from "./models";
import { user_is_verified, user_is_admin_or_su, can_access_dashboard } from "./mixins";

// Re-export from models
export { ProfileApprovalStatusEnum, ProfileApprovalStatusMessages };

// Re-export auth-related types from the auth module to avoid conflicts
export type { PortalClaims, SuperAdminClaims } from "../auth";

// Re-export auth-related functions from the auth module to avoid conflicts.
// Token sign/verify functions live in ../server/tokens (server-only) now,
// not here — this file is part of the client-safe root barrel, so it must
// never re-export them, however convenient it once seemed.
export { cookieOptions, getJwtLifetimeSeconds } from "../auth";

// Accounts - User approval system
export interface UserApprovalRequest {
  id: string;
  username: string;
  email: string;
  requested_role: string;
  approval_status: ProfileApprovalStatusEnum;
  created_at: string;
}

export function userApprovalRequests(): UserApprovalRequest[] {
  // In production, this would fetch from API
  return [];
}

export function approveUserRequest(userId: string, approved: boolean): Promise<boolean> {
  return Promise.resolve(true);
}

// Accounts - Profile completion
export interface ProfileCompleteForm {
  full_name: string;
  email: string;
  phone: string;
  address: string;
  emergency_contact: string;
}

export function profileComplete(initial: ProfileCompleteForm): ProfileCompleteForm {
  return { ...initial };
}

// Accounts - Dashboard data
export interface DashboardStats {
  total_students: number;
  total_teachers: number;
  total_departments: number;
  total_batches: number;
}

export function getDashboardStats(): DashboardStats {
  return {
    total_students: 0,
    total_teachers: 0,
    total_departments: 0,
    total_batches: 0,
  };
}