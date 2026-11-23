import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, MoveController } from '../js/game.js';
import { COMBAT_DURATION, combatStages, combatGeometry, captureTravelFrames } from '../js/combat.js';
import { fixture } from './helpers/animation-fixture.js';

function captureGame() {
  const game = new Game(); game.move('e4'); game.move('d5'); return game;
}
function eventFor(game, input) {
  const before = game.snapshot(); const move = game.move(input);
  assert.ok(move?.captured); return { move, before, after: game.snapshot() };
}
const settle = f => f.animations.forEach(animation => animation.finish());
const visible = (f, square) => f.board.cells.get(square).piece.style.visibility !== 'hidden';

test('combat timeline holds contact through attack and settles exactly at destination', () => {
  assert.equal(COMBAT_DURATION, 1200);
  assert.equal(combatStages.approach * COMBAT_DURATION, 300);
  assert.equal(combatStages.attack * COMBAT_DURATION, 720);
  assert.equal(combatStages.impact * COMBAT_DURATION, 960);
  for (const sign of [1, -1]) {
    const geometry = combatGeometry({ left: 0, top: 0 }, { left: 80 * sign, top: 80 * sign }, { left: 80 * sign, top: 80 * sign }, 80);
    const frames = captureTravelFrames(geometry, 80);
    assert.ok(Math.hypot(geometry.contact.x, geometry.contact.y) < Math.hypot(80, 80));
    assert.equal(frames.at(-1).transform, `translate(${80 * sign}px, ${80 * sign}px)`);
  }
});
test('capture creates one two-warrior battle; all tracks finish before input unlocks', async () => {
  const f = fixture(); const game = captureGame(); let rendered;
  const controller = new MoveController(game, { present: (...args) => f.movement.present(...args), render: state => { rendered = state; } });
  const playing = controller.play('exd5');
  assert.equal(f.frame.children.length, 1);
  const [layer] = f.frame.children;
  assert.equal(layer.children.filter(n => n.className.includes('combat-attacker')).length, 1);
  assert.equal(layer.children.filter(n => n.className.includes('combat-defender')).length, 1);
  assert.equal(visible(f, 'e4'), false); assert.equal(visible(f, 'd5'), false);
  assert.equal(await controller.play('Qxd5'), null);
  assert.equal(game.snapshot().history.length, 3);
  assert.ok(f.animations.length >= 5);
  for (const animation of f.animations) assert.equal(animation.options.duration, 1200);
  f.animations[0].finish(); await Promise.resolve();
  assert.equal(controller.busy, true);
  settle(f); await playing;
  assert.equal(controller.busy, false); assert.equal(f.frame.children.length, 0);
  assert.equal(rendered.board.length, 31);
  assert.equal(rendered.board.find(p => p.square === 'd5').color, 'w');
  assert.equal(visible(f, 'e4'), true); assert.equal(visible(f, 'd5'), true);
  f.movement.destroy();
});
test('skipping, disabling, hiding, resizing and aborting remove the entire battle immediately', async () => {
  for (const action of ['skip', 'disable', 'hidden', 'resize', 'abort']) {
    const f = fixture(); const game = captureGame(); const signal = new AbortController();
    const playing = f.movement.present(eventFor(game, 'exd5'), signal.signal);
    if (action === 'skip') f.movement.finish();
    if (action === 'disable') f.movement.setCombatEnabled(false);
    if (action === 'hidden') { f.document.hidden = true; f.listeners.get('visibilitychange')(); }
    if (action === 'resize') f.listeners.get('resize')();
    if (action === 'abort') signal.abort();
    assert.equal(f.frame.children.length, 0);
    assert.ok(visible(f, 'e4') && visible(f, 'd5'));
    await playing; assert.equal(game.snapshot().history.length, 3);
    f.movement.destroy();
  }
});
test('undo/restart during combat invalidate stale completion and retain correct state', async () => {
  for (const action of ['undo', 'restart']) {
    const f = fixture(); const game = captureGame(); const before = game.snapshot().fen;
    let rendered; let renderCount = 0;
    const controller = new MoveController(game, { present: (...args) => f.movement.present(...args), render: state => { rendered = state; renderCount++; } });
    const playing = controller.play('exd5'); controller[action]();
    await playing;
    assert.equal(f.frame.children.length, 0); assert.equal(controller.busy, false);
    assert.equal(renderCount, 1); assert.equal(rendered.board.length, 32);
    if (action === 'undo') assert.equal(rendered.fen, before);
    else assert.equal(rendered.history.length, 0);
    f.movement.destroy();
  }
});
test('en passant battles the actual captured pawn and capture-promotion keeps infantry until settlement', async () => {
  for (const special of ['en-passant', 'promotion']) {
    const f = fixture(); let game; let input; let source; let victim; let destination;
    if (special === 'en-passant') {
      game = new Game(); for (const move of ['e4', 'a6', 'e5', 'd5']) game.move(move);
      input = 'exd6'; source = 'e5'; victim = 'd5'; destination = 'd6';
    } else {
      game = new Game('1r5k/P7/8/8/8/8/8/7K w - - 0 1');
      input = { from: 'a7', to: 'b8', promotion: 'n' }; source = 'a7'; victim = destination = 'b8';
    }
    const event = eventFor(game, input);
    const playing = f.movement.present(event, new AbortController().signal);
    assert.equal(visible(f, source), false); assert.equal(visible(f, victim), false);
    const attacker = f.frame.children[0].children.find(n => n.className.includes('combat-attacker'));
    assert.match(attacker.className, /warrior-p/);
    f.movement.finish(); await playing;
    assert.equal(game.snapshot().board.find(p => p.square === destination).type, special === 'promotion' ? 'n' : 'p');
    assert.equal(f.frame.children.length, 0); f.movement.destroy();
  }
});
test('capture settings are independent of movement and reduced motion bypasses combat', async () => {
  for (const setting of ['no-combat', 'no-motion', 'reduced', 'neither']) {
    const f = fixture({ reduced: setting === 'reduced' });
    f.movement.setCombatEnabled(!['no-combat', 'neither'].includes(setting));
    f.movement.setEnabled(!['no-motion', 'neither'].includes(setting));
    const playing = f.movement.present(eventFor(captureGame(), 'exd5'), new AbortController().signal);
    const combat = f.frame.children[0]?.children.some(n => n.className.includes('combat-attacker'));
    if (setting === 'no-motion') assert.equal(combat, true);
    if (setting === 'no-combat') { assert.equal(combat, false); assert.equal(f.animations.length, 1); }
    if (setting === 'reduced' || setting === 'neither') assert.equal(f.animations.length, 0);
    f.movement.finish(); await playing; f.movement.destroy();
  }
});
test('combat setup failure cleans hidden pieces and leaves the committed result playable', async () => {
  const f = fixture(); const originalCreate = f.document.createElement; let created = 0;
  f.document.createElement = () => { if (++created === 4) throw new Error('effect allocation failed'); return originalCreate(); };
  const game = captureGame(); let rendered;
  const controller = new MoveController(game, { present: (...args) => f.movement.present(...args), render: state => { rendered = state; } });
  await assert.rejects(controller.play('exd5'), /effect allocation/);
  assert.equal(controller.busy, false); assert.equal(f.frame.children.length, 0);
  assert.ok(visible(f, 'e4') && visible(f, 'd5'));
  assert.equal(rendered.board.length, 31); assert.equal(rendered.history.length, 3);
  f.movement.destroy();
});
