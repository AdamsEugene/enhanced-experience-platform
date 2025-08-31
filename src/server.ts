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
} from "./types";
import { v4 as uuidv4 } from "uuid";

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
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
  console.log(`  POST   /api/forms/generate        - Generate new form`);
  console.log(`  GET    /api/forms                 - List all forms`);
  console.log(`  GET    /api/forms/:id             - Get specific form`);
  console.log(`  PUT    /api/forms/:id/edit        - Edit existing form`);
  console.log(`  PUT    /api/forms/:id/clone-edit  - Clone and edit form`);
  console.log(`  DELETE /api/forms/:id             - Delete specific form`);
  console.log(`  DELETE /api/forms?confirm=true    - Delete all forms`);
  console.log(`  POST   /api/forms/delete-batch    - Batch delete forms`);
  console.log(`  POST   /api/forms/:id/submit      - Submit form response`);
  console.log(`  GET    /api/forms/:id/submissions - Get form submissions`);
});
