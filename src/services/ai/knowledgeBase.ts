import {
  type ChromaClient,
  type Collection,
  type EmbeddingFunction as ChromaEmbeddingFunction,
} from "chromadb";
import OpenAI from "openai";
import { logger } from "../../logger.js";

export type EmbeddingVector = number[];

export const isEmbeddingVector = (value: unknown): value is EmbeddingVector =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (element) => typeof element === "number" && Number.isFinite(element)
  );

export interface OpenAIEmbeddingFunctionConfig {
  model: string;
}

interface CreateOpenAIEmbeddingFunctionOptions {
  openai_api_key: string;
  model: string;
  embedTexts?: (texts: string[]) => Promise<EmbeddingVector[]>;
}

function createEmbeddingFunction(
  apiKey: string,
  model: string
): (texts: string[]) => Promise<EmbeddingVector[]> {
  const embeddingClient = new OpenAI({ apiKey });
  return async (texts: string[]): Promise<EmbeddingVector[]> => {
    const response = await embeddingClient.embeddings.create({
      model,
      input: texts,
    });

    return response.data.map((item, index) => {
      const embedding = item.embedding;
      if (!isEmbeddingVector(embedding)) {
        throw new Error(
          `Invalid embedding vector received from OpenAI at index ${index}`
        );
      }
      return embedding;
    });
  };
}

export function createOpenAIEmbeddingFunction(
  options: CreateOpenAIEmbeddingFunctionOptions
): ChromaEmbeddingFunction {
  const { openai_api_key, model, embedTexts } = options;

  const embedTextsFn =
    embedTexts ?? createEmbeddingFunction(openai_api_key, model);

  return {
    name: "openai-api",
    getConfig(): OpenAIEmbeddingFunctionConfig {
      return { model };
    },
    defaultSpace(): "cosine" {
      return "cosine";
    },
    supportedSpaces(): Array<"cosine" | "l2" | "ip"> {
      return ["cosine", "l2", "ip"];
    },
    async generate(texts: string[]): Promise<EmbeddingVector[]> {
      return embedTextsFn(texts);
    },
    async generateForQueries(texts: string[]): Promise<EmbeddingVector[]> {
      return embedTextsFn(texts);
    },
  };
}

export interface KnowledgeEntry {
  title: string;
  source?: string | null;
}

export interface KnowledgeContext {
  message: OpenAI.Chat.Completions.ChatCompletionMessageParam;
  entries: KnowledgeEntry[];
}

export interface KnowledgeBaseServiceOptions {
  chromaClient: ChromaClient;
  chromaCollection: string;
  embeddingModel: string;
  openAIApiKey: string;
  chromaMaxResults?: number;
  chromaMaxCharacters?: number;
  chromaSimilarityThreshold?: number;
  embedTexts?: (texts: string[]) => Promise<EmbeddingVector[]>;
  openaiClient: OpenAI; // Used for fallback embedding if custom embedTexts not provided
}

export interface KnowledgeBaseService {
  buildKnowledgeContext: (
    conversationId: string,
    userMessage: string
  ) => Promise<KnowledgeContext | null>;
}

