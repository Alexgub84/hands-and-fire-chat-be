# Test Cases Suggestions

## Overview
This document provides a comprehensive list of suggested test cases based on review of existing tests and source code. Tests are organized by module with priority levels.

---

## 1. SessionManager (`tests/unit/sessionManager.test.ts`)

### ✅ Currently Covered
- Session creation and activity updates
- Session expiration logic
- Multiple sessions independence
- Parallel/concurrent sessions
- Session reset functionality
- Time calculations (age, expiration)

### 🔴 High Priority Missing Tests

#### Edge Cases
- **Session timeout boundary**: Test exactly at timeout threshold (timeout - 1ms, timeout, timeout + 1ms)
- **Negative timeout values**: Should handle gracefully or validate
- **Very large timeout values**: Test with Number.MAX_SAFE_INTEGER
- **Empty string conversationId**: Should handle gracefully
- **Special characters in conversationId**: Unicode, emojis, special chars
- **Concurrent updates to same session**: Race conditions with Promise.all

#### Integration Edge Cases
- **Session expiration during active conversation**: Test interaction with conversationHistory
- **Session reset while expired**: Verify state consistency
- **Rapid session creation/deletion**: Memory leak prevention

---

## 2. ContentNormalizer (`tests/unit/contentNormalizer.test.ts`)

### ✅ Currently Covered
- Basic link normalization with source map
- Empty source map handling
- Content without links

### 🔴 High Priority Missing Tests

#### Link Resolution Edge Cases
- **Multiple links in same content**: All should be normalized correctly
- **Nested markdown links**: `[text [nested](url)](url)`
- **Links with special characters**: Unicode, emojis in labels/URLs
- **Malformed markdown**: `[unclosed`, `](unopened)`, `[]()`
- **Very long URLs**: Test truncation/validation
- **URLs with query parameters and fragments**: `https://example.com?q=1#section`
- **Relative URLs**: `/path`, `../path`, `./path`
- **Protocol variations**: `http://`, `https://`, `ftp://`
- **www. prefix handling**: Should normalize to https://
- **URLs in parentheses**: `(https://example.com)` should be extracted
- **Multiple placeholder links**: `[Link1](#) [Link2](#)` with multiple candidates
- **Placeholder links with no candidates**: Should return label only

#### Content Edge Cases
- **Empty content string**: Should return empty string
- **Content with only links**: No surrounding text
- **Links at start/end of content**: Boundary conditions
- **Newlines in link labels**: `[Multi\nLine](url)`
- **Escaped brackets**: `\[text\]` should not be treated as link
- **Mixed content**: Links + plain text + code blocks
- **Very long content**: Performance test with 10k+ characters

#### Source Map Edge Cases
- **Null/undefined sources**: Should filter out gracefully
- **Duplicate sources**: Multiple entries with same source
- **Sources without titles**: Should handle gracefully
- **Invalid URLs in source map**: Should filter or handle
- **Empty string sources**: Should be filtered

---

## 3. TwilioService (`tests/unit/twilio.service.test.ts`)

### ✅ Currently Covered
- Basic message sending with fake client
- MessagingServiceSid propagation
- Success response handling

### 🔴 High Priority Missing Tests

#### Error Handling
- **Twilio API errors**: Network failures, rate limits, invalid credentials
- **Invalid phone numbers**: Non-E.164 format, invalid country codes
- **Empty message body**: Should validate or handle
- **Very long message body**: Twilio character limits (1600 chars)
- **Missing fromNumber and messagingServiceSid**: Should throw or return error
- **Twilio client throws exception**: Should catch and return error result
- **Timeout scenarios**: Long-running requests

#### Configuration Edge Cases
- **Both fromNumber and messagingServiceSid provided**: Should prioritize messagingServiceSid
- **Empty string fromNumber**: Should handle gracefully
- **Invalid messagingServiceSid format**: Should validate

#### Response Handling
- **Missing messageSid in response**: Edge case handling
- **Partial success responses**: Verify error handling

#### Logging
- **Verify error logging**: Check logger.error is called on failures
- **Verify success logging**: Check logger.info is called on success

---

## 4. OpenAIService (`tests/unit/openai.service.test.ts`)

### ✅ Currently Covered
- Basic reply generation
- Conversation reset
- Chroma knowledge base integration
- Markdown link conversion
- Placeholder link filling
- Chroma query failure logging

### 🔴 High Priority Missing Tests

#### Error Handling
- **OpenAI API errors**: Rate limits, invalid API key, model unavailable
- **Empty response from OpenAI**: No choices in response
- **Null content in response**: Should throw or handle gracefully
- **Network failures**: Connection timeouts, DNS failures
- **Invalid model name**: Should validate or handle error
- **Token limit exceeded**: Should handle gracefully with trimming

