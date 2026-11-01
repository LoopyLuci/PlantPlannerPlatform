import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CAPABILITIES } from '@ppp/registry';
import { type ServiceContext, createContext, dispatch } from '@ppp/services';
import { runCli } from '../../cli/src/run';
import { MCP_PROTOCOL_VERSION, createMcpHandler } from '../../mcp/src/protocol';
import { createAppServer } from '../src/server';
import type { Server } from 'node:http';

const KNOWLEDGE_DIR = join(import.meta.dirname, '..', '..', '..', 'data', 'knowledge-graph');

let root: string;
let ctx: ServiceContext;
let server: Server;
let base = '';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'ppp-adapters-'));
  ctx = await createContext({ dataDir: root, knowledgeDir: KNOWLEDGE_DIR });
  server = createAppServer({ ctx, webDir: join(root, 'no-web') });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
});

async function post(id: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${base}/api/v1/capabilities/${id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

function captureCli(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  return runCli(argv, ctx, { stdout: (t) => out.push(t), stderr: (t) => err.push(t) }).then((code) => ({
    code,
    stdout: out.join(''),
    stderr: err.join(''),
  }));
}

describe('three adapters, one contract (parity)', () => {
  it('returns identical data from CLI, HTTP and in-process dispatch for the same request', async () => {
    const created = await captureCli([
      'design.create',
      '--name',
      'Parity',
      '--template',
      'starter_pollinator',
      '--idempotency-key',
      'parity-create-1',
    ]);
    expect(created.code).toBe(0);
    const designId = JSON.parse(created.stdout).data.designId as string;

    const cli = await captureCli(['design.evaluate', '--design-id', designId]);
    const http = await post('design.evaluate', { design_id: designId });
    const direct = await dispatch(ctx, 'design.evaluate', { design_id: designId }, {
      interface: 'test',
      actorId: 'tester',
      idempotencyKey: null,
    });

    expect(cli.code).toBe(0);
    expect(http.status).toBe(200);
    const cliData = JSON.parse(cli.stdout).data;
    expect(cliData).toEqual(http.json.data);
    expect(http.json.data).toEqual(direct.ok ? direct.data : null);
    expect(http.json.version).toEqual(direct.version);
  });

  it('maps errors to the same code on every adapter, with stable HTTP status and exit code', async () => {
    const http = await post('design.get', { design_id: 'd_0000000000000000' });
    expect(http.status).toBe(404);
    expect((http.json.error as { code: string }).code).toBe('not_found');
    const cli = await captureCli(['design.get', '--design-id', 'd_0000000000000000']);
    expect(cli.code).toBe(1);
    expect(JSON.parse(cli.stdout).error.code).toBe('not_found');
  });

  it('exposes every capability in the generated OpenAPI document', async () => {
    const doc = (await (await fetch(`${base}/api/v1/openapi.json`)).json()) as { paths: Record<string, unknown> };
    for (const def of CAPABILITIES) expect(doc.paths[`/api/v1/capabilities/${def.id}`]).toBeDefined();
  });
});

describe('HTTP adapter guards', () => {
  it('requires JSON content type', async () => {
    const response = await fetch(`${base}/api/v1/capabilities/plants.search`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    });
    expect(response.status).toBe(415);
  });

  it('rejects malformed idempotency keys before dispatch', async () => {
    const result = await post('design.create', { name: 'x' }, { 'idempotency-key': 'bad key with spaces' });
    expect(result.status).toBe(400);
  });

  it('refuses a write that arrives without an Idempotency-Key', async () => {
    const result = await post('design.create', { name: 'x' });
    expect(result.status).toBe(400);
    expect((result.json.error as { code: string }).code).toBe('idempotency_key_required');
  });

  it('answers unknown routes with a JSON error', async () => {
    const response = await fetch(`${base}/api/v1/nothing`);
    expect(response.status).toBe(404);
  });

  it('reports health through the same capability', async () => {
    const health = (await (await fetch(`${base}/api/v1/health`)).json()) as { ok: boolean; data: { status: string } };
    expect(health.ok).toBe(true);
    expect(health.data.status).toBe('healthy');
  });
});

describe('CLI adapter', () => {
  it('lists capabilities and documents flags from the registry', async () => {
    const list = await captureCli(['list']);
    expect(list.stdout).toContain('design.evaluate');
    const help = await captureCli(['help', 'design.add_placement']);
    expect(help.stdout).toContain('--species-urn');
  });

  it('rejects unknown flags with exit code 2 and no side effects', async () => {
    const result = await captureCli(['plants.search', '--nonsense', 'x']);
    expect(result.code).toBe(2);
  });

  it('generates and reports an Idempotency-Key for writes when none is given', async () => {
    const result = await captureCli(['design.create', '--name', 'Generated key']);
    expect(result.code).toBe(0);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.idempotency.key).toMatch(/^cli-/);
  });

  it('renders a table for list results', async () => {
    const result = await captureCli(['plants.search', '--query', 'basil', '--table']);
    expect(result.stdout.split('\n')[0]).toContain('urn');
  });
});

describe('MCP adapter', () => {
  it('negotiates, lists only read tools, and returns structured text results', async () => {
    const handler = createMcpHandler(ctx);
    const init = await handler.handle({ id: 1, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL_VERSION } });
    expect((init?.result as { serverInfo: { name: string } }).serverInfo.name).toBe('plant-planner-platform');
    expect(await handler.handle({ method: 'notifications/initialized' })).toBeNull();

    const list = await handler.handle({ id: 2, method: 'tools/list' });
    const names = (list?.result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] }).tools;
    expect(names.length).toBeLessThanOrEqual(15);
    expect(names.every((t) => t.annotations.readOnlyHint)).toBe(true);
    expect(names.map((t) => t.name)).not.toContain('design_create');

    const call = await handler.handle({ id: 3, method: 'tools/call', params: { name: 'plants_search', arguments: { query: 'sage' } } });
    const result = call?.result as { content: { text: string }[]; isError: boolean };
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text).data.count).toBe(1);
  });

  it('refuses write tools and unknown methods with JSON-RPC errors', async () => {
    const handler = createMcpHandler(ctx);
    const write = await handler.handle({ id: 4, method: 'tools/call', params: { name: 'design_create', arguments: {} } });
    expect(write?.error?.code).toBe(-32602);
    const unknown = await handler.handle({ id: 5, method: 'resources/list' });
    expect(unknown?.error?.code).toBe(-32601);
  });
});
