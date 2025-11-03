import { test } from "tap";
import { buildApp } from "../src/app.ts";
import type { SendMessageResult } from "../src/types/index.ts";

test("GET / returns ok", async (t) => {
  const app = await buildApp();
  t.teardown(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/",
  });

  t.equal(response.statusCode, 200);
  t.same(response.json(), { ok: true });
});

test("POST /whatsapp validates request body", async (t) => {
  const app = await buildApp();
  t.teardown(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/whatsapp",
    payload: {},
  });

  t.equal(response.statusCode, 400);
  const body = response.json();
  t.ok(body.error);
  t.equal(body.error, "Invalid request body");
});

test("POST /whatsapp sends AI-generated reply when services succeed", async (t) => {
  const payload = {
    From: "whatsapp:+15551234567",
    Body: "Hello there",
  } as const;
  let observedOpenAIInput: string | undefined;
  let observedTwilio: { to: string; body: string } | undefined;

  const app = await buildApp({
    messages: {
      generateSimpleResponse: async (message: string): Promise<string> => {
        observedOpenAIInput = message;
        return "AI response";
      },
      sendWhatsAppMessage: async (
        to: string,
        body: string
      ): Promise<SendMessageResult> => {
        observedTwilio = { to, body };
        return { success: true, messageSid: "SM1234567890" };
      },
    },
  });
  t.teardown(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/whatsapp",
    payload,
  });

  t.equal(response.statusCode, 200);
  t.same(response.json(), {
    success: true,
    messageSid: "SM1234567890",
  });
  t.equal(observedOpenAIInput, payload.Body);
  t.same(observedTwilio, {
    to: payload.From,
    body: "AI response",
  });
});

test("POST /whatsapp returns 500 when Twilio send fails", async (t) => {
  const payload = {
    From: "whatsapp:+15559876543",
    Body: "Need help",
  } as const;

  const app = await buildApp({
    messages: {
      generateSimpleResponse: async (): Promise<string> => "Assistant reply",
      sendWhatsAppMessage: async () =>
        Promise.resolve({ success: false, error: "Twilio unavailable" }),
    },
  });
  t.teardown(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/whatsapp",
    payload,
  });

  t.equal(response.statusCode, 500);
  t.same(response.json(), {
    error: "Failed to send message",
    details: "Twilio unavailable",
  });
});
