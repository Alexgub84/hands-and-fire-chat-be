import { describe, expect, it } from "vitest";
import {
  ERROR_CODES,
  getErrorCodeInfo,
  getErrorCodesByService,
  getErrorCodesByCategory,
  type ErrorCodeInfo,
} from "../../src/utils/errorCodes.js";

describe("ERROR_CODES", () => {
  it("contains all required error codes", () => {
    const expectedCodes = [
      "TWILIO_20429",
      "TWILIO_429",
      "TWILIO_21211",
      "TWILIO_20003",
      "TWILIO_21608",
      "TWILIO_401",
      "TWILIO_403",
      "OPENAI_429",
      "OPENAI_400",
      "CHROMADB_ECONNREFUSED",
      "CHROMADB_ENOTFOUND",
      "CHROMADB_TIMEOUT",
      "HTTP_400",
      "HTTP_401",
      "HTTP_403",
      "HTTP_429",
      "HTTP_500",
      "SYSTEM_EMBEDDING_INVALID",
      "SYSTEM_RESPONSE_EMPTY",
    ];

    expectedCodes.forEach((code) => {
      expect(ERROR_CODES[code]).toBeDefined();
    });
  });

  it("all error codes have required fields", () => {
    Object.values(ERROR_CODES).forEach((errorInfo, index) => {
      expect(errorInfo, `Error at index ${index}`).toHaveProperty("code");
      expect(errorInfo, `Error at index ${index}`).toHaveProperty("service");
      expect(errorInfo, `Error at index ${index}`).toHaveProperty("category");
      expect(errorInfo, `Error at index ${index}`).toHaveProperty("description");
      expect(errorInfo, `Error at index ${index}`).toHaveProperty("explanation");
      expect(["number", "string"]).toContain(typeof errorInfo.code);
      expect(["twilio", "openai", "chromadb", "http", "system"]).toContain(
        errorInfo.service
      );
      expect(typeof errorInfo.description).toBe("string");
      expect(typeof errorInfo.explanation).toBe("string");
    });
  });

  it("all error codes have valid service types", () => {
    const validServices: ErrorCodeInfo["service"][] = [
      "twilio",
      "openai",
      "chromadb",
      "http",
      "system",
    ];

    Object.values(ERROR_CODES).forEach((errorInfo) => {
      expect(validServices).toContain(errorInfo.service);
    });
  });

  describe("Twilio error codes", () => {
    it("TWILIO_20429 is rate limit error", () => {
      const error = ERROR_CODES.TWILIO_20429;
      expect(error.code).toBe(20429);
      expect(error.service).toBe("twilio");
      expect(error.category).toBe("rate_limit");
      expect(error.userMessage).toBeDefined();
      expect(error.resolution).toBeDefined();
    });

    it("TWILIO_429 is rate limit error", () => {
      const error = ERROR_CODES.TWILIO_429;
      expect(error.code).toBe(429);
      expect(error.service).toBe("twilio");
      expect(error.category).toBe("rate_limit");
    });

    it("TWILIO_21211 is invalid input error", () => {
      const error = ERROR_CODES.TWILIO_21211;
      expect(error.code).toBe(21211);
      expect(error.service).toBe("twilio");
      expect(error.category).toBe("invalid_input");
    });

    it("TWILIO_20003 is authentication error", () => {
      const error = ERROR_CODES.TWILIO_20003;
      expect(error.code).toBe(20003);
      expect(error.service).toBe("twilio");
      expect(error.category).toBe("authentication");
    });

    it("TWILIO_21608 is delivery error", () => {
      const error = ERROR_CODES.TWILIO_21608;
      expect(error.code).toBe(21608);
      expect(error.service).toBe("twilio");
      expect(error.category).toBe("delivery");
    });

    it("TWILIO_401 is authentication error", () => {
      const error = ERROR_CODES.TWILIO_401;
      expect(error.code).toBe(401);
      expect(error.service).toBe("twilio");
      expect(error.category).toBe("authentication");
    });

    it("TWILIO_403 is authorization error", () => {
      const error = ERROR_CODES.TWILIO_403;
      expect(error.code).toBe(403);
      expect(error.service).toBe("twilio");
      expect(error.category).toBe("authorization");
    });
  });

  describe("OpenAI error codes", () => {
    it("OPENAI_429 is rate limit error", () => {
      const error = ERROR_CODES.OPENAI_429;
      expect(error.code).toBe(429);
      expect(error.service).toBe("openai");
      expect(error.category).toBe("rate_limit");
      expect(error.userMessage).toBeDefined();
      expect(error.resolution).toBeDefined();
    });

    it("OPENAI_400 is invalid request error", () => {
      const error = ERROR_CODES.OPENAI_400;
      expect(error.code).toBe(400);
      expect(error.service).toBe("openai");
      expect(error.category).toBe("invalid_request");
      expect(error.userMessage).toBeDefined();
      expect(error.resolution).toBeDefined();
    });
  });

  describe("ChromaDB error codes", () => {
    it("CHROMADB_ECONNREFUSED is connection error", () => {
      const error = ERROR_CODES.CHROMADB_ECONNREFUSED;
      expect(error.code).toBe("ECONNREFUSED");
      expect(error.service).toBe("chromadb");
      expect(error.category).toBe("connection");
      expect(error.userMessage).toBeDefined();
      expect(error.resolution).toBeDefined();
    });

    it("CHROMADB_ENOTFOUND is connection error", () => {
      const error = ERROR_CODES.CHROMADB_ENOTFOUND;
      expect(error.code).toBe("ENOTFOUND");
      expect(error.service).toBe("chromadb");
      expect(error.category).toBe("connection");
    });

    it("CHROMADB_TIMEOUT is connection error", () => {
      const error = ERROR_CODES.CHROMADB_TIMEOUT;
      expect(error.code).toBe("timeout");
      expect(error.service).toBe("chromadb");
      expect(error.category).toBe("connection");
    });
  });

  describe("HTTP error codes", () => {
    it("HTTP_400 is client error", () => {
      const error = ERROR_CODES.HTTP_400;
      expect(error.code).toBe(400);
      expect(error.service).toBe("http");
      expect(error.category).toBe("client_error");
    });

    it("HTTP_401 is authentication error", () => {
      const error = ERROR_CODES.HTTP_401;
      expect(error.code).toBe(401);
      expect(error.service).toBe("http");
      expect(error.category).toBe("authentication");
    });

    it("HTTP_403 is authorization error", () => {
      const error = ERROR_CODES.HTTP_403;
      expect(error.code).toBe(403);
      expect(error.service).toBe("http");
      expect(error.category).toBe("authorization");
    });

    it("HTTP_429 is rate limit error", () => {
      const error = ERROR_CODES.HTTP_429;
      expect(error.code).toBe(429);
      expect(error.service).toBe("http");
      expect(error.category).toBe("rate_limit");
    });

    it("HTTP_500 is server error", () => {
      const error = ERROR_CODES.HTTP_500;
      expect(error.code).toBe(500);
      expect(error.service).toBe("http");
      expect(error.category).toBe("server_error");
    });
  });

  describe("System error codes", () => {
    it("SYSTEM_EMBEDDING_INVALID is validation error", () => {
      const error = ERROR_CODES.SYSTEM_EMBEDDING_INVALID;
      expect(error.code).toBe("EMBEDDING_INVALID");
      expect(error.service).toBe("system");
      expect(error.category).toBe("validation");
      expect(error.userMessage).toBeDefined();
      expect(error.resolution).toBeDefined();
    });

    it("SYSTEM_RESPONSE_EMPTY is validation error", () => {
      const error = ERROR_CODES.SYSTEM_RESPONSE_EMPTY;
      expect(error.code).toBe("RESPONSE_EMPTY");
      expect(error.service).toBe("system");
      expect(error.category).toBe("validation");
      expect(error.userMessage).toBeDefined();
      expect(error.resolution).toBeDefined();
    });
  });
});

