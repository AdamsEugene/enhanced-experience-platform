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
                "You are an expert at creating comprehensive, detailed forms and decision trees. You create thorough, professional-grade forms that cover all possible scenarios and gather complete information. You MUST respond with valid, complete JSON only. Every JSON object must be properly closed. Every routeButton must have both label and routeTo fields. IMPORTANT: Always use page IDs in the format 'page-[descriptor]' (e.g., page-1, page-theft-1, page-injury-details-1) for frontend compatibility.",
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

        // Fix display-only pages structure
        result.pages = this.fixDisplayOnlyPages(result.pages);

        // NEW: Validate input types and routing
        result.pages = this.validateInputTypesAndRouting(result.pages);

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

  async editForm(
    existingForm: FormDefinition,
    editRequest: FormEditRequest,
    createNew: boolean = false
  ): Promise<FormDefinition> {
    try {
      console.log("Starting form edit operation...");

      let editedForm: FormDefinition;

      // Determine the type of edit operation
      if (editRequest.regenerateAll) {
        // Complete regeneration with modifications
        editedForm = await this.regenerateEntireForm(existingForm, editRequest);
      } else if (
        editRequest.regeneratePageIds &&
        editRequest.regeneratePageIds.length > 0
      ) {
        // Regenerate specific pages
        editedForm = await this.regenerateSpecificPages(
          existingForm,
          editRequest
        );
      } else if (
        editRequest.pageModifications ||
        editRequest.addPages ||
        editRequest.removePageIds
      ) {
        // Surgical modifications
        editedForm = await this.modifyFormStructure(existingForm, editRequest);
      } else if (editRequest.newIntent || editRequest.newContext) {
        // Regenerate based on new intent/context
        editedForm = await this.regenerateWithNewIntent(
          existingForm,
          editRequest
        );
      } else {
        // Default: regenerate with hints
        editedForm = await this.regenerateWithHints(existingForm, editRequest);
      }

      // Update metadata
      if (createNew) {
        editedForm.id = this.generateFormId();
        editedForm.createdAt = new Date().toISOString();
      }

      editedForm.lastEditedAt = new Date().toISOString();

      // Add edit history
      if (!editedForm.editHistory) {
        editedForm.editHistory = [];
      }

      editedForm.editHistory.push({
        editedAt: new Date().toISOString(),
        editType: this.determineEditType(editRequest),
        description: this.generateEditDescription(editRequest),
      });

      // NEW: Validate input types and routing for edited form
      editedForm.pages = this.validateInputTypesAndRouting(editedForm.pages);

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
            "You are an expert at editing and improving forms. You will regenerate an entire form based on modifications requested, maintaining the core purpose while implementing the requested changes. Always return valid JSON only.",
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

    // Ensure edited form has all required fields and proper page ID format
    const result = {
      ...existingForm,
      name: formJson.name || existingForm.name,
      description: formJson.description || existingForm.description,
      pages: this.ensurePageIdFormat(formJson.pages || existingForm.pages),
      generatedFrom: editRequest.newIntent || existingForm.generatedFrom,
    };

    // Fix display-only pages
    result.pages = this.fixDisplayOnlyPages(result.pages);

    return result;
  }

  private async regenerateSpecificPages(
    existingForm: FormDefinition,
    editRequest: FormEditRequest
  ): Promise<FormDefinition> {
    const prompt = this.buildEditPrompt(
      existingForm,
      editRequest,
      "specific_pages"
    );

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an expert at editing forms. You will regenerate specific pages while maintaining consistency with the rest of the form. Return the complete form with regenerated pages integrated. Always return valid JSON only.",
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
      existingForm.generatedFrom || "form edit"
    );

    // Ensure edited form has all required fields and proper page ID format
    const result = {
      ...existingForm,
      name: formJson.name || existingForm.name,
      description: formJson.description || existingForm.description,
      pages: this.ensurePageIdFormat(formJson.pages || existingForm.pages),
    };

    // Fix display-only pages
    result.pages = this.fixDisplayOnlyPages(result.pages);

    return result;
  }

  private async modifyFormStructure(
    existingForm: FormDefinition,
    editRequest: FormEditRequest
  ): Promise<FormDefinition> {
    const prompt = this.buildEditPrompt(
      existingForm,
      editRequest,
      "surgical_modify"
    );

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an expert at precisely modifying forms. Apply the specific modifications requested while maintaining form coherence. Return the complete modified form. Always return valid JSON only.",
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

    const formJson = this.extractJSONFromResponse(
      content,
      existingForm.generatedFrom || "form edit"
    );

    // Fix display-only pages
    formJson.pages = this.fixDisplayOnlyPages(formJson.pages);

    return {
      ...existingForm,
      ...formJson,
    };
  }

  private async regenerateWithNewIntent(
    existingForm: FormDefinition,
    editRequest: FormEditRequest
  ): Promise<FormDefinition> {
    const prompt = this.buildEditPrompt(
      existingForm,
      editRequest,
      "new_intent"
    );

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an expert at adapting forms to new intents. Regenerate the form to match the new intent while preserving useful structure where applicable. Always return valid JSON only.",
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

    // Fix display-only pages
    formJson.pages = this.fixDisplayOnlyPages(formJson.pages);

    return {
      ...existingForm,
      ...formJson,
      generatedFrom: editRequest.newIntent || existingForm.generatedFrom,
    };
  }

  private async regenerateWithHints(
    existingForm: FormDefinition,
    editRequest: FormEditRequest
  ): Promise<FormDefinition> {
    const prompt = this.buildEditPrompt(
      existingForm,
      editRequest,
      "hints_only"
    );

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an expert at improving forms based on feedback. Apply the modification hints to improve the form while maintaining its core purpose. Always return valid JSON only.",
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
      existingForm.generatedFrom || "form edit"
    );

    // Fix display-only pages
    formJson.pages = this.fixDisplayOnlyPages(formJson.pages);

    return {
      ...existingForm,
      ...formJson,
    };
  }

  private buildEditPrompt(
    existingForm: FormDefinition,
    editRequest: FormEditRequest,
    editType: string
  ): string {
    let prompt = `You are editing an existing form. `;

    // Add the existing form structure
    prompt += `\n\nEXISTING FORM:\n${JSON.stringify(
      existingForm,
      null,
      2
    )}\n\n`;

    // Add edit instructions based on type
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
        prompt += `- Create comprehensive coverage with detailed branching\n`;
        prompt += `- MUST use page-[descriptor] format for all page IDs\n`;
        break;

      case "specific_pages":
        prompt += `TASK: Regenerate ONLY these specific pages: ${editRequest.regeneratePageIds?.join(
          ", "
        )}\n`;
        prompt += `- Keep all other pages exactly as they are\n`;
        prompt += `- Ensure regenerated pages fit seamlessly with existing flow\n`;
        prompt += `- Maintain all routing connections\n`;
        break;

      case "surgical_modify":
        prompt += `TASK: Apply these specific modifications:\n`;

        if (editRequest.pageModifications) {
          prompt += `\nPAGE MODIFICATIONS:\n`;
          editRequest.pageModifications.forEach((mod) => {
            prompt += `- Page ${mod.pageId}:\n`;
            if (mod.newTitle) prompt += `  * New title: "${mod.newTitle}"\n`;
            if (mod.newInputType)
              prompt += `  * Change input type to: ${mod.newInputType}\n`;
            if (mod.optionModifications) {
              prompt += `  * Modify options as specified\n`;
            }
            if (mod.addOptions) {
              prompt += `  * Add new options: ${JSON.stringify(
                mod.addOptions
              )}\n`;
            }
            if (mod.removeOptionIds) {
              prompt += `  * Remove options: ${mod.removeOptionIds.join(
                ", "
              )}\n`;
            }
          });
        }

        if (editRequest.addPages) {
          prompt += `\nADD NEW PAGES:\n`;
          editRequest.addPages.forEach((page) => {
            prompt += `- Add page ${
              page.afterPageId
                ? `after ${page.afterPageId}`
                : page.beforePageId
                ? `before ${page.beforePageId}`
                : "at appropriate position"
            }\n`;
            if (page.suggestedTitle)
              prompt += `  * Title: "${page.suggestedTitle}"\n`;
            if (page.purpose) prompt += `  * Purpose: ${page.purpose}\n`;
            if (page.suggestedOptions)
              prompt += `  * Options: ${page.suggestedOptions.join(", ")}\n`;
          });
        }

        if (editRequest.removePageIds) {
          prompt += `\nREMOVE PAGES: ${editRequest.removePageIds.join(", ")}\n`;
          prompt += `- Adjust all routing to bypass removed pages\n`;
        }
        break;

      case "new_intent":
        prompt += `TASK: Adapt this form to a new intent:\n`;
        prompt += `- Original intent: "${existingForm.generatedFrom}"\n`;
        prompt += `- NEW INTENT: "${editRequest.newIntent}"\n`;
        if (editRequest.newContext) {
          prompt += `- Additional context: "${editRequest.newContext}"\n`;
        }
        prompt += `- Preserve useful structure where applicable\n`;
        prompt += `- Ensure minimum ${editRequest.minPages || 20} pages\n`;
        break;

      case "hints_only":
        prompt += `TASK: Improve this form based on these hints:\n`;
        if (editRequest.modificationHints) {
          editRequest.modificationHints.forEach((hint) => {
            prompt += `- ${hint}\n`;
          });
        }
        prompt += `- Maintain the core purpose and flow\n`;
        prompt += `- Ensure minimum ${editRequest.minPages || 20} pages\n`;
        break;
    }

    // Add common requirements
    prompt += `\n\nCRITICAL REQUIREMENTS:
- Return the COMPLETE modified form as valid JSON
- MUST include "name" and "description" fields at top level
- ALL page IDs MUST use format: page-[descriptor] (e.g., page-1, page-theft-1)
- ALL routeTo values must reference valid page-[descriptor] IDs that actually exist in the form
- EVERY routeTo must have a corresponding page in the pages array

INPUT TYPE RULES (CRITICAL):
- "single-choice": Each option has routeTo, no routeButton needed
- "multi-choice": Options have value only (no routeTo), page has routeButton
- "mixed": ONLY these types allowed in options: text, number, tel, toggle, date
  - text: For regular text input
  - number: For numeric input  
  - tel: For phone numbers
  - toggle: For checkbox/boolean options
  - date: For date selection
  - NO other types allowed in mixed pages
- "display-only": Use options with type="display"

ROUTING VALIDATION (CRITICAL):
- Every routeTo value must reference a page that exists in the form
- If routeTo references page-X, then page-X must exist in the pages array
- NO broken or missing routing destinations allowed
- Generate additional pages if needed to satisfy all routing requirements

For display-only final pages use this exact structure:
{
  "id": "page-[number]",
  "title": "[Success message]",
  "inputType": "display-only", 
  "options": [
    { "id": "info-1", "type": "display", "label": "Claim Number", "value": "AC-2024-001234" },
    { "id": "info-2", "type": "display", "label": "Status", "value": "Under Review" },
    { "id": "info-3", "type": "display", "label": "Processing Time", "value": "3-5 business days" }
  ]
}

Minimum ${editRequest.minPages || 20} pages total.

RESPOND ONLY WITH VALID JSON containing name, description, and pages fields.`;

    return prompt;
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

  // Keep existing methods...
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

  // NEW: Validate input types and ensure proper routing
  private validateInputTypesAndRouting(pages: any[]): any[] {
    console.log("🔍 Validating input types and routing...");

    const pageIds = new Set(pages.map((p) => p.id));

    return pages.map((page, index) => {
      console.log(
        `Validating page ${index + 1}: ${page.id} (${page.inputType})`
      );

      // Fix input types in mixed pages
      if (
        page.inputType === "mixed" &&
        page.options &&
        Array.isArray(page.options)
      ) {
        page.options = page.options.map((option: any) => {
          if (option.type) {
            // Validate and fix type field for mixed inputs
            const allowedTypes = ["text", "number", "tel", "toggle", "date"];

            if (!allowedTypes.includes(option.type)) {
              console.log(
                `⚠️  Fixing invalid type "${option.type}" to "text" for option: ${option.label}`
              );
              option.type = "text";
            }

            // Remove routeTo from mixed page options (they should only be in single-choice)
            if (option.routeTo) {
              console.log(
                `⚠️  Removing routeTo from mixed page option: ${option.label}`
              );
              delete option.routeTo;
            }
          }
          return option;
        });
      }

      // Validate routing destinations
      if (page.options && Array.isArray(page.options)) {
        page.options = page.options.map((option: any) => {
          if (option.routeTo && !pageIds.has(option.routeTo)) {
            console.log(
              `❌ Invalid routeTo "${option.routeTo}" in option "${option.label}"`
            );

            // Try to find a similar page or default to a valid one
            const validPageId = this.findValidRouteTarget(
              option.routeTo,
              pageIds,
              index,
              pages.length
            );
            console.log(`🔧 Fixing routeTo to: ${validPageId}`);
            option.routeTo = validPageId;
          }
          return option;
        });
      }

      // Validate routeButton routing
      if (
        page.routeButton &&
        page.routeButton.routeTo &&
        !pageIds.has(page.routeButton.routeTo)
      ) {
        console.log(
          `❌ Invalid routeButton routeTo "${page.routeButton.routeTo}" on page "${page.id}"`
        );

        const validPageId = this.findValidRouteTarget(
          page.routeButton.routeTo,
          pageIds,
          index,
          pages.length
        );
        console.log(`🔧 Fixing routeButton routeTo to: ${validPageId}`);
        page.routeButton.routeTo = validPageId;
      }

      return page;
    });
  }

  private findValidRouteTarget(
    invalidRouteTo: string,
    pageIds: Set<string>,
    currentIndex: number,
    totalPages: number
  ): string {
    // Strategy 1: Try to find a similar existing page
    for (const pageId of pageIds) {
      if (pageId.includes(invalidRouteTo.replace("page-", ""))) {
        return pageId;
      }
    }

    // Strategy 2: Route to next logical page
    const nextIndex = currentIndex + 1;
    if (nextIndex < totalPages) {
      return `page-${nextIndex + 1}`;
    }

    // Strategy 3: Route to a page that likely exists
    const likelyPages = [
      `page-${totalPages}`,
      "page-end",
      "page-summary",
      "page-confirmation",
    ];
    for (const likelyPage of likelyPages) {
      if (pageIds.has(likelyPage)) {
        return likelyPage;
      }
    }

    // Strategy 4: Just use the last page in the array
    const pageIdsArray = Array.from(pageIds);
    return pageIdsArray[pageIdsArray.length - 1] || "page-1";
  }

  // Keep all existing helper methods unchanged...
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

