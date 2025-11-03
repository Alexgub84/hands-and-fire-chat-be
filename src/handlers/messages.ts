import type { FastifyRequest, FastifyReply } from "fastify";
import { whatsappMessageSchema } from "../types/index.js";
import { sendWhatsAppMessage } from "../services/twilio.js";
import { generateSimpleResponse } from "../services/openai.js";

export async function handleWhatsAppWebhook(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const parsed = whatsappMessageSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid request body",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { From, Body } = parsed.data;

  request.log.info(`Received WhatsApp message from ${From}: ${Body}`);
  const openaiResponse = await generateSimpleResponse(Body);
  const result = await sendWhatsAppMessage(From, openaiResponse);

  if (!result.success) {
    request.log.error(`Failed to send message: ${result.error}`);
    return reply.status(500).send({
      error: "Failed to send message",
      details: result.error,
    });
  }

  return reply.send({
    success: true,
    messageSid: result.messageSid,
  });
}

export async function handleHealthCheck(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  return reply.send({ ok: true });
}
