export interface FormDefinition {
  id: string;
  name: string;
  description?: string;
  pages: FormPage[];
  createdAt: string;
  generatedFrom?: string;
}

export interface FormPage {
  id: string;
  title: string;
  order: number;
  inputType: "single-choice" | "multi-choice" | "mixed" | "display-only";
  options: PageOption[];
  routeButton?: RouteButton | null;
  displayContent?: DisplayItem[];
}

export interface PageOption {
  id: string;
  label: string;
  value: string;
  type?: "toggle" | "text-input" | "select" | "display";
  routeTo?: string;
  required?: boolean;
  selectOptions?: SelectOption[];
}

export interface SelectOption {
  label: string;
  value: string;
}

export interface RouteButton {
  id: string;
  label: string;
  routeTo: string;
}

export interface DisplayItem {
  type: "info" | "success" | "warning" | "error";
  text: string;
}

export interface FormGenerationRequest {
  userIntent: string;
  context?: string;
}

export interface FormSubmissionRequest {
  responses: Record<string, any>;
}

export interface FormSubmissionResponse {
  success: boolean;
  message: string;
  formData: Record<string, any>;
  aiAnalysis?: AIAnalysis;
  claimNumber?: string;
}

export interface AIAnalysis {
  summary: string;
  nextSteps: string;
  dataQuality: string;
  insights: string[];
  priority?: "low" | "medium" | "high" | "urgent";
}

export interface ErrorResponse {
  error: string;
  details?: string;
}
