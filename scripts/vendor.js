import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('vendor', { recursive: true });
await copyFile('node_modules/chess.js/dist/esm/chess.js', 'vendor/chess.js');
await copyFile('node_modules/chess.js/LICENSE', 'vendor/chess.LICENSE');