#### Knowledge Context Application
- **Knowledge context exceeds token limit**: Test degradation logic (full → 3 → 1 → none)
- **Knowledge context with exactly token limit**: Boundary condition
- **Knowledge context with zero entries**: Should handle gracefully
- **Knowledge context with null/undefined entries**: Edge case
- **Multiple knowledge contexts**: Verify only one is applied
- **Knowledge context insertion position**: Should be before last user message

#### Fallback Response Logic
- **Factual query without knowledge context**: Should return fallback
- **Factual query with knowledge context**: Should NOT return fallback
- **Non-factual query without knowledge context**: Should proceed normally
- **All factual keywords**: Test each keyword in factualQueryKeywords
- **Case-insensitive keyword matching**: "מחיר" vs "מחירים" vs "מחיR"
- **Factual keyword in middle of sentence**: Should still trigger
- **Multiple factual keywords**: Should still work

#### Token Counting
- **Token counting with array content**: Multi-part messages
- **Token counting with empty content**: Edge case
- **Token breakdown accuracy**: Verify knowledgeTokens, userTokens, conversationTokens
- **Token limit trimming**: Verify messages are trimmed correctly
- **System prompt token counting**: Should be included

#### Conversation History Integration
- **Session expiration during generation**: Should reset conversation
- **Very long conversation**: Test trimming logic
- **Conversation with only system message**: Edge case
- **Adding messages after reset**: Should start fresh

#### Chroma Integration Edge Cases
- **Chroma query returns empty results**: Should handle gracefully
- **Chroma query returns null metadata**: Should use defaults
- **Chroma query returns invalid distances**: Should filter or handle
- **Chroma similarity threshold filtering**: Test threshold logic
- **Chroma max results limit**: Verify only top N results used
- **Chroma max characters limit**: Verify truncation
- **Chroma embedding failure**: Should fallback gracefully
- **Chroma collection resolution failure**: Should handle gracefully

#### Response Normalization
- **Response with no links**: Should return as-is
- **Response with mixed content**: Links + text + code
- **Response normalization with empty knowledge entries**: Should still normalize

#### Performance & Timing
- **Duration calculation**: Verify durationMs is accurate
- **Concurrent requests**: Test thread safety
- **Large knowledge contexts**: Performance with many entries

---

## 5. ConversationHistoryService (`tests/unit/conversationHistory.service.test.ts`)

### ✅ Currently Covered
- Initialization with system prompt
- Adding messages
- Token counting
- Context trimming
- Conversation reset

### 🔴 High Priority Missing Tests

#### Token Counting Edge Cases
- **Array content messages**: Multi-part content with text/images
- **Null/undefined content**: Should handle gracefully
- **Empty string content**: Should count as 0 or minimal tokens
- **Very long messages**: Test with 10k+ character messages
- **Mixed content types**: String + array content in same conversation

#### Context Trimming
- **Trim when exactly at token limit**: Boundary condition
- **Trim when system prompt alone exceeds limit**: Edge case
- **Trim preserves system message**: Should never remove system message
- **Trim removes oldest messages first**: Verify order
- **Trim with single user message**: Should not trim
- **Multiple trim operations**: Verify consistency

#### Session Manager Integration
- **Session expiration triggers reset**: Verify integration
- **Session update on getOrCreateConversation**: Should update activity
- **Expired session creates new conversation**: Should reset and create new

#### Message Management
- **Adding duplicate messages**: Should allow
- **Adding messages to non-existent conversation**: Should create
- **Get messages for non-existent conversation**: Should create and return system message
- **Reset non-existent conversation**: Should handle gracefully

#### Edge Cases
- **Empty conversationId**: Should handle gracefully
- **Special characters in conversationId**: Unicode, emojis
- **Very long conversationId**: Performance test
- **Concurrent access to same conversation**: Race conditions

---

## 6. KnowledgeBaseService (`tests/unit/knowledgeBase.service.test.ts`)

### ✅ Currently Covered
- Successful knowledge context building
- Collection resolution failure
- Empty query results

### 🔴 High Priority Missing Tests

#### Similarity Threshold Filtering
- **Results below threshold**: Should filter out
- **Results exactly at threshold**: Boundary condition
- **Results above threshold**: Should include
- **All results below threshold**: Should use top results anyway (fallback logic)
- **Mixed similarity scores**: Some above, some below threshold

#### Result Limiting
- **More results than chromaMaxResults**: Should limit to max
- **Fewer results than chromaMaxResults**: Should use all available
- **Exactly chromaMaxResults**: Boundary condition
- **Zero results**: Should return null

