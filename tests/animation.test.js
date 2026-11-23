import test from 'node:test';
import assert from 'node:assert/strict';
import { Movement, movementPlan, travelFrames } from '../js/animation.js';
import { Game, MoveController } from '../js/game.js';
import { fixture } from './helpers/animation-fixture.js';

function eventFor(game, input) {
  const before = game.snapshot();
  const move = game.move(input);
  assert.ok(move);
  return { move, before, after: game.snapshot() };
}

test('castling plans move both warriors for either army and direction', () => {
  for (const turn of ['w', 'b']) for (const castle of ['O-O', 'O-O-O']) {
    const game = new Game(`r3k2r/8/8/8/8/8/8/R3K2R ${turn} KQkq - 0 1`);
    const event = eventFor(game, castle);
    const { pieces, capturedSquare } = movementPlan(event);
    assert.equal(pieces.length, 2);
    assert.equal(capturedSquare, null);
    for (const { to, piece } of pieces) {
      assert.equal(event.after.board.find(p => p.square === to).type, piece.type);
      assert.equal(piece.color, turn);
    }
  }
});
test('en passant hides the actual victim and promotion travels as infantry', () => {
  const game = new Game();
  for (const move of ['e4', 'a6', 'e5', 'd5']) game.move(move);
  const enPassant = movementPlan(eventFor(game, 'exd6'));
  assert.equal(enPassant.capturedSquare, 'd5');
  assert.equal(enPassant.pieces[0].to, 'd6');
  const promotion = eventFor(new Game('7k/P7/8/8/8/8/8/7K w - - 0 1'), { from: 'a7', to: 'a8', promotion: 'n' });
  assert.equal(movementPlan(promotion).pieces[0].piece.type, 'p');
  assert.equal(promotion.after.board.find(p => p.square === 'a8').type, 'n');
});
test('knight arc reaches the exact destination in either board orientation', () => {
  for (const [dx, dy] of [[80, -160], [-80, 160]]) {
    const frames = travelFrames(dx, dy, 80, 'n');
    assert.equal(frames.at(-1).transform, `translate(${dx}px, ${dy}px)`);
    assert.notEqual(frames[1].transform, `translate(${dx / 2}px, ${dy / 2}px)`);
  }
});

// Small browser-boundary fake exercises the actual adapter's resource lifecycle,
// including cancelled WAAPI promises, rather than a second animation algorithm.

test('movement releases clones and hidden pieces on completion and capture', async () => {
  const f = fixture(); const game = new Game(); game.move('e4'); game.move('d5');
  const event = eventFor(game, 'exd5');
  const playing = f.movement.present(event, new AbortController().signal);
  assert.equal(f.board.cells.get('e4').piece.style.visibility, 'hidden');
  assert.equal(f.board.cells.get('d5').piece.style.visibility, 'hidden');
  assert.equal(f.frame.children.length, 1);
  f.animations.forEach(a => a.finish()); await playing;
  assert.equal(f.frame.children.length, 0);
  assert.equal(f.board.cells.get('e4').piece.style.visibility, '');
  assert.equal(f.board.cells.get('d5').piece.style.visibility, '');
  f.movement.destroy(); assert.equal(f.listeners.size, 0);
});
test('skip, abort, resize, disabled motion and hidden page all settle promptly', async () => {
  for (const reason of ['skip', 'abort', 'resize', 'disable', 'hidden']) {
    const f = fixture(); const signal = new AbortController();
    const playing = f.movement.present(eventFor(new Game(), 'e4'), signal.signal);
    if (reason === 'skip') f.movement.finish();
    if (reason === 'abort') signal.abort();
    if (reason === 'resize') f.listeners.get('resize')();
    if (reason === 'disable') f.movement.setEnabled(false);
    if (reason === 'hidden') { f.document.hidden = true; f.listeners.get('visibilitychange')(); }
    assert.equal(f.frame.children.length, 0);
    await playing; assert.equal(f.movement.active, null); f.movement.destroy();
  }
});
test('reduced motion, unsupported browser and hidden page require no animation', async () => {
  for (const options of [{ reduced: true }, { hidden: true }, { animate: false }]) {
    const f = fixture(options);
    await f.movement.present(eventFor(new Game(), 'e4'), new AbortController().signal);
    assert.equal(f.animations.length, 0); assert.equal(f.frame.children.length, 0);
    f.movement.destroy();
  }
});
test('undo during real adapter playback restores engine and presentation together', async () => {
  const f = fixture(); const game = new Game(); const initial = game.snapshot().fen;
  let rendered;
  const controller = new MoveController(game, { present: (...args) => f.movement.present(...args), render: state => { rendered = state; } });
  const playing = controller.play('e4');
  assert.equal(await controller.play('e5'), null);
  controller.undo(); await playing;
  assert.equal(rendered.fen, initial); assert.equal(controller.busy, false);
  assert.equal(f.frame.children.length, 0); f.movement.destroy();
});
test('a failure while creating the second castling warrior leaves nothing stuck', async () => {
  const f = fixture(); const create = f.document.createElement;
  let created = 0;
  f.document.createElement = () => {
    if (++created === 3) throw new Error('visual allocation failed');
    return create();
  };
  const game = new Game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  let rendered;
  const controller = new MoveController(game, { present: (...args) => f.movement.present(...args), render: state => { rendered = state; } });
  await assert.rejects(controller.play('O-O'), /visual allocation failed/);
  assert.equal(f.frame.children.length, 0);
  assert.equal(f.board.cells.get('e1').piece.style.visibility, '');
  assert.equal(controller.busy, false);
  assert.equal(rendered.board.find(p => p.square === 'g1').type, 'k');
  assert.equal(rendered.board.find(p => p.square === 'f1').type, 'r');
  f.movement.destroy();
});
