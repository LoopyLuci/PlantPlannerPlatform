import { mcpCapabilities, toJsonSchema, toolName } from '@ppp/registry';
import { type ServiceContext, dispatch } from '@ppp/services';

/**
 * MCP adapter (Model Context Protocol, JSON-RPC 2.0). Exposes only the read
 * capabilities marked exposure.mcp in the registry. Agents propose and read;
 * humans write (ADR-0005). The handler is transport-free so tests can drive it.
 */

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const SERVER_VERSION = '0.1.0';

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export function createMcpHandler(ctx: ServiceContext) {
  const defs = mcpCapabilities();
  const byTool = new Map(defs.map((def) => [toolName(def.id), def]));
  const tools = defs.map((def) => ({
    name: toolName(def.id),
    title: def.title,
    description: `${def.description} Scopes: ${def.scopes.join(', ')}.`,
    inputSchema: toJsonSchema(def.input),
    annotations: {
      title: def.title,
      readOnlyHint: def.sideEffect === 'read',
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }));

  function reply(id: JsonRpcRequest['id'], result: unknown): JsonRpcResponse {
    return { jsonrpc: '2.0', id: id ?? null, result };
  }

  function fail(id: JsonRpcRequest['id'], code: number, message: string): JsonRpcResponse {
    return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
  }

  async function handle(message: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const isNotification = message.id === undefined;
    if (message.method === 'notifications/initialized' || (isNotification && message.method?.startsWith('notifications/'))) {
      return null;
    }
    switch (message.method) {
      case 'initialize':
        return reply(message.id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'plant-planner-platform', version: SERVER_VERSION },
          instructions:
            'Read-only access to Plant Planner Platform: plant profiles, designs, rule verdicts and integrity checks. ' +
            'Every result carries the version triple and cites sources with evidence grades. Writes are human-gated and not exposed here.',
        });
      case 'ping':
        return reply(message.id, {});
      case 'tools/list':
        return reply(message.id, { tools });
      case 'tools/call': {
        const name = String(message.params?.name ?? '');
        const def = byTool.get(name);
        if (!def) return fail(message.id, -32602, `Unknown tool ${name}`);
        const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
        const envelope = await dispatch(ctx, def.id, args, {
          interface: 'mcp',
          actorId: 'mcp-agent',
          idempotencyKey: null,
        });
        return reply(message.id, {
          content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }],
          isError: !envelope.ok,
        });
      }
      default:
        return fail(message.id, -32601, `Method not found: ${message.method ?? '(none)'}`);
    }
  }

  return { tools, handle };
}
