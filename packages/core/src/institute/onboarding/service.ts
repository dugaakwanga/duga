import { OnboardingStep, OnboardingStepData, OnboardingStep1Data, OnboardingStep2Data, OnboardingStep3Data, OnboardingStep4Data, ONBOARDING_STEPS } from "./steps";

export interface OnboardingState {
  currentStep: OnboardingStep;
  step1: OnboardingStep1Data | null;
  step2: OnboardingStep2Data | null;
  step3: OnboardingStep3Data | null;
  step4: OnboardingStep4Data | null;
  completed: boolean;
}

export class OnboardingService {
  private state: OnboardingState;

  constructor() {
    this.state = {
      currentStep: OnboardingStep.STEP1,
      step1: null,
      step2: null,
      step3: null,
      step4: null,
      completed: false,
    };
  }

  getCurrentStep(): OnboardingStep {
    return this.state.currentStep;
  }

  getCurrentStepData(): OnboardingStepData {
    const step = this.state.currentStep;
    const stepData = this.state[`step${step}` as keyof OnboardingState] as OnboardingStepData | null;
    const currentStepData = ONBOARDING_STEPS[step - 1]!;
    return { step, title: currentStepData.title, description: currentStepData.description, completed: !!stepData };
  }

  nextStep(): void {
    const current = this.state.currentStep;
    if (current < OnboardingStep.STEP4) {
      const nextStep = (current + 1) as OnboardingStep;
      this.state.currentStep = nextStep;
    }
  }

  prevStep(): void {
    const current = this.state.currentStep;
    if (current > OnboardingStep.STEP1) {
      const steps: Record<number, OnboardingStep> = {
        [OnboardingStep.STEP1]: OnboardingStep.STEP1,
        [OnboardingStep.STEP2]: OnboardingStep.STEP1,
        [OnboardingStep.STEP3]: OnboardingStep.STEP2,
        [OnboardingStep.STEP4]: OnboardingStep.STEP3,
      };
      this.state.currentStep = steps[current] ?? OnboardingStep.STEP1;
    }
  }

  setStep1(data: OnboardingStep1Data): void {
    this.state.step1 = data;
  }

  setStep2(data: OnboardingStep2Data): void {
    this.state.step2 = data;
  }

  setStep3(data: OnboardingStep3Data): void {
    this.state.step3 = data;
  }

  setStep4(data: OnboardingStep4Data): void {
    this.state.step4 = data;
    this.state.completed = data.onboarding_completed;
  }

  isStepCompleted(step: OnboardingStep): boolean {
    switch (step) {
      case OnboardingStep.STEP1: return !!this.state.step1;
      case OnboardingStep.STEP2: return !!this.state.step2;
      case OnboardingStep.STEP3: return !!this.state.step3;
      case OnboardingStep.STEP4: return !!this.state.step4 && this.state.step4.onboarding_completed;
      default: return false;
    }
  }

  getState(): OnboardingState {
    return { ...this.state };
  }
}

export const onboardingService = new OnboardingService();