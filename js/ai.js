export const difficulties = {
  easy: { skill: 0, depth: 4 },
  medium: { skill: 8, depth: 10 },
  hard: { skill: 20, depth: 18 },
};
export const ENGINE_URL = new URL('../vendor/stockfish/stockfish-19-lite-single.js', import.meta.url);
const aborted = () => Object.assign(new Error('Search cancelled'), { name: 'AbortError' });

export function parseBestMove(line) {
  if (!line.startsWith('bestmove ')) return undefined;
  const move = line.split(/\s+/)[1];
  if (move === '(none)' || move === '0000') return null;
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(move);
  if (!match) throw new Error('Invalid engine response');
  return { from: match[1], to: match[2], ...(match[3] ? { promotion: match[3] } : {}) };
}

// Include the complete move sequence so Stockfish sees repetition history, not
// just the final FEN. chess.js remains the authority when a move comes back.
export function positionCommand(state) {
  const moves = state.history.map(move => move.from + move.to + (move.promotion || ''));
  return `position fen ${state.history[0]?.before || state.fen}${moves.length ? ` moves ${moves.join(' ')}` : ''}`;
}

export class Stockfish {
  constructor({ workerFactory = () => new Worker(ENGINE_URL), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.workerFactory = workerFactory;
    // Keep native Window timer receivers intact in Firefox as well as Chromium.
    this.setTimer = (callback, delay) => setTimer.call(globalThis, callback, delay);
    this.clearTimer = id => clearTimer.call(globalThis, id);
    this.worker = null; this.ready = false; this.active = null;
  }
  cancel() {
    const request = this.active;
    this.active = null;
    this.worker?.terminate(); this.worker = null; this.ready = false;
    if (request) { this.clearTimer(request.timer); request.reject(aborted()); }
  }
  bestMove(state, { difficulty = 'medium', thinkingMs = 1000 } = {}) {
    if (this.active) return Promise.reject(new Error('Search already active'));
    const level = difficulties[difficulty];
    if (!level || !Number.isFinite(thinkingMs) || thinkingMs < 250 || thinkingMs > 5000) {
      return Promise.reject(new Error('Invalid computer settings'));
    }
    try { this.worker ||= this.workerFactory(); }
    catch (error) { return Promise.reject(error); }
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      const request = { reject, timer: null };
      this.active = request;
      let stage = this.ready ? 'ready' : 'uci';
      const current = () => this.worker === worker && this.active === request;
      const fail = error => {
        if (!current()) return;
        this.clearTimer(request.timer); this.active = null;
        worker.terminate(); this.worker = null; this.ready = false;
        reject(error);
      };
      const deadline = ms => {
        this.clearTimer(request.timer);
        request.timer = this.setTimer(() => fail(new Error('Computer response timed out')), ms);
      };
      const send = command => worker.postMessage(command);
      const configure = () => {
        send('setoption name Hash value 16');
        send(`setoption name Skill Level value ${level.skill}`);
        send('setoption name UCI_LimitStrength value false');
        stage = 'ready'; send('isready');
      };
      worker.onerror = () => fail(new Error('Computer engine could not load'));
      worker.onmessageerror = () => fail(new Error('Computer engine communication failed'));
      worker.onmessage = event => {
        if (!current() || typeof event.data !== 'string') return;
        try {
          for (const raw of event.data.split('\n')) {
            if (!current()) break;
            const line = raw.trim();
            if (stage === 'uci' && line === 'uciok') configure();
            else if (stage === 'ready' && line === 'readyok') {
              this.ready = true; stage = 'search';
              deadline(thinkingMs + 10000);
              send(positionCommand(state));
              send(`go depth ${level.depth} movetime ${Math.round(thinkingMs)}`);
            } else if (stage === 'search') {
              const move = parseBestMove(line);
              if (move !== undefined) {
                this.clearTimer(request.timer); this.active = null; resolve(move);
              }
            }
          }
        } catch (error) { fail(error); }
      };
      deadline(30000);
      try { if (this.ready) configure(); else send('uci'); }
      catch (error) { fail(error); }
    });
  }
}

// Owns turn scheduling, not chess rules or visuals. Stale worker replies are
// rejected by both request identity and the exact requested engine position.
export class ComputerPlayer {
  constructor(game, controller, engine, onChange = () => {}) {
    this.game = game; this.controller = controller; this.engine = engine;
    this.onChange = onChange;
    this.mode = 'local'; this.humanColor = 'w'; this.difficulty = 'medium'; this.thinkingMs = 1000;
    this.thinking = false; this.error = null; this.request = null; this.revision = 0;
  }
  isComputerTurn(state = this.game.snapshot()) {
    return this.mode === 'computer' && state.turn !== this.humanColor && !state.result;
  }
  cancel() {
    this.revision++; this.request = null; this.thinking = false;
    this.engine.cancel();
  }
  configure({ mode = this.mode, humanColor = this.humanColor, difficulty = this.difficulty, thinkingMs = this.thinkingMs } = {}) {
    if (!['local', 'computer'].includes(mode) || !['w', 'b'].includes(humanColor) || !difficulties[difficulty]
      || !Number.isFinite(thinkingMs) || thinkingMs < 250 || thinkingMs > 5000) throw new Error('Invalid computer settings');
    this.cancel();
    Object.assign(this, { mode, humanColor, difficulty, thinkingMs, error: null });
    this.onChange();
  }
  retry() { this.error = null; this.onChange(); }
  async maybeMove() {
    if (this.mode !== 'computer' || this.request || this.controller.busy || this.error) return;
    const state = this.game.snapshot();
    if (!this.isComputerTurn(state)) return;
    const request = { revision: this.revision, fen: state.fen };
    this.request = request; this.thinking = true; this.onChange();
    try {
      const move = await this.engine.bestMove(state, { difficulty: this.difficulty, thinkingMs: this.thinkingMs });
      if (this.request !== request || request.revision !== this.revision || this.game.snapshot().fen !== request.fen) return;
      this.thinking = false;
      // A bestmove is never trusted directly: controller.play uses chess.js.
      if (!move || !await this.controller.play(move)) throw new Error('Computer returned an illegal move');
    } catch (error) {
      if (this.request === request && error.name !== 'AbortError') this.error = 'Computer unavailable. Try again or choose local two-player.';
    } finally {
      if (this.request === request) {
        this.request = null; this.thinking = false; this.onChange();
      }
    }
  }
  undo() {
    this.cancel(); this.error = null;
    const history = this.game.snapshot().history;
    const last = history.at(-1);
    this.controller.undo();
    // In computer mode, take back the human move plus its reply. While the
    // engine is thinking, there is only a human half-move to take back.
    if (this.mode === 'computer' && last?.color !== this.humanColor && history.length >= 2) this.controller.undo();
    this.onChange();
  }
  restart() { this.cancel(); this.error = null; this.controller.restart(); this.onChange(); }
  destroy() { this.cancel(); }
}