export function createKnowledgeBaseService(
  options: KnowledgeBaseServiceOptions
): KnowledgeBaseService {
  const {
    chromaClient,
    chromaCollection,
    embeddingModel,
    openAIApiKey,
    openaiClient,
  } = options;

  const serviceLogger = logger.child({ module: "knowledge-base-service" });
  const chromaMaxResults = options.chromaMaxResults ?? 5;
  const chromaMaxCharacters = options.chromaMaxCharacters ?? 1500;
  const chromaSimilarityThreshold = options.chromaSimilarityThreshold ?? 0.7;

  let chromaCollectionPromise: Promise<Collection> | null = null;

  const logInfo = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.info(meta ?? {}, message);
  };

  const logError = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.error(meta ?? {}, message);
  };

  const logWarn = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.warn(meta ?? {}, message);
  };

  const embedTexts =
    options.embedTexts ??
    (async (texts: string[]): Promise<EmbeddingVector[]> => {
      try {
        const response = await openaiClient.embeddings.create({
          model: embeddingModel,
          input: texts,
        });

        return response.data.map((item, index) => {
          const embedding = item.embedding;
          if (!isEmbeddingVector(embedding)) {
            logError("openai.embedding.invalid", {
              index,
              embeddingType: typeof embedding,
              explanation:
                "Invalid embedding vector received from OpenAI API. Expected array of numbers but received different type. This indicates an API response format issue.",
            });
            throw new Error(
              `Invalid embedding vector received from OpenAI at index ${index}`
            );
          }
          return embedding;
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const isRateLimitError =
          errorMessage.includes("rate_limit") ||
          errorMessage.includes("429") ||
          (error instanceof OpenAI.APIError && error.status === 429);

        logError("openai.embedding.api.failed", {
          error: errorMessage,
          isRateLimit: isRateLimitError,
          statusCode:
            error instanceof OpenAI.APIError ? error.status : undefined,
          inputLength: texts.length,
          explanation:
            "OpenAI embedding API call failed. Rate limit errors indicate too many requests. Error will be re-thrown with user-friendly message to prevent knowledge base context building.",
        });

        if (isRateLimitError) {
          throw new Error(
            "OpenAI embedding API rate limit exceeded. Please try again later."
          );
        }
        throw new Error(`OpenAI embedding API error: ${errorMessage}`);
      }
    });

  const chromaEmbeddingFunction = createOpenAIEmbeddingFunction({
    openai_api_key: openAIApiKey,
    model: embeddingModel,
    embedTexts,
  });

  const getOrCreateChromaCollection = async (): Promise<Collection | null> => {
    if (!chromaCollectionPromise) {
      chromaCollectionPromise = chromaClient
        .getOrCreateCollection({
          name: chromaCollection,
          embeddingFunction: chromaEmbeddingFunction,
        })
        .catch((error) => {
          chromaCollectionPromise = null;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const isConnectionError =
            errorMessage.includes("ECONNREFUSED") ||
            errorMessage.includes("ENOTFOUND") ||
            errorMessage.includes("timeout") ||
            errorMessage.includes("connection");

          logError("chroma.collection.resolve.failed", {
            collection: chromaCollection,
            error: errorMessage,
            isConnectionError,
            stack: error instanceof Error ? error.stack : undefined,
            explanation:
              "Failed to resolve or create ChromaDB collection. Connection errors indicate ChromaDB server is unreachable. Collection promise reset to allow retry on next access.",
          });
          return Promise.reject(error);
        });
    }

    try {
      return await chromaCollectionPromise;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logWarn("chroma.collection.resolve.retry.failed", {
        collection: chromaCollection,
        error: errorMessage,
        explanation:
          "Retry to resolve ChromaDB collection failed. Returning null to allow graceful degradation - knowledge base queries will be skipped.",
      });
      return null;
    }
  };

  void (async () => {
    try {
      await chromaClient.heartbeat();
      logInfo("chroma.heartbeat.success", {
        explanation:
          "ChromaDB heartbeat check succeeded, indicating database connection is healthy and ready for queries.",
      });
    } catch (error) {
      logError("chroma.heartbeat.failed", {
        error: error instanceof Error ? error.message : error,
        explanation:
          "ChromaDB heartbeat check failed during initialization. Database may be unreachable or misconfigured. Service will continue but knowledge base queries may fail.",
      });
    }

    try {
      await getOrCreateChromaCollection();
      logInfo("chroma.collection.ready", {
        collection: chromaCollection,
        explanation:
          "ChromaDB collection successfully resolved and ready for queries. Knowledge base service is operational.",
      });
    } catch {
      // Ignore initialization errors
    }
  })();

  const truncateText = (value: string, limit: number): string => {
    if (value.length <= limit) {
      return value;
    }
    const sliceLimit = Math.max(0, limit - 3);
    return `${value.slice(0, sliceLimit)}...`;
  };

  const buildKnowledgeContext = async (
    conversationId: string,
    userMessage: string
  ): Promise<KnowledgeContext | null> => {
    let collection: Collection | null = null;
    try {
      collection = await getOrCreateChromaCollection();
    } catch (error) {
      logError("chroma.collection.access.failed", {
        conversationId,
        collection: chromaCollection,
        error: error instanceof Error ? error.message : String(error),
        explanation:
          "Failed to access ChromaDB collection when building knowledge context. Returning null to allow request to proceed without knowledge base context.",
      });
      return null;
    }

    if (!collection) {
      logWarn("chroma.collection.unavailable", {
        conversationId,
        collection: chromaCollection,
        explanation:
          "ChromaDB collection is unavailable (null). This may be due to connection issues or collection not existing. Returning null to allow request to proceed without knowledge base context.",
      });
      return null;
    }

    let queryEmbeddings: EmbeddingVector[];
    try {
      queryEmbeddings = await embedTexts([userMessage]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logWarn("openai.embedding.failed", {
        conversationId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        explanation:
          "Failed to generate embeddings for user message. This prevents knowledge base search. Returning null to allow request to proceed without knowledge context.",
      });
      return null;
    }

    if (!Array.isArray(queryEmbeddings) || queryEmbeddings.length === 0) {
      logWarn("openai.embedding.empty", {
        conversationId,
        explanation:
          "Embedding API returned empty or invalid result. Cannot perform knowledge base search without embeddings. Returning null to allow request to proceed without knowledge context.",
      });
      return null;
    }

    try {
      const queryResult = await collection.query({
        queryEmbeddings,
        nResults: chromaMaxResults,
        include: ["documents", "metadatas", "distances"],
      });

      const documents = queryResult.documents?.[0] ?? [];
      const metadatas = queryResult.metadatas?.[0] ?? [];
      const distances = queryResult.distances?.[0] ?? [];

      const entries: string[] = [];
      const perDocumentLimit = Math.max(
        200,
        Math.floor(chromaMaxCharacters / Math.max(1, chromaMaxResults))
      );

      const entriesForContext: KnowledgeEntry[] = [];

      // Filter results by similarity threshold
      const filteredResults = documents
        .map((doc, index) => {
          const metadata =
            (Array.isArray(metadatas) ? metadatas[index] : null) ?? {};
          const title =
            metadata && typeof metadata.title === "string"
              ? metadata.title
              : `snippet-${index + 1}`;
          const source =
            metadata && typeof metadata.source === "string"
              ? metadata.source
              : "unknown";
          const distance = Array.isArray(distances) ? distances[index] : null;
          const similarity = typeof distance === "number" ? 1 - distance : null;

          return {
            document: doc,
            metadata,
            title,
            source,
            distance,
            similarity,
          };
        })
        .filter((item) => {
          if (item.similarity === null) return false;
          const passesThreshold = item.similarity >= chromaSimilarityThreshold;
          if (!passesThreshold) {
            logInfo("chroma.query.result.filtered", {
              conversationId,
              title: item.title,
              similarity: item.similarity,
              threshold: chromaSimilarityThreshold,
              explanation:
                "Knowledge base result filtered out because similarity score is below threshold. This ensures only highly relevant context is included in the response.",
            });
          }
          return passesThreshold;
        });

      if (filteredResults.length === 0) {
        const maxSimilarity =
          distances.length > 0
            ? Math.max(
                ...distances.map((d) => (typeof d === "number" ? 1 - d : 0))
              )
            : null;

        if (documents.length > 0) {
          logWarn("chroma.query.all_filtered", {
            conversationId,
            collection: chromaCollection,
            threshold: chromaSimilarityThreshold,
            maxSimilarity,
            totalResults: documents.length,
            requestedResults: chromaMaxResults,
            explanation:
              "All knowledge base results filtered out due to low similarity scores. Falling back to top results regardless of threshold to provide some context.",
          });

          const topResults = documents
            .map((doc, index) => {
              const metadata =
                (Array.isArray(metadatas) ? metadatas[index] : null) ?? {};
              const title =
                metadata && typeof metadata.title === "string"
                  ? metadata.title
                  : `snippet-${index + 1}`;
              const source =
                metadata && typeof metadata.source === "string"
                  ? metadata.source
                  : "unknown";
              const distance = Array.isArray(distances)
                ? distances[index]
                : null;
              const similarity =
                typeof distance === "number" ? 1 - distance : null;

              return {
                document: doc,
                metadata,
                title,
                source,
                distance,
                similarity,
              };
            })
            .slice(0, chromaMaxResults);

          filteredResults.push(...topResults);
        } else {
          logInfo("chroma.query.below_threshold", {
            conversationId,
            collection: chromaCollection,
            threshold: chromaSimilarityThreshold,
            maxSimilarity,
            requestedResults: chromaMaxResults,
            explanation:
              "No knowledge base results found or all results below similarity threshold. Returning null - request will proceed without knowledge context.",
          });
          return null;
        }
      }

      filteredResults.forEach((item) => {
        if (!item.document) return;

        entriesForContext.push({ title: item.title, source: item.source });

        const scoreFragment =
          typeof item.distance === "number"
            ? ` | score: ${item.distance.toFixed(4)}`
            : "";

        entries.push(
          `- (${item.title} | source: ${item.source}${scoreFragment}          ) ${truncateText(
            item.document,
            perDocumentLimit
          )}`
        );
      });

      const contextString = `Knowledge base context:\n${entries.join("\n")}`;

      logInfo("chroma.query.success", {
        conversationId,
        collection: chromaCollection,
        results: entries.length,
        threshold: chromaSimilarityThreshold,
        explanation:
          "Successfully queried knowledge base and built context with relevant entries. Context will be included in OpenAI API request to improve answer accuracy.",
      });

      return {
        entries: entriesForContext,
        message: {
          role: "system",
          content: contextString,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isConnectionError =
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("ENOTFOUND") ||
        errorMessage.includes("timeout") ||
        errorMessage.includes("connection");

      logError("chroma.query.failed", {
        conversationId,
        collection: chromaCollection,
        error: errorMessage,
        isConnectionError,
        stack: error instanceof Error ? error.stack : undefined,
        explanation:
          "Failed to query ChromaDB knowledge base. Connection errors indicate database is unreachable. Returning null to allow request to proceed without knowledge context.",
      });
      return null;
    }
  };

  return {
    buildKnowledgeContext,
  };
}
