import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, MoveController } from '../js/game.js';
import { attacks, projectileFrames } from '../js/attacks.js';
import { fixture } from './helpers/animation-fixture.js';

function capturePosition(type, color) {
  const white = color === 'w';
  const from = white ? 'd4' : 'd5';
  const to = type === 'n' ? (white ? 'e6' : 'e3')
    : ['b', 'q'].includes(type) ? (white ? 'f6' : 'f3')
    : type === 'r' ? (white ? 'd6' : 'd3') : (white ? 'e5' : 'e4');
  const pieces = new Map([['h1', 'K'], ['h8', 'k'], [from, white ? type.toUpperCase() : type], [to, white ? 'p' : 'P']]);
  if (type === 'k') pieces.delete(white ? 'h1' : 'h8');
  const rows = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '', empty = 0;
    for (const file of 'abcdefgh') {
      const piece = pieces.get(file + rank);
      if (!piece) empty++;
      else { if (empty) row += empty; empty = 0; row += piece; }
    }
    if (empty) row += empty; rows.push(row);
  }
  return { game: new Game(`${rows.join('/')} ${color} - - 0 1`), input: { from, to } };
}

// Exercise actual legal captures through the production controller/adapter for
// every class in both armies. No direct combat invocation or fake engine moves.
test('all six class attacks finish at the legal square for both armies', async () => {
  for (const type of 'pnbrqk') for (const color of ['w', 'b']) {
    const f = fixture(); const { game, input } = capturePosition(type, color);
    let rendered;
    const controller = new MoveController(game, { present: (...args) => f.movement.present(...args), render: state => { rendered = state; } });
    const playing = controller.play(input);
    assert.equal(controller.busy, true, `${color}${type} should capture`);
    const layer = f.frame.children[0];
    assert.equal(layer.getAttribute('data-attack'), attacks[type].name);
    assert.equal(layer.children.filter(n => n.className.includes('combat-projectile')).length, type === 'b' ? 1 : 0);
    assert.ok(f.animations.length >= 6);
    for (const animation of f.animations) {
      assert.equal(animation.options.duration, 1200);
      let previous = -1;
      for (const frame of animation.keyframes) {
        assert.ok(frame.offset >= previous && frame.offset <= 1);
        assert.doesNotMatch(frame.transform || '', /NaN|Infinity/);
        previous = frame.offset;
      }
    }
    assert.equal(await controller.play(input), null);
    f.animations.forEach(animation => animation.finish()); await playing;
    assert.equal(f.frame.children.length, 0); assert.equal(controller.busy, false);
    const victor = rendered.board.find(piece => piece.square === input.to);
    assert.equal(victor.type, type); assert.equal(victor.color, color);
    assert.equal(rendered.history.length, 1);
    assert.equal(rendered.board.filter(piece => piece.type === 'k').length, 2);
    f.movement.destroy();
  }
});
test('every class cleans up on skip and undo, including projectiles and burst effects', async () => {
  for (const type of 'pnbrqk') for (const action of ['skip', 'undo']) {
    const f = fixture(); const { game, input } = capturePosition(type, 'w');
    const initial = game.snapshot().fen; let rendered;
    const controller = new MoveController(game, { present: (...args) => f.movement.present(...args), render: state => { rendered = state; } });
    const playing = controller.play(input);
    if (action === 'skip') f.movement.finish(); else controller.undo();
    await playing;
    assert.equal(f.frame.children.length, 0); assert.equal(controller.busy, false);
    for (const cell of f.board.cells.values()) assert.notEqual(cell.piece.style.visibility, 'hidden');
    if (action === 'undo') assert.equal(rendered.fen, initial);
    else assert.equal(rendered.board.find(piece => piece.square === input.to).type, type);
    f.movement.destroy();
  }
});
test('mage holds position until impact, and its projectile reaches the victim in either orientation', async () => {
  for (const color of ['w', 'b']) {
    const f = fixture(); const { game, input } = capturePosition('b', color);
    const before = game.snapshot(); const move = game.move(input);
    const playing = f.movement.present({ move, before, after: game.snapshot() }, new AbortController().signal);
    const track = f.animations.find(a => a.node.className?.includes('combat-attacker'));
    assert.equal(track.keyframes.find(frame => frame.offset === .8).transform, 'translate(0px, 0px)');
    const start = f.board.cells.get(input.from).getBoundingClientRect();
    const victim = f.board.cells.get(input.to).getBoundingClientRect();
    const frames = projectileFrames(start, victim);
    assert.equal(frames.find(frame => frame.offset === .6).transform, `translate(${victim.left - start.left}px, ${victim.top - start.top}px) scale(1)`);
    f.movement.finish(); await playing; f.movement.destroy();
  }
});
