export interface ErrorCodeInfo {
  code: number | string;
  service: "twilio" | "openai" | "chromadb" | "http" | "system";
  category: string;
  description: string;
  explanation: string;
  userMessage?: string;
  resolution?: string;
}

export const ERROR_CODES: Record<string, ErrorCodeInfo> = {
  TWILIO_20429: {
    code: 20429,
    service: "twilio",
    category: "rate_limit",
    description: "Twilio Rate Limit Exceeded",
    explanation:
      "Twilio API rate limit exceeded. Too many requests sent in a short time period. Twilio enforces rate limits to prevent abuse and ensure service stability.",
    userMessage: "Rate limit exceeded. Please try again later.",
    resolution:
      "Wait before retrying. Implement exponential backoff or request queuing for high-volume applications.",
  },

  TWILIO_429: {
    code: 429,
    service: "twilio",
    category: "rate_limit",
    description: "Twilio Rate Limit (HTTP 429)",
    explanation:
      "HTTP 429 Too Many Requests from Twilio API. Standard HTTP rate limit response indicating too many requests.",
    userMessage: "Rate limit exceeded. Please try again later.",
    resolution:
      "Wait before retrying. Check Twilio account limits and consider upgrading plan if consistently hitting limits.",
  },

  TWILIO_21211: {
    code: 21211,
    service: "twilio",
    category: "invalid_input",
    description: "Invalid 'To' Phone Number",
    explanation:
      "The phone number provided in the 'To' field is invalid. Number may be malformed, not in E.164 format, or not a valid phone number.",
    userMessage: "Invalid phone number",
    resolution:
      "Verify phone number is in E.164 format (e.g., +1234567890). Ensure number is valid and active.",
  },

  TWILIO_20003: {
    code: 20003,
    service: "twilio",
    category: "authentication",
    description: "Twilio Authentication Failed",
    explanation:
      "Twilio API authentication failed. Account SID or Auth Token is invalid, expired, or missing.",
    userMessage: "Twilio authentication failed. Please check credentials.",
    resolution:
      "Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables are correct and account is active.",
  },

  TWILIO_21608: {
    code: 21608,
    service: "twilio",
    category: "delivery",
    description: "Phone Number Unreachable",
    explanation:
      "The destination phone number is unreachable. Number may be disconnected, out of service, or blocked.",
    userMessage: "Phone number is not reachable",
    resolution:
      "Verify destination number is active and can receive messages. Check if number is blocked or in a restricted region.",
  },

  TWILIO_401: {
    code: 401,
    service: "twilio",
    category: "authentication",
    description: "Unauthorized (HTTP 401)",
    explanation:
      "HTTP 401 Unauthorized from Twilio API. Authentication credentials are invalid or missing.",
    userMessage: "Twilio authentication failed. Please check credentials.",
    resolution:
      "Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are correct and account has proper permissions.",
  },

  TWILIO_403: {
    code: 403,
    service: "twilio",
    category: "authorization",
    description: "Forbidden (HTTP 403)",
    explanation:
      "HTTP 403 Forbidden from Twilio API. Account credentials are valid but account lacks permission for this operation.",
    userMessage: "Twilio authentication failed. Please check credentials.",
    resolution:
      "Check Twilio account permissions and ensure account has access to WhatsApp messaging features.",
  },

  OPENAI_429: {
    code: 429,
    service: "openai",
    category: "rate_limit",
    description: "OpenAI Rate Limit Exceeded",
    explanation:
      "OpenAI API rate limit exceeded. Too many requests sent within the rate limit window. Rate limits vary by tier and endpoint.",
    userMessage: "OpenAI API rate limit exceeded. Please try again later.",
    resolution:
      "Wait before retrying. Implement exponential backoff. Consider upgrading OpenAI plan for higher rate limits.",
  },

  OPENAI_400: {
    code: 400,
    service: "openai",
    category: "invalid_request",
    description: "OpenAI Invalid Request",
    explanation:
      "HTTP 400 Bad Request from OpenAI API. Request parameters are invalid, malformed, or exceed limits (e.g., token limit, content policy violation).",
    userMessage: "Invalid request to OpenAI API",
    resolution:
      "Check request parameters, token counts, and content. Ensure input complies with OpenAI content policy.",
  },

  CHROMADB_ECONNREFUSED: {
    code: "ECONNREFUSED",
    service: "chromadb",
    category: "connection",
    description: "ChromaDB Connection Refused",
    explanation:
      "ChromaDB server refused the connection. Server may be down, not running, or firewall blocking access.",
    userMessage: "Knowledge base unavailable",
    resolution:
      "Verify ChromaDB server is running and accessible. Check network connectivity and firewall rules.",
  },

  CHROMADB_ENOTFOUND: {
    code: "ENOTFOUND",
    service: "chromadb",
    category: "connection",
    description: "ChromaDB Host Not Found",
    explanation:
      "ChromaDB hostname could not be resolved. DNS lookup failed or hostname is incorrect.",
    userMessage: "Knowledge base unavailable",
    resolution:
      "Verify CHROMA_URL or ChromaDB hostname is correct. Check DNS configuration and network connectivity.",
  },

  CHROMADB_TIMEOUT: {
    code: "timeout",
    service: "chromadb",
    category: "connection",
    description: "ChromaDB Request Timeout",
    explanation:
      "ChromaDB request timed out. Server took too long to respond, possibly due to overload or network issues.",
    userMessage: "Knowledge base unavailable",
    resolution:
      "Check ChromaDB server performance and network latency. Consider increasing timeout values or optimizing queries.",
  },

  HTTP_400: {
    code: 400,
    service: "http",
    category: "client_error",
    description: "Bad Request",
    explanation:
      "HTTP 400 Bad Request. Client sent an invalid request (malformed syntax, invalid parameters, etc.).",
    userMessage: "Invalid request",
    resolution:
      "Review request format, parameters, and ensure all required fields are present and valid.",
  },

  HTTP_401: {
    code: 401,
    service: "http",
    category: "authentication",
    description: "Unauthorized",
    explanation:
      "HTTP 401 Unauthorized. Request lacks valid authentication credentials.",
    userMessage: "Authentication required",
    resolution:
      "Provide valid authentication credentials (API key, token, etc.).",
  },

  HTTP_403: {
    code: 403,
    service: "http",
    category: "authorization",
    description: "Forbidden",
    explanation:
      "HTTP 403 Forbidden. Server understood request but refuses to authorize it.",
    userMessage: "Access forbidden",
    resolution:
      "Check account permissions and ensure user has required access level.",
  },

  HTTP_429: {
    code: 429,
    service: "http",
    category: "rate_limit",
    description: "Too Many Requests",
    explanation:
      "HTTP 429 Too Many Requests. Client has exceeded rate limit for this endpoint.",
    userMessage: "Rate limit exceeded. Please try again later.",
    resolution:
      "Wait before retrying. Implement exponential backoff or request queuing.",
  },

  HTTP_500: {
    code: 500,
    service: "http",
    category: "server_error",
    description: "Internal Server Error",
    explanation:
      "HTTP 500 Internal Server Error. Server encountered an unexpected error processing the request.",
    userMessage: "Server error occurred",
    resolution:
      "Retry request. If persistent, check server logs and contact support.",
  },

  SYSTEM_EMBEDDING_INVALID: {
    code: "EMBEDDING_INVALID",
    service: "system",
    category: "validation",
    description: "Invalid Embedding Vector",
    explanation:
      "Embedding vector received from OpenAI API is invalid. Expected array of numbers but received different type or format.",
    userMessage: "Knowledge base processing error",
    resolution:
      "Check OpenAI embedding API response format. Verify embedding model configuration.",
  },

  SYSTEM_RESPONSE_EMPTY: {
    code: "RESPONSE_EMPTY",
    service: "system",
    category: "validation",
    description: "Empty API Response",
    explanation:
      "API returned a response but content is empty or null. Unexpected API behavior or response format issue.",
    userMessage: "Service temporarily unavailable",
    resolution:
      "Retry request. If persistent, check API status and response format expectations.",
  },
};

export function getErrorCodeInfo(
  code: number | string,
  service?: ErrorCodeInfo["service"]
): ErrorCodeInfo | undefined {
  const key = Object.keys(ERROR_CODES).find((k) => {
    const info = ERROR_CODES[k];
    if (!info) return false;
    return (
      info.code === code && (service === undefined || info.service === service)
    );
  });

  return key ? ERROR_CODES[key] : undefined;
}

export function getErrorCodesByService(
  service: ErrorCodeInfo["service"]
): ErrorCodeInfo[] {
  return Object.values(ERROR_CODES).filter((info) => info.service === service);
}

export function getErrorCodesByCategory(category: string): ErrorCodeInfo[] {
  return Object.values(ERROR_CODES).filter(
    (info) => info.category === category
  );
}
