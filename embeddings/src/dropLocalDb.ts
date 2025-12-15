import type { ChromaClient } from "chromadb";
import { createChromaClient } from "./chromaClient.js";

export type ChromaAdminClient = Pick<
  ChromaClient,
  "listCollections" | "deleteCollection"
>;

export type DropLocalDbOptions = {
  client?: ChromaAdminClient;
};

export type DropLocalDbResult = {
  deletedCollections: string[];
};

export async function dropLocalDb(
  options: DropLocalDbOptions = {}
): Promise<DropLocalDbResult> {
  const client = options.client ?? createChromaClient();
  const collections = await client.listCollections();
  const collectionNames = collections.map((collection) => collection.name);

  if (collectionNames.length === 0) {
    return { deletedCollections: [] };
  }

  await Promise.all(
    collectionNames.map(async (collectionName) => {
      await client.deleteCollection({ name: collectionName });
    })
  );

  return { deletedCollections: collectionNames };
}

async function main() {
  const result = await dropLocalDb();

  if (result.deletedCollections.length === 0) {
    console.log("No collections found. Local Chroma database already empty.");
    return;
  }

  console.log(
    `Deleted ${result.deletedCollections.length} collections: ${result.deletedCollections.join(", ")}`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
