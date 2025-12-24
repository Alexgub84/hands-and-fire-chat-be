import OpenAI from "openai";
import { type Tiktoken } from "tiktoken";
import { logger } from "../../logger.js";
import type { ChromaClient } from "chromadb";
import {
  createConversationHistoryService,
  type ConversationHistoryService,
} from "./conversationHistory.js";
import {
  createKnowledgeBaseService,
  type KnowledgeBaseService,
  type EmbeddingVector,
  type KnowledgeContext,
  type KnowledgeEntry,
} from "./knowledgeBase.js";
import type { SessionManager } from "./sessionManager.js";
import { normalizeAssistantReply } from "../../utils/contentNormalizer.js";
import {
  fallbackResponse,
  factualQueryKeywords,
} from "../../prompts/fallback.js";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface OpenAIServiceOptions {
  client: OpenAI;
  model: string;
  tokenLimit: number;
  systemPrompt: string;
  embeddingModel: string;
  openAIApiKey: string;
  tokenizer?: Pick<Tiktoken, "encode">;
  chromaClient: ChromaClient;
  chromaCollection: string;
  chromaMaxResults?: number;
  chromaMaxCharacters?: number;
  embedTexts?: (texts: string[]) => Promise<EmbeddingVector[]>;
  conversationHistoryService?: ConversationHistoryService;
  knowledgeBaseService?: KnowledgeBaseService;
  chromaSimilarityThreshold?: number;
  sessionManager?: SessionManager;
}

export interface GenerateReplyResult {
  response: string;
  tokens: {
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
    entries: KnowledgeEntry[];
  } | null;
}

export interface OpenAIService {
  generateReply: (
    conversationId: string,
    message: string
  ) => Promise<GenerateReplyResult>;
  resetConversation: (conversationId: string) => void;
  getConversationHistory: (conversationId: string) => ChatMessage[];
}

