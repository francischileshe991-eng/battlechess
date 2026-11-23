import test from 'node:test';
import assert from 'node:assert/strict';
import { Stockfish, ComputerPlayer, difficulties, parseBestMove, positionCommand } from '../js/ai.js';
import { Game, MoveController } from '../js/game.js';

class WorkerFake {
  constructor() { this.messages = []; this.terminated = false; }
  postMessage(message) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  emit(data) { this.onmessage?.({ data }); }
}
function transport() {
  const workers = []; const timers = new Map(); let nextTimer = 0;
  const engine = new Stockfish({
    workerFactory: () => { const worker = new WorkerFake(); workers.push(worker); return worker; },
    setTimer: fn => { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimer: id => timers.delete(id),
  });
  return { engine, workers, timers };
}
function ready(worker) { worker.emit('uciok'); worker.emit('readyok'); }
function deferredEngine() {
  const requests = [];
  return {
    requests, cancelled: 0,
    bestMove(state, settings) { return new Promise((resolve, reject) => requests.push({ state, settings, resolve, reject })); },
    cancel() { this.cancelled++; },
  };
}
function session({ game = new Game(), present } = {}) {
  const engine = deferredEngine(); let lastRender;
  const controller = new MoveController(game, { render: state => { lastRender = state; }, ...(present ? { present } : {}) });
  const computer = new ComputerPlayer(game, controller, engine);
  return { game, engine, controller, computer, get rendered() { return lastRender; } };
}

test('UCI parsing handles promotions, no-move responses, and rejects malformed moves', () => {
  assert.deepEqual(parseBestMove('bestmove a7a8n ponder h8g7'), { from: 'a7', to: 'a8', promotion: 'n' });
  assert.equal(parseBestMove('bestmove (none)'), null); assert.equal(parseBestMove('bestmove 0000'), null);
  assert.equal(parseBestMove('info depth 8'), undefined);
  assert.throws(() => parseBestMove('bestmove e2e9'), /Invalid/);
});
test('engine position includes full history and selected underpromotion', () => {
  const game = new Game(); const initial = game.snapshot().fen;
  for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) game.move(move);
  assert.equal(positionCommand(game.snapshot()), `position fen ${initial} moves g1f3 g8f6 f3g1 f6g8`);
  const promotion = new Game('7k/P7/8/8/8/8/8/7K w - - 0 1'); promotion.move('a8=N');
  assert.match(positionCommand(promotion.snapshot()), /moves a7a8n$/);
});
test('UCI handshake configures difficulty before searching and reuses the ready worker', async () => {
  const { engine, workers, timers } = transport(); const game = new Game();
  const first = engine.bestMove(game.snapshot(), { difficulty: 'easy', thinkingMs: 500 });
  const worker = workers[0]; assert.deepEqual(worker.messages, ['uci']);
  worker.emit('bestmove e2e4'); assert.equal(engine.active !== null, true);
  ready(worker);
  assert.ok(worker.messages.includes('setoption name Skill Level value 0'));
  assert.ok(worker.messages.includes('go depth 4 movetime 500'));
  worker.emit('info depth 3\nbestmove e2e4 ponder e7e5');
  assert.deepEqual(await first, { from: 'e2', to: 'e4' });
  assert.equal(timers.size, 0);
  game.move('e4');
  const second = engine.bestMove(game.snapshot(), { difficulty: 'hard', thinkingMs: 2500 });
  assert.equal(workers.length, 1);
  assert.equal(worker.messages.filter(message => message === 'uci').length, 1);
  worker.emit('readyok');
  assert.ok(worker.messages.includes('setoption name Skill Level value 20'));
  assert.ok(worker.messages.includes('go depth 18 movetime 2500'));
  worker.emit('bestmove e7e5'); assert.deepEqual(await second, { from: 'e7', to: 'e5' });
  engine.cancel(); assert.equal(worker.terminated, true);
});
test('cancelling a search terminates its worker and rejects late replies', async () => {
  const { engine, workers } = transport(); const game = new Game();
  const old = engine.bestMove(game.snapshot()); const oldResult = assert.rejects(old, { name: 'AbortError' });
  const staleHandler = workers[0].onmessage;
  engine.cancel(); await oldResult; assert.equal(workers[0].terminated, true);
  const current = engine.bestMove(game.snapshot()); ready(workers[1]);
  staleHandler({ data: 'bestmove d2d4' }); assert.notEqual(engine.active, null);
  workers[1].emit('bestmove e2e4'); assert.deepEqual(await current, { from: 'e2', to: 'e4' });
  engine.cancel();
});
test('engine failure, malformed reply and timeout all release the worker', async () => {
  for (const failure of ['error', 'malformed', 'timeout']) {
    const { engine, workers, timers } = transport();
    const search = engine.bestMove(new Game().snapshot());
    const rejected = assert.rejects(search);
    if (failure === 'error') workers[0].onerror();
    if (failure === 'timeout') [...timers.values()][0]();
    if (failure === 'malformed') { ready(workers[0]); workers[0].emit('bestmove x2x4'); }
    await rejected;
    assert.equal(workers[0].terminated, true); assert.equal(engine.active, null); assert.equal(timers.size, 0);
  }
});
test('invalid settings are rejected without spawning a worker', async () => {
  const { engine, workers } = transport();
  for (const options of [{ difficulty: 'unknown' }, { thinkingMs: NaN }, { thinkingMs: 10000 }]) {
    await assert.rejects(engine.bestMove(new Game().snapshot(), options), /Invalid/);
  }
  assert.equal(workers.length, 0);
  assert.deepEqual(Object.keys(difficulties), ['easy', 'medium', 'hard']);
});
test('computer does not run in local mode, on the human turn, or after checkmate', async () => {
  const s = session(); await s.computer.maybeMove(); assert.equal(s.engine.requests.length, 0);
  s.computer.configure({ mode: 'computer' }); await s.computer.maybeMove(); assert.equal(s.engine.requests.length, 0);
  for (const move of ['f3', 'e5', 'g4', 'Qh4#']) s.game.move(move);
  s.computer.configure({ humanColor: 'b' }); await s.computer.maybeMove(); assert.equal(s.engine.requests.length, 0);
});
test('human move is followed by exactly one legal animated computer reply', async () => {
  let presentations = 0;
  const s = session({ present: async () => { presentations++; } });
  s.computer.configure({ mode: 'computer', difficulty: 'hard', thinkingMs: 2500 }); s.game.move('e4');
  const thinking = s.computer.maybeMove(); await s.computer.maybeMove();
  assert.equal(s.engine.requests.length, 1); assert.equal(s.computer.thinking, true);
  assert.deepEqual(s.engine.requests[0].settings, { difficulty: 'hard', thinkingMs: 2500 });
  s.engine.requests[0].resolve({ from: 'e7', to: 'e5' }); await thinking;
  assert.equal(s.game.snapshot().history.length, 2); assert.equal(s.game.snapshot().turn, 'w');
  assert.equal(presentations, 1); assert.equal(s.computer.thinking, false);
});
test('playing dark lets the computer make the first move', async () => {
  const s = session(); s.computer.configure({ mode: 'computer', humanColor: 'b' });
  const thinking = s.computer.maybeMove(); s.engine.requests[0].resolve({ from: 'd2', to: 'd4' }); await thinking;
  assert.equal(s.game.snapshot().turn, 'b'); assert.equal(s.game.snapshot().history.length, 1);
});
test('undo or restart during thinking discards late engine replies', async () => {
  for (const action of ['undo', 'restart']) {
    const s = session(); s.computer.configure({ mode: 'computer' }); s.game.move('e4');
    const thinking = s.computer.maybeMove(); s.computer[action](); const restored = s.game.snapshot().fen;
    s.engine.requests[0].resolve({ from: 'e7', to: 'e5' }); await thinking;
    assert.equal(s.game.snapshot().fen, restored); assert.equal(s.game.snapshot().history.length, 0);
    assert.equal(s.computer.thinking, false);
  }
});
test('changing mode or settings invalidates the pending search', async () => {
  const s = session(); s.computer.configure({ mode: 'computer' }); s.game.move('e4');
  const old = s.computer.maybeMove();
  s.computer.configure({ difficulty: 'easy', thinkingMs: 250 });
  const current = s.computer.maybeMove(); assert.equal(s.engine.requests.length, 2);
  s.engine.requests[0].resolve({ from: 'd7', to: 'd5' }); await old;
  assert.equal(s.game.snapshot().history.length, 1);
  s.engine.requests[1].resolve({ from: 'e7', to: 'e5' }); await current;
  assert.equal(s.game.snapshot().history.at(-1).san, 'e5');
  s.game.move('Nf3'); const pending = s.computer.maybeMove();
  s.computer.configure({ mode: 'local' }); s.engine.requests[2].resolve({ from: 'b8', to: 'c6' }); await pending;
  assert.equal(s.game.snapshot().history.length, 3);
});
test('illegal and stale computer moves never mutate the board', async () => {
  const s = session(); s.computer.configure({ mode: 'computer' }); s.game.move('e4');
  const before = s.game.snapshot().fen; const thinking = s.computer.maybeMove();
  s.engine.requests[0].resolve({ from: 'e7', to: 'e4' }); await thinking;
  assert.equal(s.game.snapshot().fen, before); assert.match(s.computer.error, /unavailable/);
  await s.computer.maybeMove(); assert.equal(s.engine.requests.length, 1);
  s.computer.retry(); const retry = s.computer.maybeMove();
  s.game.undo(); s.engine.requests[1].resolve({ from: 'e7', to: 'e5' }); await retry;
  assert.equal(s.game.snapshot().history.length, 0);
});
test('undo after a reply takes back the complete human/computer turn', () => {
  const s = session(); s.computer.configure({ mode: 'computer' });
  s.game.move('e4'); s.game.move('e5'); s.computer.undo();
  assert.equal(s.game.snapshot().history.length, 0); assert.equal(s.game.snapshot().turn, 'w');
  s.computer.configure({ mode: 'local' }); s.game.move('e4'); s.game.move('e5'); s.computer.undo();
  assert.equal(s.game.snapshot().history.length, 1);
});
test('no new search starts until a combat presentation has settled', async () => {
  let finish;
  const s = session({ present: () => new Promise(resolve => { finish = resolve; }) });
  s.computer.configure({ mode: 'computer' });
  const humanMove = s.controller.play('e4'); await s.computer.maybeMove();
  assert.equal(s.engine.requests.length, 0);
  finish(); await humanMove;
  const thinking = s.computer.maybeMove(); s.engine.requests[0].resolve({ from: 'e7', to: 'e5' });
  // Let controller.play enter its presentation before taking it back.
  await Promise.resolve(); s.computer.undo(); finish(); await thinking;
  assert.equal(s.game.snapshot().history.length, 0); assert.equal(s.controller.busy, false);
});
test('computer underpromotion goes through the same chess and presentation pipeline', async () => {
  const game = new Game('7k/P7/8/8/8/8/8/7K w - - 0 1');
  const s = session({ game }); s.computer.configure({ mode: 'computer', humanColor: 'b' });
  const thinking = s.computer.maybeMove();
  s.engine.requests[0].resolve({ from: 'a7', to: 'a8', promotion: 'n' }); await thinking;
  assert.equal(s.game.snapshot().board.find(piece => piece.square === 'a8').type, 'n');
  assert.equal(s.game.snapshot().history.length, 1); assert.equal(s.computer.error, null);
});
test('Firefox-style timeout functions receive Window during engine search and cleanup', async () => {
  const worker = new WorkerFake(); const timers = new Map(); let next = 0;
  const engine = new Stockfish({
    workerFactory: () => worker,
    setTimer: function (callback) {
      if (this !== globalThis) throw new TypeError('setTimeout called on an object that does not implement interface Window');
      const id = ++next; timers.set(id, callback); return id;
    },
    clearTimer: function (id) {
      assert.equal(this, globalThis); timers.delete(id);
    },
  });
  const thinking = engine.bestMove(new Game().snapshot());
  ready(worker); worker.emit('bestmove e2e4');
  assert.deepEqual(await thinking, { from: 'e2', to: 'e4' });
  assert.equal(timers.size, 0); engine.cancel();
});
