import { env } from "../../env.js";
import { createOpenAIClient } from "../../clients/openai.js";
import { createLocalChromaClient } from "../../clients/chromadb.js";
import { createOpenAIService } from "../ai/openai.js";
import { defaultSystemPrompt } from "../../prompts/system.js";
import { logger } from "../../logger.js";
import { createOpenAIEmbeddingFunction } from "../ai/knowledgeBase.js";
import type { OpenAIService } from "../ai/openai.js";

export interface TestResult {
  question: string;
  actualAnswer: string;
  expectedAnswer: {
    mustContain: string[];
    shouldContain: string[];
    shouldNotContain: string[];
  };
  similarity: {
    mustContainMatches: number;
    mustContainTotal: number;
    shouldContainMatches: number;
    shouldContainTotal: number;
    shouldNotContainMatches: number;
    shouldNotContainTotal: number;
  };
  passed: boolean;
  tokenUsage: {
    totalTokens: number;
    usageTokens: number | null;
    requestTokens: number;
    conversationTokens: number;
    knowledgeTokens: number;
    userTokens: number;
    durationMs: number;
  };
  knowledgeContext: {
    applied: boolean;
    chunksUsed: number;
    entries: Array<{
      title: string;
      source: string;
    }>;
  } | null;
  error?: string;
}

const RLE = "\u202B";
const PDF = "\u202C";

function isHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

export function wrapRTL(text: string): string {
  if (isHebrew(text)) {
    return `${RLE}${text}${PDF}`;
  }
  return text;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[\s\-_]/g, "");
}

function checkStringPresence(text: string, searchStrings: string[]): boolean[] {
  return searchStrings.map((searchStr) => {
    const normalizedText = normalizeText(text);
    const normalizedSearch = normalizeText(searchStr);
    return normalizedText.includes(normalizedSearch);
  });
}

function checkStringAbsence(text: string, searchStrings: string[]): boolean[] {
  return searchStrings.map((searchStr) => {
    const normalizedText = normalizeText(text);
    const normalizedSearch = normalizeText(searchStr);
    return !normalizedText.includes(normalizedSearch);
  });
}

