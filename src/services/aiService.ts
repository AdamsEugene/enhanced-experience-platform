import {
  FormDefinition,
  AIAnalysis,
  FormEditRequest,
  FeedbackEditRequest,
} from "../types";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";

export interface AIService {
  generateForm(userIntent: string, context?: string): Promise<FormDefinition>;
  editForm(
    existingForm: FormDefinition,
    editRequest: FormEditRequest,
    createNew?: boolean
  ): Promise<FormDefinition>;
  processFormSubmission(formId: string, responses: any): Promise<AIAnalysis>;
  generateLoadingMessages(userIntent: string): Promise<string[]>;
}

export class OpenAIService implements AIService {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey: apiKey,
    });
  }

  async generateForm(
    userIntent: string,
    context?: string
  ): Promise<FormDefinition> {
    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`Form generation attempt ${attempt}/${maxAttempts}`);

        const prompt = this.buildFormGenerationPrompt(userIntent, context);

        const response = await this.openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are an expert at creating comprehensive, detailed forms and decision trees. You create thorough, professional-grade forms that cover all possible scenarios and gather complete information. You MUST respond with valid, complete JSON only. Every JSON object must be properly closed. Every routeButton must have both label and routeTo fields. IMPORTANT: Always use page IDs in the format 'page-[descriptor]' (e.g., page-1, page-theft-1, page-injury-details-1) for frontend compatibility. For mixed pages, each option MUST have a value field (empty string for text inputs).",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 4095,
          temperature: 0.05,
        });

        const content = response.choices[0].message.content;
        if (!content) {
          throw new Error("No content received from OpenAI");
        }

        console.log(`Response received, length: ${content.length}`);

        const formJson = this.extractJSONFromResponse(content, userIntent);

        // Ensure the form has all required fields
        const result = {
          id: this.generateFormId(),
          name: formJson.name || this.generateFormName(userIntent),
          description:
            formJson.description || this.generateFormDescription(userIntent),
          createdAt: new Date().toISOString(),
          generatedFrom: userIntent,
          pages: formJson.pages || [],
          ...formJson, // Allow override but ensure required fields exist
        };

        // Validate and fix page IDs to ensure they follow the page-[something] format
        result.pages = this.ensurePageIdFormat(result.pages);

        // Fix page structures to match expected format
        result.pages = this.fixPageStructures(result.pages);

        // CRITICAL: Validate all routing and fix broken routes
        result.pages = this.validateAndFixRouting(result.pages);

        console.log(`✅ Form generated successfully on attempt ${attempt}`);
        console.log(`Generated ${result.pages?.length || 0} pages`);

        return result;
      } catch (error) {
        lastError = error as Error;
        console.error(`❌ Attempt ${attempt} failed:`, error);

        if (attempt === maxAttempts) {
          console.error("All attempts failed, throwing error");
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw new Error(
      `Failed to generate form after ${maxAttempts} attempts. Last error: ${
        lastError?.message || "Unknown error"
      }`
    );
  }

  private buildFormGenerationPrompt(
    userIntent: string,
    context?: string
  ): string {
    return `
Create a comprehensive decision tree form for: "${userIntent}"
${context ? `Additional context: ${context}` : ""}

Generate a form that helps users with this specific request. The form should be relevant, practical, and directly address their needs.

REQUIRED JSON STRUCTURE:
{
  "name": "[Descriptive form name based on intent]",
  "description": "[Comprehensive description of what this form accomplishes]",
  "pages": [...]
}

PAGE ID NAMING CONVENTION (CRITICAL):
- ALWAYS use the format: page-[descriptor]
- Examples: page-1, page-2, page-theft-1, page-injury-details-1, page-weather-2
- For main flow: page-1, page-2, page-3, etc.
- For branches: page-[topic]-[number] (e.g., page-theft-1, page-medical-2)
- each page should have a type field (single-choice, multi-choice, mixed, display-only, radio, select, toggle, text, textarea, email, tel, date, number ...)
- NEVER use camelCase or other formats

CRITICAL STRUCTURE RULES:

1. "single-choice" pages: 
   - Options MUST have: id, label, value (the actual value), routeTo (page-[something])
   - NO routeButton needed
   - EVERY routeTo MUST point to an EXISTING page in the form
   Example option: { "id": "opt-1", "label": "Vehicle collision", "value": "collision", "routeTo": "page-2" }

2. "multi-choice" pages: 
   - Options MUST have: id, label, value (the actual value)
   - NO routeTo in options
   - Page MUST have routeButton with label and routeTo pointing to EXISTING page
   Example option: { "id": "opt-1", "label": "Police report filed", "value": "police-report" }
   Example routeButton: { "label": "Continue", "routeTo": "page-5" }

3. "mixed" pages: 
   - Options array contains ALL inputs (text, toggle, etc.)
   - Each option MUST have: id, type, label, value (empty string "" for text inputs), required (for text)
   - SUPPORTED INPUT TYPES: "text", "email", "tel", "date", "number", "textarea", "toggle", "radio", "select"
   - Text input: { "id": "opt-1", "type": "text", "label": "Date of incident", "value": "", "required": true }
   - VALIDATION REQUIRED: For ALL input fields, add inputType and validation config
   - Email input: { "id": "opt-2", "type": "email", "label": "Email address", "value": "", "required": true }
   - Phone input: { "id": "opt-3", "type": "tel", "label": "Phone number", "value": "", "required": true }
   - Date input: { "id": "opt-4", "type": "date", "label": "Date of birth", "value": "", "required": true }
   - Number input: { "id": "opt-5", "type": "number", "label": "Age", "value": "", "required": false }
   - Textarea: { "id": "opt-6", "type": "textarea", "label": "Describe what happened", "value": "", "required": true }
   - Toggle: { "id": "opt-7", "type": "toggle", "label": "Police involved", "value": "police-involved" }
   - Radio: { "id": "opt-8", "type": "radio", "label": "Severity level", "value": "severity", "selectOptions": [{"label": "Minor", "value": "minor"}, {"label": "Major", "value": "major"}] }
   - Select: { "id": "opt-9", "type": "select", "label": "State", "value": "", "selectOptions": [{"label": "California", "value": "CA"}, {"label": "Texas", "value": "TX"}] }
   - Page MUST have routeButton pointing to EXISTING page
   
4. "display-only" pages: 
   - ONLY USE FOR FINAL SUCCESS/COMPLETION PAGES (last 1-2 pages)
   - Each option: { "id": "info-1", "type": "display", "label": "Field Name", "value": "field-value" }

ROUTING VALIDATION REQUIREMENTS:
- EVERY routeTo field MUST reference a page that EXISTS in the form
- Create ALL referenced pages - if you reference "page-theft-1", that page MUST exist
- Use descriptive routing: instead of generic "page-5", use "page-damage-assessment" or "page-contact-info"
- NO broken routes allowed - every path must lead somewhere valid

INPUT TYPE SELECTION GUIDE:
- Use "text" for short text (names, addresses, brief descriptions)
- Use "textarea" for long descriptions or detailed explanations
- Use "email" for email addresses (includes validation)
- Use "tel" for phone numbers (includes validation)
- Use "date" for date selections
- Use "number" for numeric inputs (ages, amounts, quantities)
- Use "toggle" for yes/no or include/exclude options
- Use "radio" for single selection from predefined options
- Use "select" for dropdown selections

Create MINIMUM 20 pages that comprehensively cover the user's intent.

CRITICAL: Before finalizing the form, verify that:
1. Every routeTo value references an EXISTING page ID in the pages array
2. No page is referenced but missing from the form
3. All mixed page options have appropriate input types
4. The routing creates a complete, navigable experience
5. GENERATE ALL MISSING PAGES - if any routeTo points to a non-existent page, CREATE that page
6. Every page MUST have a "label" (detailed description of the page) 

RESPOND ONLY WITH VALID JSON containing name, description, and pages fields.`;
  }

  private fixPageStructures(pages: any[]): any[] {
    return pages.map((page, pageIndex) => {
      // Add text content to every page - text should equal the label (which is the title)
      page.text = page.label || "";
      // Check if this should be display-only (only for final pages)
      const isFinalPage = pageIndex >= pages.length - 2; // Last or second-to-last page
      const looksLikeFinalPage =
        page.title?.toLowerCase().includes("success") ||
        page.title?.toLowerCase().includes("completed") ||
        page.title?.toLowerCase().includes("submitted") ||
        page.title?.toLowerCase().includes("congratulations");

      // If page is incorrectly marked as display-only but shouldn't be, convert it
      if (
        page.inputType === "display-only" &&
        !isFinalPage &&
        !looksLikeFinalPage
      ) {
        // Convert to appropriate interactive type based on content
        if (page.options && page.options.length > 0) {
          // If it has multiple options that look like choices, make it single-choice
          page.inputType = "single-choice";
          page.options = page.options.map((opt: any, idx: number) => ({
            id: opt.id || `opt-${idx + 1}`,
            label: opt.label || opt.value || "Continue",
            value: opt.value || `option-${idx + 1}`,
            routeTo:
              this.findNextPageId(pages, page.id) || `page-${pageIndex + 2}`,
          }));
        }
      }

      // Fix single-choice pages
      if (page.inputType === "single-choice") {
        if (page.options && Array.isArray(page.options)) {
          page.options = page.options.map((opt: any) => ({
            id: opt.id || this.generateOptionId(),
            label: opt.label || "Option",
            value:
              opt.value ||
              opt.label?.toLowerCase().replace(/\s+/g, "-") ||
              "option",
            routeTo:
              opt.routeTo || this.findNextPageId(pages, page.id) || "page-end",
          }));
        }
        // Remove routeButton if present
        delete page.routeButton;
      }

      // Fix multi-choice pages
      else if (page.inputType === "multi-choice") {
        if (page.options && Array.isArray(page.options)) {
          page.options = page.options.map((opt: any) => ({
            id: opt.id || this.generateOptionId(),
            label: opt.label || "Option",
            value:
              opt.value ||
              opt.label?.toLowerCase().replace(/\s+/g, "-") ||
              "option",
          }));
          // Remove routeTo from options
          page.options.forEach((opt: any) => delete opt.routeTo);
        }
        // Ensure routeButton exists
        if (!page.routeButton) {
          page.routeButton = {
            label: "Continue",
            routeTo: this.findNextPageId(pages, page.id) || "page-end",
          };
        }
      }

      // Fix mixed pages - ENHANCED with proper input types
      else if (page.inputType === "mixed") {
        if (page.options && Array.isArray(page.options)) {
          page.options = page.options.map((opt: any) => {
            const fixedOpt: any = {
              id: opt.id || this.generateOptionId(),
              label: opt.label || "Field",
            };

            // Determine type if not specified or fix existing type
            if (!opt.type || opt.type === "text-input") {
              fixedOpt.type = this.determineInputType(opt.label);
            } else {
              // Validate and normalize the input type
              fixedOpt.type = this.normalizeInputType(opt.type);
            }

            // Set value based on type
            if (this.isTextInputType(fixedOpt.type)) {
              fixedOpt.value = ""; // Text-based inputs always have empty string
              fixedOpt.required =
                opt.required !== undefined ? opt.required : true;
            } else if (fixedOpt.type === "toggle") {
              fixedOpt.value =
                opt.value ||
                opt.label?.toLowerCase().replace(/\s+/g, "-") ||
                "toggle-value";
            } else if (
              fixedOpt.type === "radio" ||
              fixedOpt.type === "select"
            ) {
              fixedOpt.value = opt.value || "";
              if (opt.selectOptions) {
                fixedOpt.selectOptions = opt.selectOptions;
              } else {
                // Generate some default options if none provided
                fixedOpt.selectOptions = this.generateDefaultSelectOptions(
                  opt.label
                );
              }
            }

            return fixedOpt;
          });
        }

        // Ensure routeButton exists
        if (!page.routeButton) {
          page.routeButton = {
            label: "Continue",
            routeTo: this.findNextPageId(pages, page.id) || "page-end",
          };
        }
      }

      // Fix display-only pages (only for actual final/success pages)
      else if (page.inputType === "display-only") {
        // Only keep as display-only if it's actually a final page
        if (isFinalPage || looksLikeFinalPage) {
          if (page.options && Array.isArray(page.options)) {
            page.options = page.options.map((opt: any, idx: number) => ({
              id: opt.id || `info-${idx + 1}`,
              type: "display",
              label: opt.label || `Information ${idx + 1}`,
              value: opt.value || "",
            }));
          }
          // Remove routeButton from display-only pages
          delete page.routeButton;
        } else {
          // Convert to single-choice if it's not actually a final page
          page.inputType = "single-choice";
          if (!page.options || page.options.length === 0) {
            page.options = [
              {
                id: "opt-continue",
                label: "Continue",
                value: "continue",
                routeTo:
                  this.findNextPageId(pages, page.id) ||
                  `page-${pageIndex + 2}`,
              },
            ];
          } else {
            page.options = page.options.map((opt: any, idx: number) => ({
              id: opt.id || `opt-${idx + 1}`,
              label: opt.label || "Continue",
              value: opt.value || `option-${idx + 1}`,
              routeTo:
                this.findNextPageId(pages, page.id) || `page-${pageIndex + 2}`,
            }));
          }
        }
      }

      return page;
    });
  }

  // NEW METHOD: Determine appropriate input type based on label
  private determineInputType(label: string): string {
    const lowerLabel = label.toLowerCase();

    if (lowerLabel.includes("email") || lowerLabel.includes("e-mail")) {
      return "email";
    } else if (
      lowerLabel.includes("phone") ||
      lowerLabel.includes("tel") ||
      (lowerLabel.includes("number") && lowerLabel.includes("contact"))
    ) {
      return "tel";
    } else if (
      lowerLabel.includes("date") ||
      lowerLabel.includes("when") ||
      lowerLabel.includes("time")
    ) {
      return "date";
    } else if (
      lowerLabel.includes("age") ||
      lowerLabel.includes("amount") ||
      lowerLabel.includes("cost") ||
      lowerLabel.includes("price") ||
      lowerLabel.includes("quantity")
    ) {
      return "number";
    } else if (
      lowerLabel.includes("describe") ||
      lowerLabel.includes("explain") ||
      lowerLabel.includes("details") ||
      lowerLabel.includes("comments")
    ) {
      return "textarea";
    } else if (
      lowerLabel.includes("yes") ||
      lowerLabel.includes("no") ||
      lowerLabel.includes("check") ||
      lowerLabel.includes("select")
    ) {
      return "toggle";
    } else {
      return "text"; // Default for most cases
    }
  }

  // NEW METHOD: Normalize input type to supported values
  private normalizeInputType(type: string): string {
    const supportedTypes = [
      "text",
      "email",
      "tel",
      "date",
      "number",
      "textarea",
      "toggle",
      "radio",
      "select",
    ];

    // Handle common variations
    const typeMap: Record<string, string> = {
      "text-input": "text",
      "text-area": "textarea",
      phone: "tel",
      telephone: "tel",
      datetime: "date",
      checkbox: "toggle",
      check: "toggle",
      dropdown: "select",
    };

    const normalizedType = typeMap[type.toLowerCase()] || type.toLowerCase();

    return supportedTypes.includes(normalizedType) ? normalizedType : "text";
  }

  // NEW METHOD: Check if type is text-based input
  private isTextInputType(type: string): boolean {
    return ["text", "email", "tel", "date", "number", "textarea"].includes(
      type
    );
  }

  // NEW METHOD: Generate default options for radio/select inputs
  private generateDefaultSelectOptions(
    label: string
  ): Array<{ label: string; value: string }> {
    const lowerLabel = label.toLowerCase();

    if (lowerLabel.includes("state") || lowerLabel.includes("province")) {
      return [
        { label: "California", value: "CA" },
        { label: "Texas", value: "TX" },
        { label: "New York", value: "NY" },
        { label: "Florida", value: "FL" },
        { label: "Other", value: "other" },
      ];
    } else if (
      lowerLabel.includes("severity") ||
      lowerLabel.includes("level")
    ) {
      return [
        { label: "Low", value: "low" },
        { label: "Medium", value: "medium" },
        { label: "High", value: "high" },
      ];
    } else if (
      lowerLabel.includes("priority") ||
      lowerLabel.includes("urgency")
    ) {
      return [
        { label: "Low Priority", value: "low" },
        { label: "Medium Priority", value: "medium" },
        { label: "High Priority", value: "high" },
        { label: "Urgent", value: "urgent" },
      ];
    } else {
      return [
        { label: "Option 1", value: "option1" },
        { label: "Option 2", value: "option2" },
        { label: "Option 3", value: "option3" },
      ];
    }
  }

  // NEW METHOD: Validate all routing and fix broken routes
  private validateAndFixRouting(pages: any[]): any[] {
    console.log("🔍 Validating routing for all pages...");

    // Create a set of all valid page IDs
    const validPageIds = new Set(pages.map((page) => page.id));
    console.log("Valid page IDs:", Array.from(validPageIds));

    // Collect all referenced page IDs
    const referencedPageIds = new Set<string>();

    pages.forEach((page) => {
      // Collect from single-choice options
      if (page.inputType === "single-choice" && page.options) {
        page.options.forEach((opt: any) => {
          if (opt.routeTo) {
            referencedPageIds.add(opt.routeTo);
          }
        });
      }

      // Collect from routeButtons
      if (page.routeButton?.routeTo) {
        referencedPageIds.add(page.routeButton.routeTo);
      }
    });

    // Find missing pages that are referenced but don't exist
    const missingPageIds = Array.from(referencedPageIds).filter(
      (pageId) => !validPageIds.has(pageId)
    );

    if (missingPageIds.length > 0) {
      console.log(
        `❌ Found ${missingPageIds.length} missing pages:`,
        missingPageIds
      );

      // Create placeholder pages for missing references
      const placeholderPages = missingPageIds.map((pageId) =>
        this.createPlaceholderPage(pageId)
      );

      // Add placeholder pages to the form
      pages = [...pages, ...placeholderPages];

      // Update valid page IDs set
      placeholderPages.forEach((page) => validPageIds.add(page.id));

      console.log(
        `🔧 Created ${placeholderPages.length} placeholder pages to fix routing`
      );
    }

    // Track broken routes for fixing
    const brokenRoutes: Array<{ pageId: string; routeTo: string }> = [];

    // Check all routing references again
    pages.forEach((page) => {
      // Check single-choice option routing
      if (page.inputType === "single-choice" && page.options) {
        page.options.forEach((opt: any) => {
          if (opt.routeTo && !validPageIds.has(opt.routeTo)) {
            brokenRoutes.push({ pageId: page.id, routeTo: opt.routeTo });
            console.log(`❌ Broken route: ${page.id} -> ${opt.routeTo}`);
          }
        });
      }

      // Check routeButton routing
      if (
        page.routeButton?.routeTo &&
        !validPageIds.has(page.routeButton.routeTo)
      ) {
        brokenRoutes.push({
          pageId: page.id,
          routeTo: page.routeButton.routeTo,
        });
        console.log(
          `❌ Broken routeButton: ${page.id} -> ${page.routeButton.routeTo}`
        );
      }
    });

    // Fix any remaining broken routes
    if (brokenRoutes.length > 0) {
      console.log(
        `🔧 Fixing ${brokenRoutes.length} remaining broken routes...`
      );

      pages = pages.map((page) => {
        // Fix single-choice options
        if (page.inputType === "single-choice" && page.options) {
          page.options = page.options.map((opt: any) => {
            if (opt.routeTo && !validPageIds.has(opt.routeTo)) {
              const newRoute = this.findBestReplacement(
                opt.routeTo,
                validPageIds,
                pages,
                page.id
              );
              console.log(`🔧 Fixed route: ${opt.routeTo} -> ${newRoute}`);
              opt.routeTo = newRoute;
            }
            return opt;
          });
        }

        // Fix routeButton
        if (
          page.routeButton?.routeTo &&
          !validPageIds.has(page.routeButton.routeTo)
        ) {
          const newRoute = this.findBestReplacement(
            page.routeButton.routeTo,
            validPageIds,
            pages,
            page.id
          );
          console.log(
            `🔧 Fixed routeButton: ${page.routeButton.routeTo} -> ${newRoute}`
          );
          page.routeButton.routeTo = newRoute;
        }

        return page;
      });
    }

    console.log("✅ Routing validation complete");
    return pages;
  }

  // NEW METHOD: Create placeholder page for missing references
  private createPlaceholderPage(pageId: string): any {
    // Extract meaningful name from page ID
    const pageName = pageId.replace("page-", "").replace(/-/g, " ");
    const formattedName = pageName.charAt(0).toUpperCase() + pageName.slice(1);

    return {
      id: pageId,
      title: `${formattedName} Details`,
      label: `${formattedName} Details`,
      text: `${formattedName} Details`,
      inputType: "mixed",
      options: [
        {
          id: `opt-${Date.now()}-1`,
          type: "textarea",
          label: `Please describe the ${pageName} situation`,
          value: "",
          required: true,
        },
        {
          id: `opt-${Date.now()}-2`,
          type: "toggle",
          label: "I need additional assistance with this issue",
          value: "need-assistance",
        },
      ],
      routeButton: {
        label: "Continue",
        routeTo: this.findDefaultEndPage() || "page-final-resolution",
      },
    };
  }

  // NEW METHOD: Find a suitable end page for routing
  private findDefaultEndPage(): string | null {
    // Look for common end page patterns
    const commonEndPages = [
      "page-resolution",
      "page-final",
      "page-completion",
      "page-summary",
      "page-end",
    ];

    return commonEndPages[0]; // Default to page-resolution
  }

  // NEW METHOD: Find best replacement for broken route
  private findBestReplacement(
    brokenRoute: string,
    validPageIds: Set<string>,
    pages: any[],
    currentPageId: string
  ): string {
    // Strategy 1: Look for similar page ID
    const similarPages = Array.from(validPageIds).filter(
      (pageId) =>
        pageId.includes(brokenRoute.replace("page-", "")) ||
        brokenRoute.includes(pageId.replace("page-", ""))
    );

    if (similarPages.length > 0) {
      return similarPages[0];
    }

    // Strategy 2: Find next sequential page
    const currentIndex = pages.findIndex((p) => p.id === currentPageId);
    if (currentIndex >= 0 && currentIndex < pages.length - 1) {
      return pages[currentIndex + 1].id;
    }

    // Strategy 3: Find next page in sequence or create end page
    const pageNumbers = Array.from(validPageIds)
      .filter((id) => id.match(/^page-\d+$/))
      .map((id) => parseInt(id.replace("page-", "")))
      .sort((a, b) => a - b);

    if (pageNumbers.length > 0) {
      const highestNumber = Math.max(...pageNumbers);
      const nextPageId = `page-${highestNumber}`;
      if (validPageIds.has(nextPageId)) {
        return nextPageId;
      }
    }

    // Strategy 4: Return first available page or create final page reference
    const firstPage = Array.from(validPageIds)[0];
    return firstPage || "page-end";
  }

  private findNextPageId(pages: any[], currentPageId: string): string | null {
    const currentIndex = pages.findIndex((p) => p.id === currentPageId);
    if (currentIndex >= 0 && currentIndex < pages.length - 1) {
      return pages[currentIndex + 1].id;
    }
    return null;
  }

  private generateOptionId(): string {
    return `opt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  }

  private ensurePageIdFormat(pages: any[]): any[] {
    return pages.map((page, index) => {
      if (!page.id || !page.id.startsWith("page-")) {
        if (page.title) {
          const titleWords = page.title.toLowerCase().split(" ").slice(0, 3);
          const descriptor = titleWords.join("-").replace(/[^a-z0-9-]/g, "");
          page.id = `page-${descriptor}-${index + 1}`;
        } else {
          page.id = `page-${index + 1}`;
        }
      }

      // Fix routeTo references in options (for single-choice pages)
      if (
        page.inputType === "single-choice" &&
        page.options &&
        Array.isArray(page.options)
      ) {
        page.options = page.options.map((option: any) => {
          if (option.routeTo && !option.routeTo.startsWith("page-")) {
            if (option.routeTo.match(/^\d+$/)) {
              option.routeTo = `page-${option.routeTo}`;
            } else {
              option.routeTo = `page-${option.routeTo
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "-")}`;
            }
          }
          return option;
        });
      }

      // Fix routeButton routeTo
      if (
        page.routeButton?.routeTo &&
        !page.routeButton.routeTo.startsWith("page-")
      ) {
        if (page.routeButton.routeTo.match(/^\d+$/)) {
          page.routeButton.routeTo = `page-${page.routeButton.routeTo}`;
        } else {
          page.routeButton.routeTo = `page-${page.routeButton.routeTo
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")}`;
        }
      }

      return page;
    });
  }

  private extractJSONFromResponse(response: string, userIntent: string): any {
    console.log("🔍 Starting JSON extraction...");

    try {
      let cleaned = response
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .replace(/^\s*[\r\n]/gm, "")
        .trim();

      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");

      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error("No JSON object found in response");
      }

      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(cleaned);
      console.log("✅ JSON parsed successfully");

      return parsed;
    } catch (error) {
      console.error("❌ JSON extraction failed:", error);
      throw new Error("Invalid JSON response from AI service");
    }
  }

  // Keep the editForm and other methods as they were, just ensure they also use the new validation
  async editForm(
    existingForm: FormDefinition,
    editRequest: FormEditRequest,
    createNew: boolean = false
  ): Promise<FormDefinition> {
    try {
      console.log("Starting form edit operation...");

      let editedForm: FormDefinition;

      if (editRequest.regenerateAll) {
        editedForm = await this.regenerateEntireForm(existingForm, editRequest);
      } else if (editRequest.regeneratePageIds?.length) {
        editedForm = await this.regenerateSpecificPages(
          existingForm,
          editRequest
        );
      } else if (
        editRequest.pageModifications ||
        editRequest.addPages ||
        editRequest.removePageIds
      ) {
        editedForm = await this.modifyFormStructure(existingForm, editRequest);
      } else if (editRequest.newIntent || editRequest.newContext) {
        editedForm = await this.regenerateWithNewIntent(
          existingForm,
          editRequest
        );
      } else {
        editedForm = await this.regenerateWithHints(existingForm, editRequest);
      }

      if (createNew) {
        editedForm.id = this.generateFormId();
        editedForm.createdAt = new Date().toISOString();
      }

      editedForm.lastEditedAt = new Date().toISOString();

      if (!editedForm.editHistory) {
        editedForm.editHistory = [];
      }

      editedForm.editHistory.push({
        editedAt: new Date().toISOString(),
        editType: this.determineEditType(editRequest),
        description: this.generateEditDescription(editRequest),
      });

      // Apply structure fixes to edited form
      editedForm.pages = this.fixPageStructures(editedForm.pages);

      // CRITICAL: Validate routing after edits
      editedForm.pages = this.validateAndFixRouting(editedForm.pages);

      return editedForm;
    } catch (error) {
      console.error("Error editing form:", error);
      throw new Error(
        `Failed to edit form: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async editFormWithFeedback(
    existingForm: FormDefinition,
    feedbackRequest: FeedbackEditRequest
  ): Promise<FormDefinition> {
    try {
      console.log("Processing feedback-based form edit...");

      const prompt = this.buildFeedbackEditPrompt(
        existingForm,
        feedbackRequest
      );

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert form designer who makes precise improvements based on user feedback. 
          You modify existing forms by applying specific feedback to individual pages while maintaining the overall structure and flow.
          
          CRITICAL RULES:
          - Return the COMPLETE modified form JSON (all pages, even unchanged ones)
          - Apply feedback carefully - don't over-modify
          - Maintain existing page IDs unless absolutely necessary
          - Keep routing intact unless feedback specifically requires changes
          - For "too many options" feedback: reduce to 3-4 most relevant options
          - For "too few options" feedback: add 1-2 more relevant options
          - For "need text fields" feedback: convert to mixed inputType and add appropriate text inputs
          - For "too many fields" feedback: consolidate or split across multiple pages
          - Preserve the form's core purpose and intent
          - Always respond with valid JSON only`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 4095,
        temperature: 0.1,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("No content received from OpenAI");
      }

      const formJson = this.extractJSONFromResponse(
        content,
        existingForm.generatedFrom || "feedback edit"
      );

      const result: FormDefinition = {
        ...existingForm,
        name: formJson.name || existingForm.name,
        description: formJson.description || existingForm.description,
        pages: this.ensurePageIdFormat(formJson.pages || existingForm.pages),
        lastEditedAt: new Date().toISOString(),
      };

      // Apply structure fixes
      result.pages = this.fixPageStructures(result.pages);
      result.pages = this.validateAndFixRouting(result.pages);

      console.log("✅ Feedback-based edit completed successfully");
      return result;
    } catch (error) {
      console.error("Error in feedback-based edit:", error);
      throw new Error(
        `Failed to process feedback edit: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async regenerateEntireForm(
    existingForm: FormDefinition,
    editRequest: FormEditRequest
  ): Promise<FormDefinition> {
    const prompt = this.buildEditPrompt(
      existingForm,
      editRequest,
      "full_regenerate"
    );

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an expert at editing and improving forms. You will regenerate an entire form based on modifications requested, maintaining the core purpose while implementing the requested changes. Always return valid JSON only. Ensure all options have proper value fields and appropriate input types for mixed pages.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 4095,
      temperature: 0.1,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No content received from OpenAI");
    }

    const formJson = this.extractJSONFromResponse(
      content,
      editRequest.newIntent || existingForm.generatedFrom || "form edit"
    );

    const result = {
      ...existingForm,
      name: formJson.name || existingForm.name,
      description: formJson.description || existingForm.description,
      pages: this.ensurePageIdFormat(formJson.pages || existingForm.pages),
      generatedFrom: editRequest.newIntent || existingForm.generatedFrom,
    };

    result.pages = this.fixPageStructures(result.pages);
    return result;
  }

  private buildEditPrompt(
    existingForm: FormDefinition,
    editRequest: FormEditRequest,
    editType: string
  ): string {
    let prompt = `You are editing an existing form. `;

    prompt += `\n\nEXISTING FORM:\n${JSON.stringify(
      existingForm,
      null,
      2
    )}\n\n`;

    switch (editType) {
      case "full_regenerate":
        prompt += `TASK: Completely regenerate this form with the following requirements:\n`;
        if (editRequest.newIntent) {
          prompt += `- New primary intent: "${editRequest.newIntent}"\n`;
        }
        if (editRequest.newContext) {
          prompt += `- Additional context: "${editRequest.newContext}"\n`;
        }
        if (editRequest.modificationHints) {
          prompt += `- Apply these improvements: ${editRequest.modificationHints.join(
            ", "
          )}\n`;
        }
        prompt += `- Maintain minimum ${editRequest.minPages || 20} pages\n`;
        break;
      // Add other cases as needed
    }

    prompt += `\n\nCRITICAL REQUIREMENTS:
- Return the COMPLETE modified form as valid JSON
- ALL page IDs MUST use format: page-[descriptor]
- EVERY routeTo MUST point to an EXISTING page in the form
- For single-choice: options have id, label, value, routeTo (to existing page)
- For multi-choice: options have id, label, value (no routeTo), page has routeButton (to existing page)
- For mixed: options have id, type, label, value ("" for text), required (for text)
- MIXED PAGE INPUT TYPES: text, email, tel, date, number, textarea, toggle, radio, select
- For display-only: options have id, type:"display", label, value
- Create ALL pages that are referenced in routing

VALIDATION CONFIGURATION REQUIREMENTS:
For EVERY input field in mixed pages, you MUST include both inputType and validation:

Example with validation:
{
  "id": "full-name",
  "type": "text",
  "label": "Full Name",
  "value": "",
  "required": true,
  "inputType": "text",
  "validation": {
    "required": true,
    "minLength": 2,
    "maxLength": 50,
    "customPatterns": { "name": true }
  }
}

Common validation patterns:
- Names: inputType="text", validation: {required: true, customPatterns: {name: true}}
- Email: inputType="email", validation: {required: true}
- Phone: inputType="phone", validation: {required: true, phoneFormat: "us"}
- Dates: inputType="date", validation: {required: true, pastOnly: true}
- Numbers: inputType="number", validation: {min: 0, max: 120}
- ZIP codes: inputType="text", validation: {required: true, customPatterns: {zipCode: true}}

RESPOND ONLY WITH VALID JSON.`;

    return prompt;
  }

  // Keep all other helper methods from the original implementation
  async processFormSubmission(
    formId: string,
    responses: any
  ): Promise<AIAnalysis> {
    try {
      const prompt = this.buildSubmissionAnalysisPrompt(formId, responses);

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are an expert at analyzing form data and providing actionable insights. You always respond with valid JSON only, no explanations or markdown.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 1500,
        temperature: 0.1,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("No content received from OpenAI");
      }

      return this.extractJSONFromResponse(content, "form submission analysis");
    } catch (error) {
      console.error("Error processing form submission:", error);
      throw new Error(
        `Failed to process submission: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private buildSubmissionAnalysisPrompt(
    formId: string,
    responses: any
  ): string {
    return `
Analyze this form submission and provide insights for next steps:

Form ID: ${formId}
User Responses: ${JSON.stringify(responses, null, 2)}

Provide a JSON response with the following structure:
{
  "summary": "Brief summary of what the user provided and their situation",
  "nextSteps": "Specific next actions that should be taken based on their responses",
  "dataQuality": "Assessment of completeness and quality of information provided",
  "insights": ["key insights", "important findings", "recommendations"],
  "priority": "low|medium|high|urgent"
}

RESPOND ONLY WITH VALID JSON. NO EXPLANATIONS OR MARKDOWN.
    `;
  }

  private generateFormId(): string {
    return `form-${Date.now()}-${uuidv4().split("-")[0]}`;
  }

  private generateFormName(userIntent: string): string {
    const keywords = userIntent.toLowerCase().split(" ");
    if (keywords.includes("insurance") || keywords.includes("claim")) {
      return "Insurance Claim Assistant";
    } else if (keywords.includes("return") || keywords.includes("refund")) {
      return "Product Return & Refund Form";
    } else if (
      keywords.includes("appointment") ||
      keywords.includes("schedule")
    ) {
      return "Appointment Scheduling Assistant";
    } else if (keywords.includes("support") || keywords.includes("help")) {
      return "Customer Support Request Form";
    } else {
      const words = userIntent.split(" ").slice(0, 5);
      return (
        words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") +
        " Form"
      );
    }
  }

  private generateFormDescription(userIntent: string): string {
    return `Comprehensive form to help with: ${userIntent}. This guided process will collect all necessary information through a series of targeted questions.`;
  }

  private determineEditType(
    editRequest: FormEditRequest
  ): "regenerate" | "modify" | "add_pages" | "remove_pages" {
    if (editRequest.regenerateAll || editRequest.newIntent) {
      return "regenerate";
    } else if (editRequest.addPages && editRequest.addPages.length > 0) {
      return "add_pages";
    } else if (
      editRequest.removePageIds &&
      editRequest.removePageIds.length > 0
    ) {
      return "remove_pages";
    } else {
      return "modify";
    }
  }

  private generateEditDescription(editRequest: FormEditRequest): string {
    const parts: string[] = [];

    if (editRequest.newIntent) {
      parts.push(`Changed intent to: "${editRequest.newIntent}"`);
    }
    if (editRequest.newContext) {
      parts.push(`Added context: "${editRequest.newContext}"`);
    }
    if (editRequest.regenerateAll) {
      parts.push("Regenerated entire form");
    }
    if (editRequest.regeneratePageIds) {
      parts.push(`Regenerated ${editRequest.regeneratePageIds.length} pages`);
    }
    if (editRequest.pageModifications) {
      parts.push(`Modified ${editRequest.pageModifications.length} pages`);
    }
    if (editRequest.addPages) {
      parts.push(`Added ${editRequest.addPages.length} new pages`);
    }
    if (editRequest.removePageIds) {
      parts.push(`Removed ${editRequest.removePageIds.length} pages`);
    }
    if (editRequest.modificationHints) {
      parts.push(
        `Applied ${editRequest.modificationHints.length} improvement hints`
      );
    }

    return parts.join(", ") || "General modifications";
  }

  // Add stub methods for the other regeneration types
  private async regenerateSpecificPages(
    existingForm: FormDefinition,
    editRequest: FormEditRequest
  ): Promise<FormDefinition> {
    // Implementation similar to regenerateEntireForm
    return this.regenerateEntireForm(existingForm, editRequest);
  }

  private async modifyFormStructure(
    existingForm: FormDefinition,
    editRequest: FormEditRequest
  ): Promise<FormDefinition> {
    // Implementation similar to regenerateEntireForm
    return this.regenerateEntireForm(existingForm, editRequest);
  }

  private async regenerateWithNewIntent(
    existingForm: FormDefinition,
    editRequest: FormEditRequest
  ): Promise<FormDefinition> {
    // Implementation similar to regenerateEntireForm
    return this.regenerateEntireForm(existingForm, editRequest);
  }

  private async regenerateWithHints(
    existingForm: FormDefinition,
    editRequest: FormEditRequest
  ): Promise<FormDefinition> {
    // Implementation similar to regenerateEntireForm
    return this.regenerateEntireForm(existingForm, editRequest);
  }

  // ============== LOADING MESSAGES GENERATION ==============

  async generateLoadingMessages(userIntent: string): Promise<string[]> {
    try {
      console.log(`🔄 Generating loading messages for: "${userIntent}"`);

      const prompt = this.buildLoadingMessagesPrompt(userIntent);

      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Using faster model for quick response
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that generates encouraging loading messages. Respond only with a JSON array of exactly 6 short, positive messages.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 200,
        temperature: 0.7,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("No content received from OpenAI for loading messages");
      }

      // Parse the JSON array
      const messages = JSON.parse(content.trim());

      if (Array.isArray(messages) && messages.length > 0) {
        console.log(`✅ Generated ${messages.length} loading messages`);
        return messages;
      } else {
        throw new Error("Invalid response format for loading messages");
      }
    } catch (error) {
      console.error("❌ Failed to generate loading messages:", error);
      // Return fallback messages if AI fails
      return this.getFallbackLoadingMessages(userIntent);
    }
  }

  private buildLoadingMessagesPrompt(userIntent: string): string {
    return `Generate exactly 6 short, encouraging loading messages (each 10-15 words) for someone creating a form about: "${userIntent}"

The messages should:
- Be positive and encouraging
- Reference the specific form being created
- Show progress and anticipation
- Be professional but friendly

Respond with ONLY a JSON array like: ["message 1", "message 2", "message 3", "message 4", "message 5", "message 6"]`;
  }

  private getFallbackLoadingMessages(userIntent: string): string[] {
    const genericMessages = [
      "Analyzing your requirements...",
      "Creating the perfect form structure...",
      "Adding smart validation rules...",
      "Optimizing the user experience...",
      "Finalizing your custom form...",
      "Almost ready! Putting the finishing touches...",
    ];

    // Try to customize at least the first message based on user intent
    const customizedFirst = `Creating your ${userIntent.toLowerCase()} form...`;

    return [customizedFirst, ...genericMessages.slice(1)];
  }

  private buildFeedbackEditPrompt(
    existingForm: FormDefinition,
    feedbackRequest: FeedbackEditRequest
  ): string {
    let prompt = `TASK: Apply specific feedback to improve this existing form.

EXISTING FORM:
${JSON.stringify(existingForm, null, 2)}

FEEDBACK TO APPLY:
`;

    if (
      feedbackRequest.pageSpecificFeedback &&
      feedbackRequest.pageSpecificFeedback.length > 0
    ) {
      prompt += `\nPAGE-SPECIFIC FEEDBACK:\n`;
      feedbackRequest.pageSpecificFeedback.forEach((pageFeedback) => {
        prompt += `\nPage ID: ${pageFeedback.pageId}\n`;
        prompt += `Page Title: "${pageFeedback.pageTitle}"\n`;
        prompt += `Feedback:\n`;
        pageFeedback.feedbacks.forEach((feedback, idx) => {
          prompt += `  ${idx + 1}. ${feedback}\n`;
        });
      });
    }

    if (feedbackRequest.generalFeedback) {
      prompt += `\nGENERAL FEEDBACK:\n${feedbackRequest.generalFeedback}\n`;
    }

    prompt += `\n\nHOW TO APPLY FEEDBACK:

For "too many options" feedback:
- Reduce options to 3-4 most essential/relevant choices
- Combine similar options if possible
- Remove redundant or less important options

For "too few options" feedback:
- Add 1-2 more relevant options that users might need
- Consider edge cases or alternative scenarios
- Don't add options just to reach a number - they must be meaningful

For "need text fields" feedback:
- Change inputType to "mixed" if not already
- Add appropriate text input options with proper types (text, email, tel, date, number, textarea)
- Determine best input type based on what information is needed
- Make text fields required: true for essential information

For "too many fields" feedback:
- Reduce number of input fields on that page
- Split complex pages into multiple simpler pages
- Keep only the most essential fields for that step
- Consider moving some fields to later pages

For general feedback like "add new pages":
- Add relevant new pages that enhance the form's usefulness
- Insert pages at logical points in the flow
- Ensure new pages have proper routing to/from existing pages

CRITICAL STRUCTURE REQUIREMENTS:
- Return the COMPLETE form with ALL pages (modified and unmodified)
- Maintain existing page IDs unless feedback requires structural changes
- ALL routeTo references MUST point to pages that exist in the form
- For mixed pages, use proper input types: text, email, tel, date, number, textarea, toggle, radio, select
- Ensure all text-based inputs have value: "" and appropriate required: true/false
- Validate that every page referenced in routing actually exists

RESPOND WITH THE COMPLETE MODIFIED FORM AS VALID JSON ONLY.`;

    return prompt;
  }
}
