export const AccountURLConstants = {
  permission_error: '/account/permission-error',
  user_requests: '/account/user-requests',
  account_login: '/account/login',
  dashboard: '/account/dashboard',
  profile_complete: '/account/profile-complete',
  user_approval: '/account/user-approval',
  add_user: '/account/add-user',
  all_accounts: '/account/all-accounts',
  user_requests_list: '/account/user-requests/list',
  modify_approval: '/account/user-approval/modify',
};

export const ProfileApprovalStatusEnum = {
  PENDING: 'pending' as const,
  APPROVED: 'approved' as const,
  REJECTED: 'rejected' as const,
};

export type ProfileApprovalStatus = typeof ProfileApprovalStatusEnum[keyof typeof ProfileApprovalStatusEnum];

export const ProfileApprovalStatusMessages: Record<ProfileApprovalStatus, string> = {
  [ProfileApprovalStatusEnum.PENDING]: 'Account pending approval',
  [ProfileApprovalStatusEnum.APPROVED]: 'Account approved',
  [ProfileApprovalStatusEnum.REJECTED]: 'Account rejected',
};