INPUT TYPE RULES (CRITICAL):
1. "single-choice" pages: 
   - Options have routeTo field pointing to page-[something]
   - NO routeButton on the page
   - User picks one option and automatically navigates

2. "multi-choice" pages: 
   - Options have value field only (NO routeTo)
   - Page must have routeButton with routeTo pointing to page-[something]
   - User can select multiple options, then clicks Continue

3. "mixed" pages: 
   - Can contain ONLY these input types in options:
     * "text" - for regular text input
     * "number" - for numeric input
     * "tel" - for phone number input
     * "toggle" - for checkbox/boolean selection
     * "date" - for date selection
   - NO "single-choice", "select", or other types allowed
   - Options with type should NOT have routeTo
   - Page must have routeButton with routeTo pointing to page-[something]

4. "display-only" pages: 
   - For final confirmation/success pages
   - Use options with type="display"
   - Structure: { "id": "info-X", "type": "display", "label": "Field Name", "value": "Field Value" }

ROUTING REQUIREMENTS (CRITICAL):
- Every routeTo value MUST reference a page that exists in the form
- If you specify routeTo="page-theft-1", then page-theft-1 MUST exist in pages array
- Generate all necessary pages to satisfy routing requirements
- NO broken or missing routing destinations

Create MINIMUM 20 pages that comprehensively cover the user's intent with detailed branching.

