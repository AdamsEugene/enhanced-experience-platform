import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { OpenAIService } from "./services/aiService";
import {
  FormDefinition,
  FormGenerationRequest,
  FormSubmissionRequest,
  FormEditRequest,
  ErrorResponse,
  FeedbackEditResponse,
  FeedbackEditRequest,
  StylingRequest,
  StylingResponse,
  ValidationRequest,
  ValidationResult,
  WidgetRecommendationRequest,
  WidgetRecommendationResponse,
} from "./types";
import { v4 as uuidv4 } from "uuid";
import { ValidationService } from "./services/validationService";
import { WidgetService } from "./services/widgetService";

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Define allowed origins
      const allowedOrigins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3007",
        "http://localhost:4200", // Angular default
        "http://localhost:4201", // Angular alternative
        "http://localhost:8080",
        "http://localhost:8081",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3007",
        "http://127.0.0.1:4200", // Angular default
        "http://127.0.0.1:4201", // Angular alternative
        "http://127.0.0.1:8080",
        "http://127.0.0.1:8081",
        "https://wizardbuilder.netlify.app",
        "http://localhost:5173", // for local development
      ];

      // Add custom origin from environment variable if specified
      if (process.env.CORS_ORIGIN) {
        allowedOrigins.push(process.env.CORS_ORIGIN);
      }

      // Check if the origin is allowed
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        // For development, allow all localhost and 127.0.0.1 origins
        if (
          process.env.NODE_ENV !== "production" &&
          (origin.includes("localhost") ||
            origin.includes("127.0.0.1") ||
            origin.includes("0.0.0.0"))
        ) {
          console.log(`🌐 CORS: Allowing development origin: ${origin}`);
          callback(null, true);
        } else {
          console.log(`❌ CORS: Blocking origin: ${origin}`);
          callback(new Error("Not allowed by CORS"));
        }
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "Cache-Control",
      "Pragma",
      "Expires",
      "If-Modified-Since",
      "If-None-Match",
    ],
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// In-memory storage for generated forms and submissions
const generatedForms = new Map<string, FormDefinition>();
const formSubmissions = new Map<string, any>();

// Initialize AI service
const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error("OPENAI_API_KEY environment variable is required");
  process.exit(1);
}

const aiService = new OpenAIService(openaiApiKey);
const widgetService = new WidgetService(aiService);

// Middleware for logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    formsGenerated: generatedForms.size,
    totalSubmissions: formSubmissions.size,
    aiProvider: "OpenAI GPT-4o",
  });
});

// Recommend widgets based on user intent
app.post("/api/widgets/recommend", async (req, res) => {
  try {
    const { userIntent, context }: WidgetRecommendationRequest = req.body;

    if (
      !userIntent ||
      typeof userIntent !== "string" ||
      userIntent.trim().length === 0
    ) {
      const error: ErrorResponse = {
        error: "userIntent is required and must be a non-empty string",
      };
      return res.status(400).json(error);
    }

    console.log("🔍 Generating widget recommendations for intent:", userIntent);

    const recommendations = await widgetService.recommendWidgets({
      userIntent: userIntent.trim(),
      context: context?.trim(),
    });

    console.log(
      `✅ Widget recommendations generated: ${recommendations.totalPages} pages`
    );
    res.json(recommendations);
  } catch (error) {
    console.error("Widget recommendation error:", error);
    const errorResponse: ErrorResponse = {
      error: "Failed to generate widget recommendations",
      details: error instanceof Error ? error.message : "Unknown error",
    };
    res.status(500).json(errorResponse);
  }
});

// Generate loading messages for user while form is being created
app.post("/api/forms/loading-messages", async (req, res) => {
  try {
    const { userIntent }: { userIntent: string } = req.body;

    if (
      !userIntent ||
      typeof userIntent !== "string" ||
      userIntent.trim().length === 0
    ) {
      const error: ErrorResponse = {
        error: "userIntent is required and must be a non-empty string",
      };
      return res.status(400).json(error);
    }

    console.log("Generating loading messages for intent:", userIntent);

    const messages = await aiService.generateLoadingMessages(userIntent.trim());

    console.log(
      `Loading messages generated successfully: ${messages.length} messages`
    );
    res.json({ messages });
  } catch (error) {
    console.error("Loading messages generation error:", error);
    const errorResponse: ErrorResponse = {
      error: "Failed to generate loading messages",
      details: error instanceof Error ? error.message : "Unknown error",
    };
    res.status(500).json(errorResponse);
  }
});

