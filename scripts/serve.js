import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.argv.includes('--dist') ? 'dist' : '.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (path !== root && !path.startsWith(root + sep)) throw new Error('Forbidden');
    const target = (await stat(path)).isDirectory() ? resolve(path, 'index.html') : path;
    const mime = types[extname(target)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime + (mime.startsWith('text/') || mime === 'image/svg+xml' ? '; charset=utf-8' : '') });
    res.end(await readFile(target));
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.env.PORT || 5173), '127.0.0.1', () => console.log('Shadow Chess: http://127.0.0.1:5173'));
