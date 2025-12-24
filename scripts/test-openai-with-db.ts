#!/usr/bin/env node

import { testSingleQuestion, wrapRTL } from "../src/services/test/openaiTest.js";
import { logger } from "../src/logger.js";
import { env } from "../src/env.js";
import { createLocalChromaClient } from "../src/clients/chromadb.js";
import { createOpenAIClient } from "../src/clients/openai.js";
import { createOpenAIService } from "../src/services/ai/openai.js";
import { defaultSystemPrompt } from "../src/prompts/system.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { TestResult } from "../src/services/test/openaiTest.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ExtendedTestResult extends TestResult {
  testId: string;
  checks: {
    mustContain: boolean[];
    shouldContain: boolean[];
    shouldNotContain: boolean[];
  };
}

async function loadTestQuestions(): Promise<{
  testCases: Array<{
    id: string;
    question: string;
    expectedAnswer: {
      mustContain: string[];
      shouldContain: string[];
      shouldNotContain: string[];
    };
  }>;
}> {
  const testDataPath = path.join(__dirname, "../test-data/test-questions.json");
  try {
    const data = await fs.readFile(testDataPath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Failed to load test questions from ${testDataPath}: ${error}`);
  }
}

async function testOpenAIWithDatabase(): Promise<void> {
  const testLogger = logger.child({ module: "test-openai-db" });

  testLogger.info("Starting OpenAI + Database integration test");

  // Verify environment
  if (!env.OPENAI_API_KEY || env.OPENAI_API_KEY === "test_openai_api_key") {
    throw new Error("OPENAI_API_KEY is not configured properly in .env file");
  }

  // Create clients - use local ChromaDB for testing
  const chromaClient = createLocalChromaClient({
    host: new URL(env.CHROMA_URL).hostname,
    port: env.CHROMA_PORT,
    ssl: new URL(env.CHROMA_URL).protocol === "https:",
  });
  const openaiClient = createOpenAIClient(env.OPENAI_API_KEY);

  // Test ChromaDB connection
  try {
    await chromaClient.heartbeat();
    testLogger.info("chroma.connection.success");
  } catch (error) {
    testLogger.error({ error }, "chroma.connection.failed");
    throw new Error(
      "Cannot connect to ChromaDB. Make sure it's running with: npm run db:start"
    );
  }

  // Create OpenAI service
  const openAIService = createOpenAIService({
    client: openaiClient,
    model: env.OPENAI_MODEL,
    tokenLimit: env.OPENAI_MAX_CONTEXT_TOKENS,
    systemPrompt: defaultSystemPrompt,
    embeddingModel: env.OPENAI_EMBEDDING_MODEL,
    openAIApiKey: env.OPENAI_API_KEY,
    chromaClient,
    chromaCollection: env.CHROMA_COLLECTION,
    chromaMaxResults: 5,
    chromaMaxCharacters: 1500,
    chromaSimilarityThreshold: env.CHROMA_SIMILARITY_THRESHOLD,
  });

  // Load test questions
  const testData = await loadTestQuestions();
  const testCases = testData.testCases;

  testLogger.info({ totalTests: testCases.length }, "loaded.test.cases");

  const results: ExtendedTestResult[] = [];
  let passedCount = 0;

  // Run tests sequentially to avoid rate limits
  for (const testCase of testCases) {
    const testLoggerChild = testLogger.child({ testId: testCase.id });
    testLoggerChild.info({ question: testCase.question }, "running.test");

    try {
      // Run test using app's OpenAI service
      const result = await testSingleQuestion(
        openAIService,
        testCase.question,
        testCase.expectedAnswer,
        `test-${testCase.id}`
      );

      if (result.passed) {
        passedCount++;
        testLoggerChild.info("test.passed");
      } else {
        testLoggerChild.warn(
          {
            similarity: result.similarity,
            response: result.actualAnswer,
          },
          "test.failed"
        );
      }

      // Convert to extended result format
      const extendedResult: ExtendedTestResult = {
        ...result,
        testId: testCase.id,
        checks: {
          mustContain: testCase.expectedAnswer.mustContain.map((str) =>
            result.actualAnswer.toLowerCase().includes(str.toLowerCase())
          ),
          shouldContain: testCase.expectedAnswer.shouldContain.map((str) =>
            result.actualAnswer.toLowerCase().includes(str.toLowerCase())
          ),
          shouldNotContain: testCase.expectedAnswer.shouldNotContain.map(
            (str) => !result.actualAnswer.toLowerCase().includes(str.toLowerCase())
          ),
        },
      };

      results.push(extendedResult);

      // Reset conversation for next test
      openAIService.resetConversation(`test-${testCase.id}`);

      // Add small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      testLoggerChild.error({ error }, "test.error");
      results.push({
        testId: testCase.id,
        question: testCase.question,
        actualAnswer: "",
        expectedAnswer: testCase.expectedAnswer,
        similarity: {
          mustContainMatches: 0,
          mustContainTotal: testCase.expectedAnswer.mustContain.length,
          shouldContainMatches: 0,
          shouldContainTotal: testCase.expectedAnswer.shouldContain.length,
          shouldNotContainMatches: 0,
          shouldNotContainTotal: testCase.expectedAnswer.shouldNotContain.length,
        },
        passed: false,
        checks: {
          mustContain: [],
          shouldContain: [],
          shouldNotContain: [],
        },
        tokenUsage: {
          totalTokens: 0,
          usageTokens: null,
          requestTokens: 0,
          conversationTokens: 0,
          knowledgeTokens: 0,
          userTokens: 0,
          durationMs: 0,
        },
        knowledgeContext: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Generate report
  const report = {
    summary: {
      totalTests: testCases.length,
      passed: passedCount,
      failed: testCases.length - passedCount,
      passRate: ((passedCount / testCases.length) * 100).toFixed(1) + "%",
    },
    results,
    metadata: {
      timestamp: new Date().toISOString(),
      model: env.OPENAI_MODEL,
      collection: env.CHROMA_COLLECTION,
      similarityThreshold: env.CHROMA_SIMILARITY_THRESHOLD,
    },
  };

  // Save detailed report
  const reportPath = path.join(__dirname, "../test-results/");
  await fs.mkdir(reportPath, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportFile = path.join(reportPath, `test-report-${timestamp}.json`);
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total Tests: ${report.summary.totalTests}`);
  console.log(`✅ Passed: ${report.summary.passed}`);
  console.log(`❌ Failed: ${report.summary.failed}`);
  console.log(`📈 Pass Rate: ${report.summary.passRate}`);
  console.log("=".repeat(60));

  // Print detailed failures
  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    console.log("\n❌ FAILED TESTS:");
    console.log("-".repeat(60));
    for (const failure of failures) {
      console.log(`\nTest ID: ${failure.testId}`);
      console.log(`Question: ${wrapRTL(failure.question)}`);
      if (failure.error) {
        console.log(`Error: ${wrapRTL(failure.error)}`);
      } else {
        console.log(`Response: ${wrapRTL(failure.actualAnswer.substring(0, 150))}...`);
        console.log("Missing required content:");
        failure.expectedAnswer.mustContain.forEach((str, idx) => {
          if (!failure.checks.mustContain[idx]) {
            console.log(`  - ${wrapRTL(`"${str}"`)}`);
          }
        });
        console.log("Found prohibited content:");
        failure.expectedAnswer.shouldNotContain.forEach((str, idx) => {
          if (!failure.checks.shouldNotContain[idx]) {
            console.log(`  - ${wrapRTL(`"${str}"`)}`);
          }
        });
      }
      console.log("-".repeat(40));
    }
  }

  // Print knowledge base statistics
  const testsWithKnowledge = results.filter((r) => r.knowledgeContext?.applied);
  console.log("\n📚 KNOWLEDGE BASE STATISTICS:");
  console.log("-".repeat(60));
  console.log(`Tests using KB context: ${testsWithKnowledge.length}/${results.length}`);
  console.log(
    `Average chunks used: ${(
      testsWithKnowledge.reduce((sum, r) => sum + (r.knowledgeContext?.chunksUsed || 0), 0) /
      Math.max(1, testsWithKnowledge.length)
    ).toFixed(1)}`
  );

  // Print token usage statistics
  const totalTokens = results.reduce(
    (sum, r) => sum + (r.tokenUsage.usageTokens || 0),
    0
  );
  const avgDuration =
    results.reduce((sum, r) => sum + r.tokenUsage.durationMs, 0) / results.length;

  console.log("\n⚡ PERFORMANCE:");
  console.log("-".repeat(60));
  console.log(`Total tokens used: ${totalTokens.toLocaleString()}`);
  console.log(`Average response time: ${avgDuration.toFixed(0)}ms`);
  console.log(`Average tokens per request: ${Math.round(totalTokens / results.length)}`);

  console.log("\n" + "=".repeat(60));
  console.log(`📄 Detailed report saved to: ${reportFile}`);
  console.log("=".repeat(60));

  // Exit with error code if any tests failed
  if (passedCount < testCases.length) {
    process.exit(1);
  }
}

// Run the test
testOpenAIWithDatabase().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});

