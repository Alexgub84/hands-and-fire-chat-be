# RAG System Improvement Implementation Plan

**Status**: Phase 1 (P0) Complete ✅ | Phase 2 (P1) Pending ⏳ | Phase 3 (P2) Pending ⏳

## 📋 Completed Work

### Phase 1: Stop Hallucinations (P0 - Critical) ✅ COMPLETE

All critical hallucination prevention measures implemented and tested.

**Files Modified:**
- `src/env.ts` - Added `CHROMA_SIMILARITY_THRESHOLD`
- `src/services/ai/knowledgeBase.ts` - Similarity threshold filtering
- `src/services/ai/openai.ts` - Progressive degradation + fallback
- `src/prompts/system.ts` - Hallucination guardrails
- `src/prompts/fallback.ts` - NEW: Fallback response management
- `src/server.ts` - Pass threshold to services

**Test Results:** ✅ All tests passing (28/29, 1 skipped)

---

## 🎯 Implementation Roadmap

### Phase 2: Improve Retrieval Quality (P1 - High Priority) ⏳

**Prerequisites:** Data preparation and ingestion pipeline updates

#### 2.1 Implement Semantic Chunking
**Status**: ⏳ Pending
**Files**: `embeddings/src/index.ts`
**Questions to answer:**
- Chunk size target? (words, sentences, or tokens)
- Overlap between chunks? (e.g., 1-2 sentence overlap)
- Store chunk metadata? (position in document, topic tags)

**Implementation notes:**
- Stop embedding whole documents as single vectors
- Chunk by meaning: pricing, duration, location, cancellation, schedule, materials, what's included
- Each chunk: 1-3 sentences, focused on single concept

---

#### 2.2 Fix Metadata Typing for Filtering
**Status**: ⏳ Pending  
**Files**: `embeddings/src/index.ts`
**Questions to answer:**
- Which metadata fields should be arrays? (e.g., tags, categories)
- Backfill existing data or start fresh collection?

**Implementation notes:**
- Preserve native array types in metadata
- Update `normalizeMetadata()` to handle arrays properly
- Add metadata schema validation

---

#### 2.3 Increase Per-Document Character Limit
**Status**: ⏳ Pending
**Files**: `src/services/ai/knowledgeBase.ts`
**Questions to answer:**
- New character limit? (3000 recommended)
- Which information types need dedicated chunks?
- Validate chunk completeness during ingestion?

**Implementation notes:**
- Increase `chromaMaxCharacters` from 1500 to 3000
- Store critical data (pricing, policies) in separate dedicated chunks
- Implement smart truncation that preserves complete facts

---

#### 2.4 Add Metadata Filtering to Retrieval
**Status**: ⏳ Pending
**Files**: `src/services/ai/knowledgeBase.ts`
**Questions to answer:**
- Which metadata fields to filter? (type, duration, language, capacity)
- Extract filters from query or require explicit user input?
- Filter before or after vector search?

**Implementation notes:**
- Extract filters from user query (workshop type, participant count, date range)
- Apply ChromaDB metadata filters before vector search
- Combine with similarity threshold for hybrid filtering

---

#### 2.5 Optimize Context Injection Placement
**Status**: ⏳ Pending
**Files**: `src/services/ai/openai.ts`
**Questions to answer:**
- Keep current format or switch to explicit section markers?
- Add priority instruction in context or system prompt?

**Implementation notes:**
- Inject KB context immediately after system prompt
- Use explicit format: `=== KNOWLEDGE BASE CONTEXT ===`
- Add instruction: "Use this knowledge base context first for factual answers"

---

#### 2.6 Remove Content Duplication
**Status**: ⏳ Pending
**Files**: Data ingestion pipeline
**Questions to answer:**
- Which documents have the most duplication?
- Manual cleanup or automated deduplication?
- Keep one canonical source per fact?

**Implementation notes:**
- Identify duplicate content patterns
- Create canonical source documents
- Remove or deduplicate during ingestion

---

### Phase 3: Scale and Monitor (P2 - Medium Priority) ⏳

#### 3.1 Add Retrieval Metrics Logging
**Status**: ⏳ Pending
**Files**: `src/services/ai/knowledgeBase.ts`, `src/services/ai/openai.ts`
**Questions to answer:**
- Log to file, stdout, or external service? (stdout recommended for Railway)
- Which metrics are most important to track?
- Retention period for logs?

**Implementation notes:**
- Log: query text, top similarity scores, threshold pass/fail, filters applied, chunks injected, token budget outcomes
- Add correlation IDs for request tracing
- Create structured log format for dashboard ingestion

---

#### 3.2 Implement Conversation Persistence
**Status**: ⏳ Pending
**Files**: `src/services/ai/conversationHistory.ts`
**Questions to answer:**
- Redis or PostgreSQL? (Redis recommended for session data)
- Conversation TTL? (7 days recommended)
- Migrate existing conversations or start fresh?

**Implementation notes:**
- Replace Map with Redis or PostgreSQL
- Implement repository pattern for conversation storage
- Add TTL for automatic cleanup (e.g., 7 days)
- Support horizontal scaling

---

## 🚀 How to Use This Plan

1. **Open a new chat for each phase**
2. **Answer the questions** for that phase before implementation
3. **Mark steps as complete** in this file after finishing
4. **Run tests** after each phase: `npm run build && npm run lint && npm test`

## 📊 Success Metrics

Track these after each phase:
- **Fallback rate**: Target < 15%
- **Average similarity score**: Target > 0.75
- **Token usage**: Target 20-30% reduction
- **Zero hallucinations** on factual queries

## 📝 Notes

**Phase 1 is production-ready** and can be deployed immediately. The similarity threshold and fallback mechanisms are already preventing hallucinations.

**Phase 2 requires data preparation** - you'll need to re-ingest your documents with semantic chunking. This is the most impactful phase for retrieval quality.

**Phase 3 is about scale** - only needed when you have high traffic or need horizontal scaling.

---

**Last Updated**: 2025-12-18  
**Current Phase**: 1 (Complete)  
**Next Phase**: 2 (Ready to start when you are)

