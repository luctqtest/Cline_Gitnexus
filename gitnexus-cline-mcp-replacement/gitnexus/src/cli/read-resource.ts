/**
 * Universal local resource reader.
 *
 * Exposes GitNexus MCP resources through CLI without MCP transport:
 *   gitnexus read gitnexus://repos
 *   gitnexus read gitnexus://repo/my-app/context
 *   gitnexus read gitnexus://repo/my-app/schema
 */

import { writeSync } from 'node:fs';
import { LocalBackend } from '../mcp/local/local-backend.js';
import { readResource } from '../mcp/resources.js';

function output(text: string): void {
  const finalText = text.endsWith('\n') ? text : text + '\n';
  try {
    writeSync(1, finalText);
  } catch (err: any) {
    if (err?.code === 'EPIPE') process.exit(0);
    process.stderr.write(finalText);
  }
}

export async function readResourceCommand(uri: string): Promise<void> {
  if (!uri?.trim()) {
    console.error('Usage: gitnexus read <gitnexus://... uri>');
    process.exit(1);
  }

  const backend = new LocalBackend();
  try {
    await backend.init();
    const content = await readResource(uri, backend);
    output(content);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await backend.dispose().catch(() => {});
  }
}