describe("getErrorCodeInfo", () => {
  it("returns error info for valid numeric code", () => {
    const result = getErrorCodeInfo(20429);
    expect(result).toBeDefined();
    expect(result?.code).toBe(20429);
    expect(result?.service).toBe("twilio");
  });

  it("returns error info for valid string code", () => {
    const result = getErrorCodeInfo("ECONNREFUSED");
    expect(result).toBeDefined();
    expect(result?.code).toBe("ECONNREFUSED");
    expect(result?.service).toBe("chromadb");
  });

  it("returns error info with service filter", () => {
    const result = getErrorCodeInfo(429, "twilio");
    expect(result).toBeDefined();
    expect(result?.code).toBe(429);
    expect(result?.service).toBe("twilio");
  });

  it("returns undefined for non-existent code", () => {
    const result = getErrorCodeInfo(99999);
    expect(result).toBeUndefined();
  });

  it("returns undefined for non-existent string code", () => {
    const result = getErrorCodeInfo("NON_EXISTENT");
    expect(result).toBeUndefined();
  });

  it("returns undefined when service filter doesn't match", () => {
    const result = getErrorCodeInfo(429, "chromadb");
    expect(result).toBeUndefined();
  });

  it("handles ambiguous codes correctly with service filter", () => {
    const twilioResult = getErrorCodeInfo(429, "twilio");
    expect(twilioResult?.service).toBe("twilio");

    const openaiResult = getErrorCodeInfo(429, "openai");
    expect(openaiResult?.service).toBe("openai");

    const httpResult = getErrorCodeInfo(429, "http");
    expect(httpResult?.service).toBe("http");
  });

  it("returns first match when service not specified for ambiguous codes", () => {
    const result = getErrorCodeInfo(429);
    expect(result).toBeDefined();
    expect([429]).toContain(result?.code);
  });

  it("handles all Twilio codes", () => {
    const codes = [20429, 429, 21211, 20003, 21608, 401, 403];
    codes.forEach((code) => {
      const result = getErrorCodeInfo(code, "twilio");
      expect(result).toBeDefined();
      expect(result?.service).toBe("twilio");
    });
  });

  it("handles all OpenAI codes", () => {
    const codes = [429, 400];
    codes.forEach((code) => {
      const result = getErrorCodeInfo(code, "openai");
      expect(result).toBeDefined();
      expect(result?.service).toBe("openai");
    });
  });

  it("handles all ChromaDB codes", () => {
    const codes = ["ECONNREFUSED", "ENOTFOUND", "timeout"];
    codes.forEach((code) => {
      const result = getErrorCodeInfo(code, "chromadb");
      expect(result).toBeDefined();
      expect(result?.service).toBe("chromadb");
    });
  });

  it("handles all HTTP codes", () => {
    const codes = [400, 401, 403, 429, 500];
    codes.forEach((code) => {
      const result = getErrorCodeInfo(code, "http");
      expect(result).toBeDefined();
      expect(result?.service).toBe("http");
    });
  });

  it("handles all system codes", () => {
    const codes = ["EMBEDDING_INVALID", "RESPONSE_EMPTY"];
    codes.forEach((code) => {
      const result = getErrorCodeInfo(code, "system");
      expect(result).toBeDefined();
      expect(result?.service).toBe("system");
    });
  });
});