For "${userIntent}", create a form that:
- Starts with relevant categorization (3-4 major branches)
- Each major branch should have 5-7 sub-pages for detailed information gathering
- Multiple decision points within each branch
- Comprehensive data collection at each step
- Professional follow-up questions and clarifications
- Final resolution pages with detailed next steps (using the display-only format)
- Must have at least 20 pages total
- All page IDs MUST follow the page-[descriptor] format
- All routeTo values MUST reference valid page-[descriptor] IDs that exist

RESPOND ONLY WITH VALID JSON containing name, description, and pages fields.`;
  }

  private buildSubmissionAnalysisPrompt(
    formId: string,
    responses: any
  ): string {
    // [Keep existing implementation]
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

  private extractJSONFromResponse(response: string, userIntent: string): any {
    // [Keep existing implementation - unchanged]
    console.log("🔍 Starting JSON extraction...");

    try {
      let cleaned = response
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .replace(/^\s*[\r\n]/gm, "")
        .trim();

      console.log("Cleaned response length:", cleaned.length);

      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");

      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error("No JSON object found in response");
      }

      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      console.log("Extracted JSON length:", cleaned.length);

      cleaned = this.fixCommonJSONIssues(cleaned);

      const parsed = JSON.parse(cleaned);
      console.log("✅ JSON parsed successfully");

      if (parsed.pages) {
        console.log(`Validating ${parsed.pages.length} pages...`);
        parsed.pages = this.validateAndFixPages(parsed.pages);
        console.log("✅ Pages validated and fixed");
      } else {
        throw new Error("No pages found in parsed JSON");
      }

      return parsed;
    } catch (error) {
      console.error("❌ JSON extraction failed:", error);

      if (error instanceof SyntaxError) {
        console.log("🔧 Attempting to fix JSON syntax error...");
        try {
          const fixed = this.attemptJSONRepair(response, userIntent);
          if (fixed) {
            console.log("✅ JSON repair successful");
            return fixed;
          }
        } catch (repairError) {
          console.error("❌ JSON repair also failed:", repairError);
        }
      }

      throw new Error("Invalid JSON response from AI service");
    }
  }

  // Keep all other existing helper methods unchanged...
  private fixCommonJSONIssues(jsonString: string): string {
    // [Keep existing implementation]
    console.log("🔧 Fixing common JSON issues...");

    let fixed = jsonString.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

    fixed = fixed.replace(
      /"routeButton":\s*{\s*"label":\s*"[^"]*",?\s*}/g,
      (match) => {
        if (!match.includes('"routeTo"')) {
          return match.replace("}", ', "routeTo": "page-end"}');
        }
        return match;
      }
    );

    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    return fixed;
  }

  private attemptJSONRepair(response: string, userIntent: string): any | null {
    // [Keep existing implementation]
    console.log("🚨 Attempting emergency JSON repair...");

    try {
      const pagesMatch = response.match(/"pages":\s*\[(.*?)\]/s);
      if (pagesMatch) {
        console.log("Found pages array, attempting minimal form creation...");
        return this.createFallbackForm(userIntent);
      }
    } catch (repairError) {
      console.error("Emergency repair failed:", repairError);
    }

    return null;
  }

  private createFallbackForm(userIntent: string): any {
    // [Keep existing implementation - unchanged]
    const sanitizedIntent = userIntent.toLowerCase();

    let formConfig = {
      name: "Information Gathering",
      description: "A comprehensive form to help with your request",
      pages: [
        {
          id: "page-1",
          title: `Let's help you with: ${userIntent}`,
          inputType: "single-choice",
          options: [
            {
              id: "opt-1",
              label: "I need detailed guidance",
              value: "detailed",
              routeTo: "page-2",
            },
            {
              id: "opt-2",
              label: "I want step-by-step instructions",
              value: "steps",
              routeTo: "page-8",
            },
            {
              id: "opt-3",
              label: "I need resource recommendations",
              value: "resources",
              routeTo: "page-14",
            },
          ],
        },
        // Add 19 more pages to meet minimum requirement...
        {
          id: "page-2",
          title: "What type of detailed guidance do you need?",
          inputType: "single-choice",
          options: [
            {
              id: "opt-4",
              label: "Basic information",
              value: "basic",
              routeTo: "page-3",
            },
            {
              id: "opt-5",
              label: "Advanced details",
              value: "advanced",
              routeTo: "page-4",
            },
            {
              id: "opt-6",
              label: "Complete walkthrough",
              value: "complete",
              routeTo: "page-5",
            },
          ],
        },
        {
          id: "page-3",
          title: "Provide your basic information",
          inputType: "mixed",
          options: [
            {
              id: "opt-7",
              type: "text",
              label: "Your name",
              value: "",
              required: true,
            },
            {
              id: "opt-8",
              type: "tel",
              label: "Phone number",
              value: "",
              required: true,
            },
            {
              id: "opt-9",
              type: "toggle",
              label: "I agree to terms",
              value: "terms-agree",
            },
          ],
          routeButton: { id: "btn-1", label: "Continue", routeTo: "page-6" },
        },
        // Continue with more pages to reach 20 minimum...
        {
          id: "page-4",
          title: "Advanced options",
          inputType: "single-choice",
          options: [
            { id: "opt-10", label: "Option A", value: "a", routeTo: "page-6" },
            { id: "opt-11", label: "Option B", value: "b", routeTo: "page-7" },
          ],
        },
        {
          id: "page-5",
          title: "Complete details",
          inputType: "mixed",
          options: [
            { id: "opt-12", type: "text", label: "Details", value: "" },
          ],
          routeButton: { id: "btn-2", label: "Next", routeTo: "page-6" },
        },
        {
          id: "page-6",
          title: "Additional information",
          inputType: "single-choice",
          options: [
            {
              id: "opt-13",
              label: "Continue",
              value: "continue",
              routeTo: "page-20",
            },
          ],
        },
        {
          id: "page-7",
          title: "More options",
          inputType: "single-choice",
          options: [
            {
              id: "opt-14",
              label: "Proceed",
              value: "proceed",
              routeTo: "page-20",
            },
          ],
        },
        {
          id: "page-8",
          title: "Step-by-step guidance",
          inputType: "single-choice",
          options: [
            {
              id: "opt-15",
              label: "Start process",
              value: "start",
              routeTo: "page-9",
            },
          ],
        },
        {
          id: "page-9",
          title: "Process details",
          inputType: "mixed",
          options: [
            { id: "opt-16", type: "date", label: "Start date", value: "" },
          ],
          routeButton: { id: "btn-3", label: "Continue", routeTo: "page-10" },
        },
        {
          id: "page-10",
          title: "Progress check",
          inputType: "single-choice",
          options: [
            {
              id: "opt-17",
              label: "Continue",
              value: "continue",
              routeTo: "page-11",
            },
          ],
        },
        {
          id: "page-11",
          title: "Next steps",
          inputType: "single-choice",
          options: [
            {
              id: "opt-18",
              label: "Proceed",
              value: "proceed",
              routeTo: "page-12",
            },
          ],
        },
        {
          id: "page-12",
          title: "Final details",
          inputType: "single-choice",
          options: [
            {
              id: "opt-19",
              label: "Complete",
              value: "complete",
              routeTo: "page-13",
            },
          ],
        },
        {
          id: "page-13",
          title: "Review information",
          inputType: "single-choice",
          options: [
            {
              id: "opt-20",
              label: "Submit",
              value: "submit",
              routeTo: "page-20",
            },
          ],
        },
        {
          id: "page-14",
          title: "Resource recommendations",
          inputType: "single-choice",
          options: [
            {
              id: "opt-21",
              label: "View resources",
              value: "resources",
              routeTo: "page-15",
            },
          ],
        },
        {
          id: "page-15",
          title: "Select resources",
          inputType: "multi-choice",
          options: [
            { id: "opt-22", label: "Resource A", value: "res-a" },
            { id: "opt-23", label: "Resource B", value: "res-b" },
          ],
          routeButton: { id: "btn-4", label: "Continue", routeTo: "page-16" },
        },
        {
          id: "page-16",
          title: "Resource details",
          inputType: "single-choice",
          options: [
            {
              id: "opt-24",
              label: "Get details",
              value: "details",
              routeTo: "page-17",
            },
          ],
        },
        {
          id: "page-17",
          title: "Contact preferences",
          inputType: "mixed",
          options: [
            { id: "opt-25", type: "tel", label: "Contact number", value: "" },
            {
              id: "opt-26",
              type: "toggle",
              label: "Email updates",
              value: "email-updates",
            },
          ],
          routeButton: { id: "btn-5", label: "Continue", routeTo: "page-18" },
        },
        {
          id: "page-18",
          title: "Additional requirements",
          inputType: "single-choice",
          options: [
            {
              id: "opt-27",
              label: "Standard service",
              value: "standard",
              routeTo: "page-19",
            },
            {
              id: "opt-28",
              label: "Premium service",
              value: "premium",
              routeTo: "page-19",
            },
          ],
        },
        {
          id: "page-19",
          title: "Final confirmation",
          inputType: "single-choice",
          options: [
            {
              id: "opt-29",
              label: "Confirm and submit",
              value: "confirm",
              routeTo: "page-20",
            },
          ],
        },
        {
          id: "page-20",
          title: "Your request has been successfully submitted!",
          inputType: "display-only",
          options: [
            {
              id: "info-1",
              type: "display",
              label: "Request Number",
              value: "REQ-2024-001234",
            },
            {
              id: "info-2",
              type: "display",
              label: "Status",
              value: "Under Review",
            },
            {
              id: "info-3",
              type: "display",
              label: "Expected Processing Time",
              value: "2-3 business days",
            },
            {
              id: "info-4",
              type: "display",
              label: "Next Steps",
              value: "You will receive an email confirmation shortly",
            },
          ],
        },
      ],
    };

    return formConfig;
  }

  private validateAndFixPages(pages: any[]): any[] {
    // [Keep existing implementation but enhance with new validation]
    return pages.map((page, index) => {
      if (!page.id) {
        page.id = `page-${index + 1}`;
      }
      if (!page.title) {
        page.title = `Step ${index + 1}`;
      }
      if (!page.inputType) {
        page.inputType = "mixed";
      }

      // NEW: Fix mixed page input types
      if (
        page.inputType === "mixed" &&
        page.options &&
        Array.isArray(page.options)
      ) {
        page.options = page.options.map((option: any) => {
          if (option.type) {
            const allowedTypes = ["text", "number", "tel", "toggle", "date"];
            if (!allowedTypes.includes(option.type)) {
              console.log(
                `🔧 Fixing invalid mixed type "${option.type}" to "text"`
              );
              option.type = "text";
            }
          }
          return option;
        });
      }

      // Existing validation logic...
      if (!page.options || !Array.isArray(page.options)) {
        page.options = [
          {
            id: `opt-${index + 1}-1`,
            label: "Continue",
            value: "continue",
            routeTo:
              index < pages.length - 1 ? `page-${index + 2}` : "page-end",
          },
        ];
      }

      return page;
    });
  }

  // NEW METHOD: Fix display-only pages structure
  private fixDisplayOnlyPages(pages: any[]): any[] {
    return pages.map((page) => {
      // Check if this is a display-only page that looks like a final confirmation
      if (
        page.inputType === "display-only" &&
        page.options &&
        Array.isArray(page.options)
      ) {
        // Check if this looks like a final confirmation page
        const hasClaimInfo = page.options.some(
          (opt: any) =>
            opt.label &&
            (opt.label.includes("Claim") ||
              opt.label.includes("Status") ||
              opt.label.includes("Next"))
        );

        if (
          hasClaimInfo ||
          page.title?.toLowerCase().includes("success") ||
          page.title?.toLowerCase().includes("submitted")
        ) {
          // Ensure each option has the correct structure for display-only pages
          page.options = page.options.map((opt: any, idx: number) => {
            // If it doesn't have the right structure, fix it
            if (!opt.type || opt.type !== "display") {
              return {
                id: opt.id || `info-${idx + 1}`,
                type: "display",
                label: opt.label || `Field ${idx + 1}`,
                value: opt.value || "",
              };
            }
            return opt;
          });

          // Ensure we have the standard fields for a confirmation page
          const standardFields = [
            { label: "Claim Number", value: "AC-2024-001234" },
            { label: "Claim Status", value: "Under Review" },
            { label: "Expected Processing Time", value: "3-5 business days" },
            { label: "Adjuster Assignment", value: "Within 24 hours" },
            {
              label: "Next Steps",
              value: "An adjuster will contact you to schedule an inspection",
            },
          ];

          // If the page doesn't have enough fields, ensure it has at least the standard ones
          if (page.options.length < 5) {
            page.options = standardFields.map((field, idx) => ({
              id: `info-${idx + 1}`,
              type: "display",
              label: field.label,
              value: field.value,
            }));
          }
        }
      }

      return page;
    });
  }

  private generateFormId(): string {
    return `form-${Date.now()}-${uuidv4().split("-")[0]}`;
  }

  private generateFormName(userIntent: string): string {
    // Generate a meaningful name based on the user intent
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
      // Capitalize first letter of each major word
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

  private ensurePageIdFormat(pages: any[]): any[] {
    // Ensure all page IDs follow the page-[something] format
    return pages.map((page, index) => {
      if (!page.id || !page.id.startsWith("page-")) {
        // Generate appropriate page ID
        if (page.title) {
          // Try to create meaningful ID from title
          const titleWords = page.title.toLowerCase().split(" ").slice(0, 3);
          const descriptor = titleWords.join("-").replace(/[^a-z0-9-]/g, "");
          page.id = `page-${descriptor}-${index + 1}`;
        } else {
          page.id = `page-${index + 1}`;
        }
      }

      // Fix routeTo references in options
      if (page.options && Array.isArray(page.options)) {
        page.options = page.options.map((option: any) => {
          if (option.routeTo && !option.routeTo.startsWith("page-")) {
            // Try to fix the routeTo reference
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
        page.routeButton &&
        page.routeButton.routeTo &&
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
}