// Generate form from user intent
app.post("/api/forms/generate", async (req, res) => {
  try {
    const { userIntent, context }: FormGenerationRequest = req.body;

    if (
      !userIntent ||
      typeof userIntent !== "string" ||
      userIntent.trim().length === 0
    ) {
      const error: ErrorResponse = {
        error: "userIntent is required and must be a non-empty string",
      };
      return res.status(400).json(error);
    }

    console.log("Generating form for intent:", userIntent);

    const form = await aiService.generateForm(userIntent.trim(), context);

    // Cache the generated form
    generatedForms.set(form.id, form);

    console.log(`Form generated successfully: ${form.id}`);
    res.json(form);
  } catch (error) {
    console.error("Form generation error:", error);
    const errorResponse: ErrorResponse = {
      error: "Failed to generate form",
      details: error instanceof Error ? error.message : "Unknown error",
    };
    res.status(500).json(errorResponse);
  }
});

// Edit/Regenerate form with specific modifications
app.put("/api/forms/:id/edit", async (req, res) => {
  try {
    const formId = req.params.id;
    const editRequest: FormEditRequest = req.body;

    // Get the existing form
    const existingForm = generatedForms.get(formId);
    if (!existingForm) {
      const error: ErrorResponse = { error: "Form not found" };
      return res.status(404).json(error);
    }

    console.log(`Editing form ${formId} with modifications:`, {
      hasNewIntent: !!editRequest.newIntent,
      hasNewContext: !!editRequest.newContext,
      pageModifications: editRequest.pageModifications?.length || 0,
      regenerateAll: editRequest.regenerateAll || false,
    });

    // Use the edit-specific method in the AI service
    const editedForm = await aiService.editForm(existingForm, editRequest);

    // Update the cached form with the edited version
    generatedForms.set(editedForm.id, editedForm);

    console.log(`Form edited successfully: ${editedForm.id}`);
    res.json(editedForm);
  } catch (error) {
    console.error("Form edit error:", error);
    const errorResponse: ErrorResponse = {
      error: "Failed to edit form",
      details: error instanceof Error ? error.message : "Unknown error",
    };
    res.status(500).json(errorResponse);
  }
});

// Clone and edit form (creates a new form based on existing one)
app.put("/api/forms/:id/clone-edit", async (req, res) => {
  try {
    const sourceFormId = req.params.id;
    const editRequest: FormEditRequest = req.body;

    // Get the existing form
    const sourceForm = generatedForms.get(sourceFormId);
    if (!sourceForm) {
      const error: ErrorResponse = { error: "Source form not found" };
      return res.status(404).json(error);
    }

    console.log(`Cloning and editing form ${sourceFormId}`);

    // Create a clone with modifications
    const clonedForm = await aiService.editForm(
      sourceForm,
      editRequest,
      true // This flag indicates we want a new form ID
    );

    // Store the new form
    generatedForms.set(clonedForm.id, clonedForm);

    console.log(`Form cloned and edited successfully: ${clonedForm.id}`);
    res.json(clonedForm);
  } catch (error) {
    console.error("Form clone-edit error:", error);
    const errorResponse: ErrorResponse = {
      error: "Failed to clone and edit form",
      details: error instanceof Error ? error.message : "Unknown error",
    };
    res.status(500).json(errorResponse);
  }
});

