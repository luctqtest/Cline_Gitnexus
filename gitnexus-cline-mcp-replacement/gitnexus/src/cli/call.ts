/**
 * Universal local tool command.
 *
 * Exposes every GitNexus LocalBackend tool through CLI without MCP transport:
 *   gitnexus call query --json '{"query":"auth"}'
 *   gitnexus call api_impact --json '{"route":"/api/users"}'
 *   gitnexus call rename --json '{"symbol_name":"old","new_name":"new","dry_run":true}'
 */

import { readFileSync, writeSync } from 'node:fs';
import { LocalBackend } from '../mcp/local/local-backend.js';

function output(data: unknown, pretty = true): void {
  const serialized = typeof data === 'string' ? data : JSON.stringify(data, null, pretty ? 2 : 0);
  const text = serialized ?? String(data);
  try {
    writeSync(1, text + '\n');
  } catch (err: any) {
    if (err?.code === 'EPIPE') process.exit(0);
    process.stderr.write(text + '\n');
  }
}

function readPayload(options?: { json?: string; stdin?: boolean }): Record<string, unknown> {
  const raw = options?.stdin ? readFileSync(0, 'utf8') : (options?.json ?? '{}');
  const trimmed = raw.trim();
  if (!trimmed) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON payload: ${msg}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Payload must be a JSON object. Example: --json \'{"query":"auth"}\'');
  }

  return parsed as Record<string, unknown>;
}

export async function callCommand(
  tool: string,
  options?: {
    json?: string;
    stdin?: boolean;
    repo?: string;
    compact?: boolean;
  },
): Promise<void> {
  if (!tool?.trim()) {
    console.error('Usage: gitnexus call <tool-name> --json \'{...}\'');
    process.exit(1);
  }

  let payload: Record<string, unknown>;
  try {
    payload = readPayload(options);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (options?.repo && payload.repo === undefined) {
    payload.repo = options.repo;
  }

  const backend = new LocalBackend();
  try {
    await backend.init();
    const result = await backend.callTool(tool, payload);
    output(result, !options?.compact);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await backend.dispose().catch(() => {});
  }
}
