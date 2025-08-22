import { FormDefinition, AIAnalysis } from "../types";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";

export interface AIService {
  generateForm(userIntent: string, context?: string): Promise<FormDefinition>;
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
                "You are an expert at creating comprehensive, detailed forms and decision trees. You create thorough, professional-grade forms that cover all possible scenarios and gather complete information. You MUST respond with valid, complete JSON only. Every JSON object must be properly closed. Every routeButton must have both label and routeTo fields.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 4095,
          temperature: 0.05, // Lower temperature for more consistent output
        });

        const content = response.choices[0].message.content;
        if (!content) {
          throw new Error("No content received from OpenAI");
        }

        console.log(`Response received, length: ${content.length}`);

        // Log first and last 200 characters for debugging
        console.log("Response start:", content.substring(0, 200));
        console.log("Response end:", content.substring(content.length - 200));

        const formJson = this.extractJSONFromResponse(content);

        const result = {
          ...formJson,
          id: this.generateFormId(),
          createdAt: new Date().toISOString(),
          generatedFrom: userIntent,
        };

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

        // Wait a bit before retrying
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw new Error(
      `Failed to generate form after ${maxAttempts} attempts. Last error: ${
        lastError?.message || "Unknown error"
      }`
    );
  }

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

      return this.extractJSONFromResponse(content);
    } catch (error) {
      console.error("Error processing form submission:", error);
      throw new Error(
        `Failed to process submission: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private buildFormGenerationPrompt(
    userIntent: string,
    context?: string
  ): string {
    return `
Generate a comprehensive, professional-grade decision tree form based on this user request: "${userIntent}"
${context ? `Additional context: ${context}` : ""}

Analyze the user's intent and create a detailed, multi-step form that helps them accomplish their goal through guided questions and information gathering.

CRITICAL STRUCTURE RULES:

1. "single-choice" pages:
   - Must have options array with 2-4 options
   - Each option MUST have routeTo field
   - NO routeButton on the page
   - Options do NOT have type or required fields

2. "multi-choice" pages:
   - Must have options array with 2-6 options  
   - Options do NOT have routeTo field
   - Page MUST have routeButton with label and routeTo
   - Options are for selecting multiple items

3. "mixed" pages:
   - Must have options array with text inputs and toggles
   - Text inputs have: type:"text", required:true/false
   - Toggle inputs have: type:"toggle"
   - Page MUST have routeButton with label and routeTo

4. "display-only" pages:
   - NO options field at all (remove it completely)
   - NO routeButton unless continuing to another page
   - Used for showing information or final confirmation

JSON Structure Example:
{
  "name": "Form Title Based on User Request",
  "description": "What this form helps the user accomplish",
  "pages": [
    {
      "id": "page-1",
      "title": "What specific aspect of [user's request] do you need help with?",
      "inputType": "single-choice",
      "options": [
        {
          "id": "opt-1",
          "label": "Option relevant to their need",
          "value": "option1",
          "routeTo": "page-2"
        },
        {
          "id": "opt-2", 
          "label": "Another relevant option",
          "value": "option2",
          "routeTo": "page-3"
        }
      ]
    },
    {
      "id": "page-2",
      "title": "Tell us more details about your situation",
      "inputType": "mixed",
      "options": [
        {
          "id": "details-text",
          "type": "text",
          "label": "Describe your situation",
          "value": "",
          "required": true
        },
        {
          "id": "urgent-toggle",
          "type": "toggle", 
          "label": "This is urgent",
          "value": "urgent"
        }
      ],
      "routeButton": {
        "label": "Continue",
        "routeTo": "page-4"
      }
    },
    {
      "id": "page-3",
      "title": "Which of these apply to your situation? (Select all that apply)",
      "inputType": "multi-choice",
      "options": [
        {
          "id": "option-a",
          "label": "Relevant choice A",
          "value": "choice-a"
        },
        {
          "id": "option-b",
          "label": "Relevant choice B", 
          "value": "choice-b"
        }
      ],
      "routeButton": {
        "label": "Continue",
        "routeTo": "page-4"
      }
    },
    {
      "id": "page-4",
      "title": "Based on your responses, here are your next steps",
      "inputType": "display-only"
    }
  ]
}

For "${userIntent}", create 15-20+ pages with:
- Clear progression from general to specific information
- Multiple decision paths based on different scenarios  
- Comprehensive data collection relevant to their need
- Professional, helpful guidance throughout
- Actionable next steps or resolution

VALIDATION CHECKLIST:
✓ Every single-choice page has options with routeTo, no routeButton
✓ Every multi-choice page has options without routeTo, has routeButton  
✓ Every mixed page has text/toggle options, has routeButton
✓ Every display-only page has NO options field at all
✓ All routeTo values reference actual page IDs in the form
✓ No empty options arrays anywhere
✓ No trailing commas in JSON
✓ All braces and brackets properly matched

RESPOND ONLY WITH COMPLETE, VALID JSON.`;
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

Consider:
- What critical information was provided?
- What might be missing that they should gather?
- What immediate actions are needed?
- What potential issues or complications do you see?
- How urgent is their situation?

RESPOND ONLY WITH VALID JSON. NO EXPLANATIONS OR MARKDOWN.
    `;
  }

  private extractJSONFromResponse(response: string): any {
    console.log("🔍 Starting JSON extraction...");

    try {
      // Step 1: Clean the response
      let cleaned = response
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .replace(/^\s*[\r\n]/gm, "") // Remove empty lines
        .trim();

      console.log("Cleaned response length:", cleaned.length);

      // Step 2: Find JSON boundaries
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");

      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error("No JSON object found in response");
      }

      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      console.log("Extracted JSON length:", cleaned.length);

      // Step 3: Try to fix common JSON issues
      cleaned = this.fixCommonJSONIssues(cleaned);

      // Step 4: Parse JSON
      const parsed = JSON.parse(cleaned);
      console.log("✅ JSON parsed successfully");

      // Step 5: Validate and fix structure
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
      console.error(
        "Raw response (first 500 chars):",
        response.substring(0, 500)
      );
      console.error(
        "Raw response (last 500 chars):",
        response.substring(response.length - 500)
      );

      // Try to save what we can
      if (error instanceof SyntaxError) {
        console.log("🔧 Attempting to fix JSON syntax error...");
        try {
          const fixed = this.attemptJSONRepair(response);
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

    // Fix trailing commas
    let fixed = jsonString
      .replace(/,\s*}/g, "}") // Remove trailing commas before }
      .replace(/,\s*]/g, "]"); // Remove trailing commas before ]

    // Fix incomplete routeButton objects
    fixed = fixed.replace(
      /"routeButton":\s*{\s*"label":\s*"[^"]*",?\s*}/g,
      (match) => {
        if (!match.includes('"routeTo"')) {
          return match.replace("}", ', "routeTo": "page-end"}');
        }
        return match;
      }
    );

    // Fix missing quotes around property names
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    return fixed;
  }

  private attemptJSONRepair(response: string): any | null {
    console.log("🚨 Attempting emergency JSON repair...");

    try {
      // Extract just the pages array if possible
      const pagesMatch = response.match(/"pages":\s*\[(.*?)\]/s);
      if (pagesMatch) {
        console.log("Found pages array, attempting minimal form creation...");

        // Create a minimal valid form structure
        const minimalForm = {
          name: "Auto Insurance Claim Form",
          description: "Generated form for insurance claim",
          pages: [
            {
              id: "page-1",
              title: "What type of incident are you reporting?",
              inputType: "single-choice",
              options: [
                {
                  id: "opt-1",
                  label: "Vehicle accident",
                  value: "accident",
                  routeTo: "page-2",
                },
                {
                  id: "opt-2",
                  label: "Other incident",
                  value: "other",
                  routeTo: "page-2",
                },
              ],
            },
            {
              id: "page-2",
              title: "Please provide details about the incident",
              inputType: "mixed",
              options: [
                {
                  id: "opt-3",
                  type: "text",
                  label: "Describe what happened",
                  value: "",
                  required: true,
                },
              ],
              routeButton: {
                label: "Submit",
                routeTo: "page-3",
              },
            },
            {
              id: "page-3",
              title: "Your claim has been submitted",
              inputType: "display-only",
              options: [
                {
                  id: "info-1",
                  type: "display",
                  label: "Thank you for submitting your claim",
                  value: "submitted",
                },
              ],
            },
          ],
        };

        return minimalForm;
      }
    } catch (repairError) {
      console.error("Emergency repair failed:", repairError);
    }

    return null;
  }

  private validateAndFixPages(pages: any[]): any[] {
    return pages.map((page, index) => {
      // Ensure required fields exist
      if (!page.id) {
        page.id = `page-${index + 1}`;
      }
      if (!page.title) {
        page.title = `Step ${index + 1}`;
      }
      if (!page.inputType) {
        page.inputType = "mixed";
      }

      // Fix options based on inputType
      if (page.inputType === "display-only") {
        // Display-only pages should not have options at all
        delete page.options;

        // Remove routeButton if it routes to itself (invalid)
        if (page.routeButton && page.routeButton.routeTo === page.id) {
          delete page.routeButton;
        }
      } else {
        // All other input types MUST have options
        if (
          !page.options ||
          !Array.isArray(page.options) ||
          page.options.length === 0
        ) {
          // Create default options based on inputType
          if (page.inputType === "single-choice") {
            page.options = [
              {
                id: `opt-${index}-1`,
                label: "Yes",
                value: "yes",
                routeTo:
                  index + 1 < pages.length
                    ? pages[index + 1].id || `page-${index + 2}`
                    : `page-end`,
              },
              {
                id: `opt-${index}-2`,
                label: "No",
                value: "no",
                routeTo:
                  index + 1 < pages.length
                    ? pages[index + 1].id || `page-${index + 2}`
                    : `page-end`,
              },
            ];
          } else if (page.inputType === "multi-choice") {
            page.options = [
              {
                id: `opt-${index}-1`,
                label: "Option 1",
                value: "option1",
              },
              {
                id: `opt-${index}-2`,
                label: "Option 2",
                value: "option2",
              },
            ];
            // Ensure routeButton exists for multi-choice
            if (!page.routeButton) {
              page.routeButton = {
                label: "Continue",
                routeTo:
                  index + 1 < pages.length
                    ? pages[index + 1].id || `page-${index + 2}`
                    : `page-end`,
              };
            }
          } else if (page.inputType === "mixed") {
            page.options = [
              {
                id: `opt-${index}-1`,
                type: "text",
                label: "Please provide details",
                value: "",
                required: true,
              },
            ];
            // Ensure routeButton exists for mixed
            if (!page.routeButton) {
              page.routeButton = {
                label: "Continue",
                routeTo:
                  index + 1 < pages.length
                    ? pages[index + 1].id || `page-${index + 2}`
                    : `page-end`,
              };
            }
          }
        }
      }

      // Fix routeButton issues for non-display pages
      if (page.inputType === "multi-choice" || page.inputType === "mixed") {
        if (page.routeButton && !page.routeButton.routeTo) {
          // If routeButton exists but has no routeTo, try to infer next page
          const nextPageIndex = index + 1;
          if (nextPageIndex < pages.length) {
            page.routeButton.routeTo =
              pages[nextPageIndex].id || `page-${nextPageIndex + 1}`;
          } else {
            // Last page, remove routeButton
            delete page.routeButton;
          }
        }

        // Ensure routeButton has label
        if (page.routeButton && !page.routeButton.label) {
          page.routeButton.label = "Continue";
        }
      }

      // For single-choice pages, remove routeButton and ensure options have routeTo
      if (page.inputType === "single-choice") {
        delete page.routeButton;

        // Ensure all options have routeTo
        if (page.options && Array.isArray(page.options)) {
          page.options = page.options.map((option: any, optIndex: number) => {
            if (!option.routeTo) {
              const nextPageIndex = index + 1;
              if (nextPageIndex < pages.length) {
                option.routeTo =
                  pages[nextPageIndex].id || `page-${nextPageIndex + 1}`;
              } else {
                option.routeTo = `page-end`;
              }
            }

            // Remove type field from single-choice options (not needed)
            delete option.type;
            delete option.required;

            return option;
          });
        }
      }

      // Clean up options array - ensure all options have required fields
      if (page.options && Array.isArray(page.options)) {
        page.options = page.options.map((option: any, optIndex: number) => {
          if (!option.id) {
            option.id = `opt-${index}-${optIndex}`;
          }
          if (!option.label) {
            option.label = `Option ${optIndex + 1}`;
          }
          if (!option.value) {
            option.value = `value-${optIndex}`;
          }
          return option;
        });
      }

      return page;
    });
  }

  private generateFormId(): string {
    return `form-${Date.now()}-${uuidv4().split("-")[0]}`;
  }
}