// Edit form based on user feedback
app.put("/api/forms/:id/feedback-edit", async (req, res) => {
  try {
    const formId = req.params.id;
    const feedbackRequest: FeedbackEditRequest = req.body;

    // Validate request
    if (
      !feedbackRequest.pageSpecificFeedback &&
      !feedbackRequest.generalFeedback
    ) {
      const error: ErrorResponse = {
        error: "Either pageSpecificFeedback or generalFeedback is required",
      };
      return res.status(400).json(error);
    }

    // Get the existing form
    const existingForm = generatedForms.get(formId);
    if (!existingForm) {
      const error: ErrorResponse = { error: "Form not found" };
      return res.status(404).json(error);
    }

    console.log(`Processing feedback edit for form ${formId}:`);
    console.log(
      `- Page-specific feedback: ${
        feedbackRequest.pageSpecificFeedback?.length || 0
      } pages`
    );
    console.log(
      `- General feedback: ${feedbackRequest.generalFeedback ? "Yes" : "No"}`
    );

    // Track what pages are being modified for response
    const modifications = {
      pagesModified:
        feedbackRequest.pageSpecificFeedback?.map((f: any) => f.pageId) || [],
      pagesAdded: [] as string[],
      pagesRemoved: [] as string[],
      generalChanges: feedbackRequest.generalFeedback
        ? [feedbackRequest.generalFeedback]
        : [],
    };

    // Apply feedback-based edits
    const editedForm = await aiService.editFormWithFeedback(
      existingForm,
      feedbackRequest
    );

    // Detect new/removed pages
    const originalPageIds = new Set(existingForm.pages.map((p) => p.id));
    const newPageIds = new Set(editedForm.pages.map((p) => p.id));

    modifications.pagesAdded = editedForm.pages
      .filter((p) => !originalPageIds.has(p.id))
      .map((p) => p.id);

    modifications.pagesRemoved = existingForm.pages
      .filter((p) => !newPageIds.has(p.id))
      .map((p) => p.id);

    // Update the cached form
    generatedForms.set(editedForm.id, editedForm);

    const response: FeedbackEditResponse = {
      success: true,
      message: "Form updated successfully based on feedback",
      editedForm,
      modifications,
    };

    console.log(`✅ Feedback edit completed: ${editedForm.id}`);
    console.log(`   Modified pages: ${modifications.pagesModified.length}`);
    console.log(`   Added pages: ${modifications.pagesAdded.length}`);
    console.log(`   Removed pages: ${modifications.pagesRemoved.length}`);

    res.json(response);
  } catch (error) {
    console.error("Feedback edit error:", error);
    const errorResponse: ErrorResponse = {
      error: "Failed to process feedback edit",
      details: error instanceof Error ? error.message : "Unknown error",
    };
    res.status(500).json(errorResponse);
  }
});

// Apply styling changes to form based on user feedback
app.put("/api/forms/:id/styling", async (req, res) => {
  try {
    const formId = req.params.id;
    const stylingRequest: StylingRequest = req.body;

    // Validate request
    if (
      !stylingRequest.pageSpecificFeedback &&
      !stylingRequest.generalFeedback
    ) {
      const error: ErrorResponse = {
        error: "Either pageSpecificFeedback or generalFeedback is required",
      };
      return res.status(400).json(error);
    }

    // Get the existing form
    const existingForm = generatedForms.get(formId);
    if (!existingForm) {
      const error: ErrorResponse = { error: "Form not found" };
      return res.status(404).json(error);
    }

    console.log(`Processing styling request for form ${formId}:`);
    console.log(
      `- Page-specific styling: ${
        stylingRequest.pageSpecificFeedback?.length || 0
      } pages`
    );
    console.log(
      `- General styling: ${stylingRequest.generalFeedback ? "Yes" : "No"}`
    );

    // Track what pages are being styled
    const stylingChanges = {
      pagesStyled:
        stylingRequest.pageSpecificFeedback?.map((f: any) => f.pageId) || [],
      generalChanges: stylingRequest.generalFeedback
        ? [stylingRequest.generalFeedback]
        : [],
    };

    // Apply styling changes
    const styledForm = await aiService.applyFormStyling(
      existingForm,
      stylingRequest
    );

    // Update the cached form
    generatedForms.set(styledForm.id, styledForm);

    const response: StylingResponse = {
      success: true,
      message: "Form styling applied successfully",
      ...styledForm,
      stylingChanges,
    };

    console.log(`✅ Styling applied: ${styledForm.id}`);
    console.log(`   Styled pages: ${stylingChanges.pagesStyled.length}`);
    console.log(`   General changes: ${stylingChanges.generalChanges.length}`);

    res.json(response);
  } catch (error) {
    console.error("Styling application error:", error);
    const errorResponse: ErrorResponse = {
      error: "Failed to apply styling",
      details: error instanceof Error ? error.message : "Unknown error",
    };
    res.status(500).json(errorResponse);
  }
});

