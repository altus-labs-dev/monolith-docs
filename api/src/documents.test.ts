import { describe, it, expect } from 'vitest';
import { buildApp } from './app.js';

describe('POST /api/documents/open', () => {
  it('returns editorUrl and key for valid request', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/documents/open',
      payload: {
        fileUrl: 'https://storage.googleapis.com/bucket/test.docx',
        callbackUrl: 'https://api.example.com/callback',
        user: { id: 'user-1', name: 'Test User' },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.editorUrl).toContain('/editor/');
    expect(body.key).toBeDefined();
  });

  it('returns 400 when required fields are missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/documents/open',
      payload: { fileUrl: 'https://example.com/test.docx' },
    });

    expect(res.statusCode).toBe(400);
    // Fastify schema validation returns structured error
    expect(res.json().message).toContain("must have required property 'user'");
  });
});

describe('GET /editor/:key', () => {
  it('returns HTML editor page for valid session', async () => {
    const app = buildApp();

    const openRes = await app.inject({
      method: 'POST',
      url: '/api/documents/open',
      payload: {
        fileUrl: 'https://storage.googleapis.com/bucket/test.docx',
        callbackUrl: 'https://api.example.com/callback',
        fileName: 'my-template.docx',
        user: { id: 'user-1', name: 'Test User' },
      },
    });
    const { key } = openRes.json();

    const editorRes = await app.inject({
      method: 'GET',
      url: `/editor/${key}`,
    });

    expect(editorRes.statusCode).toBe(200);
    expect(editorRes.headers['content-type']).toContain('text/html');
    expect(editorRes.body).toContain('DocsAPI.DocEditor');
    expect(editorRes.body).toContain('my-template.docx');
  });

  it('returns 404 for unknown key', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/editor/nonexistent-key',
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/documents/callback', () => {
  it('acknowledges callback with error 0', async () => {
    const app = buildApp();

    // Create a session first
    const openRes = await app.inject({
      method: 'POST',
      url: '/api/documents/open',
      payload: {
        fileUrl: 'https://storage.googleapis.com/bucket/test.docx',
        callbackUrl: 'https://api.example.com/callback',
        user: { id: 'user-1', name: 'Test User' },
      },
    });
    const { key } = openRes.json();

    // Simulate OnlyOffice callback (status 4 = closed, no changes)
    const callbackRes = await app.inject({
      method: 'POST',
      url: '/api/documents/callback',
      payload: { key, status: 4 },
    });

    expect(callbackRes.statusCode).toBe(200);
    expect(callbackRes.json()).toEqual({ error: 0 });
  });
});

describe('Standalone mode (no callbackUrl)', () => {
  it('opens a document without callbackUrl', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/documents/open',
      payload: {
        fileUrl: 'https://storage.googleapis.com/bucket/test.docx',
        user: { id: 'user-1', name: 'Test User' },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.editorUrl).toContain('/editor/');
    expect(body.key).toBeDefined();
  });

  it('download endpoint returns 404 before save', async () => {
    const app = buildApp();
    const openRes = await app.inject({
      method: 'POST',
      url: '/api/documents/open',
      payload: {
        fileUrl: 'https://storage.googleapis.com/bucket/test.docx',
        user: { id: 'user-1', name: 'Test User' },
      },
    });
    const { key } = openRes.json();

    const dlRes = await app.inject({
      method: 'GET',
      url: `/api/documents/${key}/download`,
    });

    expect(dlRes.statusCode).toBe(404);
    expect(dlRes.json().error).toContain('No saved version');
  });
});

describe('GET /api/sessions', () => {
  it('lists active sessions', async () => {
    const app = buildApp();

    await app.inject({
      method: 'POST',
      url: '/api/documents/open',
      payload: {
        fileUrl: 'https://storage.googleapis.com/bucket/test.docx',
        callbackUrl: 'https://api.example.com/callback',
        user: { id: 'user-1', name: 'Test User' },
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sessions.length).toBeGreaterThanOrEqual(1);
    expect(body.sessions[0].user.id).toBe('user-1');
  });
});
