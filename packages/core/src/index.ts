// Framework-agnostic exports (safe for client bundles).
export * from "./roles";
export * from "./auth";
export * from "./env";
export * from "./geo";
export * from "./grading";
export * from "./utils";
export * from "./pages";
export * from "./web";
export * from "./accounts";
export * from "./institute";
export * from "./teachers";
export * from "./students";
export * from "./academics";
export * from "./results";
export * from "./payments";

// Server-only types are explicitly re-exported to resolve ambiguity.
export type { Role, Permission } from "./roles";
export type { PortalClaims, SuperAdminClaims } from "./auth";
export type { ProfileApprovalStatusEnum } from "./accounts";
export type { OnboardingStep, OnboardingStepData } from "./institute/onboarding/steps";
export type { Designation, TeachersListItem } from "./teachers/models";
export type { AdmissionStudent, AdmissionFormData, ApplicationType } from "./students/models";
export type { Semester, Department, AcademicSession, Batch, Subject, SubjectGroup } from "./academics/models";
export type { 
  ResultStatus, StudentResult, SubjectResult, ResultEntryForm,
  GradeBand, GradingScale 
} from "./results/models";
export type { Payment, PaymentFormData, PaymentSummary, PaymentReason } from "./payments/models";