// PUT: Save manually edited form (replace existing form)
app.put("/api/forms/:id/save", (req, res) => {
  try {
    const formId = req.params.id;
    const updatedForm: FormDefinition = req.body;

    // Check if form exists
    const existingForm = generatedForms.get(formId);
    if (!existingForm) {
      const error: ErrorResponse = { error: "Form not found" };
      return res.status(404).json(error);
    }

    // Basic validation - just ensure we have required fields
    if (
      !updatedForm.name ||
      !updatedForm.pages ||
      !Array.isArray(updatedForm.pages)
    ) {
      const error: ErrorResponse = {
        error: "Invalid form data",
        details: "Form must have name and pages array",
      };
      return res.status(400).json(error);
    }

    console.log(`Saving manually edited form: ${formId}`);
    console.log(`- Pages: ${updatedForm.pages.length}`);
    console.log(`- Name: ${updatedForm.name}`);

    // Simple replace - keep the form exactly as provided, just preserve essential metadata
    const savedForm: FormDefinition = {
      ...updatedForm,
      id: formId, // Ensure ID matches URL
      createdAt: existingForm.createdAt, // Preserve original creation time
      lastEditedAt: new Date().toISOString(), // Update last edited time
      generatedFrom: existingForm.generatedFrom, // Preserve original intent
    };

    // Replace the old form with the new one
    generatedForms.set(formId, savedForm);

    console.log(`✅ Form saved: ${formId}`);

    res.json({
      success: true,
      message: "Form saved successfully",
      form: savedForm,
    });
  } catch (error) {
    console.error("Form save error:", error);
    const errorResponse: ErrorResponse = {
      error: "Failed to save form",
      details: error instanceof Error ? error.message : "Unknown error",
    };
    res.status(500).json(errorResponse);
  }
});

// Get specific form by ID
app.get("/api/forms/:id", (req, res) => {
  const formId = req.params.id;
  const form = generatedForms.get(formId);

  if (!form) {
    const error: ErrorResponse = { error: "Form not found" };
    return res.status(404).json(error);
  }

  res.json(form);
});

// Submit form responses
app.post("/api/forms/:id/submit", async (req, res) => {
  try {
    const formId = req.params.id;
    const { responses }: FormSubmissionRequest = req.body;

    const form = generatedForms.get(formId);
    if (!form) {
      const error: ErrorResponse = { error: "Form not found" };
      return res.status(404).json(error);
    }

    if (!responses || typeof responses !== "object") {
      const error: ErrorResponse = { error: "Responses object is required" };
      return res.status(400).json(error);
    }

    console.log(
      "Form submission received:",
      formId,
      Object.keys(responses).length,
      "responses"
    );

    // Generate unique submission ID and claim number
    const submissionId = uuidv4();
    const claimNumber = `EXP-${Date.now().toString().slice(-6)}-${Math.random()
      .toString(36)
      .substr(2, 4)
      .toUpperCase()}`;

    // Store submission
    const submissionData = {
      id: submissionId,
      formId,
      responses,
      submittedAt: new Date().toISOString(),
      claimNumber,
    };
    formSubmissions.set(submissionId, submissionData);

    // Process with AI for insights
    const aiAnalysis = await aiService.processFormSubmission(formId, responses);

    const response = {
      success: true,
      message: "Form submitted successfully",
      formData: responses,
      aiAnalysis,
      claimNumber,
    };

    console.log(
      `Form submission processed: ${submissionId}, claim: ${claimNumber}`
    );
    res.json(response);
  } catch (error) {
    console.error("Form submission error:", error);
    const errorResponse: ErrorResponse = {
      error: "Failed to process form submission",
      details: error instanceof Error ? error.message : "Unknown error",
    };
    res.status(500).json(errorResponse);
  }
});

// ============== VALIDATION ENDPOINTS ==============

// Validate single input
app.post("/api/forms/validate", (req, res) => {
  try {
    const validationRequest: ValidationRequest = req.body;

    // Validate request structure
    if (!validationRequest.inputType || validationRequest.value === undefined) {
      const error: ErrorResponse = {
        error: "Invalid validation request",
        details: "inputType and value are required",
      };
      return res.status(400).json(error);
    }

    console.log(`Validating ${validationRequest.inputType} input:`, {
      fieldName: validationRequest.fieldName || "unknown",
      hasConfig: !!validationRequest.config,
      valueType: typeof validationRequest.value,
    });

    // Perform validation
    const result = ValidationService.validateInput(
      validationRequest.value,
      validationRequest.inputType,
      validationRequest.config || {},
      validationRequest.fieldName
    );

    console.log(
      `Validation result: ${result.isValid ? "✅ Valid" : "❌ Invalid"}`
    );
    if (!result.isValid) {
      console.log(`Errors: ${result.errors.join(", ")}`);
    }

    res.json(result);
  } catch (error) {
    console.error("Validation error:", error);
    const errorResponse: ErrorResponse = {
      error: "Failed to validate input",
      details: error instanceof Error ? error.message : "Unknown error",
    };
    res.status(500).json(errorResponse);
  }
});

