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

        // Ensure the last page is properly formatted as display-only
        result.pages = this.ensureFinalPageFormat(result.pages, userIntent);

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

      // Ensure the last page is properly formatted
      editedForm.pages = this.ensureFinalPageFormat(
        editedForm.pages,
        editedForm.generatedFrom || "form submission"
      );

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

  private ensureFinalPageFormat(pages: any[], userIntent: string): any[] {
    if (!pages || pages.length === 0) {
      return pages;
    }

    // Find the last page
    const lastPageIndex = pages.length - 1;
    const lastPage = pages[lastPageIndex];

    // Check if the last page is already display-only
    if (lastPage.inputType === "display-only") {
      // Ensure it has the correct structure
      if (!lastPage.options || lastPage.options.length === 0) {
        lastPage.options = this.generateDefaultCompletionOptions(userIntent);
      }

      // Ensure options have the correct format
      lastPage.options = lastPage.options.map((opt: any, index: number) => ({
        id: opt.id || `info-${index + 1}`,
        type: "display",
        label: opt.label || this.getDefaultLabel(index),
        value: opt.value || this.getDefaultValue(index),
      }));

      // Remove any routeButton or routeTo from display-only page
      delete lastPage.routeButton;
      lastPage.options.forEach((opt: any) => delete opt.routeTo);
    } else {
      // Convert the last page to display-only format or add a new completion page
      const completionPage = {
        id: `page-completion`,
        title: this.generateCompletionTitle(userIntent),
        order: pages.length,
        inputType: "display-only",
        options: this.generateDefaultCompletionOptions(userIntent),
      };

      // Check if we should replace or add
      if (
        (lastPage.title && lastPage.title.toLowerCase().includes("submit")) ||
        (lastPage.title && lastPage.title.toLowerCase().includes("complete")) ||
        (lastPage.title && lastPage.title.toLowerCase().includes("success"))
      ) {
        // Replace the last page
        pages[lastPageIndex] = completionPage;
      } else {
        // Add a new completion page
        pages.push(completionPage);

        // Update the second-to-last page to route to the completion page
        if (pages.length > 1) {
          const secondToLast = pages[pages.length - 2];
          if (
            secondToLast.inputType === "single-choice" &&
            secondToLast.options
          ) {
            // Update all options to route to completion
            secondToLast.options.forEach((opt: any) => {
              if (!opt.routeTo || opt.routeTo === lastPage.id) {
                opt.routeTo = "page-completion";
              }
            });
          } else if (secondToLast.routeButton) {
            secondToLast.routeButton.routeTo = "page-completion";
          }
        }
      }
    }

    return pages;
  }

  private generateCompletionTitle(userIntent: string): string {
    const lowerIntent = userIntent.toLowerCase();

    if (lowerIntent.includes("insurance") || lowerIntent.includes("claim")) {
      return "Your insurance claim has been successfully submitted!";
    } else if (
      lowerIntent.includes("appointment") ||
      lowerIntent.includes("schedule")
    ) {
      return "Your appointment request has been submitted!";
    } else if (
      lowerIntent.includes("return") ||
      lowerIntent.includes("refund")
    ) {
      return "Your return request has been successfully submitted!";
    } else if (
      lowerIntent.includes("support") ||
      lowerIntent.includes("help")
    ) {
      return "Your support request has been submitted!";
    } else if (
      lowerIntent.includes("application") ||
      lowerIntent.includes("apply")
    ) {
      return "Your application has been successfully submitted!";
    } else {
      return "Your form has been successfully submitted!";
    }
  }

  private generateDefaultCompletionOptions(userIntent: string): any[] {
    const lowerIntent = userIntent.toLowerCase();

    if (lowerIntent.includes("insurance") || lowerIntent.includes("claim")) {
      return [
        {
          id: "info-1",
          type: "display",
          label: "Claim Number",
          value: `CLM-${Date.now().toString().slice(-8)}`,
        },
        {
          id: "info-2",
          type: "display",
          label: "Claim Status",
          value: "Under Review",
        },
        {
          id: "info-3",
          type: "display",
          label: "Expected Processing Time",
          value: "3-5 business days",
        },
        {
          id: "info-4",
          type: "display",
          label: "Adjuster Assignment",
          value: "Within 24 hours",
        },
        {
          id: "info-5",
          type: "display",
          label: "Next Steps",
          value: "An adjuster will contact you to schedule an inspection",
        },
      ];
    } else {
      return [
        {
          id: "info-1",
          type: "display",
          label: "Reference Number",
          value: `REF-${Date.now().toString().slice(-8)}`,
        },
        {
          id: "info-2",
          type: "display",
          label: "Status",
          value: "Submitted Successfully",
        },
        {
          id: "info-3",
          type: "display",
          label: "Processing Time",
          value: "2-3 business days",
        },
        {
          id: "info-4",
          type: "display",
          label: "Next Steps",
          value: "We will review your submission and contact you soon",
        },
        {
          id: "info-5",
          type: "display",
          label: "Contact",
          value: "Check your email for confirmation",
        },
      ];
    }
  }

  private getDefaultLabel(index: number): string {
    const labels = [
      "Reference Number",
      "Status",
      "Processing Time",
      "Next Steps",
      "Additional Information",
    ];
    return labels[index] || `Information ${index + 1}`;
  }

  private getDefaultValue(index: number): string {
    const values = [
      `REF-${Date.now().toString().slice(-8)}`,
      "Submitted Successfully",
      "2-3 business days",
      "We will review your submission",
      "Check your email for updates",
    ];
    return values[index] || `Value ${index + 1}`;
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
            "You are an expert at editing and improving forms. You will regenerate an entire form based on modifications requested, maintaining the core purpose while implementing the requested changes. Always return valid JSON only. THE LAST PAGE MUST BE display-only type with options array containing display items.",
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
        prompt += `- THE LAST PAGE MUST BE display-only type with success confirmation\n`;
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

    // Add common requirements including final page format
    prompt += `\n\nREQUIREMENTS:
- Return the COMPLETE modified form as valid JSON
- MUST include "name" and "description" fields at top level
- Maintain consistency in page IDs and routing
- ALL page IDs MUST use format: page-[descriptor] (e.g., page-1, page-theft-1)
- ALL routeTo values must reference valid page-[descriptor] IDs
- For single-choice pages: options have routeTo, no routeButton
- For multi-choice/mixed pages: routeButton required
- For display-only pages: no options array OR options with type:"display"
- Minimum ${editRequest.minPages || 20} pages total
- Professional, thorough approach

CRITICAL FINAL PAGE REQUIREMENT:
The LAST page of the form MUST be a display-only confirmation page with this structure:
{
  "id": "page-[completion/final/success]",
  "title": "[Success/completion message]",
  "inputType": "display-only",
  "options": [
    { "id": "info-1", "type": "display", "label": "[Label]", "value": "[Value]" },
    { "id": "info-2", "type": "display", "label": "[Label]", "value": "[Value]" },
    // ... more display items
  ]
}
NO routeButton, NO routeTo in the final page.

RESPOND ONLY WITH VALID JSON containing name, description, and pages fields.`;

    return prompt;
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

STRUCTURE RULES:
1. "single-choice" pages: Options have routeTo field pointing to page-[something], no routeButton
2. "multi-choice" pages: Options without routeTo, page has routeButton with routeTo to page-[something]
3. "mixed" pages: Mix of text inputs and options, page has routeButton  
4. "display-only" pages: Options array with type:"display" items, NO routeButton, NO routeTo

CRITICAL FINAL PAGE REQUIREMENT:
The LAST page of the form MUST ALWAYS be a display-only confirmation/success page with this exact structure:
{
  "id": "page-[completion/final/success/etc]",
  "title": "Your [form type] has been successfully submitted!",
  "inputType": "display-only",
  "options": [
    { "id": "info-1", "type": "display", "label": "Reference Number", "value": "[generated number]" },
    { "id": "info-2", "type": "display", "label": "Status", "value": "Submitted/Under Review" },
    { "id": "info-3", "type": "display", "label": "Processing Time", "value": "[timeframe]" },
    { "id": "info-4", "type": "display", "label": "Next Steps", "value": "[what happens next]" },
    { "id": "info-5", "type": "display", "label": "Additional Info", "value": "[contact/confirmation details]" }
  ]
}
This final page must have NO routeButton and NO routeTo fields anywhere.

Create MINIMUM 20 pages that comprehensively cover the user's intent with detailed branching.

For "${userIntent}", create a form that:
- Starts with relevant categorization (3-4 major branches)
- Each major branch should have 5-7 sub-pages for detailed information gathering
- Multiple decision points within each branch
- Comprehensive data collection at each step
- Professional follow-up questions and clarifications
- ENDS with a display-only success/confirmation page (NO routing from this page)
- Must have at least 20 pages total
- All page IDs MUST follow the page-[descriptor] format
- All routeTo values MUST reference valid page-[descriptor] IDs

RESPOND ONLY WITH VALID JSON containing name, description, and pages fields.`;
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

  private extractJSONFromResponse(response: string, userIntent: string): any {
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
      } else if (!parsed.summary) {
        // Only throw if it's not an analysis response
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

  private fixCommonJSONIssues(jsonString: string): string {
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
    const sanitizedIntent = userIntent.toLowerCase();

    let formConfig = {
      name: this.generateFormName(userIntent),
      description: this.generateFormDescription(userIntent),
      pages: [
        {
          id: "page-1",
          title: `Let's help you with: ${userIntent}`,
          order: 1,
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
        // ... Add minimal pages here
        {
          id: "page-completion",
          title: this.generateCompletionTitle(userIntent),
          order: 20,
          inputType: "display-only",
          options: this.generateDefaultCompletionOptions(userIntent),
        },
      ],
    };

    return formConfig;
  }

  private validateAndFixPages(pages: any[]): any[] {
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

      // Fix options structure
      if (page.inputType === "single-choice" && page.options) {
        page.options = page.options.map((opt: any) => {
          if (!opt.routeTo) {
            opt.routeTo = `page-${index + 2}`;
          }
          return opt;
        });
        delete page.routeButton;
      } else if (
        (page.inputType === "multi-choice" || page.inputType === "mixed") &&
        page.options
      ) {
        page.options = page.options.map((opt: any) => {
          delete opt.routeTo;
          return opt;
        });

        if (!page.routeButton) {
          page.routeButton = {
            id: `route-btn-${index}`,
            label: "Continue",
            routeTo: `page-${index + 2}`,
          };
        } else if (!page.routeButton.routeTo) {
          page.routeButton.routeTo = `page-${index + 2}`;
        }
      } else if (page.inputType === "display-only") {
        delete page.routeButton;
        if (page.options) {
          page.options = page.options.map((opt: any) => {
            delete opt.routeTo;
            if (!opt.type) {
              opt.type = "display";
            }
            return opt;
          });
        }
      }

      if (!page.order) {
        page.order = index + 1;
      }

      return page;
    });
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

      // Fix routeTo references in options
      if (page.options && Array.isArray(page.options)) {
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
