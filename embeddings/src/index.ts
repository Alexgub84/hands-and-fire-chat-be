import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import OpenAI from "openai";
import type { Metadata } from "chromadb";
import { z } from "zod";
import { env } from "./env.js";
import { createChromaClient } from "./chromaClient.js";

export { parseChromaUrl } from "./chromaClient.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const client = createChromaClient();
const DEFAULT_COLLECTION_NAME = "default_collection";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_BATCH_SIZE = 64;
const UPDATED_DOCUMENT_NAME = "documents_1.3";

const metadataPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const metadataValueSchema = z.union([
  metadataPrimitiveSchema,
  z.array(metadataPrimitiveSchema),
]);

const rawMetadataSchema = z.record(metadataValueSchema);

const metadataSchema = z.record(metadataPrimitiveSchema);

const documentRecordSchema = z.object({
  id: z.string().min(1, "Document id is required"),
  document: z.string().min(1, "Document text is required"),
  metadata: rawMetadataSchema.optional(),
});

const collectionSchema = z.object({
  name: z.string().min(1, "Collection name is required"),
  version: z.string().optional(),
  description: z.string().optional(),
});

const documentFileSchema = z.object({
  collection: collectionSchema.optional(),
  records: z.array(documentRecordSchema),
});

const embeddingDocumentSchema = z.object({
  id: z.string().min(1, "Document id is required"),
  text: z.string().min(1, "Document text is required"),
  metadata: metadataSchema.optional(),
});

const embeddingDocumentListSchema = z.array(embeddingDocumentSchema);

export type EmbeddingDocument = z.infer<typeof embeddingDocumentSchema>;
export type DocumentCollection = z.infer<typeof collectionSchema>;

export async function loadDocumentsFromJson(filePath: string): Promise<{
  collection?: DocumentCollection;
  documents: EmbeddingDocument[];
}> {
  const contents = await readFile(filePath, "utf-8");
  const json = JSON.parse(contents);

  const parsedFile = documentFileSchema.safeParse(json);
  if (parsedFile.success) {
    return {
      collection: parsedFile.data.collection,
      documents: parsedFile.data.records.map((record) => ({
        id: record.id,
        text: record.document,
        metadata: normalizeMetadata(record.metadata),
      })),
    };
  }

  const parsedDocuments = embeddingDocumentListSchema.safeParse(json);
  if (parsedDocuments.success) {
    return {
      documents: parsedDocuments.data.map((document) => ({
        ...document,
        metadata: normalizeMetadata(document.metadata),
      })),
    };
  }

  throw new Error(
    parsedFile.error.issues.map((issue) => issue.message).join("\n")
  );
}

export function normalizeMetadata(
  metadata?: z.infer<typeof rawMetadataSchema>
): z.infer<typeof metadataSchema> | undefined {
  if (!metadata) {
    return undefined;
  }

  const entries = Object.entries(metadata).map(([key, value]) => {
    if (Array.isArray(value)) {
      return [key, JSON.stringify(value)] as const;
    }

    return [key, value] as const;
  });

  return entries.reduce<Record<string, string | number | boolean | null>>(
    (acc, [key, value]) => {
      acc[key] = value;
      return acc;
    },
    {}
  );
}

export async function createEmbeddings(
  texts: string[],
  options: {
    model?: string;
    batchSize?: number;
    client?: OpenAI;
  } = {}
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const {
    model = DEFAULT_EMBEDDING_MODEL,
    batchSize = DEFAULT_EMBEDDING_BATCH_SIZE,
    client = openai,
  } = options;

  if (batchSize <= 0 || !Number.isFinite(batchSize)) {
    throw new Error(`Invalid batch size: ${batchSize}`);
  }

  const sanitizedTexts = texts.map((text) => text.replace(/\n/g, " "));
  const batches = chunkArray(sanitizedTexts, batchSize);
  const embeddings: number[][] = [];

  for (const batch of batches) {
    const response = await client.embeddings.create({
      model,
      input: batch,
    });
    embeddings.push(...response.data.map((item) => item.embedding as number[]));
  }

  return embeddings;
}

export async function getOrCreateCollection(name: string) {
  try {
    return await client.getCollection({ name });
  } catch {
    await client.createCollection({ name, embeddingFunction: null });
    return await client.getCollection({ name });
  }
}

export async function addDocsWithEmbeddings(opts: {
  collectionName: string;
  documents: EmbeddingDocument[];
}) {
  const collection = await getOrCreateCollection(opts.collectionName);
  const ids = opts.documents.map((document) => document.id);
  const documents = opts.documents.map((document) => document.text);
  const metadatas: Metadata[] = opts.documents.map(
    (document) => document.metadata ?? {}
  );
  const embeddings = await createEmbeddings(documents);
  await collection.upsert({
    ids,
    documents,
    metadatas,
    embeddings,
  });
}

export async function run(documentsPath: string) {
  const absolutePath = resolve(process.cwd(), documentsPath);
  const { collection, documents } = await loadDocumentsFromJson(absolutePath);
  const collectionName = collection?.name ?? DEFAULT_COLLECTION_NAME;

  if (documents.length === 0) {
    return {
      collectionName,
      documentCount: 0,
    };
  }

  await addDocsWithEmbeddings({ collectionName, documents });

  return {
    collectionName,
    documentCount: documents.length,
  };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

async function main() {
  const inputPath = process.argv[2] ?? `./data/${UPDATED_DOCUMENT_NAME}.json`;
  const result = await run(inputPath);

  console.log(
    `Ingested ${result.documentCount} documents into ${result.collectionName}`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
