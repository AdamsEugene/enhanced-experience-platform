import {
  WidgetRecommendationRequest,
  WidgetRecommendationResponse,
  WidgetPage,
} from "../types";
import { OpenAIService } from "./aiService";

export class WidgetService {
  private openaiService: OpenAIService;

  // Available pre-built widgets - this is just for the AI to know what's available
  private readonly AVAILABLE_WIDGETS = {
    AuthenticationWidget: {
      description:
        "Email or phone challenge-link sign-in. Sends a secure link (or simulate verification) to verify identity. Has fields for email/phone and send challenge button.",
      props: {
        title: "string (optional)",
        subtitle: "string (optional)",
        defaultChannel: '"email" | "phone"',
        allowChannels: 'Array<"email" | "phone">',
        onSendChallenge: "function",
        onSimulateVerified: "function",
      },
    },
    ManagedProfileWidget: {
      description:
        "Employer selection plus personal information (first/middle/last name, DOB, SSN) and contact info (email, phone) with a Save action. Comprehensive profile form.",
      props: {
        title: "string (optional)",
        subtitle: "string (optional)",
        employers: "Array<{label: string, value: string}>",
        initial: "Partial profile data",
        onSave: "function",
      },
    },
    AddressWidget: {
      description:
        "Address form with Line 1/2, City, State dropdown, ZIP with validation. Previous/Continue actions for wizard navigation.",
      props: {
        title: "string (optional)",
        subtitle: "string (optional)",
        initial: "Partial address data",
        stateOptions: "Array<{label: string, value: string}>",
        onPrevious: "function",
        onContinue: "function",
      },
    },
    PlanSelectionWidget: {
      description:
        "Displays available plans with checkboxes and a dynamic total monthly premium calculator. Previous/Next actions for multi-step flow.",
      props: {
        title: "string (optional)",
        subtitle: "string (optional)",
        availablePlans:
          "Array<{id: string, name: string, priceMonthly: number, description?: string}>",
        initiallySelected: "Array<string>",
        onPrevious: "function",
        onNext: "function",
      },
    },
    ManagedDependentsWidget: {
      description:
        "Coverage tier selection (Employee Only, +Spouse, +Family), spouse details form when required, add/remove dependents list with full name and DOB. Previous/Next actions.",
      props: {
        title: "string (optional)",
        subtitle: "string (optional)",
        initialTier: '"employee" | "employee_spouse" | "employee_family"',
        initialSpouse: "Partial person data",
        initialDependents: "Array<Partial person data>",
        onPrevious: "function",
        onNext: "function",
      },
    },
  };

  // Manifest examples for AI to understand the structure
  private readonly MANIFEST_EXAMPLE = `
MANIFEST STRUCTURE FOR CUSTOM PAGES:
A manifest defines a dynamic form page. Here's the complete structure:

{
  "id": "page-id",
  "title": "Page Title",
  "description": "Description of what this page does",
  "fields": [
    {
      "id": "fieldId",
      "type": "text|email|phone|password|number|date|radio|checkbox|dropdown|textarea|slider",
      "label": "Field Label",
      "placeholder": "Placeholder text (optional)",
      "helperText": "Helper text explaining the field (optional)",
      "required": true,
      "validation": {
        "minLength": 2,
        "maxLength": 50,
        "min": 0,
        "max": 100
      },
      // For radio/checkbox/dropdown:
      "options": [
        {"label": "Option 1", "value": "option1"},
        {"label": "Option 2", "value": "option2"}
      ],
      // Field-specific properties:
      "rows": 4, // for textarea
      "counter": true, // show character count
      "clearable": true, // show clear button
      "searchable": true, // for dropdown
      "showStrength": true, // for password
      "showToggle": true, // for password
      "allowCountrySelect": true, // for phone
      "format": "MM/DD/YYYY", // for date
      "prefix": "$", // for number
      "suffix": "/mo", // for number/slider
      "thousandSeparator": true, // for number
      "step": 1, // for number/slider
      "showValueBubble": true // for slider
    }
  ],
  "layout": {
    "type": "form",
    "sections": [
      {
        "id": "section-1",
        "title": "Section Title (optional)",
        "description": "Section description (optional)",
        "rows": [
          {"fields": ["fieldId1", "fieldId2"], "className": "form-row"}, // side by side
          {"fields": ["fieldId3"]} // full width
        ]
      }
    ]
  },
  "actions": {
    "submit": {
      "label": "Submit",
      "successMessage": "Success message",
      "errorMessage": "Error message"
    },
    "cancel": {
      "label": "← Back",
      "action": "back"
    }
  },
  "styling": {
    "theme": "light",
    "className": "custom-page-class"
  }
}

AVAILABLE FIELD TYPES:
- text: Basic text input with validation, can have prefix/suffix, character counter
- email: Email input with validation, domain suggestions, Gravatar support
- phone: Phone input with country selection, formatting options
- password: Password with strength meter, requirements checker, generator
- number: Numeric input with min/max, step, thousand separator, prefix/suffix
- date: Date picker with format options (MM/DD/YYYY, YYYY-MM-DD, etc.)
- radio: Single selection from multiple options
- checkbox: Multiple selections, can have min/max selected
- dropdown: Searchable dropdown, single or multiple selection
- textarea: Multi-line text with auto-grow, character counter
- slider: Range slider with value bubble, prefix/suffix

FIELD LAYOUT PATTERNS:
- Side by side: {"fields": ["field1", "field2"], "className": "form-row"}
- Full width: {"fields": ["field1"]}
- Three columns: {"fields": ["field1", "field2", "field3"], "className": "form-row"}
`;

