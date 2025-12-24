import { logger } from "../../logger.js";

interface SessionData {
  startTime: Date;
  lastActivity: Date;
}

export interface SessionManagerOptions {
  sessionTimeoutMs: number;
}

export interface SessionManager {
  getSessionStartTime: (conversationId: string) => Date | null;
  getLastActivityTime: (conversationId: string) => Date | null;
  isSessionExpired: (conversationId: string) => boolean;
  updateActivity: (conversationId: string) => void;
  resetSession: (conversationId: string) => void;
  getSessionAgeMs: (conversationId: string) => number | null;
  getTimeUntilExpirationMs: (conversationId: string) => number | null;
}

export function createSessionManager(
  options: SessionManagerOptions
): SessionManager {
  const { sessionTimeoutMs } = options;
  const serviceLogger = logger.child({ module: "session-manager" });
  const sessions = new Map<string, SessionData>();

  const getSessionStartTime = (conversationId: string): Date | null => {
    const session = sessions.get(conversationId);
    return session?.startTime ?? null;
  };

  const getLastActivityTime = (conversationId: string): Date | null => {
    const session = sessions.get(conversationId);
    return session?.lastActivity ?? null;
  };

  const isSessionExpired = (conversationId: string): boolean => {
    const session = sessions.get(conversationId);
    if (!session) {
      return false;
    }

    const now = new Date();
    const timeSinceLastActivity =
      now.getTime() - session.lastActivity.getTime();
    const expired = timeSinceLastActivity >= sessionTimeoutMs;

    if (expired) {
      serviceLogger.info(
        {
          conversationId,
          sessionAgeMs: now.getTime() - session.startTime.getTime(),
          timeSinceLastActivityMs: timeSinceLastActivity,
          sessionTimeoutMs,
        },
        "session.expired"
      );
    }

    return expired;
  };

  const updateActivity = (conversationId: string): void => {
    const now = new Date();
    const existing = sessions.get(conversationId);

    if (existing) {
      existing.lastActivity = now;
    } else {
      sessions.set(conversationId, {
        startTime: now,
        lastActivity: now,
      });
      serviceLogger.debug({ conversationId }, "session.created");
    }
  };

  const resetSession = (conversationId: string): void => {
    const existing = sessions.get(conversationId);
    if (existing) {
      const sessionAgeMs = new Date().getTime() - existing.startTime.getTime();
      serviceLogger.info(
        {
          conversationId,
          sessionAgeMs,
        },
        "session.reset"
      );
    }
    sessions.delete(conversationId);
  };

  const getSessionAgeMs = (conversationId: string): number | null => {
    const session = sessions.get(conversationId);
    if (!session) {
      return null;
    }
    return new Date().getTime() - session.startTime.getTime();
  };

  const getTimeUntilExpirationMs = (conversationId: string): number | null => {
    const session = sessions.get(conversationId);
    if (!session) {
      return null;
    }
    const now = new Date();
    const timeSinceLastActivity =
      now.getTime() - session.lastActivity.getTime();
    const timeUntilExpiration = sessionTimeoutMs - timeSinceLastActivity;
    return Math.max(0, timeUntilExpiration);
  };

  return {
    getSessionStartTime,
    getLastActivityTime,
    isSessionExpired,
    updateActivity,
    resetSession,
    getSessionAgeMs,
    getTimeUntilExpirationMs,
  };
}
