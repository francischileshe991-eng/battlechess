import { rm, mkdir, cp, stat, writeFile } from 'node:fs/promises';
await import('./vendor.js');
let engineInstalled = true;
for (const file of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm', 'Copying.txt']) {
  try { await stat(`vendor/stockfish/${file}`); } catch { engineInstalled = false; }
}
if (!engineInstalled) {
  if (process.argv.includes('--require-ai')) throw new Error('Stockfish assets missing. Run npm run setup:ai first.');
  console.warn('Stockfish assets missing: this build supports local play only. Run npm run setup:ai to enable computer mode.');
}
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const path of ['index.html', 'css', 'js', 'vendor']) await cp(path, `dist/${path}`, { recursive: true });
await writeFile('dist/.nojekyll', '');
console.log('Static site built in dist/');
