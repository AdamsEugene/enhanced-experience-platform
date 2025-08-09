// Test OpenAI SDK setup
require("dotenv").config();
const OpenAI = require("openai");

async function testOpenAISDK() {
  const apiKey = process.env.OPENAI_API_KEY;

  console.log("=== OpenAI SDK Test ===");
  console.log("✓ API Key exists:", !!apiKey);
  console.log("✓ API Key length:", apiKey ? apiKey.length : "N/A");
  console.log("✓ Starts with sk-:", apiKey ? apiKey.startsWith("sk-") : "N/A");

  if (!apiKey) {
    console.error("❌ OPENAI_API_KEY not found in .env file");
    return;
  }

  try {
    const openai = new OpenAI({
      apiKey: apiKey,
    });

    console.log("🚀 Testing OpenAI SDK...");

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant. Be brief.",
        },
        {
          role: "user",
          content: "Say 'OpenAI SDK test successful' and nothing else.",
        },
      ],
      max_tokens: 50,
    });

    console.log("✅ OpenAI SDK test successful!");
    console.log("🤖 GPT-4o response:", response.choices[0].message.content);

    // Test form generation
    console.log("\n🧪 Testing form generation with SDK...");

    const formResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an expert at creating structured forms. Respond with valid JSON only.",
        },
        {
          role: "user",
          content:
            'Create a simple form for "I want to schedule a doctor appointment". Return JSON with this structure: {"name": "Appointment Booking", "pages": [{"id": "page-1", "title": "What type of appointment?", "inputType": "single-choice", "options": [{"id": "routine", "label": "Routine checkup", "value": "routine", "routeTo": "page-2"}]}]}',
        },
      ],
      max_tokens: 1000,
      temperature: 0.1,
    });

    console.log("✅ Form generation test successful!");
    console.log(
      "📝 Generated form preview:",
      formResponse.choices[0].message.content?.substring(0, 150) + "..."
    );
  } catch (error) {
    console.error("❌ OpenAI SDK error:", error.message);

    if (error.code === "invalid_api_key") {
      console.log("\n🔍 API Key Issues:");
      console.log("1. Verify the key is from platform.openai.com");
      console.log("2. Check if the key has been revoked");
      console.log("3. Ensure your OpenAI account has credits");
    } else if (error.code === "model_not_found") {
      console.log("\n🔍 Model Access Issues:");
      console.log("1. Your account may not have access to GPT-4o");
      console.log('2. Try using "gpt-4" or "gpt-3.5-turbo" instead');
    }
  }
}

testOpenAISDK();
