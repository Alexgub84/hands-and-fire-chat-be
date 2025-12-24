import type { drive_v3 } from "googleapis";
import {
  createCsvFile,
  createGoogleDriveClient,
  findFile,
  findOrCreateFolder,
  updateFile,
} from "../../clients/googleDrive.js";
import { env, type Environment } from "../../env.js";
import { logger } from "../../logger.js";
import type OpenAI from "openai";
import { buildConversationCsvContent } from "../export/conversationCsv.js";
import type { ConversationCsvMessage } from "../export/conversationCsv.js";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface SaveConversationOptions {
  phoneNumber: string;
  messages: ChatMessage[];
}

export interface ConversationDriveServiceDependencies {
  drive?: drive_v3.Drive;
  environment?: Pick<
    Environment,
    | "GOOGLE_SERVICE_ACCOUNT_EMAIL"
    | "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"
    | "GOOGLE_DRIVE_FOLDER_ID"
  >;
  createDriveClient?: typeof createGoogleDriveClient;
  createDriveCsvFile?: typeof createCsvFile;
  findDriveFile?: typeof findFile;
  findOrCreateDriveFolder?: typeof findOrCreateFolder;
  updateDriveFile?: typeof updateFile;
  now?: () => Date;
}

function normalizePhoneNumber(phoneNumber: string): string {
  return phoneNumber.replace(/[^0-9]/g, "");
}

function convertToCsvMessages(
  messages: ChatMessage[]
): ConversationCsvMessage[] {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role,
      content:
        typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      timestamp: new Date().toISOString(),
    }));
}

export async function saveConversationToDrive(
  options: SaveConversationOptions,
  dependencies: ConversationDriveServiceDependencies = {}
): Promise<void> {
  const serviceLogger = logger.child({ module: "conversation-drive" });
  const environment = dependencies.environment ?? env;

  if (
    !environment.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    !environment.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ||
    !environment.GOOGLE_DRIVE_FOLDER_ID
  ) {
    serviceLogger.warn(
      { phoneNumber: options.phoneNumber },
      "conversation.drive.save.skipped.missing.credentials"
    );
    return;
  }

  try {
    const getOrCreateDriveClient = (): drive_v3.Drive => {
      if (dependencies.drive) {
        return dependencies.drive;
      }

      const createClient =
        dependencies.createDriveClient ?? createGoogleDriveClient;
      return createClient({
        clientEmail: environment.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
        privateKey: environment.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!,
      });
    };

    const drive = getOrCreateDriveClient();
    const normalizedPhoneNumber = normalizePhoneNumber(options.phoneNumber);
    const folderName = `conversation-${normalizedPhoneNumber}`;
    const fileName = "conversation";

    const findOrCreateFolderFn =
      dependencies.findOrCreateDriveFolder ?? findOrCreateFolder;
    const phoneFolder = await findOrCreateFolderFn({
      drive,
      parentFolderId: environment.GOOGLE_DRIVE_FOLDER_ID,
      folderName,
    });

    const csvMessages = convertToCsvMessages(options.messages);
    const csvContent = buildConversationCsvContent(
      normalizedPhoneNumber,
      csvMessages
    );

    const findFileFn = dependencies.findDriveFile ?? findFile;
    const existingFile = await findFileFn({
      drive,
      folderId: phoneFolder.id ?? "",
      fileName,
    });

    if (existingFile?.id) {
      const updateFileFn = dependencies.updateDriveFile ?? updateFile;
      await updateFileFn({
        drive,
        fileId: existingFile.id,
        content: csvContent,
      });

      serviceLogger.info(
        {
          phoneNumber: options.phoneNumber,
          folderId: phoneFolder.id,
          fileId: existingFile.id,
        },
        "conversation.drive.updated"
      );
    } else {
      const createFileFn = dependencies.createDriveCsvFile ?? createCsvFile;
      const file = await createFileFn({
        drive,
        folderId: phoneFolder.id ?? "",
        fileName,
        content: csvContent,
      });

      serviceLogger.info(
        {
          phoneNumber: options.phoneNumber,
          folderId: phoneFolder.id,
          fileId: file.id,
        },
        "conversation.drive.created"
      );
    }
  } catch (error) {
    serviceLogger.error(
      {
        phoneNumber: options.phoneNumber,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "conversation.drive.save.failed"
    );
  }
}

export interface ConversationDriveService {
  saveConversation: (
    phoneNumber: string,
    messages: ChatMessage[]
  ) => Promise<void>;
}

export function createConversationDriveService(
  dependencies: ConversationDriveServiceDependencies = {}
): ConversationDriveService {
  return {
    async saveConversation(phoneNumber: string, messages: ChatMessage[]) {
      await saveConversationToDrive({ phoneNumber, messages }, dependencies);
    },
  };
}
