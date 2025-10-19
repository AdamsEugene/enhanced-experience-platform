import {
  WidgetRecommendationRequest,
  WidgetRecommendationResponse,
  WidgetPage,
} from "../types";
import { OpenAIService } from "./aiService";

export class WidgetService {
  private openaiService: OpenAIService;

  // Available pre-built widgets
  private readonly AVAILABLE_WIDGETS = {
    AuthenticationWidget: {
      description:
        "Email or phone challenge-link sign-in. Sends a secure link (or simulate verification) to verify identity.",
      useCases: [
        "login",
        "sign-in",
        "authentication",
        "verify identity",
        "email verification",
        "phone verification",
      ],
    },
    ManagedProfileWidget: {
      description:
        "Employer selection plus personal (first/middle/last, DOB, SSN) and contact info (email, phone) with a Save action.",
      useCases: [
        "personal information",
        "profile",
        "employee details",
        "contact info",
        "employer selection",
        "personal details",
        "name and contact",
      ],
    },
    AddressWidget: {
      description:
        "Address Line 1/2, City, State dropdown, ZIP with basic validation. Previous/Continue actions for wizard navigation.",
      useCases: [
        "address",
        "location",
        "shipping address",
        "billing address",
        "home address",
        "mailing address",
        "where do you live",
      ],
    },
    PlanSelectionWidget: {
      description:
        "Displays available plans with checkboxes and a dynamic total monthly premium. Previous/Next actions.",
      useCases: [
        "plan selection",
        "choose plan",
        "insurance plans",
        "coverage options",
        "subscription plans",
        "pricing plans",
        "select coverage",
      ],
    },
    ManagedDependentsWidget: {
      description:
        "Coverage tier radios (Employee Only, +Spouse, +Family), spouse details when required, add/remove dependents list. Previous/Next actions.",
      useCases: [
        "dependents",
        "family members",
        "spouse information",
        "coverage tier",
        "family coverage",
        "add dependents",
        "beneficiaries",
      ],
    },
  };

  constructor(openaiService: OpenAIService) {
    this.openaiService = openaiService;
  }

  async recommendWidgets(
    request: WidgetRecommendationRequest
  ): Promise<WidgetRecommendationResponse> {
    try {
      console.log(
        `🔍 Analyzing user intent for widget recommendations: "${request.userIntent}"`
      );

      // First, try to match with available widgets using keyword matching
      const directMatches = this.findDirectWidgetMatches(
        request.userIntent,
        request.context
      );

      if (directMatches.length > 0) {
        console.log(`✅ Found ${directMatches.length} direct widget matches`);
        return this.buildWidgetResponse(directMatches, request.userIntent);
      }

      // If no direct matches, use AI to analyze and recommend
      console.log("🤖 Using AI to analyze intent and recommend widgets...");
      const aiRecommendations = await this.getAIWidgetRecommendations(request);

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

  private findDirectWidgetMatches(
    userIntent: string,
    context?: string
  ): string[] {
    const fullText = `${userIntent} ${context || ""}`.toLowerCase();
    const matches: string[] = [];

    // Check each widget's use cases
    Object.entries(this.AVAILABLE_WIDGETS).forEach(
      ([widgetName, widgetInfo]) => {
        const hasMatch = widgetInfo.useCases.some((useCase) =>
          fullText.includes(useCase.toLowerCase())
        );

        if (hasMatch) {
          matches.push(widgetName);
        }
      }
    );

    return matches;
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
            content: `You are an expert at analyzing user intents and recommending appropriate UI widgets for form flows.

AVAILABLE WIDGETS:
${Object.entries(this.AVAILABLE_WIDGETS)
  .map(([name, info]) => `- ${name}: ${info.description}`)
  .join("\n")}

RULES:
1. Analyze the user intent and recommend a logical flow of 4-8 pages (not just 2!)
2. ONLY use widgets from the available list above
3. If no available widget fits perfectly, use "custom" for that page
4. Create a logical sequence (e.g., auth first, then profile, then specific functionality)
5. For "custom" widgets, you MUST also generate a complete manifest
6. Respond with VALID JSON only
7. Each page should have a clear purpose and appropriate widget

RESPONSE FORMAT:
{
  "pages": [
    {
      "pageId": "page-1",
      "pageTitle": "Authentication",
      "widgetType": "AuthenticationWidget",
      "widgetConfig": {},
      "order": 1
    },
    {
      "pageId": "page-2",
      "pageTitle": "Custom Form Title",
      "widgetType": "custom",
      "widgetConfig": {},
      "order": 2,
      "manifest": {
        "id": "custom-page-2",
        "title": "Custom Form Title",
        "description": "Description of what this form does",
        "fields": [
          {
            "id": "fieldId",
            "type": "text|email|phone|password|number|date|radio|checkbox|dropdown|textarea|slider",
            "label": "Field Label",
            "placeholder": "Placeholder text",
            "helperText": "Helper text",
            "required": true,
            "validation": { "minLength": 2, "maxLength": 50 }
          }
        ],
        "layout": {
          "type": "form",
          "sections": [
            {
              "id": "section-1",
              "title": "Section Title",
              "rows": [
                { "fields": ["fieldId"] }
              ]
            }
          ]
        },
        "actions": {
          "submit": {
            "label": "Submit",
            "successMessage": "Success message",
            "errorMessage": "Error message"
          }
        }
      }
    }
  ],
  "flowDescription": "Brief description of the overall flow"
}`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 8000, // Increased for manifest generation
        temperature: 0.1,
      }
    );

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error(
        "No content received from OpenAI for widget recommendations"
      );
    }

