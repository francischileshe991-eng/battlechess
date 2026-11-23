import { Chess } from '../vendor/chess.js';

// Sole owner of chess state. Visual code never edits the engine or its history.
export class Game {
  #chess;
  constructor(fen) { this.#chess = new Chess(fen); }
  legalMoves(square) {
    return this.#chess.isGameOver() ? [] : this.#chess.moves({ square, verbose: true });
  }
  move(input) {
    if (this.#chess.isGameOver()) return null;
    try { return this.#chess.move(input); } catch { return null; }
  }
  undo() { return this.#chess.undo(); }
  reset() { this.#chess.reset(); }
  snapshot() {
    const chess = this.#chess;
    let result = null;
    if (chess.isCheckmate()) result = `${chess.turn() === 'w' ? 'Dark' : 'Light'} army wins by checkmate`;
    else if (chess.isStalemate()) result = 'Draw by stalemate';
    else if (chess.isThreefoldRepetition()) result = 'Draw by threefold repetition';
    else if (chess.isInsufficientMaterial()) result = 'Draw by insufficient material';
    else if (chess.isDrawByFiftyMoves()) result = 'Draw by the fifty-move rule';
    return {
      fen: chess.fen(), board: chess.board().flat().filter(Boolean).map(p => ({ ...p })),
      turn: chess.turn(), check: chess.isCheck(), result,
      history: chess.history({ verbose: true }),
    };
  }
}

// Phase 3 adapter: present({ move, before, after }, signal) may animate a committed
// move. Input stays locked; undo/restart abort it. Rendering always reconciles
// with an engine snapshot, even if presentation fails or is interrupted.
export class MoveController {
  #revision = 0;
  #abort;
  constructor(game, { render = () => {}, present = async () => {} } = {}) {
    this.game = game; this.render = render; this.present = present; this.busy = false;
  }
  async play(input) {
    if (this.busy) return null;
    const before = this.game.snapshot();
    const move = this.game.move(input);
    if (!move) return null;
    this.busy = true;
    const revision = ++this.#revision;
    this.#abort = new AbortController();
    const after = this.game.snapshot();
    try { await this.present({ move, before, after }, this.#abort.signal); }
    finally {
      if (revision === this.#revision) {
        this.busy = false;
        this.render(this.game.snapshot());
      }
    }
    return move;
  }
  #cancel() { this.#revision++; this.#abort?.abort(); this.busy = false; }
  undo() { this.#cancel(); this.game.undo(); this.render(this.game.snapshot()); }
  restart() { this.#cancel(); this.game.reset(); this.render(this.game.snapshot()); }
}
