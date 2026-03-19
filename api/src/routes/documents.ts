import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { resolveDownloadUrl, transferToGcs } from '../storage.js';

interface OpenRequestBody {
  fileUrl: string;
  /** Optional — if omitted, standalone mode: user downloads the edited file directly */
  callbackUrl?: string;
  fileName?: string;
  user: {
    id: string;
    name: string;
  };
  permissions?: {
    edit?: boolean;
    download?: boolean;
    print?: boolean;
  };
  /** Optional: GCS bucket + path where the saved document should be written back */
  saveTo?: {
    bucket: string;
    object: string;
  };
}

// In-memory session store — replaced with a proper store in production
const sessions = new Map<string, {
  key: string;
  fileUrl: string;
  resolvedFileUrl: string;
  callbackUrl?: string;
  fileName: string;
  user: { id: string; name: string };
  permissions: { edit: boolean; download: boolean; print: boolean };
  saveTo?: { bucket: string; object: string };
  /** Populated by OnlyOffice callback — the URL to download the edited document */
  lastSavedUrl?: string;
  createdAt: number;
}>();

export async function documentRoutes(app: FastifyInstance): Promise<void> {

  // --- Document Open ---
  app.post<{ Body: OpenRequestBody }>('/api/documents/open', async (req, reply) => {
    const { fileUrl, callbackUrl, fileName, user, permissions, saveTo } = req.body;

    if (!fileUrl || !user?.id || !user?.name) {
      return reply.status(400).send({ error: 'Missing required fields: fileUrl, user.id, user.name' });
    }

    const key = crypto.randomUUID();
    const resolvedFileName = fileName ?? inferFileName(fileUrl);
    const resolvedPermissions = {
      edit: permissions?.edit ?? true,
      download: permissions?.download ?? true,
      print: permissions?.print ?? true,
    };

    // Resolve GCS paths to signed URLs if needed
    let resolvedFileUrl: string;
    try {
      resolvedFileUrl = await resolveDownloadUrl(fileUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      app.log.error({ fileUrl, error: message }, 'Failed to resolve file URL');
      return reply.status(400).send({ error: `Failed to resolve file URL: ${message}` });
    }

    sessions.set(key, {
      key,
      fileUrl,
      resolvedFileUrl,
      callbackUrl,
      fileName: resolvedFileName,
      user,
      permissions: resolvedPermissions,
      saveTo,
      createdAt: Date.now(),
    });

    const editorUrl = `${config.apiPublicUrl}/editor/${key}`;

    return reply.send({ editorUrl, key });
  });

  // --- Editor Page ---
  app.get<{ Params: { key: string } }>('/editor/:key', async (req, reply) => {
    const session = sessions.get(req.params.key);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found or expired' });
    }

    const editorConfig = buildEditorConfig(session);
    const signedToken = jwt.sign(editorConfig, config.onlyofficeJwtSecret);

    const html = renderEditorPage({
      apiUrl: config.onlyofficePublicUrl,
      config: editorConfig,
      token: signedToken,
    });

    return reply.type('text/html').send(html);
  });

  // --- OnlyOffice Callback ---
  app.post<{ Body: OnlyOfficeCallback }>('/api/documents/callback', async (req, reply) => {
    const { key, status, url, users } = req.body;
    app.log.info({ key, status, url, users }, 'OnlyOffice callback received');

    // Status codes: https://api.onlyoffice.com/editors/callback
    // 1 = editing, 2 = ready to save, 4 = closed no changes, 6 = force save
    if ((status === 2 || status === 6) && url) {
      const session = sessions.get(key);
      if (!session) {
        app.log.warn({ key }, 'Callback for unknown session');
        return reply.send({ error: 0 });
      }

      let downloadUrl = url;

      // If saveTo was specified, transfer the file from OnlyOffice to GCS
      if (session.saveTo) {
        try {
          downloadUrl = await transferToGcs(
            url,
            session.saveTo.bucket,
            session.saveTo.object,
          );
          app.log.info({ bucket: session.saveTo.bucket, object: session.saveTo.object }, 'Document saved to GCS');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'unknown error';
          app.log.error({ error: message }, 'Failed to transfer document to GCS');
          // Fall through — still notify consumer with the OnlyOffice download URL
        }
      }

      // Store the latest download URL for standalone mode
      session.lastSavedUrl = downloadUrl;

      // Notify consumer if callbackUrl was provided
      if (session.callbackUrl) {
        try {
          const callbackRes = await fetch(session.callbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: status === 2 ? 'saved' : 'force-saved',
              downloadUrl,
              key,
              users,
            }),
          });

          if (!callbackRes.ok) {
            app.log.error({ callbackUrl: session.callbackUrl, status: callbackRes.status }, 'Consumer callback failed');
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'unknown error';
          app.log.error({ callbackUrl: session.callbackUrl, error: message }, 'Consumer callback error');
        }
      }

      // Clean up closed sessions (but not standalone — user may still need to download)
      if (status === 2 && session.callbackUrl) {
        sessions.delete(key);
      }
    }

    if (status === 4) {
      sessions.delete(key);
    }

    // OnlyOffice expects { "error": 0 } to acknowledge
    return reply.send({ error: 0 });
  });

  // --- Download endpoint for standalone mode ---
  app.get<{ Params: { key: string } }>('/api/documents/:key/download', async (req, reply) => {
    const session = sessions.get(req.params.key);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found or expired' });
    }
    if (!session.lastSavedUrl) {
      return reply.status(404).send({ error: 'No saved version available yet — save the document first' });
    }
    return reply.send({ downloadUrl: session.lastSavedUrl, fileName: session.fileName });
  });

  // --- Active Sessions (admin) ---
  app.get('/api/sessions', async (_req, reply) => {
    const list = Array.from(sessions.values()).map(s => ({
      key: s.key,
      fileName: s.fileName,
      user: s.user,
      createdAt: new Date(s.createdAt).toISOString(),
    }));
    return reply.send({ sessions: list });
  });
}

