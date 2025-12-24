#!/usr/bin/env node

import { initializeTestServices, testSingleQuestion, printTestResult } from "../src/services/test/openaiTest.js";
import { logger } from "../src/logger.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSingleTest(): Promise<void> {
  const testLogger = logger.child({ module: "test-openai-single" });

  testLogger.info("Starting single question OpenAI + Database test");

  // Load test questions
  const testDataPath = path.join(__dirname, "../test-data/test-questions.json");
  interface TestCase {
    id: string;
    question: string;
    expectedAnswer: {
      mustContain: string[];
      shouldContain: string[];
      shouldNotContain: string[];
    };
  }
  interface TestData {
    testCases: TestCase[];
  }
  let testData: TestData;
  try {
    const data = await fs.readFile(testDataPath, "utf-8");
    testData = JSON.parse(data) as TestData;
  } catch (error) {
    throw new Error(`Failed to load test questions from ${testDataPath}: ${error}`);
  }

  // Use first test case
  const testCase = testData.testCases[0];
  if (!testCase) {
    throw new Error("No test cases found in test-questions.json");
  }

  testLogger.info({ testId: testCase.id, question: testCase.question }, "running.single.test");

  // Initialize services using app's initialization pattern
  const { openAIService, chromaClient } = await initializeTestServices();

  // Run the test using the app's OpenAI service
  const result = await testSingleQuestion(
    openAIService,
    testCase.question,
    testCase.expectedAnswer,
    `test-${testCase.id}`,
    chromaClient
  );

  // Print results
  printTestResult(result);

  // Save result to file
  const reportPath = path.join(__dirname, "../test-results/");
  await fs.mkdir(reportPath, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportFile = path.join(reportPath, `single-test-${timestamp}.json`);
  await fs.writeFile(reportFile, JSON.stringify(result, null, 2));

  console.log(`📄 Detailed result saved to: ${reportFile}`);
  console.log("=".repeat(60) + "\n");

  // Exit with error code if test failed
  if (!result.passed) {
    process.exit(1);
  }
}

// Run the test
runSingleTest().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
