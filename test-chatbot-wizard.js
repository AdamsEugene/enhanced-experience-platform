#!/usr/bin/env node

/**
 * Test script for Chatbot Wizard API
 *
 * This script tests the 2-step chatbot wizard flow:
 * 1. Submit a chatbot description
 * 2. Answer follow-up questions
 * 3. Receive the generated chatbot configuration
 */

const API_BASE = "http://localhost:3007/api";

async function testChatbotWizard() {
  console.log("🧪 Testing Chatbot Wizard API...\n");

  try {
    // Step 1: Analyze chatbot description
    console.log("📝 Step 1: Submitting chatbot description...");
    const step1Response = await fetch(`${API_BASE}/chatbot-wizard/step1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userDescription:
          "I want a customer support chatbot for my online bookstore",
      }),
    });

    if (!step1Response.ok) {
      throw new Error(
        `Step 1 failed: ${step1Response.status} ${step1Response.statusText}`
      );
    }

    const step1Data = await step1Response.json();
    console.log("✅ Step 1 Response:");
    console.log(`   Session ID: ${step1Data.sessionId}`);
    console.log(`   Needs More Info: ${step1Data.needsMoreInfo}`);
    console.log(`   Message: ${step1Data.message}`);

    if (step1Data.questions) {
      console.log(`   Questions (${step1Data.questions.length}):`);
      step1Data.questions.forEach((q, i) => {
        console.log(`     ${i + 1}. ${q}`);
      });
    }
    console.log("");

    // If we need more info, proceed to step 2
    if (step1Data.needsMoreInfo && step1Data.sessionId) {
      console.log("📝 Step 2: Submitting answers...");
      const step2Response = await fetch(`${API_BASE}/chatbot-wizard/step2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: step1Data.sessionId,
          answers:
            "We sell fiction and non-fiction books. The tone should be friendly and knowledgeable. The chatbot should help with book recommendations, order tracking, and return policies.",
        }),
      });

      if (!step2Response.ok) {
        throw new Error(
          `Step 2 failed: ${step2Response.status} ${step2Response.statusText}`
        );
      }

      const step2Data = await step2Response.json();
      console.log("✅ Step 2 Response:");
      console.log(`   Chatbot ID: ${step2Data.chatbotId}`);
      console.log(`   Message: ${step2Data.message}`);
      console.log(`   Chat Link: ${step2Data.chatLink}`);
      console.log(`   Phone Number: ${step2Data.phoneNumber}`);
      console.log("");
      console.log("📋 Generated Chatbot Configuration:");
      console.log(`   Name: ${step2Data.chatbotConfig.name}`);
      console.log(`   Description: ${step2Data.chatbotConfig.description}`);
      console.log(`   Personality: ${step2Data.chatbotConfig.personality}`);
      console.log(
        `   Capabilities: ${step2Data.chatbotConfig.capabilities?.length || 0}`
      );

      if (step2Data.chatbotConfig.capabilities) {
        step2Data.chatbotConfig.capabilities.forEach((cap, i) => {
          console.log(`     ${i + 1}. ${cap}`);
        });
      }

      console.log("");
      console.log("🎉 Chatbot wizard test completed successfully!");

      // Test GET endpoint
      console.log("\n📝 Testing GET /api/chatbots/:id...");
      const getChatbotResponse = await fetch(
        `${API_BASE}/chatbots/${step2Data.chatbotId}`
      );

      if (getChatbotResponse.ok) {
        const chatbot = await getChatbotResponse.json();
        console.log(`✅ Successfully retrieved chatbot: ${chatbot.name}`);
      } else {
        console.log("❌ Failed to retrieve chatbot");
      }

      // Test LIST endpoint
      console.log("\n📝 Testing GET /api/chatbots...");
      const listResponse = await fetch(`${API_BASE}/chatbots`);

      if (listResponse.ok) {
        const list = await listResponse.json();
        console.log(
          `✅ Successfully retrieved chatbot list: ${list.total} chatbot(s)`
        );
      } else {
        console.log("❌ Failed to retrieve chatbot list");
      }
    } else {
      console.log("⚠️  AI determined enough info was provided (rare case)");
      console.log("   Skipping Step 2...");
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    process.exit(1);
  }
}

// Run the test
testChatbotWizard();
