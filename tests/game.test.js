import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, MoveController } from '../js/game.js';
const at = (game, square) => game.snapshot().board.find(p => p.square === square);
const sequence = (game, moves) => moves.forEach(move => assert.ok(game.move(move), move));

test('starting position, legal moves and rejected moves preserve state', () => {
  const game = new Game(); const initial = game.snapshot().fen;
  assert.equal(game.snapshot().board.length, 32);
  assert.deepEqual(game.legalMoves('e2').map(m => m.to).sort(), ['e3', 'e4']);
  assert.equal(game.move({ from: 'e2', to: 'e5' }), null);
  assert.equal(game.move({ from: 'e7', to: 'e5' }), null);
  assert.equal(game.snapshot().fen, initial);
});
test('captures, history, undo and restart reconcile state', () => {
  const game = new Game(); const initial = game.snapshot().fen;
  sequence(game, ['e4', 'd5', 'exd5']);
  assert.equal(game.snapshot().board.length, 31);
  assert.equal(at(game, 'd5').color, 'w');
  assert.equal(game.snapshot().history.at(-1).captured, 'p');
  game.undo(); assert.equal(at(game, 'd5').color, 'b');
  assert.equal(game.snapshot().board.length, 32);
  game.reset(); assert.equal(game.snapshot().fen, initial);
  assert.equal(game.snapshot().history.length, 0);
});
test('castling moves both warriors and undo restores both', () => {
  for (const [move, king, rook] of [['O-O', 'g1', 'f1'], ['O-O-O', 'c1', 'd1']]) {
    const game = new Game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const initial = game.snapshot().fen;
    assert.ok(game.move(move)); assert.equal(at(game, king).type, 'k'); assert.equal(at(game, rook).type, 'r');
    game.undo(); assert.equal(game.snapshot().fen, initial);
  }
});
test('castling through check is rejected', () => {
  const game = new Game('r3k2r/8/8/8/2b5/8/8/R3K2R w KQkq - 0 1');
  assert.equal(game.move('O-O'), null);
});
test('en passant removes the pawn on a different square and undo restores it', () => {
  const game = new Game(); sequence(game, ['e4', 'a6', 'e5', 'd5']);
  const before = game.snapshot().fen;
  assert.equal(game.move('exd6').flags.includes('e'), true);
  assert.equal(at(game, 'd5'), undefined); assert.equal(at(game, 'd6').color, 'w');
  game.undo(); assert.equal(game.snapshot().fen, before);
});
test('all four promotion choices work and can be undone', () => {
  for (const promotion of ['q', 'r', 'b', 'n']) {
    const game = new Game('7k/P7/8/8/8/8/8/7K w - - 0 1');
    assert.equal(game.legalMoves('a7').length, 4);
    assert.ok(game.move({ from: 'a7', to: 'a8', promotion }));
    assert.equal(at(game, 'a8').type, promotion);
    game.undo(); assert.equal(at(game, 'a7').type, 'p');
  }
});
test('check and checkmate retain kings and stop play; undo resumes', () => {
  const game = new Game(); sequence(game, ['f3', 'e5', 'g4', 'Qh4#']);
  assert.equal(game.snapshot().check, true);
  assert.match(game.snapshot().result, /Dark army wins by checkmate/);
  assert.equal(game.snapshot().board.filter(p => p.type === 'k').length, 2);
  assert.deepEqual(game.legalMoves('e1'), []); assert.equal(game.move('a3'), null);
  game.undo(); assert.equal(game.snapshot().result, null);
});
test('stalemate, insufficient material and fifty-move draws', () => {
  for (const [fen, expected] of [
    ['7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', /stalemate/],
    ['7k/8/6K1/8/8/8/8/8 w - - 0 1', /insufficient/],
    ['7k/8/6K1/8/8/8/R7/8 w - - 100 51', /fifty/],
  ]) assert.match(new Game(fen).snapshot().result, expected);
});
test('threefold repetition tracks history and undo restores play', () => {
  const game = new Game(); sequence(game, ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']);
  assert.match(game.snapshot().result, /repetition/);
  game.undo(); assert.equal(game.snapshot().result, null);
});
test('rapid input cannot duplicate a move or start a second presentation', async () => {
  const game = new Game(); let finish; let presentations = 0; let rendered;
  const controller = new MoveController(game, { present: () => { presentations++; return new Promise(resolve => { finish = resolve; }); }, render: state => { rendered = state; } });
  const playing = controller.play('e4');
  assert.equal(await controller.play('e5'), null); assert.equal(presentations, 1);
  finish(); await playing;
  assert.equal(controller.busy, false); assert.equal(rendered.fen, game.snapshot().fen);
  assert.equal(rendered.history.length, 1);
});
test('presentation errors reconcile committed engine state and release input', async () => {
  const game = new Game(); let rendered;
  const controller = new MoveController(game, { present: async () => { throw new Error('visual failure'); }, render: state => { rendered = state; } });
  await assert.rejects(controller.play('e4'), /visual failure/);
  assert.equal(controller.busy, false); assert.equal(rendered.fen, game.snapshot().fen);
});
test('restart and undo abort in-flight presentation without stale rendering', async () => {
  for (const action of ['restart', 'undo']) {
    const game = new Game(); const initial = game.snapshot().fen;
    let finish; let signal; let renders = 0;
    const controller = new MoveController(game, { present: (_, s) => { signal = s; return new Promise(resolve => { finish = resolve; }); }, render: () => renders++ });
    const playing = controller.play('e4'); controller[action]();
    assert.equal(signal.aborted, true); assert.equal(controller.busy, false);
    finish(); await playing;
    assert.equal(renders, 1); assert.equal(game.snapshot().fen, initial);
  }
});
