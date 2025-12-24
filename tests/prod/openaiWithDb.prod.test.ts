import { describe, expect, it } from "vitest";
import { testSingleQuestion, wrapRTL } from "../../src/services/test/openaiTest.js";
import { env } from "../../src/env.js";
import { createLocalChromaClient } from "../../src/clients/chromadb.js";
import { createOpenAIClient } from "../../src/clients/openai.js";
import { createOpenAIService } from "../../src/services/ai/openai.js";
import { defaultSystemPrompt } from "../../src/prompts/system.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { TestResult } from "../../src/services/test/openaiTest.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runProdTest = process.env.RUN_OPENAI_PROD_TEST === "true";
const describeProd = runProdTest ? describe : describe.skip;

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
  const testDataPath = path.join(__dirname, "../../test-data/test-questions.json");
  try {
    const data = await fs.readFile(testDataPath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Failed to load test questions from ${testDataPath}: ${error}`);
  }
}

describeProd("OpenAI prod integration - full test suite", () => {
  it("runs all test cases with OpenAI API", async () => {
    if (!env.OPENAI_API_KEY || env.OPENAI_API_KEY === "test_openai_api_key") {
      throw new Error("OPENAI_API_KEY is not configured properly in .env file");
    }

    const chromaClient = createLocalChromaClient({
      host: new URL(env.CHROMA_URL).hostname,
      port: env.CHROMA_PORT,
      ssl: new URL(env.CHROMA_URL).protocol === "https:",
    });
    const openaiClient = createOpenAIClient(env.OPENAI_API_KEY);

    try {
      await chromaClient.heartbeat();
    } catch (error) {
      throw new Error(
        "Cannot connect to ChromaDB. Make sure it's running with: npm run db:start"
      );
    }

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

    const testData = await loadTestQuestions();
    const testCases = testData.testCases;

    const results: ExtendedTestResult[] = [];
    let passedCount = 0;

    for (const testCase of testCases) {
      try {
        const result = await testSingleQuestion(
          openAIService,
          testCase.question,
          testCase.expectedAnswer,
          `test-${testCase.id}`
        );

        if (result.passed) {
          passedCount++;
        }

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

        openAIService.resetConversation(`test-${testCase.id}`);

        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
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

    const reportPath = path.join(__dirname, "../../test-results/");
    await fs.mkdir(reportPath, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportFile = path.join(reportPath, `test-report-${timestamp}.json`);
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

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
        }
      }
    }

    expect(passedCount).toBe(testCases.length);
  }, 300_000);
});

