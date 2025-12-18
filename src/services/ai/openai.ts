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

  function addUserMessage(
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
    };
  }

  function applyKnowledgeContext(
    requestMessages: ChatMessage[],
    knowledgeContext: KnowledgeContext | null
  ): { messages: ChatMessage[]; applied: boolean; chunksUsed: number } {
    if (!knowledgeContext) {
      return { messages: requestMessages, applied: false, chunksUsed: 0 };
    }

    // Try with all chunks first
    const originalEntries = [...knowledgeContext.entries];

    // Helper to build context message with specific number of entries
    const buildContextMessage = (entries: KnowledgeEntry[]): ChatMessage => {
      const contextEntries = entries.map((entry) => {
        const scoreFragment = "";
        return `- (${entry.title} | source: ${entry.source}${scoreFragment}) ${entry.title}`;
      });

      const contextString = `Knowledge base context:\n${contextEntries.join("\n")}`;
      return {
        role: "system",
        content: contextString,
      } as ChatMessage;
    };

    // Try with all chunks (5)
    if (originalEntries.length > 0) {
      const fullContext = buildContextMessage(originalEntries);
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

      // Try with 3 chunks (most relevant)
      if (originalEntries.length > 3) {
        const reducedEntries = originalEntries.slice(0, 3);
        const reducedContext = buildContextMessage(reducedEntries);
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
          });
          return {
            messages: messagesWithReducedKnowledge,
            applied: true,
            chunksUsed: 3,
          };
        }
      }

      // Try with 1 chunk (most relevant)
      if (originalEntries.length > 1) {
        const firstEntry = originalEntries[0];
        if (firstEntry) {
          const singleEntry = [firstEntry];
          const singleContext = buildContextMessage(singleEntry);
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
            });
            return {
              messages: messagesWithSingleKnowledge,
              applied: true,
              chunksUsed: 1,
            };
          }
        }
      }
    }

    // All KB context dropped
    logWarn("chroma.context.dropped_all", {
      reason: "token_limit",
      originalChunks: originalEntries.length,
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

  async function callOpenAI(
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
    const messages = addUserMessage(conversationId, message);
    const trimmedBeforeCall = conversationHistory.trimContext(messages);

    const requestMessages = [...messages];
    const knowledgeContext = await knowledgeBase.buildKnowledgeContext(
      conversationId,
      message
    );
    const knowledgeEntries: KnowledgeEntry[] = knowledgeContext?.entries ?? [];

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

    // Calculate token breakdown first
    const tokenBreakdown = calculateTokenBreakdown(
      finalRequestMessages,
      verifiedKnowledgeApplied,
      knowledgeContext
    );

    // Check if we should use fallback response
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
    });

    const startedAt = Date.now();
    const response = await callOpenAI(finalRequestMessages, conversationId);
    const responseMessage = extractResponseMessage(response, conversationId);

    saveAssistantResponse(conversationId, responseMessage, knowledgeEntries);
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

    logInfo("openai.tokens", payload);

    if (!responseMessage.content) {
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
    };
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
