import { ProfileApprovalStatusEnum, ProfileApprovalStatusMessages } from "./models";

export function profileNotApproved(user: { approval_status: ProfileApprovalStatusEnum }): boolean {
  return user.approval_status !== ProfileApprovalStatusEnum.APPROVED;
}

export function mapProfileApprovalStatusMessage(status: ProfileApprovalStatusEnum): string {
  return ProfileApprovalStatusMessages[status] || 'Unknown status';
}