export async function initializeTestServices(): Promise<{
  openAIService: OpenAIService;
  chromaClient: ReturnType<typeof createLocalChromaClient>;
}> {
  const testLogger = logger.child({ module: "test-services" });

  if (!env.OPENAI_API_KEY || env.OPENAI_API_KEY === "test_openai_api_key") {
    throw new Error("OPENAI_API_KEY is not configured properly in .env file");
  }

  const openAIClient = createOpenAIClient(env.OPENAI_API_KEY);

  const chromaClient = createLocalChromaClient({
    host: new URL(env.CHROMA_URL).hostname,
    port: env.CHROMA_PORT,
    ssl: new URL(env.CHROMA_URL).protocol === "https:",
  });

  try {
    await chromaClient.heartbeat();
    testLogger.info("chroma.connection.success");
  } catch (error) {
    testLogger.error({ error }, "chroma.connection.failed");
    throw new Error(
      "Cannot connect to ChromaDB. Make sure it's running with: npm run db:start"
    );
  }

  try {
    const collection = await chromaClient.getOrCreateCollection({
      name: env.CHROMA_COLLECTION,
    });
    const count = await collection.count();
    if (count === 0) {
      testLogger.warn(
        { collection: env.CHROMA_COLLECTION },
        "chroma.collection.empty"
      );
      console.warn(
        `\n⚠️  WARNING: Collection "${env.CHROMA_COLLECTION}" is empty.\n` +
          `   The test expects knowledge base data to be present.\n` +
          `   You may need to ingest documents first.\n` +
          `   Collection will be queried but may return no results.\n`
      );
    } else {
      testLogger.info(
        { collection: env.CHROMA_COLLECTION, count },
        "chroma.collection.has_data"
      );
    }
  } catch (error) {
    testLogger.warn(
      { error: error instanceof Error ? error.message : error },
      "chroma.collection.check.failed"
    );
  }

  const openAIService = createOpenAIService({
    client: openAIClient,
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

  return { openAIService, chromaClient };
}

export async function queryDatabaseDirectly(
  chromaClient: ReturnType<typeof createLocalChromaClient>,
  question: string,
  collectionName: string
): Promise<void> {
  const testLogger = logger.child({ module: "db-direct-query" });

  try {
    const openaiClient = createOpenAIClient(env.OPENAI_API_KEY);
    const embeddingResponse = await openaiClient.embeddings.create({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: [question],
    });

    const queryEmbedding = embeddingResponse.data[0]?.embedding;
    if (!queryEmbedding) {
      throw new Error("Failed to generate embedding for question");
    }

    const chromaEmbeddingFunction = createOpenAIEmbeddingFunction({
      openai_api_key: env.OPENAI_API_KEY,
      model: env.OPENAI_EMBEDDING_MODEL,
      embedTexts: async (texts: string[]) => {
        const response = await openaiClient.embeddings.create({
          model: env.OPENAI_EMBEDDING_MODEL,
          input: texts,
        });
        return response.data.map((item) => item.embedding as number[]);
      },
    });

    const collection = await chromaClient.getOrCreateCollection({
      name: collectionName,
      embeddingFunction: chromaEmbeddingFunction,
    });

    const queryResult = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: 10,
      include: ["documents", "metadatas", "distances"],
    });

    const documents = queryResult.documents?.[0] ?? [];
    const metadatas = queryResult.metadatas?.[0] ?? [];
    const distances = queryResult.distances?.[0] ?? [];

    console.log("\n" + "=".repeat(60));
    console.log("🔍 DIRECT DATABASE QUERY RESULTS");
    console.log("=".repeat(60));
    console.log(`Question: ${wrapRTL(question)}`);
    console.log(`Results found: ${documents.length}`);
    console.log("-".repeat(60));

    if (documents.length === 0) {
      console.log("❌ No results returned from database");
      console.log("=".repeat(60) + "\n");
      return;
    }

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const metadata = metadatas[i] ?? {};
      const distance = distances[i];
      const similarity = typeof distance === "number" ? 1 - distance : null;

      const title =
        typeof metadata.title === "string" ? metadata.title : `Result ${i + 1}`;
      const source =
        typeof metadata.source === "string" ? metadata.source : "unknown";

      console.log(
        `\n[${i + 1}] Similarity: ${similarity?.toFixed(4) ?? "N/A"} (distance: ${distance?.toFixed(4) ?? "N/A"})`
      );
      console.log(`    Title: ${title}`);
      console.log(`    Source: ${source}`);
      console.log(
        `    Content: ${wrapRTL(doc?.substring(0, 200) ?? "")}${doc && doc.length > 200 ? "..." : ""}`
      );
    }

    console.log("\n" + "=".repeat(60) + "\n");
  } catch (error) {
    testLogger.error({ error }, "db.direct.query.failed");
    console.error("❌ Failed to query database directly:", error);
  }
}

export async function testSingleQuestion(
  openAIService: OpenAIService,
  question: string,
  expectedAnswer: {
    mustContain: string[];
    shouldContain: string[];
    shouldNotContain: string[];
  },
  conversationId: string = "test-single",
  chromaClient?: ReturnType<typeof createLocalChromaClient>
): Promise<TestResult> {
  const testLogger = logger.child({ module: "test-single-question" });

  if (chromaClient) {
    await queryDatabaseDirectly(chromaClient, question, env.CHROMA_COLLECTION);
  }

  try {
    const startTime = Date.now();
    const openaiResult = await openAIService.generateReply(
      conversationId,
      question
    );
    const durationMs = Date.now() - startTime;

    const mustContainChecks = checkStringPresence(
      openaiResult.response,
      expectedAnswer.mustContain
    );
    const shouldContainChecks = checkStringPresence(
      openaiResult.response,
      expectedAnswer.shouldContain
    );
    const shouldNotContainChecks = checkStringAbsence(
      openaiResult.response,
      expectedAnswer.shouldNotContain
    );

    const mustContainMatches = mustContainChecks.filter(
      (check) => check === true
    ).length;
    const shouldContainMatches = shouldContainChecks.filter(
      (check) => check === true
    ).length;
    const shouldNotContainMatches = shouldNotContainChecks.filter(
      (check) => check === true
    ).length;

    const allMustContainPassed = mustContainChecks.every(
      (check) => check === true
    );
    const allShouldNotContainPassed = shouldNotContainChecks.every(
      (check) => check === true
    );
    const passed = allMustContainPassed && allShouldNotContainPassed;

    const knowledgeContext: TestResult["knowledgeContext"] =
      openaiResult.knowledgeContext
        ? {
            applied: openaiResult.knowledgeContext.applied,
            chunksUsed: openaiResult.knowledgeContext.chunksUsed,
            entries: openaiResult.knowledgeContext.entries.map((entry) => ({
              title: entry.title,
              source: entry.source ?? "unknown",
            })),
          }
        : null;

    return {
      question,
      actualAnswer: openaiResult.response,
      expectedAnswer,
      similarity: {
        mustContainMatches,
        mustContainTotal: expectedAnswer.mustContain.length,
        shouldContainMatches,
        shouldContainTotal: expectedAnswer.shouldContain.length,
        shouldNotContainMatches,
        shouldNotContainTotal: expectedAnswer.shouldNotContain.length,
      },
      passed,
      tokenUsage: {
        ...openaiResult.tokens,
        durationMs,
      },
      knowledgeContext,
    };
  } catch (error) {
    testLogger.error({ error }, "test.error");
    return {
      question,
      actualAnswer: "",
      expectedAnswer,
      similarity: {
        mustContainMatches: 0,
        mustContainTotal: expectedAnswer.mustContain.length,
        shouldContainMatches: 0,
        shouldContainTotal: expectedAnswer.shouldContain.length,
        shouldNotContainMatches: 0,
        shouldNotContainTotal: expectedAnswer.shouldNotContain.length,
      },
      passed: false,
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
    };
  }
}

