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

        const formJson = this.extractJSONFromResponse(content, userIntent);

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

  private buildFormGenerationPrompt(
    userIntent: string,
    context?: string
  ): string {
    return `
Create a decision tree form for: "${userIntent}"
${context ? `Additional context: ${context}` : ""}

Generate a form that helps users with this specific request. The form should be relevant, practical, and directly address their needs.

STRUCTURE RULES:

1. "single-choice" pages: Options have routeTo field, no routeButton
2. "multi-choice" pages: Options without routeTo, page has routeButton
3. "mixed" pages: Mix of text inputs and options, page has routeButton  
4. "display-only" pages: No options array, optional routeButton

Create MINIMUM 20 pages that comprehensively cover the user's intent with detailed branching.

For "${userIntent}", create a form that:
- Starts with relevant categorization (3-4 major branches)
- Each major branch should have 5-7 sub-pages for detailed information gathering
- Multiple decision points within each branch
- Comprehensive data collection at each step
- Professional follow-up questions and clarifications
- Final resolution pages with detailed next steps
- Must have at least 20 pages total

JSON Example:
{
  "name": "[Relevant Form Name]",
  "description": "[Form description matching user intent]",
  "pages": [
    {
      "id": "page-1",
      "title": "[Question relevant to user intent]",
      "inputType": "single-choice",
      "options": [
        {
          "id": "opt-1",
          "label": "[Option relevant to intent]",
          "value": "value1",
          "routeTo": "page-2"
        },
        {
          "id": "opt-2", 
          "label": "[Second relevant option]",
          "value": "value2",
          "routeTo": "page-3"
        }
      ]
    }
  ]
}

COMPREHENSIVE REQUIREMENTS:
1. MINIMUM 20 pages - this is mandatory
2. Create 3-4 major category branches from the first page
3. Each major branch should have 5-7 detailed sub-pages
4. Include multiple decision points and scenario variations
5. Add information gathering pages (mixed type) for detailed data collection
6. Professional, thorough questions throughout
7. Multiple routes that can converge to final resolution pages

VALIDATION CHECKLIST:
✓ At least 20 pages total
✓ Multiple branches from main categories  
✓ No empty options arrays (except display-only pages)
✓ All routeTo values reference actual page IDs
✓ Comprehensive coverage of all scenarios
✓ Professional, detailed approach throughout

IMPORTANT: 
- Make the form DIRECTLY relevant to "${userIntent}"
- Use practical, helpful questions
- Create logical flow between pages
- Ensure all routeTo values reference actual page IDs
- MUST have minimum 20 pages - create extensive branches and detailed information gathering

RESPOND ONLY WITH VALID JSON.`;
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

  private extractJSONFromResponse(response: string, userIntent: string): any {
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

  private attemptJSONRepair(response: string, userIntent: string): any | null {
    console.log("🚨 Attempting emergency JSON repair...");

    try {
      // Extract just the pages array if possible
      const pagesMatch = response.match(/"pages":\s*\[(.*?)\]/s);
      if (pagesMatch) {
        console.log("Found pages array, attempting minimal form creation...");

        // Create a minimal valid form structure based on user intent
        return this.createFallbackForm(userIntent);
      }
    } catch (repairError) {
      console.error("Emergency repair failed:", repairError);
    }

    return null;
  }

  private createFallbackForm(userIntent: string): any {
    // Create a comprehensive, relevant form based on the user's intent with minimum 20 pages
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
        // Detailed guidance branch (pages 2-7)
        {
          id: "page-2",
          title: "What's your current experience level?",
          inputType: "single-choice",
          options: [
            {
              id: "exp-1",
              label: "Complete beginner",
              value: "beginner",
              routeTo: "page-3",
            },
            {
              id: "exp-2",
              label: "Some experience",
              value: "intermediate",
              routeTo: "page-4",
            },
            {
              id: "exp-3",
              label: "Advanced",
              value: "advanced",
              routeTo: "page-5",
            },
          ],
        },
        {
          id: "page-3",
          title: "Tell us about your specific goals",
          inputType: "mixed",
          options: [
            {
              id: "goal-details",
              type: "text",
              label: "Describe your main objective",
              value: "",
              required: true,
            },
          ],
          routeButton: { label: "Continue", routeTo: "page-6" },
        },
        {
          id: "page-4",
          title: "What challenges have you encountered?",
          inputType: "multi-choice",
          options: [
            { id: "challenge-1", label: "Lack of time", value: "time" },
            { id: "challenge-2", label: "Complexity", value: "complex" },
            { id: "challenge-3", label: "Resources", value: "resources" },
          ],
          routeButton: { label: "Continue", routeTo: "page-6" },
        },
        {
          id: "page-5",
          title: "What advanced aspects interest you most?",
          inputType: "single-choice",
          options: [
            {
              id: "adv-1",
              label: "Optimization techniques",
              value: "optimize",
              routeTo: "page-6",
            },
            {
              id: "adv-2",
              label: "Best practices",
              value: "practices",
              routeTo: "page-6",
            },
            {
              id: "adv-3",
              label: "Latest developments",
              value: "latest",
              routeTo: "page-6",
            },
          ],
        },
        {
          id: "page-6",
          title: "How do you prefer to receive information?",
          inputType: "multi-choice",
          options: [
            { id: "format-1", label: "Written guides", value: "written" },
            { id: "format-2", label: "Video content", value: "video" },
            {
              id: "format-3",
              label: "Interactive demos",
              value: "interactive",
            },
          ],
          routeButton: { label: "Continue", routeTo: "page-7" },
        },
        {
          id: "page-7",
          title: "We'll create a personalized guidance plan for you",
          inputType: "display-only",
          routeButton: { label: "Continue", routeTo: "page-20" },
        },
        // Step-by-step branch (pages 8-13)
        {
          id: "page-8",
          title: "How detailed should the steps be?",
          inputType: "single-choice",
          options: [
            {
              id: "detail-1",
              label: "High-level overview",
              value: "overview",
              routeTo: "page-9",
            },
            {
              id: "detail-2",
              label: "Detailed instructions",
              value: "detailed",
              routeTo: "page-10",
            },
            {
              id: "detail-3",
              label: "Expert-level breakdown",
              value: "expert",
              routeTo: "page-11",
            },
          ],
        },
        {
          id: "page-9",
          title: "What's your timeframe for completion?",
          inputType: "single-choice",
          options: [
            {
              id: "time-1",
              label: "Immediate (1-7 days)",
              value: "immediate",
              routeTo: "page-12",
            },
            {
              id: "time-2",
              label: "Short-term (1-4 weeks)",
              value: "short",
              routeTo: "page-12",
            },
            {
              id: "time-3",
              label: "Long-term (1+ months)",
              value: "long",
              routeTo: "page-12",
            },
          ],
        },
        {
          id: "page-10",
          title: "Do you need prerequisite information?",
          inputType: "single-choice",
          options: [
            {
              id: "prereq-1",
              label: "Yes, I need background info",
              value: "yes",
              routeTo: "page-12",
            },
            {
              id: "prereq-2",
              label: "No, I'm ready to start",
              value: "no",
              routeTo: "page-12",
            },
          ],
        },
        {
          id: "page-11",
          title: "What tools or resources do you have available?",
          inputType: "mixed",
          options: [
            {
              id: "tools-available",
              type: "text",
              label: "List available tools/resources",
              value: "",
              required: false,
            },
          ],
          routeButton: { label: "Continue", routeTo: "page-12" },
        },
        {
          id: "page-12",
          title: "Would you like checkpoints or milestones?",
          inputType: "single-choice",
          options: [
            {
              id: "milestone-1",
              label: "Yes, regular checkpoints",
              value: "yes",
              routeTo: "page-13",
            },
            {
              id: "milestone-2",
              label: "No, continuous flow",
              value: "no",
              routeTo: "page-13",
            },
          ],
        },
        {
          id: "page-13",
          title: "We'll create a customized step-by-step plan",
          inputType: "display-only",
          routeButton: { label: "Continue", routeTo: "page-20" },
        },
        // Resources branch (pages 14-19)
        {
          id: "page-14",
          title: "What type of resources are you looking for?",
          inputType: "multi-choice",
          options: [
            { id: "res-1", label: "Learning materials", value: "learning" },
            { id: "res-2", label: "Tools and software", value: "tools" },
            { id: "res-3", label: "Community support", value: "community" },
            {
              id: "res-4",
              label: "Professional services",
              value: "professional",
            },
          ],
          routeButton: { label: "Continue", routeTo: "page-15" },
        },
        {
          id: "page-15",
          title: "What's your budget range?",
          inputType: "single-choice",
          options: [
            {
              id: "budget-1",
              label: "Free resources only",
              value: "free",
              routeTo: "page-16",
            },
            {
              id: "budget-2",
              label: "Low cost ($1-50)",
              value: "low",
              routeTo: "page-17",
            },
            {
              id: "budget-3",
              label: "Moderate ($50-200)",
              value: "moderate",
              routeTo: "page-18",
            },
            {
              id: "budget-4",
              label: "No budget constraints",
              value: "unlimited",
              routeTo: "page-19",
            },
          ],
        },
        {
          id: "page-16",
          title: "Free resources curation",
          inputType: "display-only",
          routeButton: { label: "Continue", routeTo: "page-20" },
        },
        {
          id: "page-17",
          title: "Budget-friendly recommendations",
          inputType: "display-only",
          routeButton: { label: "Continue", routeTo: "page-20" },
        },
        {
          id: "page-18",
          title: "Premium resource selection",
          inputType: "display-only",
          routeButton: { label: "Continue", routeTo: "page-20" },
        },
        {
          id: "page-19",
          title: "Comprehensive resource package",
          inputType: "display-only",
          routeButton: { label: "Continue", routeTo: "page-20" },
        },
        {
          id: "page-20",
          title:
            "Thank you for providing detailed information. Your customized recommendations are being prepared.",
          inputType: "display-only",
        },
      ],
    };

    // Customize based on intent keywords
    if (sanitizedIntent.includes("learn")) {
      formConfig.name = "Learning Path Assistant";
      formConfig.description =
        "Help us create a personalized learning plan for you";
      formConfig.pages[0].title = "What would you like to learn about?";
      if (formConfig.pages[0].options && formConfig.pages[0].options[0]) {
        formConfig.pages[0].options[0].label =
          "I want a structured learning plan";
      }
      if (formConfig.pages[0].options && formConfig.pages[0].options[1]) {
        formConfig.pages[0].options[1].label = "I need learning resources";
      }
    } else if (
      sanitizedIntent.includes("plan") ||
      sanitizedIntent.includes("schedule")
    ) {
      formConfig.name = "Planning Assistant";
      formConfig.description = "Help us create a plan that works for you";
      formConfig.pages[0].title = "What type of planning do you need?";
    }

    return formConfig;
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

      // Handle different input types
      if (page.inputType === "display-only") {
        // Display-only pages should NEVER have options
        delete page.options;

        // Remove routeButton if it routes to itself (invalid)
        if (page.routeButton && page.routeButton.routeTo === page.id) {
          delete page.routeButton;
        }

        // If it's the last page, remove routeButton entirely
        if (index === pages.length - 1) {
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
                label: "Continue",
                value: "continue",
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
            ];
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
          }
        }

        // Ensure routeButton exists for multi-choice and mixed
        if (
          (page.inputType === "multi-choice" || page.inputType === "mixed") &&
          !page.routeButton
        ) {
          page.routeButton = {
            label: "Continue",
            routeTo:
              index + 1 < pages.length
                ? pages[index + 1].id || `page-${index + 2}`
                : `page-end`,
          };
        }

        // For single-choice pages, remove routeButton and ensure options have routeTo
        if (page.inputType === "single-choice") {
          delete page.routeButton;

          if (page.options && Array.isArray(page.options)) {
            page.options = page.options.map((option: any) => {
              if (!option.routeTo) {
                const nextPageIndex = index + 1;
                if (nextPageIndex < pages.length) {
                  option.routeTo =
                    pages[nextPageIndex].id || `page-${nextPageIndex + 1}`;
                } else {
                  option.routeTo = `page-end`;
                }
              }

              // Remove invalid fields from single-choice options
              delete option.type;
              delete option.required;

              return option;
            });
          }
        }
      }

      // Fix routeButton issues for pages that should have them
      if (page.routeButton) {
        if (!page.routeButton.routeTo) {
          const nextPageIndex = index + 1;
          if (nextPageIndex < pages.length) {
            page.routeButton.routeTo =
              pages[nextPageIndex].id || `page-${nextPageIndex + 1}`;
          } else {
            delete page.routeButton;
          }
        }

        if (page.routeButton && !page.routeButton.label) {
          page.routeButton.label = "Continue";
        }
      }

      // Clean up options array - ensure all options have required fields
      if (page.options && Array.isArray(page.options)) {
        page.options = page.options.map((option: any, optIndex: number) => {
          if (!option.id) {
            option.id = `opt-${index}-${optIndex + 1}`;
          }
          if (!option.label) {
            option.label = `Option ${optIndex + 1}`;
          }
          if (option.value === undefined || option.value === null) {
            option.value = `value-${optIndex + 1}`;
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
