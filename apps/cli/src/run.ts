import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { CAPABILITIES, type CapabilityDef, type FieldSpec, getCapability, parseCliValue } from '@ppp/registry';
import { type Envelope, ERROR_EXIT_CODE, type ServiceContext, dispatch } from '@ppp/services';

/**
 * CLI adapter. Flags are generated from the capability's input shape, so the
 * command surface cannot drift from the API. Output is JSON on stdout. Exit
 * codes are stable: 0 ok, 1 general, 2 input, 4 conflict, 5 integrity.
 */

export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const USAGE = `Usage:
  ppp list                         list capabilities
  ppp help <capability>            show a capability's flags
  ppp <capability> [--flag value]  run a capability (JSON output)

Flags: --idempotency-key <key>  --input-json '<json>'  --input-file <path>  --table
Writes generate an Idempotency-Key when you do not pass one; keep it to retry safely.
`;

function flagName(field: string): string {
  return field.replace(/_/g, '-');
}

function fieldSummary(name: string, spec: FieldSpec): string {
  const required = spec.required ? ' (required)' : '';
  const choices = spec.enum ? ` [${spec.enum.join('|')}]` : '';
  return `  --${flagName(name)} <${spec.type}>${choices}${required}  ${spec.description}`;
}

function describe(def: CapabilityDef): string {
  const fields = Object.entries(def.input).map(([name, spec]) => fieldSummary(name, spec));
  return [
    `${def.id}: ${def.title}`,
    def.description,
    `side effect: ${def.sideEffect}   determinism: ${def.determinism}   scopes: ${def.scopes.join(', ')}`,
    `output: ${def.output}`,
    ...(fields.length > 0 ? ['flags:', ...fields] : ['flags: none']),
    '',
  ].join('\n');
}

interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | true>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) {
      flags.set(body.slice(0, eq), body.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags.set(body, true);
    } else {
      flags.set(body, next);
      i += 1;
    }
  }
  return { positional, flags };
}

function renderTable(envelope: Envelope): string {
  if (!envelope.ok) return '';
  const list = Object.values(envelope.data).find((value) => Array.isArray(value)) as Record<string, unknown>[] | undefined;
  if (!list || list.length === 0) return 'no rows\n';
  const columns = Object.keys(list[0]).filter((key) => {
    const value = list[0][key];
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  });
  const cell = (row: Record<string, unknown>, key: string) => String(row[key] ?? '');
  const widths = columns.map((key) => Math.max(key.length, ...list.map((row) => cell(row, key).length)));
  const line = (values: string[]) => values.map((v, i) => v.padEnd(widths[i])).join('  ');
  return [line(columns), ...list.map((row) => line(columns.map((key) => cell(row, key))))].join('\n') + '\n';
}

export async function runCli(argv: string[], ctx: ServiceContext, io: CliIO): Promise<number> {
  const { positional, flags } = parseArgs(argv);
  const [command, ...rest] = positional;

  if (command === undefined || (command === 'help' && rest.length === 0)) {
    io.stdout(USAGE);
    return 0;
  }
  if (command === 'list') {
    if (flags.has('json')) {
      io.stdout(`${JSON.stringify(CAPABILITIES.map((c) => ({ id: c.id, title: c.title, sideEffect: c.sideEffect })), null, 2)}\n`);
    } else {
      io.stdout(CAPABILITIES.map((c) => `${c.id.padEnd(26)} ${c.title}`).join('\n') + '\n');
    }
    return 0;
  }
  if (command === 'help') {
    const def = getCapability(rest[0]);
    if (!def) {
      io.stderr(`Unknown capability ${rest[0]}\n`);
      return 2;
    }
    io.stdout(describe(def));
    return 0;
  }

  const def = getCapability(command);
  if (!def) {
    io.stderr(`Unknown capability ${command}. Run "ppp list".\n`);
    return 2;
  }

  const input: Record<string, unknown> = {};
  try {
    if (flags.has('input-file')) {
      Object.assign(input, JSON.parse(await readFile(String(flags.get('input-file')), 'utf8')) as Record<string, unknown>);
    }
    if (flags.has('input-json')) {
      Object.assign(input, JSON.parse(String(flags.get('input-json'))) as Record<string, unknown>);
    }
  } catch (error) {
    io.stderr(`Could not read JSON input: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  const known = new Map(Object.keys(def.input).map((field) => [flagName(field), field]));
  const reserved = new Set(['json', 'table', 'idempotency-key', 'input-json', 'input-file']);
  for (const [flag, value] of flags) {
    if (reserved.has(flag)) continue;
    const field = known.get(flag);
    if (!field) {
      io.stderr(`Unknown flag --${flag} for ${def.id}. Run "ppp help ${def.id}".\n`);
      return 2;
    }
    const spec = def.input[field];
    if (value === true) {
      if (spec.type !== 'boolean') {
        io.stderr(`--${flag} needs a value.\n`);
        return 2;
      }
      input[field] = true;
      continue;
    }
    try {
      input[field] = parseCliValue(spec, value);
    } catch {
      io.stderr(`--${flag} must be valid JSON for a ${spec.type}.\n`);
      return 2;
    }
  }

  const keyFlag = flags.get('idempotency-key');
  const idempotencyKey = typeof keyFlag === 'string' ? keyFlag : def.sideEffect === 'read' ? null : `cli-${randomUUID()}`;
  const envelope = await dispatch(ctx, def.id, input, {
    interface: 'cli',
    actorId: process.env.PPP_ACTOR ?? 'local-cli',
    idempotencyKey,
  });

  if (flags.has('table') && envelope.ok) {
    io.stdout(renderTable(envelope));
  } else {
    io.stdout(`${JSON.stringify(envelope, null, 2)}\n`);
  }
  if (envelope.ok) return 0;
  io.stderr(`${envelope.error.code}: ${envelope.error.message}\n`);
  return ERROR_EXIT_CODE[envelope.error.code];
}