export function createOpenAIService(
  options: OpenAIServiceOptions
): OpenAIService {
  const {
    client,
    model,
    tokenLimit,
    systemPrompt,
    openAIApiKey,
    chromaClient,
    chromaCollection,
    embeddingModel,
  } = options;

  const serviceLogger = logger.child({ module: "openai-service", model });

  const conversationHistory =
    options.conversationHistoryService ??
    createConversationHistoryService({
      model,
      tokenLimit,
      systemPrompt,
      ...(options.tokenizer && { tokenizer: options.tokenizer }),
      ...(options.sessionManager && { sessionManager: options.sessionManager }),
    });

  const knowledgeBase =
    options.knowledgeBaseService ??
    createKnowledgeBaseService({
      chromaClient,
      chromaCollection,
      embeddingModel,
      openAIApiKey,
      openaiClient: client,
      ...(options.chromaMaxResults && {
        chromaMaxResults: options.chromaMaxResults,
      }),
      ...(options.chromaMaxCharacters && {
        chromaMaxCharacters: options.chromaMaxCharacters,
      }),
      ...(options.embedTexts && { embedTexts: options.embedTexts }),
    });

  const logInfo = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.info(meta ?? {}, message);
  };

  const logError = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.error(meta ?? {}, message);
  };

  const logWarn = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.warn(meta ?? {}, message);
  };

  function addUserMessageToConversation(
    conversationId: string,
    message: string
  ): ChatMessage[] {
    const messages = conversationHistory.getMessages(conversationId);
    const userMessage: ChatMessage = { role: "user", content: message };
    conversationHistory.addMessage(conversationId, userMessage);
    return messages;
  }

  function isFactualQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return factualQueryKeywords.some((keyword) =>
      lowerMessage.includes(keyword.toLowerCase())
    );
  }

  function generateFallbackResponse(
    conversationId: string,
    message: string,
    userTokens: number
  ): GenerateReplyResult {
    logInfo("fallback.response.triggered", {
      conversationId,
      message,
      reason: "missing_knowledge_context",
      explanation:
        "Fallback response triggered because user asked a factual question but no relevant knowledge base context was found. Returning default fallback message instead of calling OpenAI API.",
    });

    return {
      response: fallbackResponse,
      tokens: {
        totalTokens: userTokens,
        usageTokens: null,
        requestTokens: 0,
        conversationTokens: 0,
        knowledgeTokens: 0,
        userTokens: userTokens,
        durationMs: 0,
      },
      knowledgeContext: null,
    };
  }

  function applyKnowledgeContext(
    requestMessages: ChatMessage[],
    knowledgeContext: KnowledgeContext | null
  ): { messages: ChatMessage[]; applied: boolean; chunksUsed: number } {
    if (!knowledgeContext) {
      return { messages: requestMessages, applied: false, chunksUsed: 0 };
    }

    const originalEntries = [...knowledgeContext.entries];
    const fullContent =
      typeof knowledgeContext.message.content === "string"
        ? knowledgeContext.message.content
        : "";

    if (!fullContent || originalEntries.length === 0) {
      return { messages: requestMessages, applied: false, chunksUsed: 0 };
    }

    const lines = fullContent.split("\n").filter((line) => line.trim());
    const contextLines = lines.slice(1);

    const extractChunksUpTo = (numChunks: number): string => {
      const chunkLines: string[] = [];
      let currentChunk = 0;

      for (const line of contextLines) {
        if (line.startsWith("- (")) {
          if (currentChunk >= numChunks) break;
          currentChunk++;
        }
        if (currentChunk <= numChunks) {
          chunkLines.push(line);
        }
      }

      return lines[0]
        ? `${lines[0]}\n${chunkLines.join("\n")}`
        : chunkLines.join("\n");
    };

    const buildContextMessage = (content: string): ChatMessage => {
      return {
        role: "system",
        content,
      } as ChatMessage;
    };

    const fullContext = buildContextMessage(fullContent);
    const messagesWithFullKnowledge = [...requestMessages];
    messagesWithFullKnowledge.splice(
      messagesWithFullKnowledge.length - 1,
      0,
      fullContext
    );

    if (
      conversationHistory.countTokens(messagesWithFullKnowledge) <= tokenLimit
    ) {
      return {
        messages: messagesWithFullKnowledge,
        applied: true,
        chunksUsed: originalEntries.length,
      };
    }

    if (originalEntries.length > 3) {
      const reducedContent = extractChunksUpTo(3);
      const reducedContext = buildContextMessage(reducedContent);
      const messagesWithReducedKnowledge = [...requestMessages];
      messagesWithReducedKnowledge.splice(
        messagesWithReducedKnowledge.length - 1,
        0,
        reducedContext
      );

      if (
        conversationHistory.countTokens(messagesWithReducedKnowledge) <=
        tokenLimit
      ) {
        logWarn("chroma.context.degraded", {
          reason: "token_limit",
          originalChunks: originalEntries.length,
          reducedChunks: 3,
          explanation:
            "Knowledge base context degraded from full context to 3 chunks because full context exceeded token limit. This may reduce answer quality but ensures request fits within limits.",
        });
        return {
          messages: messagesWithReducedKnowledge,
          applied: true,
          chunksUsed: 3,
        };
      }
    }

    if (originalEntries.length > 1) {
      const singleContent = extractChunksUpTo(1);
      const singleContext = buildContextMessage(singleContent);
      const messagesWithSingleKnowledge = [...requestMessages];
      messagesWithSingleKnowledge.splice(
        messagesWithSingleKnowledge.length - 1,
        0,
        singleContext
      );

      if (
        conversationHistory.countTokens(messagesWithSingleKnowledge) <=
        tokenLimit
      ) {
        logWarn("chroma.context.degraded", {
          reason: "token_limit",
          originalChunks: originalEntries.length,
          reducedChunks: 1,
          explanation:
            "Knowledge base context degraded to single chunk because even 3 chunks exceeded token limit. This significantly reduces answer quality but ensures request fits within limits.",
        });
        return {
          messages: messagesWithSingleKnowledge,
          applied: true,
          chunksUsed: 1,
        };
      }
    }

    logWarn("chroma.context.dropped_all", {
      reason: "token_limit",
      originalChunks: originalEntries.length,
      explanation:
        "All knowledge base context dropped because even a single chunk exceeded token limit. Request will proceed without knowledge context, which may reduce answer accuracy.",
    });
    return { messages: requestMessages, applied: false, chunksUsed: 0 };
  }

  function calculateTokenBreakdown(
    requestMessages: ChatMessage[],
    knowledgeApplied: boolean,
    knowledgeContext: KnowledgeContext | null
  ): {
    totalRequestTokens: number;
    knowledgeTokens: number;
    userTokens: number;
    conversationTokens: number;
  } {
    const totalRequestTokens = conversationHistory.countTokens(requestMessages);
    const knowledgeTokens =
      knowledgeApplied && knowledgeContext
        ? conversationHistory.countTokens([knowledgeContext.message])
        : 0;
    const userTokens = conversationHistory.countTokens([
      requestMessages[requestMessages.length - 1] ?? {
        role: "user",
        content: "",
      },
    ]);
    const conversationTokens = Math.max(
      0,
      totalRequestTokens - knowledgeTokens - userTokens
    );

    return {
      totalRequestTokens,
      knowledgeTokens,
      userTokens,
      conversationTokens,
    };
  }

  async function callOpenAIChatCompletion(
    requestMessages: ChatMessage[],
    conversationId: string
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    try {
      return await client.chat.completions.create({
        model,
        messages: requestMessages,
      });
    } catch (error) {
      logError("openai.request.failed", {
        conversationId,
        error: error instanceof Error ? error.message : error,
        explanation:
          "OpenAI API request failed during chat completion creation. This could be due to network issues, API errors, or invalid request parameters. Error will be re-thrown for higher-level handling.",
      });
      throw error;
    }
  }

  function extractResponseMessage(
    response: OpenAI.Chat.Completions.ChatCompletion,
    conversationId: string
  ): OpenAI.Chat.Completions.ChatCompletionMessage {
    const responseMessage = response.choices?.[0]?.message;
    if (!responseMessage?.content) {
      logError("openai.response.empty", {
        conversationId,
        usage: response.usage,
        explanation:
          "OpenAI API returned a response but the message content is empty or null. This is unexpected and indicates an API issue. Cannot proceed without response content.",
      });
      throw new Error("No content returned from OpenAI response");
    }
    return responseMessage;
  }

  function saveAssistantResponse(
    conversationId: string,
    responseMessage: OpenAI.Chat.Completions.ChatCompletionMessage,
    knowledgeEntries: KnowledgeEntry[]
  ): void {
    if (!responseMessage.content) {
      throw new Error("Response message content is null");
    }
    const normalizedContent = normalizeAssistantReply(
      responseMessage.content,
      knowledgeEntries
    );
    const enrichedResponseMessage: ChatMessage = {
      ...responseMessage,
      content: normalizedContent,
    };
    conversationHistory.addMessage(conversationId, enrichedResponseMessage);
  }

  const generateReply = async (
    conversationId: string,
    message: string
  ): Promise<GenerateReplyResult> => {
    try {
      const messages = addUserMessageToConversation(conversationId, message);
      const trimmedBeforeCall = conversationHistory.trimContext(messages);

      const requestMessages = [...messages];
      let knowledgeContext: KnowledgeContext | null = null;
      let knowledgeEntries: KnowledgeEntry[] = [];

      try {
        knowledgeContext = await knowledgeBase.buildKnowledgeContext(
          conversationId,
          message
        );
        knowledgeEntries = knowledgeContext?.entries ?? [];
      } catch (error) {
        logWarn("knowledge.base.context.failed", {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
          explanation:
            "Failed to build knowledge base context, likely due to ChromaDB connection issues or embedding API failures. Continuing without knowledge context - response quality may be reduced but request will proceed.",
        });
        knowledgeContext = null;
        knowledgeEntries = [];
      }

      const {
        messages: finalRequestMessages,
        applied: knowledgeApplied,
        chunksUsed,
      } = applyKnowledgeContext(requestMessages, knowledgeContext);

      const trimmedRequest =
        conversationHistory.trimContext(finalRequestMessages);

      const verifiedKnowledgeApplied = Boolean(
        knowledgeApplied && knowledgeContext && chunksUsed > 0
      );

      const tokenBreakdown = calculateTokenBreakdown(
        finalRequestMessages,
        verifiedKnowledgeApplied,
        knowledgeContext
      );

      const isFactual = isFactualQuery(message);
      const hasKnowledgeContext = verifiedKnowledgeApplied && chunksUsed > 0;

      if (isFactual && !hasKnowledgeContext) {
        return generateFallbackResponse(
          conversationId,
          message,
          tokenBreakdown.userTokens
        );
      }

      logInfo("openai.tokens.breakdown", {
        conversationId,
        requestTokens: tokenBreakdown.totalRequestTokens,
        conversationTokens: tokenBreakdown.conversationTokens,
        knowledgeTokens: tokenBreakdown.knowledgeTokens,
        userTokens: tokenBreakdown.userTokens,
        tokenLimit,
        chunksUsed,
        originalChunks: knowledgeContext?.entries.length ?? 0,
        isFactual,
        hasKnowledgeContext,
        explanation:
          "Token breakdown before OpenAI API call showing distribution of tokens across conversation history, knowledge base context, and current user message. Used for monitoring and optimization.",
      });

      const startedAt = Date.now();
      let response: OpenAI.Chat.Completions.ChatCompletion;
      let responseMessage: OpenAI.Chat.Completions.ChatCompletionMessage;

      try {
        response = await callOpenAIChatCompletion(
          finalRequestMessages,
          conversationId
        );
        responseMessage = extractResponseMessage(response, conversationId);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const isRateLimitError =
          errorMessage.includes("rate_limit") ||
          errorMessage.includes("429") ||
          (error instanceof OpenAI.APIError && error.status === 429);
        const isInvalidRequestError =
          errorMessage.includes("invalid_request") ||
          (error instanceof OpenAI.APIError && error.status === 400);

        logError("openai.api.call.failed", {
          conversationId,
          error: errorMessage,
          isRateLimit: isRateLimitError,
          isInvalidRequest: isInvalidRequestError,
          statusCode:
            error instanceof OpenAI.APIError ? error.status : undefined,
          explanation:
            "OpenAI API call failed during chat completion. Rate limit errors indicate too many requests; invalid request errors indicate malformed input. Error will be re-thrown with user-friendly message.",
        });

        if (isRateLimitError) {
          throw new Error(
            "OpenAI API rate limit exceeded. Please try again later."
          );
        }
        if (isInvalidRequestError) {
          throw new Error(`Invalid request to OpenAI API: ${errorMessage}`);
        }
        throw new Error(`OpenAI API error: ${errorMessage}`);
      }

      try {
        saveAssistantResponse(
          conversationId,
          responseMessage,
          knowledgeEntries
        );
      } catch (error) {
        logError("openai.response.save.failed", {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
          explanation:
            "Failed to save assistant response to conversation history. This prevents future context from including this response, potentially affecting conversation continuity. Error will be re-thrown.",
        });
        throw new Error(
          "Failed to save assistant response to conversation history"
        );
      }

      const trimmedAfterCall = conversationHistory.trimContext(messages);

      const payload: Record<string, unknown> = {
        conversationId,
        totalTokens: conversationHistory.countTokens(messages),
        durationMs: Date.now() - startedAt,
        usageTokens: response.usage?.total_tokens ?? null,
        trimmed: trimmedBeforeCall || trimmedAfterCall || trimmedRequest,
        knowledgeApplied: verifiedKnowledgeApplied,
        requestTokens: tokenBreakdown.totalRequestTokens,
        conversationTokens: tokenBreakdown.conversationTokens,
        knowledgeTokens: tokenBreakdown.knowledgeTokens,
        userTokens: tokenBreakdown.userTokens,
      };

      logInfo("openai.tokens", {
        ...payload,
        explanation:
          "Token usage summary after successful OpenAI API call. Includes total tokens, usage tokens from API response, breakdown by context type, and whether conversation was trimmed. Used for monitoring and cost tracking.",
      });

      if (!responseMessage.content) {
        logError("openai.response.content.null", {
          conversationId,
          usage: response.usage,
          explanation:
            "Response message content is null after extraction. This is unexpected and indicates an API response format issue. Cannot normalize or return empty content.",
        });
        throw new Error("Response message content is null");
      }

      const normalizedResponse = normalizeAssistantReply(
        responseMessage.content,
        knowledgeEntries
      );

      return {
        response: normalizedResponse,
        tokens: {
          totalTokens: conversationHistory.countTokens(messages),
          usageTokens: response.usage?.total_tokens ?? null,
          requestTokens: tokenBreakdown.totalRequestTokens,
          conversationTokens: tokenBreakdown.conversationTokens,
          knowledgeTokens: tokenBreakdown.knowledgeTokens,
          userTokens: tokenBreakdown.userTokens,
          durationMs: Date.now() - startedAt,
        },
        knowledgeContext:
          verifiedKnowledgeApplied && knowledgeContext
            ? {
                applied: true,
                chunksUsed,
                entries: knowledgeContext.entries,
              }
            : null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logError("openai.generateReply.failed", {
        conversationId,
        message,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        explanation:
          "Critical failure in generateReply function. This is a top-level catch-all for any unhandled errors during reply generation. Error will be re-thrown to handler layer.",
      });
      throw error;
    }
  };

  const resetConversation = (conversationId: string) => {
    conversationHistory.resetConversation(conversationId);
  };

  const getConversationHistory = (conversationId: string): ChatMessage[] => {
    return conversationHistory.getMessages(conversationId);
  };

  return {
    generateReply,
    resetConversation,
    getConversationHistory,
  };
}