export function printTestResult(result: TestResult): void {
  console.log("\n" + "=".repeat(60));
  console.log("📊 TEST RESULT");
  console.log("=".repeat(60));
  console.log(`Question: ${wrapRTL(result.question)}`);
  console.log("\n" + "-".repeat(60));
  console.log("Response:");
  console.log(wrapRTL(result.actualAnswer || "(No response - error occurred)"));
  console.log("\n" + "-".repeat(60));
  console.log("✅ Test Status:", result.passed ? "PASSED" : "FAILED");
  console.log("\nSimilarity Analysis:");
  console.log(
    `  Must Contain: ${result.similarity.mustContainMatches}/${result.similarity.mustContainTotal} matches`
  );
  console.log(
    `  Should Contain: ${result.similarity.shouldContainMatches}/${result.similarity.shouldContainTotal} matches`
  );
  console.log(
    `  Should Not Contain: ${result.similarity.shouldNotContainMatches}/${result.similarity.shouldNotContainTotal} matches`
  );

  if (!result.passed) {
    console.log("\n❌ Missing Required Content:");
    result.expectedAnswer.mustContain.forEach((str) => {
      const check = checkStringPresence(result.actualAnswer, [str])[0];
      if (!check) {
        console.log(`  - ${wrapRTL(`"${str}"`)}`);
      }
    });
    console.log("\n❌ Found Prohibited Content:");
    result.expectedAnswer.shouldNotContain.forEach((str) => {
      const check = checkStringAbsence(result.actualAnswer, [str])[0];
      if (!check) {
        console.log(`  - ${wrapRTL(`"${str}"`)}`);
      }
    });
  }

  if (result.error) {
    console.log(`\n❌ Error: ${wrapRTL(result.error)}`);
  }

  console.log("\n📚 Knowledge Base Context:");
  if (result.knowledgeContext?.applied) {
    console.log(`  ✅ Applied: Yes`);
    console.log(`  📦 Chunks Used: ${result.knowledgeContext.chunksUsed}`);
    if (result.knowledgeContext.entries.length > 0) {
      console.log(`  📄 Sources:`);
      result.knowledgeContext.entries.forEach((entry) => {
        console.log(`    - ${wrapRTL(entry.title)} (${wrapRTL(entry.source)})`);
      });
    }
  } else {
    console.log(`  ❌ Applied: No`);
  }

  console.log("\n⚡ Performance:");
  console.log(`  Duration: ${result.tokenUsage.durationMs}ms`);
  console.log(`  Total Tokens: ${result.tokenUsage.totalTokens}`);
  console.log(`  Usage Tokens: ${result.tokenUsage.usageTokens ?? "N/A"}`);
  console.log(`  Knowledge Tokens: ${result.tokenUsage.knowledgeTokens}`);

  console.log("\n" + "=".repeat(60));
}