describe("getErrorCodesByService", () => {
  it("returns all Twilio error codes", () => {
    const result = getErrorCodesByService("twilio");
    expect(result.length).toBe(7);
    result.forEach((error) => {
      expect(error.service).toBe("twilio");
    });
  });

  it("returns all OpenAI error codes", () => {
    const result = getErrorCodesByService("openai");
    expect(result.length).toBe(2);
    result.forEach((error) => {
      expect(error.service).toBe("openai");
    });
  });

  it("returns all ChromaDB error codes", () => {
    const result = getErrorCodesByService("chromadb");
    expect(result.length).toBe(3);
    result.forEach((error) => {
      expect(error.service).toBe("chromadb");
    });
  });

  it("returns all HTTP error codes", () => {
    const result = getErrorCodesByService("http");
    expect(result.length).toBe(5);
    result.forEach((error) => {
      expect(error.service).toBe("http");
    });
  });

  it("returns all system error codes", () => {
    const result = getErrorCodesByService("system");
    expect(result.length).toBe(2);
    result.forEach((error) => {
      expect(error.service).toBe("system");
    });
  });

  it("returns empty array for invalid service", () => {
    const result = getErrorCodesByService("invalid" as ErrorCodeInfo["service"]);
    expect(result).toEqual([]);
  });
});

