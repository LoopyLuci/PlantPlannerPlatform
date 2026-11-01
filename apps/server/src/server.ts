import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { CAPABILITIES, type CapabilityDef, toJsonSchema } from '@ppp/registry';
import { type Envelope, type ServiceContext, dispatch, httpStatusFor, REPO_ROOT } from '@ppp/services';

/**
 * HTTP adapter. It translates requests into dispatch() calls and nothing more.
 * Routes: POST /api/v1/capabilities/{id}, GET /api/v1/capabilities,
 * GET /api/v1/openapi.json, GET /api/v1/health, and static files for the web app.
 */

const MAX_BODY_BYTES = 1_000_000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export interface AppOptions {
  ctx: ServiceContext;
  webDir?: string;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(text);
}

function badRequest(res: ServerResponse, message: string): void {
  sendJson(res, 400, {
    ok: false,
    capability: null,
    error: { code: 'validation_error', message },
  });
}

async function readBody(req: IncomingMessage): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return { ok: false, reason: 'request body is larger than 1 MB' };
    chunks.push(chunk as Buffer);
  }
  return { ok: true, text: Buffer.concat(chunks).toString('utf8') };
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function handleCapability(ctx: ServiceContext, req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
  const contentType = headerValue(req, 'content-type') ?? '';
  if (!contentType.startsWith('application/json')) {
    sendJson(res, 415, { ok: false, capability: id, error: { code: 'validation_error', message: 'Content-Type must be application/json' } });
    return;
  }
  const body = await readBody(req);
  if (!body.ok) {
    badRequest(res, body.reason);
    return;
  }
  let input: unknown = {};
  if (body.text.trim() !== '') {
    try {
      input = JSON.parse(body.text);
    } catch {
      badRequest(res, 'request body is not valid JSON');
      return;
    }
  }
  const key = headerValue(req, 'idempotency-key');
  if (key !== undefined && !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    badRequest(res, 'Idempotency-Key must be 1-128 characters: letters, digits, dot, colon, underscore or hyphen');
    return;
  }
  const envelope = await dispatch(ctx, id, input, {
    interface: 'api',
    actorId: headerValue(req, 'x-ppp-actor') ?? 'local-user',
    idempotencyKey: key ?? null,
  });
  sendJson(res, httpStatusFor(envelope), envelope);
}

export function openApiDocument(defs: readonly CapabilityDef[] = CAPABILITIES): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  for (const def of defs) {
    const write = def.sideEffect !== 'read';
    paths[`/api/v1/capabilities/${def.id}`] = {
      post: {
        operationId: def.id,
        summary: def.title,
        description: def.description,
        'x-side-effect': def.sideEffect,
        'x-determinism': def.determinism,
        'x-scopes': def.scopes,
        'x-atomicity': def.atomicity,
        parameters: write
          ? [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', maxLength: 128 } }]
          : [],
        requestBody: {
          required: false,
          content: { 'application/json': { schema: toJsonSchema(def.input) } },
        },
        responses: {
          '200': { description: `Success envelope. data: ${def.output}` },
          '400': { description: 'validation_error, idempotency_key_required or confirmation_required' },
          '404': { description: 'not_found or unknown_capability' },
          '409': { description: 'conflict: stale base_seq or duplicate placement' },
          '500': { description: 'integrity_error or internal_error' },
        },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Plant Planner Platform API',
      version: '0.1.0',
      description: 'Generated from the capability registry. Every response carries the version triple.',
    },
    paths,
  };
}

async function serveStatic(webDir: string, pathname: string, res: ServerResponse): Promise<void> {
  const root = resolve(webDir);
  const requested = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const candidate = resolve(root, requested);
  const inside = candidate === root || candidate.startsWith(root + sep);
  let file = inside ? candidate : join(root, 'index.html');
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = join(file, 'index.html');
  } catch {
    if (extname(requested) !== '') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    file = join(root, 'index.html');
  }
  try {
    const bytes = await readFile(file);
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      'content-length': bytes.length,
      'x-content-type-options': 'nosniff',
    });
    res.end(bytes);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('The web app is not built yet. Run "npm run build" and reload.');
  }
}

export function createAppServer(options: AppOptions): Server {
  const webDir = options.webDir ?? join(REPO_ROOT, 'apps', 'web', 'dist');
  const { ctx } = options;
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const { pathname } = url;
      if (pathname === '/api/v1/capabilities' && req.method === 'GET') {
        sendJson(res, 200, {
          capabilities: CAPABILITIES.map((c) => ({ id: c.id, title: c.title, sideEffect: c.sideEffect, scopes: c.scopes })),
        });
        return;
      }
      if (pathname === '/api/v1/openapi.json' && req.method === 'GET') {
        sendJson(res, 200, openApiDocument());
        return;
      }
      if (pathname === '/api/v1/health' && req.method === 'GET') {
        const envelope: Envelope = await dispatch(ctx, 'platform.get_health', {}, {
          interface: 'api',
          actorId: 'local-user',
          idempotencyKey: null,
        });
        sendJson(res, httpStatusFor(envelope), envelope);
        return;
      }
      const match = /^\/api\/v1\/capabilities\/([a-z_]+\.[a-z_]+)$/.exec(pathname);
      if (match) {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: { code: 'validation_error', message: 'Use POST' } });
          return;
        }
        await handleCapability(ctx, req, res, match[1]);
        return;
      }
      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, { ok: false, error: { code: 'unknown_capability', message: `No route for ${pathname}` } });
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
        return;
      }
      await serveStatic(webDir, pathname, res);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: { code: 'internal_error', message: error instanceof Error ? error.message : String(error) },
      });
    }
  });
}
