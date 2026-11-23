import { character } from './characters.js';
import { createCombat, COMBAT_DURATION } from './combat.js';

export const movementStyles = {
  p: { duration: 360, easing: 'ease-in-out', lift: 0 },
  n: { duration: 480, easing: 'cubic-bezier(.25,.6,.4,1)', lift: 0.38 },
  b: { duration: 420, easing: 'ease-in-out', lift: 0.06 },
  r: { duration: 520, easing: 'cubic-bezier(.4,0,.6,1)', lift: 0 },
  q: { duration: 320, easing: 'cubic-bezier(.2,.65,.35,1)', lift: 0.03 },
  k: { duration: 480, easing: 'ease-in-out', lift: 0 },
};

// A presentation plan, never a rules implementation. The engine's committed
// move supplies special-move flags; snapshots supply the original warriors.
export function movementPlan({ move, before }) {
  const pieces = [{ from: move.from, to: move.to, piece: before.board.find(p => p.square === move.from) }];
  if (move.flags.includes('k') || move.flags.includes('q')) {
    const rank = move.from[1];
    pieces.push({
      from: `${move.flags.includes('k') ? 'h' : 'a'}${rank}`,
      to: `${move.flags.includes('k') ? 'f' : 'd'}${rank}`,
      piece: before.board.find(p => p.square === `${move.flags.includes('k') ? 'h' : 'a'}${rank}`),
    });
  }
  const capturedSquare = move.captured
    ? move.flags.includes('e') ? move.to[0] + move.from[1] : move.to
    : null;
  return { pieces, capturedSquare };
}

