import {
  CloudClient,
  ChromaClient,
  type ChromaClient as ChromaClientType,
} from "chromadb";

export interface CreateChromaClientOptions {
  apiKey: string;
  tenant: string;
  database: string;
}

export interface CreateLocalChromaClientOptions {
  host: string;
  port: number;
  ssl?: boolean;
}

export function createChromaClient(
  options: CreateChromaClientOptions
): ChromaClientType {
  return new CloudClient(options);
}

export function createLocalChromaClient(
  options: CreateLocalChromaClientOptions
): ChromaClientType {
  return new ChromaClient({
    host: options.host,
    port: options.port,
    ssl: options.ssl ?? false,
  });
}
