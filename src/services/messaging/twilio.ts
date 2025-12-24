import type { Twilio } from "twilio";
import type { SendMessageResult } from "../../types/index.js";
import { logger } from "../../logger.js";

export interface TwilioServiceOptions {
  client: Twilio;
  fromNumber?: string;
  messagingServiceSid?: string;
}

export interface TwilioService {
  sendWhatsAppMessage: (to: string, body: string) => Promise<SendMessageResult>;
}

export function createTwilioService(
  options: TwilioServiceOptions
): TwilioService {
  const { client, fromNumber, messagingServiceSid } = options;
  const serviceLogger = logger.child({ module: "twilio-service" });

  const sendWhatsAppMessage = async (
    to: string,
    body: string
  ): Promise<SendMessageResult> => {
    try {
      const messageParams: {
        to: string;
        body: string;
        from?: string;
        messagingServiceSid?: string;
      } = {
        to,
        body,
      };

      if (messagingServiceSid) {
        messageParams.messagingServiceSid = messagingServiceSid;
      } else if (fromNumber) {
        messageParams.from = fromNumber;
      }

      const message = await client.messages.create(messageParams);

      serviceLogger.info(
        {
          to,
          messageSid: message.sid,
          messagingServiceSid: messageParams.messagingServiceSid,
          explanation:
            "WhatsApp message successfully sent via Twilio API. Message SID can be used for tracking and debugging.",
        },
        "twilio.message.sent"
      );

      return {
        success: true,
        messageSid: message.sid,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      const twilioError = error as {
        code?: number;
        status?: number;
        message?: string;
        moreInfo?: string;
      };

      const errorCode = twilioError.code ?? twilioError.status;
      const isRateLimitError = errorCode === 20429 || errorCode === 429;
      const isInvalidNumberError =
        errorCode === 21211 ||
        errorMessage.includes("Invalid 'To' Phone Number") ||
        errorMessage.includes("not a valid phone number");
      const isUnauthorizedError =
        errorCode === 20003 || errorCode === 401 || errorCode === 403;
      const isUnreachableError =
        errorCode === 21608 ||
        errorMessage.includes("unreachable") ||
        errorMessage.includes("not reachable");

      serviceLogger.error(
        {
          to,
          messagingServiceSid,
          error: errorMessage,
          errorCode,
          isRateLimit: isRateLimitError,
          isInvalidNumber: isInvalidNumberError,
          isUnauthorized: isUnauthorizedError,
          isUnreachable: isUnreachableError,
          moreInfo: twilioError.moreInfo,
          stack: error instanceof Error ? error.stack : undefined,
          explanation:
            "Twilio API call failed to send WhatsApp message. Error type detected (rate limit, invalid number, auth, or unreachable) for appropriate user-friendly error message. Returning failure result to handler.",
        },
        "twilio.message.failed"
      );

      let userFriendlyError = errorMessage;
      if (isRateLimitError) {
        userFriendlyError = "Rate limit exceeded. Please try again later.";
      } else if (isInvalidNumberError) {
        userFriendlyError = `Invalid phone number: ${to}`;
      } else if (isUnauthorizedError) {
        userFriendlyError =
          "Twilio authentication failed. Please check credentials.";
      } else if (isUnreachableError) {
        userFriendlyError = `Phone number ${to} is not reachable.`;
      }

      return {
        success: false,
        error: userFriendlyError,
      };
    }
  };

  return { sendWhatsAppMessage };
}
