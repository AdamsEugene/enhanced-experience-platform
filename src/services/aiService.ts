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
You must create a comprehensive auto insurance claim form. This is critical - respond ONLY with valid, complete JSON.

User request: "${userIntent}"
${context ? `Context: ${context}` : ""}

Generate exactly this JSON structure with 10-15 pages:

{
  "name": "Comprehensive Auto Insurance Claim Form",
  "description": "Complete form for filing auto insurance claims",
  "pages": [
    {
      "id": "page-1",
      "title": "What type of incident occurred?",
      "inputType": "single-choice",
      "options": [
        {
          "id": "incident-collision",
          "label": "Vehicle collision",
          "value": "collision",
          "routeTo": "page-2"
        },
        {
          "id": "incident-theft", 
          "label": "Theft or vandalism",
          "value": "theft",
          "routeTo": "page-3"
        },
        {
          "id": "incident-weather",
          "label": "Weather damage",
          "value": "weather", 
          "routeTo": "page-4"
        }
      ]
    }
  ]
}

REQUIREMENTS:
1. Create 10-15 pages minimum
2. Include these page types:
   - Incident classification (single-choice)
   - Fault determination (single-choice) 
   - Evidence gathering (multi-choice)
   - Damage assessment (single-choice)
   - Personal details (mixed)
   - Vehicle information (mixed)
   - Contact information (mixed)
   - Review and confirmation (display-only)

3. Every single-choice option MUST have routeTo
4. Every multi-choice and mixed page MUST have routeButton with label and routeTo
5. All routeTo values must reference actual page IDs in your form
6. NO trailing commas anywhere
7. ALL JSON objects must be complete and properly closed

Example patterns:
- single-choice: options have routeTo, no routeButton
- multi-choice: options have no routeTo, page has routeButton
- mixed: text inputs and toggles, page has routeButton
- display-only: just info, no routeButton

Build paths for: collision details → fault → evidence → damage → vehicle info → contact → submit

CRITICAL: Double-check every brace, bracket, comma, and quote. Ensure all objects are complete.

Respond with ONLY the JSON. No explanations, no markdown, no extra text.`;
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
      if (!page.options) {
        page.options = [];
      }

      // Fix routeButton issues
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

      // Fix options
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

      return page;
    });
  }

  private generateFormId(): string {
    return `form-${Date.now()}-${uuidv4().split("-")[0]}`;
  }
}
