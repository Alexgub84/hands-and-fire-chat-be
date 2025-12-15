import { ChromaClient } from "chromadb";
import { env } from "./env.js";

export type ChromaConnection = {
  host: string;
  port: number;
  ssl: boolean;
};

export function parseChromaUrl(url: string, port: number): ChromaConnection {
  const parsed = new URL(url);
  const urlPort = parsed.port ? Number(parsed.port) : undefined;

  if (parsed.pathname && parsed.pathname !== "/") {
    console.warn(
      `Ignoring path '${parsed.pathname}' in CHROMA_URL; requests will target the server root`
    );
  }

  if (Number.isNaN(port)) {
    throw new Error(`Invalid port provided for Chroma connection: ${port}`);
  }

  if (urlPort && urlPort !== port) {
    console.warn(
      `Port mismatch between CHROMA_URL (${urlPort}) and CHROMA_PORT (${port}); using CHROMA_PORT`
    );
  }

  return {
    host: parsed.hostname,
    port,
    ssl: parsed.protocol === "https:",
  };
}

export function createChromaClient(): ChromaClient {
  const connection = parseChromaUrl(env.CHROMA_URL, env.CHROMA_PORT);
  return new ChromaClient(connection);
}
