import { createInterface } from 'node:readline';
import { createContext } from '@ppp/services';
import { createMcpHandler } from './protocol';

/**
 * stdio transport: one JSON-RPC message per line on stdin, one response per line
 * on stdout. Logs go to stderr so they never corrupt the protocol stream.
 */
const ctx = await createContext();
const handler = createMcpHandler(ctx);
const lines = createInterface({ input: process.stdin });

lines.on('line', (line) => {
  if (line.trim() === '') return;
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
    return;
  }
  handler
    .handle(message as Parameters<typeof handler.handle>[0])
    .then((response) => {
      if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(`mcp: ${error instanceof Error ? error.message : String(error)}\n`);
    });
});