    try {
      const aiResult = JSON.parse(content.trim());

      return {
        success: true,
        message: "Widget recommendations generated successfully",
        pages: aiResult.pages || [],
        totalPages: aiResult.pages?.length || 0,
        flowDescription: aiResult.flowDescription || "AI-generated widget flow",
      };
    } catch (parseError) {
      console.error(
        "❌ Failed to parse AI widget recommendations:",
        parseError
      );
      // Fallback to a basic flow
      return this.getFallbackWidgetFlow(request.userIntent);
    }
  }

  private buildWidgetAnalysisPrompt(
    request: WidgetRecommendationRequest
  ): string {
    return `
TASK: Analyze this user intent and recommend which widgets to use in what order.

USER INTENT: "${request.userIntent}"
${request.context ? `ADDITIONAL CONTEXT: "${request.context}"` : ""}

ANALYSIS REQUIREMENTS:
1. Determine what the user is trying to accomplish
2. Create a logical flow of 4-8 pages (comprehensive, not minimal!)
3. Start with authentication if it's a secure process
4. Include profile/personal info collection if needed
5. Add specific functionality widgets based on the intent
6. Use "custom" for any page that doesn't fit available widgets
7. For custom widgets, generate complete manifests with proper field types

AVAILABLE FIELD TYPES FOR CUSTOM MANIFESTS:
- text: Basic text input with validation
- email: Email input with domain suggestions
- phone: Phone input with country selection
- password: Password with strength meter
- number: Numeric input with min/max
- date: Date picker with format options
- radio: Single selection from options
- checkbox: Multiple selections
- dropdown: Searchable dropdown
- textarea: Multi-line text
- slider: Range slider with values

EXAMPLES OF COMPREHENSIVE FLOWS:
- Insurance enrollment (6 pages) → AuthenticationWidget, ManagedProfileWidget, AddressWidget, PlanSelectionWidget, ManagedDependentsWidget, custom(confirmation)
- Employee onboarding (5 pages) → AuthenticationWidget, ManagedProfileWidget, AddressWidget, custom(emergency-contacts), custom(tax-info)
- Medical intake (7 pages) → AuthenticationWidget, ManagedProfileWidget, custom(medical-history), custom(symptoms), custom(medications), custom(insurance-info), custom(appointment-scheduling)
- Loan application (8 pages) → AuthenticationWidget, ManagedProfileWidget, AddressWidget, custom(employment-info), custom(financial-info), custom(loan-details), custom(documents), custom(review-submit)

MANIFEST STRUCTURE FOR CUSTOM WIDGETS:
Use the exact structure from the examples, including:
- Proper field IDs (camelCase)
- Appropriate field types from the list above
- Validation rules (minLength, maxLength, min, max, required)
- Layout with sections and rows
- Submit/cancel actions with messages

Respond with JSON containing pages array and flowDescription.
`;
  }

  private buildWidgetResponse(
    widgetNames: string[],
    userIntent: string
  ): WidgetRecommendationResponse {
    const pages: WidgetPage[] = [];
    let order = 1;

    // Always start with authentication for secure processes
    if (
      !widgetNames.includes("AuthenticationWidget") &&
      this.requiresAuth(userIntent)
    ) {
      pages.push({
        pageId: `page-${order}`,
        pageTitle: "Authentication",
        widgetType: "AuthenticationWidget",
        widgetConfig: {},
        order: order++,
      });
    }

    // Add the matched widgets in logical order
    const orderedWidgets = this.orderWidgets(widgetNames);

    orderedWidgets.forEach((widgetName) => {
      pages.push({
        pageId: `page-${order}`,
        pageTitle: this.getWidgetTitle(widgetName),
        widgetType: widgetName,
        widgetConfig: {},
        order: order++,
      });
    });

    return {
      success: true,
      message: "Widget recommendations based on direct matching",
      pages,
      totalPages: pages.length,
      flowDescription: `Recommended flow for: ${userIntent}`,
    };
  }

  private requiresAuth(userIntent: string): boolean {
    const authKeywords = [
      "account",
      "profile",
      "personal",
      "secure",
      "login",
      "enrollment",
      "application",
      "claim",
    ];
    return authKeywords.some((keyword) =>
      userIntent.toLowerCase().includes(keyword)
    );
  }

  private orderWidgets(widgetNames: string[]): string[] {
    // Define logical order for widgets
    const widgetOrder = [
      "AuthenticationWidget",
      "ManagedProfileWidget",
      "AddressWidget",
      "PlanSelectionWidget",
      "ManagedDependentsWidget",
    ];

    return widgetOrder.filter((widget) => widgetNames.includes(widget));
  }

  private getWidgetTitle(widgetName: string): string {
    const titles: Record<string, string> = {
      AuthenticationWidget: "Sign In",
      ManagedProfileWidget: "Personal Information",
      AddressWidget: "Address Information",
      PlanSelectionWidget: "Plan Selection",
      ManagedDependentsWidget: "Dependents & Coverage",
    };

    return titles[widgetName] || widgetName.replace("Widget", "");
  }

  private getFallbackWidgetFlow(
    userIntent: string
  ): WidgetRecommendationResponse {
    // Enhanced fallback flow with more pages and manifest generation
    const pages: WidgetPage[] = [
      {
        pageId: "page-1",
        pageTitle: "Authentication",
        widgetType: "AuthenticationWidget",
        widgetConfig: {},
        order: 1,
      },
      {
        pageId: "page-2",
        pageTitle: "Personal Information",
        widgetType: "ManagedProfileWidget",
        widgetConfig: {},
        order: 2,
      },
      {
        pageId: "page-3",
        pageTitle: "Details",
        widgetType: "custom",
        widgetConfig: {},
        order: 3,
        manifest: this.generateFallbackManifest(userIntent, "page-3"),
      },
      {
        pageId: "page-4",
        pageTitle: "Additional Information",
        widgetType: "custom",
        widgetConfig: {},
        order: 4,
        manifest: this.generateFallbackManifest(userIntent, "page-4", true),
      },
    ];

    return {
      success: true,
      message: "Fallback widget recommendations with manifests",
      pages,
      totalPages: pages.length,
      flowDescription: `Comprehensive fallback flow for: ${userIntent}`,
    };
  }

  private generateFallbackManifest(
    userIntent: string,
    pageId: string,
    isSecondary: boolean = false
  ): any {
    const baseTitle = isSecondary ? "Additional Information" : "Details";
    const baseDescription = isSecondary
      ? `Additional information needed for: ${userIntent}`
      : `Please provide details for: ${userIntent}`;

    return {
      id: pageId,
      title: baseTitle,
      description: baseDescription,
      fields: [
        {
          id: "description",
          type: "textarea",
          label: "Description",
          placeholder: "Please describe your request in detail...",
          helperText: "Provide as much detail as possible",
          required: true,
          validation: {
            minLength: 10,
            maxLength: 1000,
          },
          rows: 4,
          counter: true,
        },
        {
          id: "priority",
          type: "radio",
          label: "Priority Level",
          helperText: "How urgent is this request?",
          required: true,
          options: [
            { label: "Low - Can wait", value: "low" },
            { label: "Medium - Within a week", value: "medium" },
            { label: "High - Within 24 hours", value: "high" },
            { label: "Urgent - Immediate attention", value: "urgent" },
          ],
        },
        ...(isSecondary
          ? [
              {
                id: "contactPreference",
                type: "checkbox",
                label: "Contact Preferences",
                helperText: "How would you like us to follow up?",
                required: false,
                options: [
                  { label: "Email updates", value: "email" },
                  { label: "Phone call", value: "phone" },
                  { label: "Text message", value: "sms" },
                ],
              },
            ]
          : [
              {
                id: "category",
                type: "dropdown",
                label: "Category",
                placeholder: "Select a category...",
                helperText: "Choose the most relevant category",
                required: true,
                searchable: true,
                options: [
                  { label: "General Inquiry", value: "general" },
                  { label: "Technical Support", value: "technical" },
                  { label: "Account Issue", value: "account" },
                  { label: "Billing Question", value: "billing" },
                  { label: "Feature Request", value: "feature" },
                  { label: "Other", value: "other" },
                ],
              },
            ]),
      ],
      layout: {
        type: "form",
        sections: [
          {
            id: "main-section",
            title: "Request Information",
            rows: [
              { fields: ["description"] },
              { fields: ["priority"] },
              { fields: isSecondary ? ["contactPreference"] : ["category"] },
            ],
          },
        ],
      },
      actions: {
        submit: {
          label: "Continue",
          successMessage: "Information saved successfully!",
          errorMessage: "Please check your inputs and try again.",
        },
        cancel: {
          label: "← Back",
          action: "back",
        },
      },
      styling: {
        theme: "light",
        className: "custom-form-page",
      },
    };
  }
}
