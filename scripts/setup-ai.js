import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const STOCKFISH_VERSION = '19.0.1';
const base = `https://cdn.jsdelivr.net/npm/stockfish@${STOCKFISH_VERSION}/`;
const files = [
  ['bin/stockfish-19-lite-single.js', 'stockfish-19-lite-single.js'],
  ['bin/stockfish-19-lite-single.wasm', 'stockfish-19-lite-single.wasm'],
  ['Copying.txt', 'Copying.txt'],
];

// Bounded, atomic-per-file downloads. Runtime never contacts a CDN; the engine
// is lazy-loaded from this project's own static assets only in computer mode.
export async function setupAI({ fetcher = fetch, directory = new URL('../vendor/stockfish/', import.meta.url) } = {}) {
  const assets = await Promise.all(files.map(async ([remote, local]) => {
    const response = await fetcher(base + remote, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Engine download failed (${response.status}): ${local}`);
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8 * 1024 * 1024) throw new Error(`Engine asset too large: ${local}`);
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    const bytes = Buffer.concat(chunks);
    if (local.endsWith('.wasm') && !WebAssembly.validate(bytes)) throw new Error('Invalid Stockfish WebAssembly download');
    if (local.endsWith('.js') && !bytes.toString().toLowerCase().includes('stockfish')) throw new Error('Invalid Stockfish worker download');
    if (local.endsWith('.txt') && !bytes.toString().includes('GNU GENERAL PUBLIC LICENSE')) throw new Error('Invalid Stockfish license download');
    return [local, bytes];
  }));
  await mkdir(directory, { recursive: true });
  for (const [local, bytes] of assets) {
    const target = new URL(local, directory);
    const temporary = new URL(`${local}.tmp`, directory);
    try { await writeFile(temporary, bytes); await rename(temporary, target); }
    finally { await rm(temporary, { force: true }); }
  }
  await writeFile(new URL('package.json', directory), '{"type":"commonjs"}\n');
  await writeFile(new URL('SOURCE.md', directory), `Stockfish.js ${STOCKFISH_VERSION}, unmodified lite single-threaded build.\n\nDistribution: https://www.npmjs.com/package/stockfish/v/${STOCKFISH_VERSION}\nSource and build instructions: https://github.com/nmrugg/stockfish.js/tree/v19.0.1\nSource archive: https://github.com/nmrugg/stockfish.js/archive/refs/tags/v19.0.1.tar.gz\nLicense: GPL-3.0; see Copying.txt.\n`);
  return assets.reduce((sum, [, bytes]) => sum + bytes.length, 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(`Stockfish installed locally (${await setupAI()} bytes).`); }
  catch (error) { console.error(`Stockfish setup failed: ${error.message}. Local two-player remains available. Retry npm run setup:ai when network access is available.`); process.exitCode = 1; }
}
