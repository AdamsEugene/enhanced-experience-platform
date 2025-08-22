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
    try {
      const prompt = this.buildFormGenerationPrompt(userIntent, context);

      console.log("Making OpenAI API request...");

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are an expert at creating comprehensive, detailed forms and decision trees. You create thorough, professional-grade forms that cover all possible scenarios and gather complete information. You always respond with valid JSON only, no explanations or markdown.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 4095,
        temperature: 0.1,
      });

      console.log("OpenAI API response received");

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("No content received from OpenAI");
      }

      console.log("Response content length:", content.length);

      const formJson = this.extractJSONFromResponse(content);

      return {
        ...formJson,
        id: this.generateFormId(),
        createdAt: new Date().toISOString(),
        generatedFrom: userIntent,
      };
    } catch (error) {
      console.error("Error generating form:", error);
      throw new Error(
        `Failed to generate form: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
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
Generate a comprehensive, detailed decision tree form based on this user request: "${userIntent}"
${context ? `Additional context: ${context}` : ""}

This should be a PROFESSIONAL-GRADE, COMPREHENSIVE form that covers ALL possible scenarios and gathers COMPLETE information. Think like a real insurance company or professional service provider.

Create a JSON form definition with 15-25+ pages that breaks down the user's request into multiple logical steps/slides. Each slide should gather specific information needed to complete their task comprehensively.

CRITICAL JSON REQUIREMENTS:
- Every routeButton MUST have both "label" and "routeTo" fields
- Every option MUST have "id", "label", and "value" fields
- All JSON must be properly closed with matching braces and brackets
- No trailing commas
- No incomplete objects

Follow this exact structure:
{
  "name": "Professional Form Title",
  "description": "Comprehensive description of what this form accomplishes",
  "pages": [
    {
      "id": "page-1",
      "title": "Clear question or instruction for the user",
      "inputType": "single-choice|multi-choice|mixed|display-only",
      "options": [
        {
          "id": "option-id",
          "label": "Button or field label",
          "value": "option-value",
          "type": "toggle|text|select",
          "routeTo": "next-page-id",
          "required": true
        }
      ],
      "routeButton": {
        "label": "Continue",
        "routeTo": "next-page-id"
      }
    }
  ]
}

Input Type Rules:
- "single-choice": User picks ONE option, each option MUST have routeTo (no routeButton needed)
- "multi-choice": User can select MULTIPLE options, MUST have routeButton with valid routeTo
- "mixed": Combination of text inputs and toggles, MUST have routeButton with valid routeTo
- "display-only": Information display, no routeButton needed

JSON VALIDATION RULES:
1. Every page MUST have: id, title, inputType, options array
2. Every routeButton MUST have: label, routeTo
3. Every routeTo MUST reference a valid page id that exists in the form
4. All objects must be properly closed
5. No trailing commas anywhere

COMPREHENSIVE Form Requirements:
1. Start with broad categorization (incident type, severity, etc.)
2. Branch into specific scenarios with detailed paths
3. Gather ALL relevant details for each scenario:
   - Incident details (date, time, location, description)
   - Parties involved (names, contact info, insurance details)
   - Damage assessment (detailed descriptions, photos, estimates)
   - Evidence gathering (police reports, witnesses, documentation)
   - Injury information (if applicable)
   - Vehicle information (make, model, year, VIN, license plates)
   - Insurance preferences (repair shops, rental cars, claim handling)
   - Contact information and communication preferences
   - Legal acknowledgments and authorizations
4. Include multiple decision branches for different scenarios
5. End with comprehensive review and confirmation pages
6. Use professional, clear language throughout

For auto insurance specifically, include paths for:
- Vehicle-to-vehicle collisions (fault determination, other driver info)
- Single-vehicle accidents (object strikes, rollovers)
- Theft and break-ins (police reports, stolen items)
- Weather damage (hail, flood, wind, lightning)
- Vandalism and malicious damage
- Animal collisions
- Comprehensive damage assessment flows
- Injury documentation procedures
- Towing and storage arrangements
- Total loss procedures

Create AT LEAST 15-20 pages with multiple branching paths. Be thorough and professional.

BEFORE RESPONDING: Double-check that:
- Every routeButton has both label and routeTo
- Every routeTo points to an actual page id in your form
- All JSON brackets and braces are properly matched
- No trailing commas exist
- All required fields are present

RESPOND ONLY WITH VALID, COMPLETE JSON. NO EXPLANATIONS OR MARKDOWN BLOCKS.
    `;
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
    try {
      // Remove markdown code blocks if present
      let cleaned = response
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      // Find the first { and last } to extract just the JSON
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");

      if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }

      // Try to parse and validate
      const parsed = JSON.parse(cleaned);

      // Validate and fix the structure
      if (parsed.pages) {
        parsed.pages = this.validateAndFixPages(parsed.pages);
      }

      return parsed;
    } catch (error) {
      console.error("Failed to parse JSON from OpenAI response:", response);
      // console.error("Cleaned response:", cleaned);
      throw new Error("Invalid JSON response from AI service");
    }
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
