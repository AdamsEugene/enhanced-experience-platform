export interface FormDefinition {
  id: string;
  name: string;
  description?: string;
  pages: FormPage[];
  createdAt: string;
  generatedFrom?: string;
  lastEditedAt?: string; // Track when form was last edited
  editHistory?: EditHistoryEntry[]; // Optional edit history
  styles?: {
    container?: string;
    [selector: string]: string | undefined; // CSS selectors (.class, #id, tag) with Tailwind classes
  };
}

export interface FormPage {
  id: string;
  title: string;
  order: number;
  inputType: "single-choice" | "multi-choice" | "mixed" | "display-only";
  options: PageOption[];
  routeButton?: RouteButton | null;
  displayContent?: DisplayItem[];
  styling?: {
    container?: string;
    form?: string;
    [key: string]: string | undefined;
  };
  classNames?: string; // CSS class names for this page (comma-separated)
}

export interface PageOption {
  id: string;
  label: string;
  value: string;
  type?: "toggle" | "text-input" | "select" | "display";
  routeTo?: string;
  required?: boolean;
  selectOptions?: SelectOption[];
  // Validation configuration for this input
  inputType?: InputType; // The actual HTML input type for validation
  validation?: ValidationConfig; // Validation rules for this input
  classNames?: string; // CSS class names for this option (comma-separated)
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

// NEW: Form Edit Request Types
export interface FormEditRequest {
  // Option 1: Change the overall intent/context
  newIntent?: string; // Replace the original user intent
  newContext?: string; // Replace or add context

  // Option 2: Specify exact modifications to pages
  pageModifications?: PageModification[];

  // Option 3: Add new pages
  addPages?: AddPageRequest[];

  // Option 4: Remove pages
  removePageIds?: string[];

  // Option 5: Regenerate specific pages or entire form
  regeneratePageIds?: string[]; // Specific pages to regenerate
  regenerateAll?: boolean; // Regenerate entire form with modifications

  // Modification hints for AI
  modificationHints?: string[]; // e.g., ["Make questions more detailed", "Add validation steps"]

  // Preserve certain aspects
  preserveStructure?: boolean; // Keep the same page flow
  preservePageCount?: boolean; // Keep the same number of pages
  minPages?: number; // Minimum pages requirement (default 20)
}

export interface PageModification {
  pageId: string;

  // What to change
  newTitle?: string;
  newInputType?: "single-choice" | "multi-choice" | "mixed" | "display-only";

  // Option modifications
  optionModifications?: OptionModification[];
  addOptions?: PageOption[];
  removeOptionIds?: string[];

  // Routing changes
  newRouteButton?: RouteButton;
  removeRouteButton?: boolean;

  // For display-only pages
  newDisplayContent?: DisplayItem[];
}

export interface OptionModification {
  optionId: string;
  newLabel?: string;
  newValue?: string;
  newRouteTo?: string;
  newRequired?: boolean;
  newType?: "toggle" | "text-input" | "select" | "display";
}

export interface AddPageRequest {
  afterPageId?: string; // Insert after this page
  beforePageId?: string; // Insert before this page
  suggestedTitle?: string;
  suggestedInputType?:
    | "single-choice"
    | "multi-choice"
    | "mixed"
    | "display-only";
  suggestedOptions?: string[]; // Simple string suggestions for AI to expand
  purpose?: string; // Description of what this page should accomplish
}

export interface EditHistoryEntry {
  editedAt: string;
  editType: "regenerate" | "modify" | "add_pages" | "remove_pages";
  description?: string;
}

// Existing types continue...
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

export interface PageFeedback {
  pageId: string;
  pageTitle: string;
  feedbacks: string[];
}

export interface FeedbackEditRequest {
  pageSpecificFeedback?: PageFeedback[];
  generalFeedback?: string;
}

export interface FeedbackEditResponse {
  success: boolean;
  message: string;
  editedForm: FormDefinition;
  modifications: {
    pagesModified: string[];
    pagesAdded: string[];
    pagesRemoved: string[];
    generalChanges: string[];
  };
}

export interface StylingRequest {
  formId: string;
  pageSpecificFeedback?: PageStylingFeedback[];
  generalFeedback?: string;
}

export interface PageStylingFeedback {
  pageId: string;
  pageTitle: string;
  feedbacks: string[];
}

export interface StylingResponse extends FormDefinition {
  success: boolean;
  message: string;
  stylingChanges: {
    pagesStyled: string[];
    generalChanges: string[];
  };
}

// ============== VALIDATION TYPES ==============

export type InputType =
  | "text"
  | "textarea"
  | "number"
  | "email"
  | "password"
  | "tel"
  | "phone"
  | "url"
  | "date"
  | "time"
  | "datetime-local"
  | "month"
  | "week"
  | "color"
  | "range"
  | "search"
  | "file"
  | "hidden"
  | "select"
  | "radio"
  | "checkbox"
  | "toggle"
  | "display";

export interface ValidationConfig {
  // Common validation rules
  required?: boolean;
  minLength?: number;
  maxLength?: number;

  // Number-specific rules
  min?: number;
  max?: number;
  step?: number;

  // Pattern validation
  pattern?: string; // Regex pattern
  customPatterns?: {
    name?: boolean; // Validate as person name
    address?: boolean; // Validate as address
    zipCode?: boolean; // Validate as zip/postal code
    ssn?: boolean; // Validate as SSN (format: XXX-XX-XXXX)
    creditCard?: boolean; // Validate as credit card number
  };

  // Date/time validation
  minDate?: string; // ISO date string
  maxDate?: string; // ISO date string
  futureOnly?: boolean; // Only allow future dates
  pastOnly?: boolean; // Only allow past dates

  // File validation
  allowedFileTypes?: string[]; // ['image/*', '.pdf', '.doc', etc.]
  maxFileSize?: number; // In bytes

  // Select/radio/checkbox validation
  allowedValues?: string[]; // Valid option values
  minSelections?: number; // For multi-select/checkbox
  maxSelections?: number; // For multi-select/checkbox

  // Phone validation
  phoneFormat?: "us" | "international" | "any";

  // Custom validation messages
  messages?: {
    required?: string;
    invalid?: string;
    tooShort?: string;
    tooLong?: string;
    outOfRange?: string;
    invalidFormat?: string;
  };
}

export interface ValidationRequest {
  value: any; // The user input value
  inputType: InputType;
  config?: ValidationConfig;
  fieldName?: string; // For better error messages
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
  sanitizedValue?: any; // Cleaned/formatted value if applicable
}