// Validate multiple inputs (batch validation)
app.post("/api/forms/validate/batch", (req, res) => {
  try {
    const { validations } = req.body;

    if (!validations || !Array.isArray(validations)) {
      const error: ErrorResponse = {
        error: "Invalid batch validation request",
        details: "validations must be an array of ValidationRequest objects",
      };
      return res.status(400).json(error);
    }

    console.log(`Batch validating ${validations.length} inputs`);

    const results: { [key: string]: ValidationResult } = {};
    let allValid = true;

    validations.forEach((validation: ValidationRequest, index: number) => {
      const key = validation.fieldName || `field_${index}`;

      if (!validation.inputType || validation.value === undefined) {
        results[key] = {
          isValid: false,
          errors: ["inputType and value are required"],
        };
        allValid = false;
        return;
      }

      const result = ValidationService.validateInput(
        validation.value,
        validation.inputType,
        validation.config || {},
        validation.fieldName
      );

      results[key] = result;
      if (!result.isValid) {
        allValid = false;
      }
    });

    console.log(
      `Batch validation complete: ${
        allValid ? "✅ All valid" : "❌ Some invalid"
      }`
    );

    res.json({
      allValid,
      results,
      summary: {
        total: validations.length,
        valid: Object.values(results).filter((r) => r.isValid).length,
        invalid: Object.values(results).filter((r) => !r.isValid).length,
      },
    });
  } catch (error) {
    console.error("Batch validation error:", error);
    const errorResponse: ErrorResponse = {
      error: "Failed to validate inputs",
      details: error instanceof Error ? error.message : "Unknown error",
    };
    res.status(500).json(errorResponse);
  }
});

// Get all generated forms (for debugging/admin)
app.get("/api/forms", (req, res) => {
  const forms = Array.from(generatedForms.values()).map((form) => ({
    id: form.id,
    name: form.name,
    description: form.description,
    createdAt: form.createdAt,
    generatedFrom: form.generatedFrom,
    pageCount: form.pages.length,
    lastEditedAt: form.lastEditedAt,
    hasSubmissions: Array.from(formSubmissions.values()).some(
      (sub) => sub.formId === form.id
    ),
  }));

  res.json({ forms, total: forms.length });
});

// Get form submission details
app.get("/api/submissions/:id", (req, res) => {
  const submission = formSubmissions.get(req.params.id);
  if (!submission) {
    const error: ErrorResponse = { error: "Submission not found" };
    return res.status(404).json(error);
  }
  res.json(submission);
});

// ============== DELETE ENDPOINTS ==============

// DELETE: Delete a specific form and its submissions
app.delete("/api/forms/:id", (req, res) => {
  try {
    const formId = req.params.id;

    // Check if form exists
    const form = generatedForms.get(formId);
    if (!form) {
      const error: ErrorResponse = { error: "Form not found" };
      return res.status(404).json(error);
    }

    // Delete all submissions associated with this form
    let deletedSubmissions = 0;
    for (const [submissionId, submission] of formSubmissions.entries()) {
      if (submission.formId === formId) {
        formSubmissions.delete(submissionId);
        deletedSubmissions++;
      }
    }

    // Delete the form
    generatedForms.delete(formId);

    console.log(
      `Deleted form ${formId} and ${deletedSubmissions} associated submissions`
    );

    res.json({
      success: true,
      message: "Form deleted successfully",
      deletedForm: {
        id: form.id,
        name: form.name,
      },
      deletedSubmissions,
    });
  } catch (error) {
    console.error("Form deletion error:", error);
    const errorResponse: ErrorResponse = {
      error: "Failed to delete form",
      details: error instanceof Error ? error.message : "Unknown error",
    };
    res.status(500).json(errorResponse);
  }
});

// DELETE: Delete all forms (requires confirmation)
app.delete("/api/forms", (req, res) => {
  try {
    // Require explicit confirmation to prevent accidental deletion
    const { confirm } = req.query;
    if (confirm !== "true") {
      const error: ErrorResponse = {
        error: "Confirmation required",
        details: "Add ?confirm=true to the URL to delete all forms",
      };
      return res.status(400).json(error);
    }

    const totalForms = generatedForms.size;
    const totalSubmissions = formSubmissions.size;

    // Clear all forms and submissions
    generatedForms.clear();
    formSubmissions.clear();

    console.log(
      `Deleted all forms (${totalForms}) and submissions (${totalSubmissions})`
    );

    res.json({
      success: true,
      message: "All forms deleted successfully",
      deletedForms: totalForms,
      deletedSubmissions: totalSubmissions,
    });
  } catch (error) {
    console.error("Delete all forms error:", error);
    const errorResponse: ErrorResponse = {
      error: "Failed to delete all forms",
      details: error instanceof Error ? error.message : "Unknown error",
    };
    res.status(500).json(errorResponse);
  }
});

