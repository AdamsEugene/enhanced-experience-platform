// Deep API key analysis
require("dotenv").config();

function debugAPIKey() {
  const apiKey = process.env.CLAUDE_API_KEY;

  if (!apiKey) {
    console.error("No API key found");
    return;
  }

  console.log("=== Detailed API Key Analysis ===");
  console.log("Raw length:", apiKey.length);
  console.log("Trimmed length:", apiKey.trim().length);

  // Check for invisible characters
  const visibleChars = apiKey.replace(/[^\x20-\x7E]/g, "");
  console.log("Visible chars only length:", visibleChars.length);
  console.log("Has invisible chars:", visibleChars.length !== apiKey.length);

  // Character by character analysis of first/last few chars
  console.log("\nFirst 15 characters:");
  for (let i = 0; i < Math.min(15, apiKey.length); i++) {
    const char = apiKey[i];
    const code = char.charCodeAt(0);
    console.log(`  [${i}]: "${char}" (code: ${code})`);
  }

  console.log("\nLast 10 characters:");
  for (let i = Math.max(0, apiKey.length - 10); i < apiKey.length; i++) {
    const char = apiKey[i];
    const code = char.charCodeAt(0);
    console.log(`  [${i}]: "${char}" (code: ${code})`);
  }

  // Check the exact format
  const expectedPrefix = "sk-ant-api";
  const actualPrefix = apiKey.substring(0, expectedPrefix.length);
  console.log("\nPrefix check:");
  console.log("Expected:", expectedPrefix);
  console.log("Actual:  ", actualPrefix);
  console.log("Match:", actualPrefix === expectedPrefix);

  // Generate a clean version
  const cleanKey = apiKey.trim();
  console.log("\nCleaned key info:");
  console.log("Length after trim:", cleanKey.length);
  console.log("First 15:", cleanKey.substring(0, 15));
  console.log("Last 10:", cleanKey.substring(cleanKey.length - 10));

  // Output the exact string to copy (useful for debugging)
  console.log("\n=== For Manual Verification ===");
  console.log("Copy this exact string and verify it matches your source:");
  console.log(cleanKey);
}

debugAPIKey();
