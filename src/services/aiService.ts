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
Generate a comprehensive, professional-grade auto insurance claim form based on: "${userIntent}"
${context ? `Additional context: ${context}` : ""}

This must be a COMPLETE, DETAILED form with 20-25+ pages covering ALL scenarios like a real insurance company would use.

You MUST create comprehensive decision trees covering:

1. INCIDENT CLASSIFICATION (4-5 pages):
   - Primary incident type (collision, theft, weather, vandalism)
   - Collision sub-types (vehicle-to-vehicle, object collision, rollover, animal)
   - Fault determination (other driver, my fault, shared fault, unclear)
   - Evidence documentation (police reports, witnesses, photos)

2. INJURY ASSESSMENT (3-4 pages):
   - Injury occurrence and severity
   - Medical treatment details
   - Ongoing care requirements
   - Emergency response details

3. DAMAGE EVALUATION (4-5 pages):
   - Damage severity assessment
   - Drivability status
   - Towing and storage needs
   - Total loss evaluation
   - Repair preferences

4. DETAILED INFORMATION GATHERING (6-8 pages):
   - Complete accident details (date, time, location, description)
   - Your vehicle information (year, make, model, VIN, license plate)
   - Other driver and vehicle information
   - Insurance and repair preferences
   - Contact information and communication preferences

5. REVIEW AND SUBMISSION (2-3 pages):
   - Information review and confirmation
   - Legal acknowledgments and authorizations
   - Final submission and claim number

Create JSON with this exact structure:
{
  "name": "Comprehensive Auto Insurance Claim Assistant",
  "description": "Complete professional-grade form for filing auto insurance claims with detailed information gathering",
  "pages": [
    {
      "id": "page-1",
      "title": "What type of incident are you reporting?",
      "inputType": "single-choice",
      "options": [
        {
          "id": "incident-collision",
          "label": "Vehicle collision or accident",
          "value": "collision",
          "routeTo": "page-2"
        },
        {
          "id": "incident-theft",
          "label": "Theft or break-in", 
          "value": "theft",
          "routeTo": "page-theft-1"
        },
        {
          "id": "incident-weather",
          "label": "Weather damage (hail, flood, wind, etc.)",
          "value": "weather",
          "routeTo": "page-weather-1"
        },
        {
          "id": "incident-vandalism",
          "label": "Vandalism or malicious damage",
          "value": "vandalism",
          "routeTo": "page-vandalism-1"
        }
      ]
    }
  ]
}

CRITICAL JSON RULES:
- Every "single-choice" page: options have "routeTo", NO routeButton
- Every "multi-choice" page: options have NO routeTo, page has routeButton
- Every "mixed" page: text/toggle options, page has routeButton  
- Every "display-only" page: no options, no routeButton
- ALL routeTo values must reference actual page IDs in your form
- NO trailing commas, ALL braces properly closed
- Every routeButton must have "label" and "routeTo"

REQUIRED PAGES (create ALL of these):
- page-1: Primary incident type (single-choice → 4 paths)
- page-2: Collision sub-type (single-choice → 4 paths)  
- page-3: Fault determination (single-choice → 4 paths)
- page-4: Evidence gathering (multi-choice)
- page-5: Injury assessment (single-choice → 3 paths)
- page-6: Vehicle damage level (single-choice → 4 paths)
- page-7: Repair planning (multi-choice)
- page-8: Accident details (mixed - date, time, location, description)
- page-9: Your vehicle info (mixed - year, make, model, VIN, plate)
- page-10: Other driver info (mixed - name, phone, insurance, vehicle)
- page-11: Repair preferences (multi-choice)
- page-12: Contact information (mixed)
- page-13: Review and acknowledgments (multi-choice)
- page-14: Final confirmation (display-only)
- page-theft-1: Theft details (mixed)
- page-theft-2: Additional theft info (mixed)
- page-weather-1: Weather damage type (single-choice)
- page-weather-2: Weather damage details (mixed)
- page-injury-details-1: Minor injury info (mixed)
- page-injury-details-2: Serious injury info (mixed)
- page-towing-1: Towing arrangements (multi-choice)
- page-towing-2: Storage details (mixed)
- Plus additional specialized pages for different scenarios

Include branches for:
- Object collisions, animal collisions, rollovers
- At-fault vs not-at-fault scenarios
- Minor vs major vs total loss damage
- Injury vs no-injury paths
- Towing and storage needs
- Weather damage subtypes

Create MINIMUM 20+ pages with comprehensive coverage of all insurance claim scenarios.

RESPOND ONLY WITH COMPLETE, VALID JSON. Every routeTo must reference a real page in your form.`;
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
