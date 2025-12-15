import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  CHROMA_URL: z.string().url("CHROMA_URL must be a valid URL"),
  CHROMA_PORT: z.coerce
    .number()
    .int("CHROMA_PORT must be an integer")
    .min(1, "CHROMA_PORT must be between 1 and 65535")
    .max(65535, "CHROMA_PORT must be between 1 and 65535"),
});

const parsedEnv = envSchema.safeParse({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  CHROMA_URL: process.env.CHROMA_URL,
  CHROMA_PORT: process.env.CHROMA_PORT,
});

if (!parsedEnv.success) {
  throw new Error(
    parsedEnv.error.issues.map((issue) => issue.message).join("\n")
  );
}

export const env = parsedEnv.data;