describe("getErrorCodesByCategory", () => {
  it("returns all rate_limit errors", () => {
    const result = getErrorCodesByCategory("rate_limit");
    expect(result.length).toBeGreaterThan(0);
    result.forEach((error) => {
      expect(error.category).toBe("rate_limit");
    });
  });

  it("returns all authentication errors", () => {
    const result = getErrorCodesByCategory("authentication");
    expect(result.length).toBeGreaterThan(0);
    result.forEach((error) => {
      expect(error.category).toBe("authentication");
    });
  });

  it("returns all connection errors", () => {
    const result = getErrorCodesByCategory("connection");
    expect(result.length).toBe(3);
    result.forEach((error) => {
      expect(error.category).toBe("connection");
      expect(error.service).toBe("chromadb");
    });
  });

  it("returns all validation errors", () => {
    const result = getErrorCodesByCategory("validation");
    expect(result.length).toBe(2);
    result.forEach((error) => {
      expect(error.category).toBe("validation");
      expect(error.service).toBe("system");
    });
  });

  it("returns all invalid_input errors", () => {
    const result = getErrorCodesByCategory("invalid_input");
    expect(result.length).toBe(1);
    expect(result[0]?.code).toBe(21211);
    expect(result[0]?.service).toBe("twilio");
  });

  it("returns all delivery errors", () => {
    const result = getErrorCodesByCategory("delivery");
    expect(result.length).toBe(1);
    expect(result[0]?.code).toBe(21608);
    expect(result[0]?.service).toBe("twilio");
  });

  it("returns all authorization errors", () => {
    const result = getErrorCodesByCategory("authorization");
    expect(result.length).toBeGreaterThan(0);
    result.forEach((error) => {
      expect(error.category).toBe("authorization");
    });
  });

  it("returns all client_error errors", () => {
    const result = getErrorCodesByCategory("client_error");
    expect(result.length).toBe(1);
    expect(result[0]?.code).toBe(400);
    expect(result[0]?.service).toBe("http");
  });

  it("returns all server_error errors", () => {
    const result = getErrorCodesByCategory("server_error");
    expect(result.length).toBe(1);
    expect(result[0]?.code).toBe(500);
    expect(result[0]?.service).toBe("http");
  });

  it("returns all invalid_request errors", () => {
    const result = getErrorCodesByCategory("invalid_request");
    expect(result.length).toBe(1);
    expect(result[0]?.code).toBe(400);
    expect(result[0]?.service).toBe("openai");
  });

  it("returns empty array for non-existent category", () => {
    const result = getErrorCodesByCategory("non_existent_category");
    expect(result).toEqual([]);
  });
});

describe("Error code consistency", () => {
  it("all error codes have user messages or are system-level", () => {
    Object.values(ERROR_CODES).forEach((error) => {
      if (error.service !== "system" && error.category !== "server_error") {
        expect(
          error.userMessage,
          `Error ${error.code} (${error.service}) should have userMessage`
        ).toBeDefined();
      }
    });
  });

  it("all error codes have resolution steps", () => {
    Object.values(ERROR_CODES).forEach((error) => {
      expect(
        error.resolution,
        `Error ${error.code} (${error.service}) should have resolution`
      ).toBeDefined();
    });
  });

  it("no duplicate codes within same service", () => {
    const serviceCodes = new Map<string, Set<number | string>>();

    Object.values(ERROR_CODES).forEach((error) => {
      const key = error.service;
      if (!serviceCodes.has(key)) {
        serviceCodes.set(key, new Set());
      }
      const codes = serviceCodes.get(key)!;
      expect(
        codes.has(error.code),
        `Duplicate code ${error.code} for service ${error.service}`
      ).toBe(false);
      codes.add(error.code);
    });
  });

  it("all descriptions are non-empty strings", () => {
    Object.values(ERROR_CODES).forEach((error) => {
      expect(error.description).toBeTruthy();
      expect(typeof error.description).toBe("string");
      expect(error.description.length).toBeGreaterThan(0);
    });
  });

  it("all explanations are non-empty strings", () => {
    Object.values(ERROR_CODES).forEach((error) => {
      expect(error.explanation).toBeTruthy();
      expect(typeof error.explanation).toBe("string");
      expect(error.explanation.length).toBeGreaterThan(0);
    });
  });
});

