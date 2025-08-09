import { FormDefinition, AIAnalysis } from "../types";
import { v4 as uuidv4 } from "uuid";

export interface AIService {
  generateForm(userIntent: string, context?: string): Promise<FormDefinition>;
  processFormSubmission(formId: string, responses: any): Promise<AIAnalysis>;
}

export class ClaudeAIService implements AIService {
  private apiKey: string;
  private baseUrl = "https://api.anthropic.com/v1/messages";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateForm(
    userIntent: string,
    context?: string
  ): Promise<FormDefinition> {
    try {
      const prompt = this.buildFormGenerationPrompt(userIntent, context);

      console.log("Making Claude API request...");
      console.log("API Key length:", this.apiKey.length);
      console.log("API Key starts with:", this.apiKey.substring(0, 7));

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      console.log("Claude API response status:", response.status);
      console.log(
        "Claude API response headers:",
        Object.fromEntries(response.headers.entries())
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Claude API error response:", errorText);
        throw new Error(
          `Claude API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();
      console.log(
        "Claude API response received, content length:",
        (data as any).content[0].text.length
      );

      const formJson = this.extractJSONFromResponse(
        (data as any).content[0].text
      );

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

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Claude API error response:", errorText);
        throw new Error(
          `Claude API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();
      return this.extractJSONFromResponse((data as any).content[0].text);
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
Generate a decision tree form based on this user request: "${userIntent}"
${context ? `Additional context: ${context}` : ""}

Create a JSON form definition that breaks down the user's request into multiple logical steps/slides. Each slide should gather specific information needed to complete their task.

Follow this exact structure:
{
  "name": "Form Title",
  "description": "Brief description of what this form accomplishes",
  "pages": [
    {
      "id": "page-1",
      "title": "Clear question or instruction for the user",
      "order": 1,
      "inputType": "single-choice|multi-choice|mixed|display-only",
      "options": [
        {
          "id": "option-id",
          "label": "Button or field label",
          "value": "option-value",
          "type": "toggle|text-input|select", // only for mixed inputType
          "routeTo": "next-page-id", // only for single-choice
          "required": true // for text inputs
        }
      ],
      "routeButton": {
        "id": "continue-btn",
        "label": "Continue",
        "routeTo": "next-page-id"
      }, // only for multi-choice and mixed
      "displayContent": [
        {
          "type": "info|success|warning|error",
          "text": "Information to display"
        }
      ] // only for display-only
    }
  ]
}

Input Type Rules:
- "single-choice": User picks ONE option, each option has routeTo (no routeButton needed)
- "multi-choice": User can select MULTIPLE options, needs routeButton to continue
- "mixed": Combination of text inputs, selects, and toggles, needs routeButton
- "display-only": Information display with displayContent array

Form Design Principles:
1. Start with broad categorization questions
2. Progressively gather more specific details
3. Keep 2-4 options per page maximum
4. Create logical flow that builds understanding
5. End with confirmation/summary page
6. Think about the user's mental model and workflow
7. Each page should have a single, clear purpose
8. Use descriptive, user-friendly language

For the user intent "${userIntent}", think about:
- What information is needed to complete this task?
- What decisions does the user need to make?
- What is the logical order of information gathering?
- What are the different scenarios or paths they might take?

RESPOND ONLY WITH VALID JSON. NO EXPLANATIONS OR MARKDOWN BLOCKS.
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

      return JSON.parse(cleaned);
    } catch (error) {
      console.error("Failed to parse JSON from Claude response:", response);
      throw new Error("Invalid JSON response from AI service");
    }
  }

  private generateFormId(): string {
    return `form-${Date.now()}-${uuidv4().split("-")[0]}`;
  }
}
