import { describe, expect, it } from "vitest";
import { initializeTestServices, testSingleQuestion, printTestResult } from "../../src/services/test/openaiTest.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runProdTest = process.env.RUN_OPENAI_PROD_TEST === "true";
const describeProd = runProdTest ? describe : describe.skip;

describeProd("OpenAI prod integration - single question", () => {
  it("tests single question with OpenAI API", async () => {
    const testDataPath = path.join(__dirname, "../../test-data/test-questions.json");
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

    const testCase = testData.testCases[0];
    if (!testCase) {
      throw new Error("No test cases found in test-questions.json");
    }

    const { openAIService, chromaClient } = await initializeTestServices();

    const result = await testSingleQuestion(
      openAIService,
      testCase.question,
      testCase.expectedAnswer,
      `test-${testCase.id}`,
      chromaClient
    );

    printTestResult(result);

    const reportPath = path.join(__dirname, "../../test-results/");
    await fs.mkdir(reportPath, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportFile = path.join(reportPath, `single-test-${timestamp}.json`);
    await fs.writeFile(reportFile, JSON.stringify(result, null, 2));

    expect(result.passed).toBe(true);
    expect(result.actualAnswer).toBeTruthy();
    expect(result.error).toBeUndefined();
  }, 60_000);
});

