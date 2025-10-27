import fastify from "fastify";
import formbody from "@fastify/formbody";
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

export async function buildApp() {
  const app = fastify({ logger: process.env.NODE_ENV !== "test" });
  await app.register(formbody);

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const waPhoneNumber = process.env.WA_PHONE_NUMBER;

  app.get("/", (_req, reply) => {
    reply.send({ ok: true });
  });

  app.post("/whatsapp", async (request, reply) => {
    const { From, Body } = request.body as Record<string, string>;
    app.log.info(`Received WhatsApp message from ${From}: ${Body}`);
    if (!From || !Body) {
      return reply.status(400).send({ error: "Missing required fields" });
    }

    const client = twilio(accountSid, authToken);
    await client.messages.create({
      from: waPhoneNumber!,
      to: From,
      body: "SO cool!",
    });
    reply.code(200).send({ ok: true });
    return;
  });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = await buildApp();

  app.listen({ port: 3000 }, (err, address) => {
    if (err) {
      app.log.error(err);
      process.exit(1);
    }
    app.log.info(`Server is running on ${address}`);
  });
}
