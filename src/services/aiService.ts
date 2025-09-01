import {
  FormDefinition,
  AIAnalysis,
  FormEditRequest,
  PageModification,
  AddPageRequest,
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
- NEVER use camelCase or other formats

CRITICAL STRUCTURE RULES:

1. "single-choice" pages: 
   - Options MUST have: id, label, value (the actual value), routeTo (page-[something])
   - NO routeButton needed
   Example option: { "id": "opt-1", "label": "Vehicle collision", "value": "collision", "routeTo": "page-2" }

2. "multi-choice" pages: 
   - Options MUST have: id, label, value (the actual value)
   - NO routeTo in options
   - Page MUST have routeButton with label and routeTo
   Example option: { "id": "opt-1", "label": "Police report filed", "value": "police-report" }
   Example routeButton: { "label": "Continue", "routeTo": "page-5" }

3. "mixed" pages: 
   - Options array contains ALL inputs (text, toggle, etc.)
   - Each option MUST have: id, type, label, value (empty string "" for text inputs), required (for text)
   - Text input: { "id": "opt-1", "type": "text", "label": "Date of incident", "value": "", "required": true }
   - Toggle: { "id": "opt-2", "type": "toggle", "label": "Police involved", "value": "police-involved" }
   - Page MUST have routeButton
   
4. "display-only" pages: 
   - For final confirmation, use options array with display items
   - Each option: { "id": "info-1", "type": "display", "label": "Field Name", "value": "field-value" }
   Example:
   {
     "id": "page-14",
     "title": "Your claim has been submitted!",
     "inputType": "display-only",
     "options": [
       { "id": "info-1", "type": "display", "label": "Claim Number", "value": "AC-2024-001234" },
       { "id": "info-2", "type": "display", "label": "Status", "value": "Under Review" }
     ]
   }

IMPORTANT VALUE FIELD RULES:
- For single-choice: value is the data value (e.g., "collision", "theft")
- For multi-choice: value is the data value (e.g., "police-report", "photos-taken")
- For mixed text inputs: value is ALWAYS empty string ""
- For mixed toggles: value is the data value (e.g., "police-involved")
- For display-only: value contains the display text

Create MINIMUM 20 pages that comprehensively cover the user's intent.

RESPOND ONLY WITH VALID JSON containing name, description, and pages fields.`;
  }

  private fixPageStructures(pages: any[]): any[] {
    return pages.map((page) => {
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
            routeTo: opt.routeTo || "page-end",
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

      // Fix mixed pages
      else if (page.inputType === "mixed") {
        if (page.options && Array.isArray(page.options)) {
          page.options = page.options.map((opt: any) => {
            const fixedOpt: any = {
              id: opt.id || this.generateOptionId(),
              label: opt.label || "Field",
            };

            // Determine type if not specified
            if (!opt.type) {
              if (
                opt.required !== undefined ||
                opt.label?.toLowerCase().includes("describe") ||
                opt.label?.toLowerCase().includes("enter") ||
                opt.label?.toLowerCase().includes("provide")
              ) {
                opt.type = "text";
              } else {
                opt.type = "toggle";
              }
            }

            fixedOpt.type = opt.type;

            // Set value based on type
            if (opt.type === "text" || opt.type === "text-input") {
              fixedOpt.type = "text"; // Normalize to "text"
              fixedOpt.value = ""; // Text inputs always have empty string
              fixedOpt.required =
                opt.required !== undefined ? opt.required : true;
            } else if (opt.type === "toggle") {
              fixedOpt.value =
                opt.value ||
                opt.label?.toLowerCase().replace(/\s+/g, "-") ||
                "toggle-value";
            } else if (opt.type === "select") {
              fixedOpt.value = opt.value || "";
              if (opt.selectOptions) {
                fixedOpt.selectOptions = opt.selectOptions;
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

      // Fix display-only pages
      else if (page.inputType === "display-only") {
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
      }

      return page;
    });
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

  // Keep the editForm and other methods as they were, just ensure they also use fixPageStructures
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

  // Keep all other methods unchanged but ensure they use fixPageStructures
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
            "You are an expert at editing and improving forms. You will regenerate an entire form based on modifications requested, maintaining the core purpose while implementing the requested changes. Always return valid JSON only. Ensure all options have proper value fields.",
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

  // Include other required methods with similar fixes...
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
- For single-choice: options have id, label, value, routeTo
- For multi-choice: options have id, label, value (no routeTo), page has routeButton
- For mixed: options have id, type, label, value ("" for text), required (for text)
- For display-only: options have id, type:"display", label, value

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
}