  constructor(openaiService: OpenAIService) {
    this.openaiService = openaiService;
  }

  async recommendWidgets(
    request: WidgetRecommendationRequest
  ): Promise<WidgetRecommendationResponse> {
    try {
      console.log(
        `🔍 Using AI to analyze user intent: "${request.userIntent}"`
      );

      const aiRecommendations = await this.getAIWidgetRecommendations(request);

      console.log(
        `✅ AI generated ${aiRecommendations.totalPages} pages for the workflow`
      );

      return aiRecommendations;
    } catch (error) {
      console.error("❌ Error in widget recommendation:", error);
      throw new Error(
        `Failed to recommend widgets: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async getAIWidgetRecommendations(
    request: WidgetRecommendationRequest
  ): Promise<WidgetRecommendationResponse> {
    const prompt = this.buildWidgetAnalysisPrompt(request);

    const response = await this.openaiService["openai"].chat.completions.create(
      {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: this.buildSystemPrompt(),
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 16000,
        temperature: 0.1,
      }
    );

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error(
        "No content received from OpenAI for widget recommendations"
      );
    }

    console.log(
      `📄 AI response received, length: ${content.length} characters`
    );

    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in AI response");
      }

      const aiResult = JSON.parse(jsonMatch[0]);

      // Validate response structure
      if (!aiResult.pages || !Array.isArray(aiResult.pages)) {
        throw new Error("Invalid AI response: missing pages array");
      }

      // Validate and sanitize shortName
      let shortName = aiResult.shortName || "widget";
      shortName = shortName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 12);
      if (shortName.length === 0) {
        shortName = "widget";
      }

      console.log(`✅ Generated shortName: ${shortName}`);

      // Validate each page
      aiResult.pages.forEach((page: any, index: number) => {
        if (!page.pageId || !page.pageTitle || !page.widgetType) {
          throw new Error(
            `Invalid page at index ${index}: missing required fields`
          );
        }

        // If custom widget, ensure manifest exists
        if (page.widgetType === "custom" && !page.manifest) {
          throw new Error(
            `Custom widget at page ${page.pageId} is missing manifest`
          );
        }

        // Validate manifest structure if present
        if (page.manifest) {
          if (
            !page.manifest.id ||
            !page.manifest.title ||
            !page.manifest.fields ||
            !page.manifest.layout
          ) {
            throw new Error(
              `Invalid manifest structure for page ${page.pageId}`
            );
          }
        }
      });

      return {
        success: true,
        message: "Widget recommendations generated by AI",
        shortName: shortName,
        pages: aiResult.pages,
        totalPages: aiResult.pages.length,
        flowDescription: aiResult.flowDescription || "AI-generated widget flow",
      };
    } catch (parseError) {
      console.error(
        "❌ Failed to parse AI widget recommendations:",
        parseError
      );
      console.error("AI Response:", content);
      throw new Error(
        `Failed to parse AI response: ${
          parseError instanceof Error ? parseError.message : "Unknown error"
        }`
      );
    }
  }

  private buildSystemPrompt(): string {
    return `You are an expert at analyzing user intents and creating optimal multi-step form workflows.

AVAILABLE PRE-BUILT WIDGETS:
${Object.entries(this.AVAILABLE_WIDGETS)
  .map(
    ([name, info]) => `
${name}:
  Description: ${info.description}
  Props: ${JSON.stringify(info.props, null, 2)}
`
  )
  .join("\n")}

${this.MANIFEST_EXAMPLE}

YOUR TASK:
1. Analyze the user's intent
2. Design a logical multi-step workflow (typically 4-8 pages)
3. For each page, decide:
   - Use a pre-built widget if it fits perfectly
   - Create a custom manifest if no widget fits
4. Generate complete manifests for all custom pages
5. Ensure logical flow and proper sequencing

CRITICAL RULES:
- Use pre-built widgets when they match the requirement exactly
- Create custom manifests when you need specific fields or functionality
- Custom manifests must be complete with all required fields
- Each page must have a clear purpose
- Maintain logical progression (e.g., auth → personal info → specific details)
- Always include proper validation, helper text, and user guidance
- For custom pages, use appropriate field types and validation rules
- DO NOT create summary, confirmation, or review pages - end the flow with the last data collection page
- NO final summary pages, NO confirmation pages, NO review pages at the end

RESPONSE FORMAT:
Respond with ONLY valid JSON (no markdown, no explanations):
{
  "shortName": "Meaningful, descriptive name for this workflow (max 12 lowercase letters/numbers/hyphens, e.g., auth-widget, health-form, claim-enroll)",
  "pages": [
    {
      "pageId": "page-1",
      "pageTitle": "Page Title",
      "widgetType": "AuthenticationWidget|ManagedProfileWidget|AddressWidget|PlanSelectionWidget|ManagedDependentsWidget|custom",
      "widgetConfig": {
        "title": "Optional custom title for this widget",
        "subtitle": "Optional custom subtitle/description for this widget"
      },
      "order": 1,
      "manifest": {...} // ONLY if widgetType is "custom"
    }
  ],
  "flowDescription": "Brief description of the overall flow and reasoning"
}

IMPORTANT: 
- shortName must be meaningful and descriptive (e.g., "auth-widget", "profile-form", "health-enroll")
- shortName must be 1-12 characters: lowercase letters, numbers, and hyphens only
- shortName should describe the purpose or main functionality of the workflow
- For widgetConfig, ONLY include "title" and "subtitle" properties. Nothing else.`;
  }

  private buildWidgetAnalysisPrompt(
    request: WidgetRecommendationRequest
  ): string {
    return `Analyze this user intent and create an optimal multi-step workflow:

USER INTENT: "${request.userIntent}"
${request.context ? `ADDITIONAL CONTEXT: "${request.context}"` : ""}

REQUIREMENTS:
1. Create a comprehensive workflow (4-8 pages recommended)
2. Use pre-built widgets when they match the requirement
3. Generate custom manifests for specialized pages
4. Ensure proper sequencing and logical flow
5. Include appropriate validation and user guidance
6. DO NOT create summary, confirmation, or review pages - end with the last data collection page

DECISION CRITERIA:
- Use AuthenticationWidget for: login, sign-in, authentication, identity verification
- Use ManagedProfileWidget for: personal information, profile setup, employee details
- Use AddressWidget for: address collection, location information, shipping/billing address
- Use PlanSelectionWidget for: plan selection, pricing options, coverage selection
- Use ManagedDependentsWidget for: family coverage, dependent information, beneficiaries
- Use custom manifest for: everything else (surveys, specialized forms, unique workflows)

For custom pages, create detailed manifests with:
- Appropriate field types (text, email, phone, date, number, radio, checkbox, dropdown, textarea, slider)
- Proper validation rules
- Clear labels and helper text
- Logical layout (sections and rows)
- Submit/cancel actions

CRITICAL INSTRUCTIONS:
1. In widgetConfig, ONLY include "title" and "subtitle" properties. Do not add any other properties.
2. DO NOT create summary, confirmation, or review pages at the end of the workflow.
3. End the workflow with the last data collection page.

Example widgetConfig:
{
  "title": "Sign In to Your Account",
  "subtitle": "Enter your credentials to continue"
}

Respond with the complete workflow in JSON format. Remember: NO summary or confirmation pages!`;
  }
}