#### Character Truncation
- **Documents exceeding chromaMaxCharacters**: Should truncate
- **Documents exactly at chromaMaxCharacters**: Boundary condition
- **Multiple documents**: Should distribute character limit
- **Very short documents**: Should handle gracefully
- **Documents with special characters**: Unicode, emojis

#### Metadata Handling
- **Missing title in metadata**: Should use default "snippet-N"
- **Missing source in metadata**: Should use "unknown"
- **Null metadata**: Should handle gracefully
- **Invalid metadata types**: Should handle gracefully
- **Metadata with extra fields**: Should ignore extra fields

#### Embedding Edge Cases
- **Embedding API failure**: Should return null gracefully
- **Empty embedding response**: Should handle
- **Invalid embedding format**: Should validate
- **Embedding timeout**: Should handle gracefully

#### Collection Resolution
- **Collection resolution retry**: Test promise caching
- **Collection resolution after failure**: Should retry on next call
- **Collection name changes**: Should handle gracefully

#### Context Building
- **Context string format**: Verify correct format
- **Context with score fragments**: Verify distance formatting
- **Context ordering**: Should maintain result order
- **Context with no entries**: Should return null

#### Logging
- **Verify info logging**: Check logger.info calls
- **Verify error logging**: Check logger.error calls
- **Verify warn logging**: Check logger.warn calls

---

## 7. GoogleDriveClient (`tests/unit/googleDrive.client.test.ts`)

### ✅ Currently Covered
- Client creation with normalized credentials
- CSV file creation in folder

### 🔴 High Priority Missing Tests

#### Credential Handling
- **Invalid private key format**: Should handle gracefully
- **Missing newlines in private key**: Should normalize
- **Extra whitespace in credentials**: Should trim
- **Invalid email format**: Should validate or handle

#### File Creation Edge Cases
- **File creation failure**: API errors, permissions
- **Invalid folder ID**: Should handle gracefully
- **Empty file content**: Should handle gracefully
- **Very large file content**: Performance test
- **Special characters in fileName**: Unicode, emojis
- **Very long fileName**: Should handle or truncate
- **Duplicate file names**: Should handle gracefully

#### CSV Content Validation
- **Verify CSV format**: Headers, escaping, quotes
- **Content with commas**: Should escape correctly
- **Content with quotes**: Should escape correctly
- **Content with newlines**: Should escape correctly
- **Content with special characters**: Unicode, emojis

#### Stream Handling
- **Stream read errors**: Should handle gracefully
- **Stream timeout**: Should handle gracefully
- **Very large streams**: Performance test

---

## 8. ConversationCsvService (`tests/unit/conversationCsv.service.test.ts`)

### ✅ Currently Covered
- CSV upload with default drive client
- Reusing provided drive client

### 🔴 High Priority Missing Tests

#### CSV Building
- **Empty messages array**: Should create headers only
- **Messages with special characters**: Unicode, emojis, commas, quotes
- **Messages with newlines**: Should escape correctly
- **Very long message content**: Should handle
- **Missing required fields**: Should handle gracefully
- **Invalid timestamp format**: Should handle gracefully

#### Error Handling
- **Missing Google credentials**: Should throw error
- **Missing folder ID**: Should throw error
- **Drive API errors**: Should propagate or handle
- **File creation failure**: Should handle gracefully

#### Timestamp Handling
- **Custom timestamp function**: Should use provided function
- **Default timestamp**: Should use current time
- **Timestamp in filename**: Should format correctly

#### Edge Cases
- **Very large conversation**: Many messages
- **Empty conversationId**: Should handle gracefully
- **Special characters in conversationId**: Unicode, emojis

---

## 9. Handlers (`tests/unit/handlers/messages.test.ts` - NEW FILE NEEDED)

### 🔴 High Priority Missing Tests

#### WhatsApp Webhook Handler
- **Invalid request body**: Missing From, missing Body
- **Empty From field**: Should return 400
- **Empty Body field**: Should return 400
- **Invalid From format**: Non-E.164 format
- **Very long Body**: Should handle or validate
- **Special characters in Body**: Unicode, emojis

#### Export Request Handling
- **Export request without saveConversationCsv**: Should handle gracefully
- **Export request without getConversationHistory**: Should send error message
- **Export with empty conversation history**: Should send error message
- **Export failure**: Should send error message
- **Export success**: Should send success message
- **Case-insensitive export command**: "EXPORT", "Export", "export"

#### Error Handling
- **generateSimpleResponse failure**: Should handle gracefully
- **sendWhatsAppMessage failure**: Should return 500
- **Logging on errors**: Verify error logging
- **Logging on success**: Verify info logging

