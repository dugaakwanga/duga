import { OnboardingStep, OnboardingStepData, OnboardingStep1Data, OnboardingStep2Data, OnboardingStep3Data, OnboardingStep4Data } from "./steps";

export interface OnboardingStep1Form {
  institute_name: string;
  country: string;
  motto: string;
  logo_url: string;
}

export interface OnboardingStep2Form {
  departments: string[];
  academic_session: string;
}

export interface OnboardingStep3Form {
  curriculum: string;
  class_numbers: number[];
}

export interface OnboardingStep4Form {
  onboarding_completed: boolean;
}

export function createOnboardingStep1Form(data: OnboardingStep1Data): OnboardingStep1Form {
  return { ...data };
}

export function createOnboardingStep2Form(data: OnboardingStep2Data): OnboardingStep2Form {
  return { ...data };
}

export function createOnboardingStep3Form(data: OnboardingStep3Data): OnboardingStep3Form {
  return { ...data };
}

export function createOnboardingStep4Form(data: OnboardingStep4Data): OnboardingStep4Form {
  return { ...data };
}