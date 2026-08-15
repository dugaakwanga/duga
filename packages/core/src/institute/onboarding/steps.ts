export enum OnboardingStep {
  STEP1 = 1,
  STEP2 = 2,
  STEP3 = 3,
  STEP4 = 4,
}

export interface OnboardingStepData {
  step: OnboardingStep;
  title: string;
  description: string;
  completed: boolean;
}

export const ONBOARDING_STEPS = [
  {
    step: OnboardingStep.STEP1,
    title: 'Institute Profile',
    description: 'Set up school name, country, logo, and motto',
    completed: false,
  },
  {
    step: OnboardingStep.STEP2,
    title: 'Academics',
    description: 'Add departments, subjects, and academic sessions',
    completed: false,
  },
  {
    step: OnboardingStep.STEP3,
    title: 'Load Subjects',
    description: 'Import subjects from curriculum (optional)',
    completed: false,
  },
  {
    step: OnboardingStep.STEP4,
    title: 'Review & Launch',
    description: 'Review all settings and launch the school',
    completed: false,
  },
];

export interface OnboardingStep1Data {
  institute_name: string;
  country: string;
  motto: string;
  logo_url: string;
}

export interface OnboardingStep2Data {
  departments: string[];
  academic_session: string;
}

export interface OnboardingStep3Data {
  curriculum: string;
  class_numbers: number[];
}

export interface OnboardingStep4Data {
  onboarding_completed: boolean;
  current_session: string;
}