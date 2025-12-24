import { beforeEach, describe, expect, it, vi } from "vitest";
import type { drive_v3 } from "googleapis";
import type OpenAI from "openai";

const driveMocks = vi.hoisted(() => ({
  createGoogleDriveClient: vi.fn(),
  createCsvFile: vi.fn(),
  findFile: vi.fn(),
  findOrCreateFolder: vi.fn(),
  updateFile: vi.fn(),
}));

const envMock = vi.hoisted(() => ({
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "service-account@example.com",
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:
    "-----BEGIN PRIVATE KEY-----\\nLINE\\n-----END PRIVATE KEY-----",
  GOOGLE_DRIVE_FOLDER_ID: "drive-folder-id",
}));

vi.mock("../../src/clients/googleDrive", () => ({
  createGoogleDriveClient: driveMocks.createGoogleDriveClient,
  createCsvFile: driveMocks.createCsvFile,
  findFile: driveMocks.findFile,
  findOrCreateFolder: driveMocks.findOrCreateFolder,
  updateFile: driveMocks.updateFile,
}));

vi.mock("../../src/env", () => ({
  env: envMock,
}));

import {
  createConversationDriveService,
  saveConversationToDrive,
} from "../../src/services/messaging/conversationDrive";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

describe("conversationDrive service", () => {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: "You are a helpful assistant.",
    },
    {
      role: "user",
      content: "Hello, world!",
    },
    {
      role: "assistant",
      content: "Hi there!",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new conversation file when file does not exist", async () => {
    const driveInstance = {
      files: { create: vi.fn(), list: vi.fn(), update: vi.fn() },
    } as unknown as drive_v3.Drive;

    driveMocks.createGoogleDriveClient.mockReturnValue(driveInstance);
    driveMocks.findOrCreateFolder.mockResolvedValue({
      id: "phone-folder-id",
      name: "conversation-15555555555",
    });
    driveMocks.findFile.mockResolvedValue(null);
    driveMocks.createCsvFile.mockResolvedValue({
      id: "file-id",
      name: "conversation.csv",
    });

    await saveConversationToDrive({
      phoneNumber: "whatsapp:+15555555555",
      messages,
    });

    expect(driveMocks.createGoogleDriveClient).toHaveBeenCalledWith({
      clientEmail: "service-account@example.com",
      privateKey:
        "-----BEGIN PRIVATE KEY-----\\nLINE\\n-----END PRIVATE KEY-----",
    });

    expect(driveMocks.findOrCreateFolder).toHaveBeenCalledWith({
      drive: driveInstance,
      parentFolderId: "drive-folder-id",
      folderName: "conversation-15555555555",
    });

    expect(driveMocks.findFile).toHaveBeenCalledWith({
      drive: driveInstance,
      folderId: "phone-folder-id",
      fileName: "conversation",
    });

    expect(driveMocks.createCsvFile).toHaveBeenCalledWith({
      drive: driveInstance,
      folderId: "phone-folder-id",
      fileName: "conversation",
      content: expect.stringContaining("conversation_id,role,timestamp,content"),
    });

    expect(driveMocks.updateFile).not.toHaveBeenCalled();
  });

  it("updates existing conversation file when file exists", async () => {
    const driveInstance = {
      files: { create: vi.fn(), list: vi.fn(), update: vi.fn() },
    } as unknown as drive_v3.Drive;

    driveMocks.createGoogleDriveClient.mockReturnValue(driveInstance);
    driveMocks.findOrCreateFolder.mockResolvedValue({
      id: "phone-folder-id",
      name: "conversation-15555555555",
    });
    driveMocks.findFile.mockResolvedValue({
      id: "existing-file-id",
      name: "conversation.csv",
    });
    driveMocks.updateFile.mockResolvedValue({
      id: "existing-file-id",
      name: "conversation.csv",
    });

    await saveConversationToDrive({
      phoneNumber: "whatsapp:+15555555555",
      messages,
    });

    expect(driveMocks.findFile).toHaveBeenCalledWith({
      drive: driveInstance,
      folderId: "phone-folder-id",
      fileName: "conversation",
    });

    expect(driveMocks.updateFile).toHaveBeenCalledWith({
      drive: driveInstance,
      fileId: "existing-file-id",
      content: expect.stringContaining("conversation_id,role,timestamp,content"),
    });

    expect(driveMocks.createCsvFile).not.toHaveBeenCalled();
  });

  it("normalizes phone number for folder name", async () => {
    const driveInstance = {
      files: { create: vi.fn(), list: vi.fn(), update: vi.fn() },
    } as unknown as drive_v3.Drive;

    driveMocks.createGoogleDriveClient.mockReturnValue(driveInstance);
    driveMocks.findOrCreateFolder.mockResolvedValue({
      id: "phone-folder-id",
      name: "conversation-15555555555",
    });
    driveMocks.findFile.mockResolvedValue(null);
    driveMocks.createCsvFile.mockResolvedValue({
      id: "file-id",
      name: "conversation.csv",
    });

    await saveConversationToDrive({
      phoneNumber: "whatsapp:+1 (555) 555-5555",
      messages,
    });

    expect(driveMocks.findOrCreateFolder).toHaveBeenCalledWith({
      drive: driveInstance,
      parentFolderId: "drive-folder-id",
      folderName: "conversation-15555555555",
    });
  });

  it("skips saving when credentials are missing", async () => {
    await saveConversationToDrive(
      {
        phoneNumber: "whatsapp:+15555555555",
        messages,
      },
      {
        environment: {
          GOOGLE_SERVICE_ACCOUNT_EMAIL: "",
          GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "",
          GOOGLE_DRIVE_FOLDER_ID: "",
        },
      }
    );

    expect(driveMocks.createGoogleDriveClient).not.toHaveBeenCalled();
    expect(driveMocks.findOrCreateFolder).not.toHaveBeenCalled();
  });

  it("uses provided dependencies", async () => {
    const driveInstance = {
      files: { create: vi.fn(), list: vi.fn(), update: vi.fn() },
    } as unknown as drive_v3.Drive;

    driveMocks.findOrCreateFolder.mockResolvedValue({
      id: "phone-folder-id",
      name: "conversation-15555555555",
    });
    driveMocks.findFile.mockResolvedValue(null);
    driveMocks.createCsvFile.mockResolvedValue({
      id: "file-id",
      name: "conversation.csv",
    });

    await saveConversationToDrive(
      {
        phoneNumber: "whatsapp:+15555555555",
        messages,
      },
      {
        drive: driveInstance,
        createDriveClient: driveMocks.createGoogleDriveClient,
        findOrCreateDriveFolder: driveMocks.findOrCreateFolder,
        findDriveFile: driveMocks.findFile,
        createDriveCsvFile: driveMocks.createCsvFile,
        environment: {
          GOOGLE_SERVICE_ACCOUNT_EMAIL: "custom@example.com",
          GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "custom-key",
          GOOGLE_DRIVE_FOLDER_ID: "custom-folder-id",
        },
      }
    );

    expect(driveMocks.createGoogleDriveClient).not.toHaveBeenCalled();
    expect(driveMocks.findOrCreateFolder).toHaveBeenCalledWith({
      drive: driveInstance,
      parentFolderId: "custom-folder-id",
      folderName: "conversation-15555555555",
    });
  });

  it("filters out system messages from CSV", async () => {
    const driveInstance = {
      files: { create: vi.fn(), list: vi.fn(), update: vi.fn() },
    } as unknown as drive_v3.Drive;

    driveMocks.createGoogleDriveClient.mockReturnValue(driveInstance);
    driveMocks.findOrCreateFolder.mockResolvedValue({
      id: "phone-folder-id",
      name: "conversation-15555555555",
    });
    driveMocks.findFile.mockResolvedValue(null);
    driveMocks.createCsvFile.mockResolvedValue({
      id: "file-id",
      name: "conversation.csv",
    });

    await saveConversationToDrive({
      phoneNumber: "whatsapp:+15555555555",
      messages,
    });

    const createCall = driveMocks.createCsvFile.mock.calls[0][0];
    const csvContent = createCall.content as string;
    const lines = csvContent.split("\n");

    expect(lines.some((line) => line.includes("system"))).toBe(false);
    expect(lines.some((line) => line.includes("user"))).toBe(true);
    expect(lines.some((line) => line.includes("assistant"))).toBe(true);
  });

  it("creates service with saveConversation method", async () => {
    const driveInstance = {
      files: { create: vi.fn(), list: vi.fn(), update: vi.fn() },
    } as unknown as drive_v3.Drive;

    driveMocks.createGoogleDriveClient.mockReturnValue(driveInstance);
    driveMocks.findOrCreateFolder.mockResolvedValue({
      id: "phone-folder-id",
      name: "conversation-15555555555",
    });
    driveMocks.findFile.mockResolvedValue(null);
    driveMocks.createCsvFile.mockResolvedValue({
      id: "file-id",
      name: "conversation.csv",
    });

    const service = createConversationDriveService();
    await service.saveConversation("whatsapp:+15555555555", messages);

    expect(driveMocks.findOrCreateFolder).toHaveBeenCalled();
    expect(driveMocks.createCsvFile).toHaveBeenCalled();
  });

  it("handles Drive connection errors gracefully without crashing", async () => {
    const connectionError = new Error("Failed to connect to Google Drive");
    driveMocks.createGoogleDriveClient.mockImplementation(() => {
      throw connectionError;
    });

    await expect(
      saveConversationToDrive({
        phoneNumber: "whatsapp:+15555555555",
        messages,
      })
    ).resolves.not.toThrow();

    expect(driveMocks.createGoogleDriveClient).toHaveBeenCalled();
  });

  it("handles folder creation errors gracefully without crashing", async () => {
    const driveInstance = {
      files: { create: vi.fn(), list: vi.fn(), update: vi.fn() },
    } as unknown as drive_v3.Drive;

    driveMocks.createGoogleDriveClient.mockReturnValue(driveInstance);
    const folderError = new Error("Failed to create folder");
    driveMocks.findOrCreateFolder.mockRejectedValue(folderError);

    await expect(
      saveConversationToDrive({
        phoneNumber: "whatsapp:+15555555555",
        messages,
      })
    ).resolves.not.toThrow();

    expect(driveMocks.findOrCreateFolder).toHaveBeenCalled();
  });

  it("handles file creation errors gracefully without crashing", async () => {
    const driveInstance = {
      files: { create: vi.fn(), list: vi.fn(), update: vi.fn() },
    } as unknown as drive_v3.Drive;

    driveMocks.createGoogleDriveClient.mockReturnValue(driveInstance);
    driveMocks.findOrCreateFolder.mockResolvedValue({
      id: "phone-folder-id",
      name: "conversation-15555555555",
    });
    driveMocks.findFile.mockResolvedValue(null);
    const createError = new Error("Failed to create CSV file");
    driveMocks.createCsvFile.mockRejectedValue(createError);

    await expect(
      saveConversationToDrive({
        phoneNumber: "whatsapp:+15555555555",
        messages,
      })
    ).resolves.not.toThrow();

    expect(driveMocks.createCsvFile).toHaveBeenCalled();
  });

  it("handles file update errors gracefully without crashing", async () => {
    const driveInstance = {
      files: { create: vi.fn(), list: vi.fn(), update: vi.fn() },
    } as unknown as drive_v3.Drive;

    driveMocks.createGoogleDriveClient.mockReturnValue(driveInstance);
    driveMocks.findOrCreateFolder.mockResolvedValue({
      id: "phone-folder-id",
      name: "conversation-15555555555",
    });
    driveMocks.findFile.mockResolvedValue({
      id: "existing-file-id",
      name: "conversation.csv",
    });
    const updateError = new Error("Failed to update CSV file");
    driveMocks.updateFile.mockRejectedValue(updateError);

    await expect(
      saveConversationToDrive({
        phoneNumber: "whatsapp:+15555555555",
        messages,
      })
    ).resolves.not.toThrow();

    expect(driveMocks.updateFile).toHaveBeenCalled();
  });

  it("service handles errors gracefully without crashing", async () => {
    const driveInstance = {
      files: { create: vi.fn(), list: vi.fn(), update: vi.fn() },
    } as unknown as drive_v3.Drive;

    driveMocks.createGoogleDriveClient.mockReturnValue(driveInstance);
    const folderError = new Error("Drive API error");
    driveMocks.findOrCreateFolder.mockRejectedValue(folderError);

    const service = createConversationDriveService();
    await expect(
      service.saveConversation("whatsapp:+15555555555", messages)
    ).resolves.not.toThrow();

    expect(driveMocks.findOrCreateFolder).toHaveBeenCalled();
  });
});