export function travelFrames(dx, dy, squareSize, type) {
  const lift = movementStyles[type].lift * squareSize;
  return [
    { transform: 'translate(0px, 0px)', offset: 0 },
    { transform: `translate(${dx / 2}px, ${dy / 2 - lift}px)`, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px)`, offset: 1 },
  ];
}

// Transient DOM belongs to this adapter. The board remains a snapshot renderer;
// MoveController always renders the final engine state after this promise settles.
export class Movement {
  constructor(board, { audio = null } = {}) {
    this.audio = audio; this.soundStop = null;
    this.board = board;
    this.document = board.element.ownerDocument;
    this.view = this.document.defaultView;
    this.enabled = true;
    this.combatEnabled = true;
    this.active = null;
    this.reducedMotion = this.view.matchMedia('(prefers-reduced-motion: reduce)');
    this.onVisibility = () => { if (this.document.hidden) this.finish(); };
    this.onResize = () => this.finish();
    this.onPreference = () => { if (this.reducedMotion.matches) this.finish(); };
    this.document.addEventListener('visibilitychange', this.onVisibility);
    this.view.addEventListener('resize', this.onResize);
    this.reducedMotion.addEventListener('change', this.onPreference);
  }

  setEnabled(enabled) { this.enabled = enabled; if (!enabled) this.finish(); }
  setCombatEnabled(enabled) { this.combatEnabled = enabled; if (!enabled) this.finish(); }
  finish() { this.active?.(); this.soundStop?.(); this.soundStop = null; }

  async present(event, signal) {
    const combat = Boolean(event.move.captured && this.combatEnabled);
    if (signal.aborted || this.document.hidden) return;
    this.finish();
    const element = this.board.element;
    const animated = (this.enabled || combat) && !this.reducedMotion.matches && typeof element.animate === 'function';
    const { pieces, capturedSquare } = movementPlan(event);
    let stopSound = () => {};
    try {
      if (event.move.captured) stopSound = this.audio?.capture(event.move.piece, animated && combat ? COMBAT_DURATION : 0, signal, event.move.captured) || stopSound;
      else {
        const duration = animated ? Math.max(...pieces.map(({ piece }) => movementStyles[piece.type].duration)) : 0;
        stopSound = this.audio?.move(pieces.map(({ piece }) => piece.type), duration, signal) || stopSound;
      }
    } catch { /* Audio failure must never affect a chess move. */ }
    this.soundStop = stopSound;
    if (!animated) {
      if (event.move.captured) this.soundStop = null; // Audio owns its longer tail.
      return;
    }
    const frame = element.parentElement;
    const bounds = frame.getBoundingClientRect();
    const hidden = [];
    const animations = [];
    const layer = this.document.createElement('div');
    layer.className = 'movement-layer';
    layer.setAttribute('aria-hidden', 'true');
    const hide = square => {
      const piece = this.board.cells.get(square)?.querySelector('.piece');
      if (piece) { hidden.push([piece, piece.style.visibility]); piece.style.visibility = 'hidden'; }
    };
    let complete;
    const finished = new Promise(resolve => { complete = resolve; });
    // Idempotent cleanup also runs synchronously on undo/restart, before a new
    // render or presentation can start. No delayed cleanup can hide new pieces.
    let cleaned = false;
    const cleanup = (reason = 'cancel') => {
      if (cleaned) return;
      cleaned = true;
      // Natural capture completion releases input at 1.2 s; its two-second
      // scream continues. Explicit interruption still cancels every source.
      if (reason !== 'complete' || !event.move.captured) stopSound();
      if (this.soundStop === stopSound) this.soundStop = null;
      for (const animation of animations) animation.cancel();
      for (const [piece, visibility] of hidden) piece.style.visibility = visibility;
      layer.remove();
      element.classList.remove('is-moving');
      element.removeAttribute('aria-busy');
      signal.removeEventListener('abort', cleanup);
      if (this.active === cleanup) this.active = null;
      complete();
    };
    this.active = cleanup;
    signal.addEventListener('abort', cleanup, { once: true });
    try {
      this.board.render(event.before, null);
      element.classList.add('is-moving');
      element.setAttribute('aria-busy', 'true');
      frame.append(layer);
      const play = (node, keyframes, options) => {
        const animation = node.animate(keyframes, options);
        animation.finished.catch(() => {});
        animations.push(animation);
        return animation;
      };
      const place = (square, piece, classes) => {
        const start = this.board.cells.get(square).getBoundingClientRect();
        const warrior = this.document.createElement('div');
        warrior.className = `${classes} warrior-${piece.type}`;
        warrior.style.left = `${start.left - bounds.left - frame.clientLeft}px`;
        warrior.style.top = `${start.top - bounds.top - frame.clientTop}px`;
        warrior.style.width = `${start.width}px`;
        warrior.style.height = `${start.height}px`;
        warrior.innerHTML = `<span class="piece">${character(piece.type, piece.color)}</span>`;
        layer.append(warrior);
        return warrior;
      };
      if (combat) {
        hide(capturedSquare);
        hide(event.move.from);
        createCombat({ event, capturedSquare, board: this.board, layer, place, play });
      } else {
        if (capturedSquare) hide(capturedSquare);
        for (const { from, to, piece } of pieces) {
          const source = this.board.cells.get(from);
          const target = this.board.cells.get(to);
          if (!source || !target || !piece) continue;
          const start = source.getBoundingClientRect();
          const end = target.getBoundingClientRect();
          const warrior = place(from, piece, 'moving-warrior');
          warrior.style.setProperty('--travel-time', `${movementStyles[piece.type].duration}ms`);
          hide(from);
          const { duration, easing } = movementStyles[piece.type];
          play(warrior, travelFrames(end.left - start.left, end.top - start.top, start.width, piece.type),
            { duration, easing, fill: 'forwards' });
        }
      }
      // Catch cancellation rejections, including undo before this await resumes.
      Promise.all(animations.map(animation => animation.finished)).then(() => cleanup('complete'), cleanup);
      await finished;
    } finally { cleanup(); }
  }

  destroy() {
    this.finish();
    this.document.removeEventListener('visibilitychange', this.onVisibility);
    this.view.removeEventListener('resize', this.onResize);
    this.reducedMotion.removeEventListener('change', this.onPreference);
  }
}
