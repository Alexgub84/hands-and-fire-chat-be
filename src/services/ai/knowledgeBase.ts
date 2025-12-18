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

function createEmbedder(
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

  const embedTextsFn = embedTexts ?? createEmbedder(openai_api_key, model);

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
      const response = await openaiClient.embeddings.create({
        model: embeddingModel,
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
    });

  const chromaEmbeddingFunction = createOpenAIEmbeddingFunction({
    openai_api_key: openAIApiKey,
    model: embeddingModel,
    embedTexts,
  });

  const resolveChromaCollection = async (): Promise<Collection | null> => {
    if (!chromaCollectionPromise) {
      chromaCollectionPromise = chromaClient
        .getOrCreateCollection({
          name: chromaCollection,
          embeddingFunction: chromaEmbeddingFunction,
        })
        .catch((error) => {
          chromaCollectionPromise = null;
          logError("chroma.collection.resolve.failed", {
            collection: chromaCollection,
            error: error instanceof Error ? error.message : error,
          });
          return Promise.reject(error);
        });
    }

    try {
      return await chromaCollectionPromise;
    } catch {
      return null;
    }
  };

  void (async () => {
    try {
      await chromaClient.heartbeat();
      logInfo("chroma.heartbeat.success");
    } catch (error) {
      logError("chroma.heartbeat.failed", {
        error: error instanceof Error ? error.message : error,
      });
    }

    try {
      await resolveChromaCollection();
      logInfo("chroma.collection.ready", { collection: chromaCollection });
    } catch {
      // Ignore initialization errors
    }
  })();

  const truncate = (value: string, limit: number): string => {
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
    const collection = await resolveChromaCollection();

    if (!collection) {
      return null;
    }

    let queryEmbeddings: EmbeddingVector[];
    try {
      queryEmbeddings = await embedTexts([userMessage]);
    } catch (error) {
      logWarn("openai.embedding.failed", {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }

    if (!Array.isArray(queryEmbeddings) || queryEmbeddings.length === 0) {
      logWarn("openai.embedding.empty", {
        conversationId,
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
        logInfo("chroma.query.below_threshold", {
          conversationId,
          collection: chromaCollection,
          threshold: chromaSimilarityThreshold,
          maxSimilarity,
          requestedResults: chromaMaxResults,
        });
        return null;
      }

      filteredResults.forEach((item) => {
        if (!item.document) return;

        entriesForContext.push({ title: item.title, source: item.source });

        const scoreFragment =
          typeof item.distance === "number"
            ? ` | score: ${item.distance.toFixed(4)}`
            : "";

        entries.push(
          `- (${item.title} | source: ${item.source}${scoreFragment}) ${truncate(
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
      });

      return {
        entries: entriesForContext,
        message: {
          role: "system",
          content: contextString,
        },
      };
    } catch (error) {
      logError("chroma.query.failed", {
        conversationId,
        collection: chromaCollection,
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  };

  return {
    buildKnowledgeContext,
  };
}
