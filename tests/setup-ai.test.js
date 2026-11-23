import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setupAI } from '../scripts/setup-ai.js';

function response(url) {
  if (url.endsWith('.wasm')) return new Response(Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0]));
  if (url.endsWith('.js')) return new Response('// Stockfish fixture, not an engine');
  return new Response('GNU GENERAL PUBLIC LICENSE fixture');
}
test('setup writes the matching worker, wasm, license and source notice locally', async () => {
  const path = await mkdtemp(join(tmpdir(), 'shadow-chess-ai-'));
  try {
    const urls = [];
    await setupAI({ directory: pathToFileURL(path + '/'), fetcher: async url => { urls.push(url); return response(url); } });
    assert.equal(urls.length, 3); assert.ok(urls.every(url => url.includes('stockfish@19.0.1/')));
    assert.equal((await readFile(join(path, 'stockfish-19-lite-single.wasm')))[0], 0);
    assert.match(await readFile(join(path, 'SOURCE.md'), 'utf8'), /19.0.1/);
    assert.ok((await readdir(path)).includes('Copying.txt'));
  } finally { await rm(path, { recursive: true, force: true }); }
});
test('invalid or unavailable downloads leave no partial engine assets', async () => {
  for (const failure of ['http', 'html']) {
    const path = await mkdtemp(join(tmpdir(), 'shadow-chess-ai-'));
    try {
      await assert.rejects(setupAI({ directory: pathToFileURL(path + '/'), fetcher: async url => {
        if (url.endsWith('.wasm')) return failure === 'http' ? new Response('Not found', { status: 404 }) : new Response('<html>Error</html>');
        return response(url);
      } }));
      assert.deepEqual(await readdir(path), []);
    } finally { await rm(path, { recursive: true, force: true }); }
  }
});
