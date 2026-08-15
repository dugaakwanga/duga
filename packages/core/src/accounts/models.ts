export enum ProfileApprovalStatusEnum {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum AccountURLConstants {
  permission_error = '/account/permission-error',
  user_requests = '/account/user-requests',
  account_login = '/account/login',
}

export const ProfileApprovalStatusMessages: Record<ProfileApprovalStatusEnum, string> = {
  [ProfileApprovalStatusEnum.PENDING]: 'Account pending approval',
  [ProfileApprovalStatusEnum.APPROVED]: 'Account approved',
  [ProfileApprovalStatusEnum.REJECTED]: 'Account rejected',
};