// --- Types ---

interface OnlyOfficeCallback {
  key: string;
  status: number;
  url?: string;
  users?: string[];
}

// --- Helpers ---

function buildEditorConfig(session: {
  key: string;
  resolvedFileUrl: string;
  fileName: string;
  user: { id: string; name: string };
  permissions: { edit: boolean; download: boolean; print: boolean };
}) {
  return {
    document: {
      fileType: session.fileName.split('.').pop() ?? 'docx',
      key: session.key,
      title: session.fileName,
      url: session.resolvedFileUrl,
      permissions: {
        edit: session.permissions.edit,
        download: session.permissions.download,
        print: session.permissions.print,
      },
    },
    editorConfig: {
      callbackUrl: `${config.apiInternalUrl}/api/documents/callback`,
      user: {
        id: session.user.id,
        name: session.user.name,
      },
      lang: 'en',
      customization: session.permissions.edit
        ? {
            forcesave: true,
            compactHeader: true,
          }
        : {
            // View-only mode: strip UI to a clean, minimal viewer
            compactHeader: true,
            toolbarHideFileName: true,
            hideRightMenu: true,
            hideLeftMenu: true,
            toolbar: false,
            header: false,
            statusBar: false,
            plugins: false,
          },
    },
    documentType: getDocumentType(session.fileName),
  };
}

/** Extract filename from URL, falling back to document.docx */
function inferFileName(fileUrl: string): string {
  try {
    const pathname = new URL(fileUrl).pathname;
    const basename = pathname.split('/').pop();
    if (basename && basename.includes('.')) return basename;
  } catch { /* not a valid URL */ }
  return 'document.docx';
}

/** Map file extension to OnlyOffice documentType */
function getDocumentType(fileName: string): 'word' | 'cell' | 'slide' | 'pdf' {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();

  const spreadsheetExts = new Set([
    'xls', 'xlsx', 'xlsm', 'xlsb', 'ods', 'fods', 'csv', 'xlst', 'xltx', 'xltm',
  ]);
  const presentationExts = new Set([
    'ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'ppsm', 'odp', 'fodp', 'pot', 'potx', 'potm',
  ]);
  const pdfExts = new Set(['pdf', 'djvu', 'xps']);

  if (spreadsheetExts.has(ext)) return 'cell';
  if (presentationExts.has(ext)) return 'slide';
  if (pdfExts.has(ext)) return 'pdf';
  return 'word';
}

function renderEditorPage(opts: {
  apiUrl: string;
  config: ReturnType<typeof buildEditorConfig>;
  token: string;
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.config.document.title} — Monolith Docs</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #editor { width: 100%; height: 100%; overflow: hidden; }
  </style>
</head>
<body>
  <div id="editor"></div>
  <script src="${opts.apiUrl}/web-apps/apps/api/documents/api.js"></script>
  <script>
    new DocsAPI.DocEditor("editor", {
      ...${JSON.stringify(opts.config)},
      token: "${opts.token}"
    });
  </script>
</body>
</html>`;
}
