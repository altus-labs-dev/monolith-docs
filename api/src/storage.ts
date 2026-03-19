import { Storage } from '@google-cloud/storage';
import { config } from './config.js';

const MIME_TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  pdf: 'application/pdf',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  csv: 'text/csv',
  rtf: 'application/rtf',
  txt: 'text/plain',
};

function mimeFromPath(path: string): string {
  const ext = (path.split('.').pop() ?? '').toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

let storage: Storage | undefined;

function getStorage(): Storage {
  if (!storage) {
    storage = new Storage({
      projectId: config.gcsProjectId || undefined,
    });
  }
  return storage;
}

/**
 * Check whether a URL is already a signed/full HTTP URL or a raw GCS path
 * like "gs://bucket/path/to/file.docx" or just "bucket/path/to/file.docx".
 */
function isSignedUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Parse a GCS path into bucket and object name.
 * Accepts "gs://bucket/object" or "bucket/object".
 */
function parseGcsPath(path: string): { bucket: string; object: string } {
  const cleaned = path.replace(/^gs:\/\//, '');
  const slashIndex = cleaned.indexOf('/');
  if (slashIndex === -1) {
    throw new Error(`Invalid GCS path: ${path}`);
  }
  return {
    bucket: cleaned.slice(0, slashIndex),
    object: cleaned.slice(slashIndex + 1),
  };
}

/**
 * If the input is already a signed URL, return it as-is.
 * If it's a GCS path, generate a signed download URL.
 */
export async function resolveDownloadUrl(fileUrl: string): Promise<string> {
  if (isSignedUrl(fileUrl)) {
    return fileUrl;
  }

  const { bucket, object } = parseGcsPath(fileUrl);
  const [url] = await getStorage()
    .bucket(bucket)
    .file(object)
    .getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + config.signedUrlTtlMs,
    });

  return url;
}

/**
 * Generate a signed upload URL for a given GCS destination.
 * Used when saving an edited document back to GCS.
 */
export async function generateUploadUrl(
  bucket: string,
  object: string,
): Promise<string> {
  const [url] = await getStorage()
    .bucket(bucket)
    .file(object)
    .getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + config.signedUrlTtlMs,
      contentType: 'application/octet-stream',
    });

  return url;
}

/**
 * Download a file from a URL and upload it to GCS.
 * Used in the save callback to transfer the edited document from OnlyOffice to GCS.
 */
export async function transferToGcs(
  sourceUrl: string,
  destinationBucket: string,
  destinationObject: string,
): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download from OnlyOffice: ${res.status} ${res.statusText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  const file = getStorage().bucket(destinationBucket).file(destinationObject);
  await file.save(buffer, {
    contentType: mimeFromPath(destinationObject),
    resumable: false,
  });

  // Return a signed download URL for the consumer
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + config.signedUrlTtlMs,
  });

  return url;
}