// POST: Batch delete forms
app.post("/api/forms/delete-batch", (req, res) => {
  try {
    const { formIds } = req.body;

    if (!formIds || !Array.isArray(formIds) || formIds.length === 0) {
      const error: ErrorResponse = {
        error: "Invalid request",
        details: "formIds must be a non-empty array",
      };
      return res.status(400).json(error);
    }

    const results = {
      deleted: [] as string[],
      notFound: [] as string[],
      totalSubmissionsDeleted: 0,
    };

    // Process each form ID
    for (const formId of formIds) {
      const form = generatedForms.get(formId);

      if (form) {
        // Delete associated submissions
        for (const [submissionId, submission] of formSubmissions.entries()) {
          if (submission.formId === formId) {
            formSubmissions.delete(submissionId);
            results.totalSubmissionsDeleted++;
          }
        }

        // Delete the form
        generatedForms.delete(formId);
        results.deleted.push(formId);
      } else {
        results.notFound.push(formId);
      }
    }

    console.log(
      `Batch delete: ${results.deleted.length} forms deleted, ` +
        `${results.notFound.length} not found, ` +
        `${results.totalSubmissionsDeleted} submissions deleted`
    );

    res.json({
      success: true,
      message: `Deleted ${results.deleted.length} forms`,
      results,
    });
  } catch (error) {
    console.error("Batch delete error:", error);
    const errorResponse: ErrorResponse = {
      error: "Failed to delete forms",
      details: error instanceof Error ? error.message : "Unknown error",
    };
    res.status(500).json(errorResponse);
  }
});

// GET: Get all submissions for a specific form
app.get("/api/forms/:id/submissions", (req, res) => {
  try {
    const formId = req.params.id;

    // Check if form exists
    const form = generatedForms.get(formId);
    if (!form) {
      const error: ErrorResponse = { error: "Form not found" };
      return res.status(404).json(error);
    }

    // Get all submissions for this form
    const submissions = Array.from(formSubmissions.values()).filter(
      (submission) => submission.formId === formId
    );

    res.json({
      formId,
      formName: form.name,
      submissions,
      total: submissions.length,
    });
  } catch (error) {
    console.error("Get form submissions error:", error);
    const errorResponse: ErrorResponse = {
      error: "Failed to get form submissions",
      details: error instanceof Error ? error.message : "Unknown error",
    };
    res.status(500).json(errorResponse);
  }
});

// Error handling middleware
app.use(
  (
    error: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Unhandled error:", error);
    const errorResponse: ErrorResponse = {
      error: "Internal server error",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    };
    res.status(500).json(errorResponse);
  }
);

// 404 handler
app.use((req, res) => {
  const error: ErrorResponse = { error: "Route not found" };
  res.status(404).json(error);
});

const PORT = process.env.PORT || 3007;

app.listen(PORT, () => {
  console.log(`🚀 Enhanced Experience Platform Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(
    `🤖 AI Service: OpenAI GPT-4o ${
      openaiApiKey ? "Configured" : "Missing API Key"
    }`
  );
  console.log(`\n📝 Available endpoints:`);
  console.log(
    `  POST   /api/widgets/recommend     - Recommend widgets for user intent`
  );
  console.log(
    `  POST   /api/forms/loading-messages - Generate loading messages`
  );
  console.log(`  POST   /api/forms/generate        - Generate new form`);
  console.log(`  GET    /api/forms                 - List all forms`);
  console.log(`  GET    /api/forms/:id             - Get specific form`);
  console.log(`  PUT    /api/forms/:id/edit        - Edit existing form`);
  console.log(`  PUT    /api/forms/:id/clone-edit  - Clone and edit form`);
  console.log(`  PUT    /api/forms/:id/styling     - Apply styling changes`);
  console.log(`  DELETE /api/forms/:id             - Delete specific form`);
  console.log(`  DELETE /api/forms?confirm=true    - Delete all forms`);
  console.log(`  POST   /api/forms/delete-batch    - Batch delete forms`);
  console.log(`  POST   /api/forms/:id/submit      - Submit form response`);
  console.log(`  GET    /api/forms/:id/submissions - Get form submissions`);
  console.log(`  POST   /api/validate              - Validate single input`);
  console.log(`  POST   /api/validate/batch        - Validate multiple inputs`);
});
