import { Readable } from "node:stream";
import { google, type drive_v3 } from "googleapis";

const DEFAULT_SCOPES = ["https://www.googleapis.com/auth/drive.file"];
const CSV_MIME_TYPE = "text/csv";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const DEFAULT_FIELDS = "id, name, webViewLink";

export interface CreateGoogleDriveClientOptions {
  clientEmail: string;
  privateKey: string;
  scopes?: string[];
}

export function createGoogleDriveClient(
  options: CreateGoogleDriveClientOptions
): drive_v3.Drive {
  const auth = new google.auth.JWT({
    email: options.clientEmail,
    key: options.privateKey.replace(/\\n/g, "\n"),
    scopes: options.scopes ?? DEFAULT_SCOPES,
  });

  return google.drive({
    version: "v3",
    auth,
  });
}

export interface CreateCsvFileOptions {
  drive: drive_v3.Drive;
  folderId: string;
  fileName: string;
  content: string;
  fields?: string;
}

export async function createCsvFile(
  options: CreateCsvFileOptions
): Promise<drive_v3.Schema$File> {
  const normalizedFileName = options.fileName.endsWith(".csv")
    ? options.fileName
    : `${options.fileName}.csv`;

  const response = await options.drive.files.create({
    requestBody: {
      name: normalizedFileName,
      mimeType: CSV_MIME_TYPE,
      parents: [options.folderId],
    },
    media: {
      mimeType: CSV_MIME_TYPE,
      body: Readable.from([options.content]),
    },
    fields: options.fields ?? DEFAULT_FIELDS,
    supportsAllDrives: true,
  });

  return response.data;
}

export interface FindFileOptions {
  drive: drive_v3.Drive;
  folderId: string;
  fileName: string;
}

export async function findFile(
  options: FindFileOptions
): Promise<drive_v3.Schema$File | null> {
  const normalizedFileName = options.fileName.endsWith(".csv")
    ? options.fileName
    : `${options.fileName}.csv`;

  const response = await options.drive.files.list({
    q: `name='${normalizedFileName}' and '${options.folderId}' in parents and trashed=false`,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files = response.data.files;
  if (!files || files.length === 0) {
    return null;
  }

  return files[0] ?? null;
}

export interface CreateFolderOptions {
  drive: drive_v3.Drive;
  parentFolderId: string;
  folderName: string;
}

export async function createFolder(
  options: CreateFolderOptions
): Promise<drive_v3.Schema$File> {
  const response = await options.drive.files.create({
    requestBody: {
      name: options.folderName,
      mimeType: FOLDER_MIME_TYPE,
      parents: [options.parentFolderId],
    },
    fields: DEFAULT_FIELDS,
    supportsAllDrives: true,
  });

  return response.data;
}

export interface FindOrCreateFolderOptions {
  drive: drive_v3.Drive;
  parentFolderId: string;
  folderName: string;
}

export async function findOrCreateFolder(
  options: FindOrCreateFolderOptions
): Promise<drive_v3.Schema$File> {
  const response = await options.drive.files.list({
    q: `name='${options.folderName}' and '${options.parentFolderId}' in parents and mimeType='${FOLDER_MIME_TYPE}' and trashed=false`,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files = response.data.files;
  if (files && files.length > 0 && files[0]) {
    return files[0];
  }

  return createFolder(options);
}

export interface UpdateFileOptions {
  drive: drive_v3.Drive;
  fileId: string;
  content: string;
  fields?: string;
}

export async function updateFile(
  options: UpdateFileOptions
): Promise<drive_v3.Schema$File> {
  const response = await options.drive.files.update({
    fileId: options.fileId,
    media: {
      mimeType: CSV_MIME_TYPE,
      body: Readable.from([options.content]),
    },
    fields: options.fields ?? DEFAULT_FIELDS,
    supportsAllDrives: true,
  });

  return response.data;
}