#### Response Formatting
- **Success response format**: Verify structure
- **Error response format**: Verify structure
- **Token logging**: Verify token breakdown is logged

---

## 10. Routes (`tests/unit/routes/messages.test.ts` - NEW FILE NEEDED)

### 🔴 High Priority Missing Tests

#### Route Registration
- **Health check route**: GET / should return { ok: true }
- **WhatsApp route**: POST /whatsapp should be registered
- **Route dependencies**: Verify handlers are called correctly

#### Route Error Handling
- **404 for unknown routes**: Should return 404
- **Method not allowed**: GET /whatsapp should return 405
- **Invalid content type**: Should handle gracefully

---

## 11. Integration Tests (`tests/integration/app.integration.test.ts`)

### ✅ Currently Covered
- Health check
- WhatsApp payload validation
- Successful message flow
- Twilio send failure

### 🔴 High Priority Missing Tests

#### End-to-End Flows
- **Full conversation flow**: Multiple messages in sequence
- **Export flow**: Send "export", verify CSV creation
- **Session expiration flow**: Wait for expiration, verify reset
- **Knowledge base integration**: Query with knowledge context

#### Error Scenarios
- **OpenAI service failure**: Should handle gracefully
- **Chroma service failure**: Should proceed without knowledge
- **Multiple concurrent requests**: Should handle correctly
- **Request timeout**: Should handle gracefully

#### Edge Cases
- **Very long conversation**: Many messages, verify trimming
- **Rapid messages**: Multiple messages in quick succession
- **Mixed content types**: Text, links, special characters

---

## 12. E2E Tests (`tests/e2e/app.e2e.test.ts`)

### ✅ Currently Covered
- Health check and WhatsApp flow end-to-end
- Chroma query verification

### 🔴 High Priority Missing Tests

#### Full System Tests
- **Complete conversation**: Multiple exchanges
- **Export functionality**: End-to-end export flow
- **Session expiration**: Full expiration and reset flow
- **Knowledge base queries**: Verify knowledge context application

#### Performance Tests
- **Load testing**: Multiple concurrent requests
- **Response time**: Verify acceptable latency
- **Memory usage**: Verify no memory leaks

#### Error Recovery
- **Service restart**: Verify state recovery
- **Partial failures**: Some services down, others working

---

## 13. Utility Functions

### CSV Building (`conversationCsv.ts`)
- **escapeCsv edge cases**: Empty strings, only commas, only quotes
- **toCsv formatting**: Verify correct CSV format
- **resolveTimestamp**: Verify ISO format

### Content Normalizer Helpers
- **isHttpUrl validation**: Various URL formats
- **extractFirstUrl**: URLs in text, URLs in parentheses
- **formatLink edge cases**: Empty labels, URLs with punctuation
- **stripTrailingPunctuation**: Various punctuation combinations

---

## 14. Environment & Configuration (`src/env.ts`)

### 🔴 High Priority Missing Tests

#### Validation
- **Missing required env vars**: Should throw validation error
- **Invalid env var formats**: Should validate and throw
- **Default values**: Should use defaults when appropriate
- **Type coercion**: String to number, etc.

---

## 15. App Initialization (`src/app.ts`)

### 🔴 High Priority Missing Tests

#### App Building
- **Missing required dependencies**: Should throw error
- **Partial dependencies**: Should handle gracefully
- **Logger configuration**: Test vs production modes
- **Route registration**: Verify all routes registered
- **Plugin registration**: Verify formbody registered

---

## Priority Summary

### 🔴 Critical (Security, Data Integrity, Core Functionality)
1. Error handling in all services
2. Input validation and sanitization
3. Session expiration edge cases
4. Token limit handling
5. Knowledge base threshold filtering

### 🟡 Important (User Experience, Edge Cases)
1. Content normalization edge cases
2. Export functionality error handling
3. Conversation trimming logic
4. Fallback response logic
5. Logging verification

### 🟢 Nice to Have (Performance, Polish)
1. Performance tests
2. Load testing
3. Memory leak detection
4. Concurrent access tests

---

## Test Organization Recommendations

1. **Create missing test files**:
   - `tests/unit/handlers/messages.test.ts`
   - `tests/unit/routes/messages.test.ts`
   - `tests/unit/env.test.ts`
   - `tests/unit/app.test.ts`

2. **Expand existing test files** with edge cases listed above

3. **Add integration test scenarios** for cross-service interactions

4. **Add E2E test scenarios** for complete user flows

5. **Consider test utilities**:
   - Mock factories for common scenarios
   - Test data generators
   - Assertion helpers

