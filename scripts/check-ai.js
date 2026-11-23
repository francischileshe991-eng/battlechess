// Optional integration check against the actual downloaded engine (not a fake
// worker). Browser transport is covered separately by the Playwright suite.
import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Game } from '../js/game.js';
import { parseBestMove } from '../js/ai.js';

const workerPath = fileURLToPath(new URL('../vendor/stockfish/stockfish-19-lite-single.js', import.meta.url));
try {
  await stat(workerPath);
  const game = new Game();
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = ''; let done = false; let stage = 'uci'; let diagnostic = '';
    const finish = error => {
      if (done) return;
      done = true; clearTimeout(timer); child.kill();
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => finish(new Error('Stockfish integration check timed out')), 30000);
    const send = command => child.stdin.write(command + '\n');
    child.on('error', finish);
    child.stdin.on('error', finish);
    child.on('exit', code => { if (!done) finish(new Error(`Stockfish exited early (${code}): ${diagnostic.slice(-300)}`)); });
    child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-1000); });
    child.stdout.on('data', chunk => {
      buffer += chunk;
      const lines = buffer.split('\n'); buffer = lines.pop();
      try {
        for (const raw of lines) {
          const line = raw.trim();
          if (line === 'uciok' && stage === 'uci') { stage = 'ready'; send('isready'); }
          else if (line === 'readyok' && stage === 'ready') {
            stage = 'search'; send('position startpos'); send('go depth 4 movetime 500');
          } else if (stage === 'search') {
            const move = parseBestMove(line);
            if (move !== undefined) {
              if (!move || !game.move(move)) throw new Error('Stockfish did not return a legal opening move');
              console.log(`Actual Stockfish engine returned legal move ${game.snapshot().history.at(-1).san}.`);
              finish();
            }
          }
        }
      } catch (error) { finish(error); }
    });
    send('uci');
  });
} catch (error) {
  console.error(`Stockfish integration check unavailable: ${error.message}. Run npm run setup:ai first.`);
  process.exitCode = 1;
}
