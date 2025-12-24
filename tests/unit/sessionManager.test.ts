import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createSessionManager,
  type SessionManager,
} from "../../src/services/ai/sessionManager";

describe("SessionManager", () => {
  let sessionManager: SessionManager;
  const sessionTimeoutMs = 900000;

  beforeEach(() => {
    sessionManager = createSessionManager({
      sessionTimeoutMs,
    });
  });

  describe("updateActivity", () => {
    it("should create a new session when conversationId is first accessed", () => {
      const conversationId = "test-conversation-1";
      const startTime = sessionManager.getSessionStartTime(conversationId);
      expect(startTime).toBeNull();

      sessionManager.updateActivity(conversationId);

      const newStartTime = sessionManager.getSessionStartTime(conversationId);
      expect(newStartTime).not.toBeNull();
      expect(newStartTime).toBeInstanceOf(Date);
    });

    it("should update last activity time on subsequent calls", async () => {
      const conversationId = "test-conversation-2";
      sessionManager.updateActivity(conversationId);

      const firstActivity = sessionManager.getLastActivityTime(conversationId);
      expect(firstActivity).not.toBeNull();

      await new Promise((resolve) => setTimeout(resolve, 10));

      sessionManager.updateActivity(conversationId);
      const secondActivity = sessionManager.getLastActivityTime(conversationId);
      expect(secondActivity).not.toBeNull();
      expect(secondActivity!.getTime()).toBeGreaterThan(
        firstActivity!.getTime()
      );
    });
  });

  describe("isSessionExpired", () => {
    it("should return false for a new session", () => {
      const conversationId = "test-conversation-3";
      sessionManager.updateActivity(conversationId);
      expect(sessionManager.isSessionExpired(conversationId)).toBe(false);
    });

    it("should return false for a non-existent session", () => {
      const conversationId = "non-existent";
      expect(sessionManager.isSessionExpired(conversationId)).toBe(false);
    });

    it("should return true for an expired session", () => {
      const conversationId = "test-conversation-4";
      const expiredTimeout = 100;
      const expiredSessionManager = createSessionManager({
        sessionTimeoutMs: expiredTimeout,
      });

      expiredSessionManager.updateActivity(conversationId);

      vi.useFakeTimers();
      vi.advanceTimersByTime(expiredTimeout + 1);

      expect(expiredSessionManager.isSessionExpired(conversationId)).toBe(true);
      vi.useRealTimers();
    });

    it("should return false for a session that has not expired", () => {
      const conversationId = "test-conversation-5";
      const shortTimeout = 1000;
      const shortSessionManager = createSessionManager({
        sessionTimeoutMs: shortTimeout,
      });

      shortSessionManager.updateActivity(conversationId);

      vi.useFakeTimers();
      vi.advanceTimersByTime(shortTimeout - 1);

      expect(shortSessionManager.isSessionExpired(conversationId)).toBe(false);
      vi.useRealTimers();
    });
  });

  describe("resetSession", () => {
    it("should remove session data", () => {
      const conversationId = "test-conversation-6";
      sessionManager.updateActivity(conversationId);

      expect(sessionManager.getSessionStartTime(conversationId)).not.toBeNull();

      sessionManager.resetSession(conversationId);

      expect(sessionManager.getSessionStartTime(conversationId)).toBeNull();
      expect(sessionManager.getLastActivityTime(conversationId)).toBeNull();
    });

    it("should handle resetting non-existent session gracefully", () => {
      const conversationId = "non-existent";
      expect(() => {
        sessionManager.resetSession(conversationId);
      }).not.toThrow();
    });
  });

  describe("getSessionAgeMs", () => {
    it("should return null for non-existent session", () => {
      const conversationId = "non-existent";
      expect(sessionManager.getSessionAgeMs(conversationId)).toBeNull();
    });

    it("should return correct age for existing session", async () => {
      const conversationId = "test-conversation-7";
      sessionManager.updateActivity(conversationId);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const age = sessionManager.getSessionAgeMs(conversationId);
      expect(age).not.toBeNull();
      expect(age!).toBeGreaterThanOrEqual(45);
      expect(age!).toBeLessThan(100);
    });
  });

  describe("getTimeUntilExpirationMs", () => {
    it("should return null for non-existent session", () => {
      const conversationId = "non-existent";
      expect(
        sessionManager.getTimeUntilExpirationMs(conversationId)
      ).toBeNull();
    });

    it("should return correct time until expiration", () => {
      const conversationId = "test-conversation-8";
      const testTimeout = 1000;
      const testSessionManager = createSessionManager({
        sessionTimeoutMs: testTimeout,
      });

      testSessionManager.updateActivity(conversationId);

      vi.useFakeTimers();
      vi.advanceTimersByTime(300);

      const timeUntilExpiration =
        testSessionManager.getTimeUntilExpirationMs(conversationId);
      expect(timeUntilExpiration).not.toBeNull();
      expect(timeUntilExpiration!).toBeGreaterThan(600);
      expect(timeUntilExpiration!).toBeLessThanOrEqual(700);

      vi.useRealTimers();
    });

    it("should return 0 for expired session", () => {
      const conversationId = "test-conversation-9";
      const expiredTimeout = 100;
      const expiredSessionManager = createSessionManager({
        sessionTimeoutMs: expiredTimeout,
      });

      expiredSessionManager.updateActivity(conversationId);

      vi.useFakeTimers();
      vi.advanceTimersByTime(expiredTimeout + 1);

      const timeUntilExpiration =
        expiredSessionManager.getTimeUntilExpirationMs(conversationId);
      expect(timeUntilExpiration).toBe(0);

      vi.useRealTimers();
    });
  });

  describe("multiple sessions", () => {
    it("should track multiple sessions independently", async () => {
      const conversationId1 = "conversation-1";
      const conversationId2 = "conversation-2";

      sessionManager.updateActivity(conversationId1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      sessionManager.updateActivity(conversationId2);

      const age1 = sessionManager.getSessionAgeMs(conversationId1);
      const age2 = sessionManager.getSessionAgeMs(conversationId2);

      expect(age1).not.toBeNull();
      expect(age2).not.toBeNull();
      expect(age1!).toBeGreaterThan(age2!);
    });

    it("should expire sessions independently", () => {
      const conversationId1 = "conversation-1";
      const conversationId2 = "conversation-2";
      const expiredTimeout = 100;
      const expiredSessionManager = createSessionManager({
        sessionTimeoutMs: expiredTimeout,
      });

      expiredSessionManager.updateActivity(conversationId1);
      vi.useFakeTimers();
      vi.advanceTimersByTime(50);
      expiredSessionManager.updateActivity(conversationId2);
      vi.advanceTimersByTime(expiredTimeout - 40);

      expect(expiredSessionManager.isSessionExpired(conversationId1)).toBe(
        true
      );
      expect(expiredSessionManager.isSessionExpired(conversationId2)).toBe(
        false
      );

      vi.useRealTimers();
    });

    it("should handle parallel sessions for different phone numbers", async () => {
      const phoneNumber1 = "whatsapp:+15551234567";
      const phoneNumber2 = "whatsapp:+15559876543";

      await Promise.all([
        Promise.resolve().then(() => {
          sessionManager.updateActivity(phoneNumber1);
        }),
        Promise.resolve().then(() => {
          sessionManager.updateActivity(phoneNumber2);
        }),
      ]);

      const startTime1 = sessionManager.getSessionStartTime(phoneNumber1);
      const startTime2 = sessionManager.getSessionStartTime(phoneNumber2);
      const lastActivity1 = sessionManager.getLastActivityTime(phoneNumber1);
      const lastActivity2 = sessionManager.getLastActivityTime(phoneNumber2);

      expect(startTime1).not.toBeNull();
      expect(startTime2).not.toBeNull();
      expect(lastActivity1).not.toBeNull();
      expect(lastActivity2).not.toBeNull();

      expect(sessionManager.isSessionExpired(phoneNumber1)).toBe(false);
      expect(sessionManager.isSessionExpired(phoneNumber2)).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 20));

      const activityBeforeUpdate = sessionManager.getLastActivityTime(
        phoneNumber2
      )!.getTime();

      sessionManager.updateActivity(phoneNumber1);

      const updatedActivity1 = sessionManager.getLastActivityTime(phoneNumber1);
      const unchangedActivity2 = sessionManager.getLastActivityTime(phoneNumber2);

      expect(updatedActivity1!.getTime()).toBeGreaterThan(
        lastActivity1!.getTime()
      );
      expect(unchangedActivity2!.getTime()).toEqual(activityBeforeUpdate);

      const age1 = sessionManager.getSessionAgeMs(phoneNumber1);
      const age2 = sessionManager.getSessionAgeMs(phoneNumber2);

      expect(age1).not.toBeNull();
      expect(age2).not.toBeNull();
      expect(age1!).toBeGreaterThan(0);
      expect(age2!).toBeGreaterThan(0);

      sessionManager.resetSession(phoneNumber1);
      expect(sessionManager.getSessionStartTime(phoneNumber1)).toBeNull();
      expect(sessionManager.getSessionStartTime(phoneNumber2)).not.toBeNull();
    });

    it("should handle concurrent message exchanges for different phone numbers", async () => {
      const phoneNumber1 = "whatsapp:+15551111111";
      const phoneNumber2 = "whatsapp:+15552222222";

      const simulateMessageExchange = async (
        phoneNumber: string,
        messageCount: number,
        delayMs: number
      ) => {
        for (let i = 0; i < messageCount; i++) {
          sessionManager.updateActivity(phoneNumber);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        return sessionManager.getLastActivityTime(phoneNumber);
      };

      const [finalActivity1, finalActivity2] = await Promise.all([
        simulateMessageExchange(phoneNumber1, 3, 10),
        simulateMessageExchange(phoneNumber2, 3, 15),
      ]);

      expect(finalActivity1).not.toBeNull();
      expect(finalActivity2).not.toBeNull();

      const session1Age = sessionManager.getSessionAgeMs(phoneNumber1);
      const session2Age = sessionManager.getSessionAgeMs(phoneNumber2);

      expect(session1Age).not.toBeNull();
      expect(session2Age).not.toBeNull();
      expect(session1Age!).toBeGreaterThan(0);
      expect(session2Age!).toBeGreaterThan(0);

      expect(sessionManager.isSessionExpired(phoneNumber1)).toBe(false);
      expect(sessionManager.isSessionExpired(phoneNumber2)).toBe(false);

      const timeUntilExpiration1 =
        sessionManager.getTimeUntilExpirationMs(phoneNumber1);
      const timeUntilExpiration2 =
        sessionManager.getTimeUntilExpirationMs(phoneNumber2);

      expect(timeUntilExpiration1).not.toBeNull();
      expect(timeUntilExpiration2).not.toBeNull();
      expect(timeUntilExpiration1!).toBeGreaterThan(0);
      expect(timeUntilExpiration2!).toBeGreaterThan(0);
    });
  });
});

