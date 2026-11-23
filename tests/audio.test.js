import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleAudio, DEFEAT_CRY_DURATION } from '../js/audio.js';
import { COMBAT_DURATION } from '../js/combat.js';
import { fixture } from './helpers/animation-fixture.js';
import { Game, MoveController } from '../js/game.js';

class Param {
  constructor() { this.value = 0; this.events = []; }
  setValueAtTime(value, time) { this.events.push({ value, time }); }
  linearRampToValueAtTime(value, time) { this.events.push({ value, time }); }
  exponentialRampToValueAtTime(value, time) { this.events.push({ value, time }); }
  cancelScheduledValues() {}
  setTargetAtTime(value) { this.value = value; }
}
class AudioNodeFake {
  constructor() {
    for (const key of ['gain', 'frequency', 'detune', 'Q', 'threshold', 'knee', 'ratio']) this[key] = new Param();
    this.connections = [];
  }
  connect(node) { this.connections.push(node); }
  disconnect() { this.disconnected = true; }
  start(time) { this.startTime = time; }
  stop(time) { if (time === undefined) this.immediateStop = true; else this.stopTime = time; }
  setPeriodicWave(wave) { this.wave = wave; }
}
class ContextFake {
  constructor() { this.currentTime = 10; this.sampleRate = 8000; this.state = 'suspended'; this.destination = new AudioNodeFake(); this.sources = []; }
  createGain() { return new AudioNodeFake(); }
  createDynamicsCompressor() { return new AudioNodeFake(); }
  createConvolver() { return new AudioNodeFake(); }
  createBiquadFilter() { return new AudioNodeFake(); }
  createOscillator() { const node = new AudioNodeFake(); this.sources.push(node); return node; }
  createBufferSource() { return this.createOscillator(); }
  createPeriodicWave(real, imaginary) { return { real, imaginary }; }
  createBuffer(channels, length) { const data = Array.from({ length: channels }, () => new Float32Array(length)); return { getChannelData: i => data[i] }; }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}
function audioFixture() {
  const context = new ContextFake(); const timers = new Set(); let created = 0;
  const audio = new BattleAudio({
    contextFactory: () => { created++; return context; },
    setIntervalFn: fn => { timers.add(fn); return fn; },
    clearIntervalFn: fn => timers.delete(fn),
  });
  return { context, audio, timers, get created() { return created; } };
}

test('sound is silent and does not create a context until explicitly enabled', async () => {
  const f = audioFixture(); f.audio.capture('p', COMBAT_DURATION); f.audio.move(['r'], 520);
  assert.equal(f.created, 0); assert.equal(f.context.sources.length, 0);
  await f.audio.setEnabled(true); assert.equal(f.created, 1); assert.equal(f.context.state, 'running');
  assert.equal(f.timers.size, 1); assert.ok(f.context.sources.length > 0);
  await f.audio.destroy(); assert.equal(f.timers.size, 0);
});
test('all six attacks schedule impact on the 1.2-second visual clock', async () => {
  for (const type of 'pnbrqk') {
    const f = audioFixture(); f.audio.setAmbience(false); await f.audio.setEnabled(true);
    f.audio.setScreams(false);
    const stop = f.audio.capture(type, COMBAT_DURATION);
    const expected = f.context.currentTime + .015 + .72;
    const impact = f.context.sources.find(source => Math.abs(source.startTime - expected) < .0001);
    assert.ok(impact, `${type} needs a synchronized impact`);
    assert.ok(f.context.sources.every(source => source.stopTime < f.context.currentTime + COMBAT_DURATION / 1000));
    stop(); assert.equal(f.audio.effects.size, 0);
    assert.ok(f.context.sources.every(source => source.immediateStop)); await f.audio.destroy();
  }
});
test('skip, abort and mute cancel cries before their scheduled start', async () => {
  for (const action of ['skip', 'abort', 'mute']) {
    const f = audioFixture(); f.audio.setAmbience(false); await f.audio.setEnabled(true);
    const signal = new AbortController(); const stop = f.audio.capture('p', COMBAT_DURATION, signal.signal);
    assert.ok(f.context.sources.some(source => source.startTime > f.context.currentTime + .7));
    if (action === 'skip') stop();
    if (action === 'abort') signal.abort();
    if (action === 'mute') await f.audio.setEnabled(false);
    assert.ok(f.context.sources.every(source => source.immediateStop));
    assert.equal(f.audio.effects.size, 0); await f.audio.destroy();
  }
});
test('ambience and cries can be independently disabled', async () => {
  const f = audioFixture(); f.audio.setAmbience(false); await f.audio.setEnabled(true);
  assert.equal(f.timers.size, 0); assert.equal(f.context.sources.length, 0);
  f.audio.setShouts(false); f.audio.setScreams(false); f.audio.capture('p', COMBAT_DURATION);
  assert.equal(f.context.sources.some(source => source.wave), false);
  f.audio.stopEffects(); f.context.sources = [];
  f.audio.setScreams(true); f.audio.capture('p', COMBAT_DURATION);
  assert.equal(f.context.sources.some(source => source.wave), true);
  f.audio.setScreams(false); assert.equal(f.audio.cries.size, 0);
  assert.ok(f.audio.effects.size > 0, 'Disabling cries must retain weapon sounds');
  f.audio.stopEffects();
  f.audio.setAmbience(true); assert.equal(f.timers.size, 1);
  f.audio.setAmbience(true); assert.equal(f.timers.size, 1);
  await f.audio.destroy();
});
test('hidden pages stop all sound and resume only when enabled', async () => {
  const f = audioFixture(); await f.audio.setEnabled(true); f.audio.capture('r', COMBAT_DURATION);
  await f.audio.setHidden(true);
  assert.equal(f.context.state, 'suspended'); assert.equal(f.timers.size, 0);
  assert.equal(f.audio.effects.size, 0); assert.equal(f.audio.ambient.size, 0);
  await f.audio.setHidden(false); assert.equal(f.context.state, 'running'); assert.equal(f.timers.size, 1);
  await f.audio.setEnabled(false); await f.audio.setHidden(true); await f.audio.setHidden(false);
  assert.equal(f.context.state, 'suspended'); assert.equal(f.timers.size, 0);
  await f.audio.destroy();
});
test('volume is bounded and silence applies without enabling playback', async () => {
  const f = audioFixture(); f.audio.setVolume('volume', -1); assert.equal(f.audio.volume, 0);
  f.audio.setVolume('effectsVolume', 2); assert.equal(f.audio.effectsVolume, 1);
  f.audio.setVolume('ambienceVolume', NaN); assert.equal(f.audio.ambienceVolume, .6);
  assert.equal(f.created, 0);
  f.audio.setAmbience(false); await f.audio.setEnabled(true);
  assert.equal(f.audio.master.gain.value, 0); await f.audio.destroy();
});
test('finished voices release their nodes and background catch-up never bursts old notes', async () => {
  const f = audioFixture(); f.audio.setAmbience(false); await f.audio.setEnabled(true);
  f.audio.capture('b', COMBAT_DURATION);
  for (const source of f.context.sources) source.onended();
  assert.equal(f.audio.effects.size, 0); assert.ok(f.context.sources.every(source => source.disconnected));
  f.audio.setAmbience(true); const previous = f.context.sources.length;
  f.context.currentTime += 300;
  for (const schedule of f.timers) schedule();
  assert.ok(f.context.sources.length - previous <= 5);
  await f.audio.destroy();
});
test('audio initialization failures and late resume cannot leave playback enabled', async () => {
  const unavailable = new BattleAudio({ contextFactory: () => { throw new Error('Unavailable'); } });
  assert.equal(await unavailable.setEnabled(true), false); assert.equal(unavailable.enabled, false);
  const f = audioFixture(); let resume;
  f.context.resume = () => new Promise(resolve => { resume = resolve; });
  const enabling = f.audio.setEnabled(true); await f.audio.setEnabled(false); resume(); await enabling;
  assert.equal(f.audio.enabled, false); assert.equal(f.timers.size, 0); await f.audio.destroy();
});
test('movement cancellation stops its capture audio; audio errors cannot break a move', async () => {
  const f = fixture(); let stopped = 0;
  f.movement.audio = { capture: (_, duration) => { assert.equal(duration, 1200); return () => stopped++; } };
  const game = new Game(); game.move('e4'); game.move('d5');
  const before = game.snapshot(); const move = game.move('exd5');
  const playing = f.movement.present({ move, before, after: game.snapshot() }, new AbortController().signal);
  f.movement.finish(); await playing; assert.equal(stopped, 1);
  f.movement.audio = { capture: () => { throw new Error('Audio failure'); } };
  const again = f.movement.present({ move, before, after: game.snapshot() }, new AbortController().signal);
  f.movement.finish(); await again; assert.equal(f.frame.children.length, 0);
  f.movement.destroy();
});

test('movement sounds distinguish heavy armor, infantry and hooves while mages stay quiet', async () => {
  const peaks = {};
  for (const [type, duration] of [['p', 360], ['n', 480], ['b', 420], ['r', 520], ['q', 320], ['k', 480]]) {
    const f = audioFixture(); f.audio.setAmbience(false); await f.audio.setEnabled(true);
    f.audio.move([type], duration);
    if (type === 'b') assert.equal(f.context.sources.length, 0);
    else {
      assert.ok(f.context.sources.length > 0);
      const strikes = new Set(f.context.sources.map(source => source.startTime));
      assert.ok(strikes.size >= 2, 'Walking needs multiple timed steps');
      assert.ok(f.context.sources.every(source => source.stopTime <= f.context.currentTime + duration / 1000));
      const envelopes = f.context.sources.flatMap(source => source.connections).filter(node => node.gain);
      peaks[type] = Math.max(...envelopes.flatMap(node => node.gain.events.map(event => event.value)));
    }
    await f.audio.destroy();
  }
  assert.ok(peaks.r > peaks.p && peaks.k > peaks.p && peaks.p > peaks.q);
});
test('castling schedules both royal and guardian footsteps, then cancels them on undo', async () => {
  const f = fixture(); const a = audioFixture(); a.audio.setAmbience(false); await a.audio.setEnabled(true);
  f.movement.audio = a.audio;
  const game = new Game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const initial = game.snapshot().fen;
  const controller = new MoveController(game, { present: (...args) => f.movement.present(...args) });
  const playing = controller.play('O-O');
  const frequencies = a.context.sources.flatMap(source => source.frequency.events.map(event => event.value));
  assert.ok(frequencies.includes(90) && frequencies.includes(105));
  controller.undo(); await playing;
  assert.equal(game.snapshot().fen, initial);
  assert.ok(a.context.sources.every(source => source.immediateStop));
  f.movement.destroy(); await a.audio.destroy();
});
test('heavy steps remain audible as a single footfall when visual movement is disabled', async () => {
  const f = fixture(); const a = audioFixture(); a.audio.setAmbience(false); await a.audio.setEnabled(true);
  f.movement.audio = a.audio; f.movement.setEnabled(false);
  const game = new Game('7k/8/8/8/8/8/R7/7K w - - 0 1');
  const before = game.snapshot(); const move = game.move('Ra3');
  await f.movement.present({ move, before, after: game.snapshot() }, new AbortController().signal);
  assert.ok(a.context.sources.length > 0); assert.equal(f.frame.children.length, 0);
  f.movement.finish(); assert.equal(a.audio.effects.size, 0);
  f.movement.destroy(); await a.audio.destroy();
});
test('optional reverb and limiter failures cannot disable direct playback', async () => {
  const f = audioFixture(); f.audio.setAmbience(false);
  f.context.createConvolver = () => { throw new Error('Reverb unavailable'); };
  f.context.createDynamicsCompressor = () => { throw new Error('Limiter unavailable'); };
  assert.equal(await f.audio.setEnabled(true), true);
  assert.equal(f.audio.lastError, null); assert.ok(f.audio.master.connections.includes(f.context.destination));
  assert.equal(f.audio.preview(), true); assert.ok(f.context.sources.length > 0);
  await f.audio.destroy();
});
test('audio startup errors retain their reason and a suspended resume never claims success', async () => {
  const blocked = new BattleAudio({ contextFactory: () => { throw Object.assign(new Error('Audio is blocked for this site'), { name: 'NotAllowedError' }); } });
  assert.equal(await blocked.setEnabled(true), false);
  assert.match(blocked.lastError, /NotAllowedError: Audio is blocked/);
  const f = audioFixture(); f.context.resume = async () => {};
  assert.equal(await f.audio.setEnabled(true), false);
  assert.equal(f.audio.enabled, false); assert.match(f.audio.lastError, /Audio is suspended/);
  await f.audio.destroy();
});
test('preview sounds reuse one context and remain cancellable through mute', async () => {
  const f = audioFixture(); f.audio.setAmbience(false);
  assert.equal(f.audio.preview(), false); assert.equal(f.created, 0);
  await f.audio.setEnabled(true); assert.equal(f.audio.preview(), true);
  assert.ok(f.context.sources.some(source => source.frequency.events.some(event => event.value === 440)));
  f.audio.preview(); assert.equal(f.created, 1);
  await f.audio.setEnabled(false);
  assert.ok(f.context.sources.every(source => source.immediateStop));
  await f.audio.destroy();
});
test('Firefox-style interval functions receive Window for both start and stop', async () => {
  const context = new ContextFake(); let running = false;
  const audio = new BattleAudio({
    contextFactory: () => context,
    setIntervalFn: function () {
      if (this !== globalThis) throw new TypeError('setInterval called on an object that does not implement interface Window');
      running = true; return 42;
    },
    clearIntervalFn: function (id) {
      assert.equal(this, globalThis); assert.equal(id, 42); running = false;
    },
  });
  try {
    assert.equal(await audio.setEnabled(true), true, audio.lastError);
    assert.equal(running, true);
    await audio.setEnabled(false); assert.equal(running, false);
  } finally { await audio.destroy(); }
});
test('pawn impacts combine heavy body and several inharmonic steel resonances', async () => {
  const f = audioFixture(); f.audio.setAmbience(false); f.audio.setScreams(false); f.audio.setShouts(false);
  await f.audio.setEnabled(true); f.audio.capture('p', COMBAT_DURATION, undefined, 'p');
  const impact = f.context.currentTime + .015 + .72;
  const frequencies = f.context.sources.filter(source => Math.abs(source.startTime - impact) < .0001)
    .flatMap(source => source.frequency.events.slice(0, 1).map(event => event.value));
  assert.ok(frequencies.length >= 5);
  assert.ok(frequencies.some(value => value < 180));
  assert.ok(frequencies.some(value => value > 1000));
  assert.ok(frequencies.some(value => Math.abs(value / frequencies[0] - Math.round(value / frequencies[0])) > .1));
  await f.audio.destroy();
});
test('every captured class has a distinct two-second cry', async () => {
  const signatures = new Set();
  for (const victim of 'pnbrq') {
    const f = audioFixture(); f.audio.setAmbience(false); f.audio.setShouts(false); await f.audio.setEnabled(true);
    f.audio.capture('p', COMBAT_DURATION, undefined, victim);
    const voice = f.context.sources.filter(source => source.wave);
    assert.ok(voice.length >= 2);
    signatures.add(voice.map(source => source.frequency.events[0].value).join(','));
    const first = Math.min(...voice.map(source => source.startTime));
    const last = Math.max(...voice.map(source => source.stopTime - .01));
    assert.ok(Math.abs(last - first - DEFEAT_CRY_DURATION) < 1e-6);
    assert.equal(DEFEAT_CRY_DURATION, 2);
    await f.audio.destroy();
    assert.equal(f.audio.cries.size, 0); assert.equal(f.audio.shouts.size, 0);
  }
  assert.equal(signatures.size, 5);
});
test('all attacking classes have distinct impact sound signatures', async () => {
  const signatures = new Set();
  for (const attacker of 'pnbrqk') {
    const f = audioFixture(); f.audio.setAmbience(false); f.audio.setScreams(false); f.audio.setShouts(false);
    await f.audio.setEnabled(true); f.audio.capture(attacker, COMBAT_DURATION);
    const impact = f.context.currentTime + .015 + .72;
    signatures.add(f.context.sources.filter(source => Math.abs(source.startTime - impact) < .0001)
      .flatMap(source => source.frequency.events.slice(0, 1).map(event => event.value)).join(','));
    await f.audio.destroy();
  }
  assert.equal(signatures.size, 6);
});
test('defeat cries and attack shouts can be stopped separately without muting steel', async () => {
  const f = audioFixture(); f.audio.setAmbience(false); await f.audio.setEnabled(true);
  f.audio.capture('p', COMBAT_DURATION, undefined, 'n');
  assert.equal(f.audio.effects.size, 1); assert.equal(f.audio.cries.size, 1); assert.equal(f.audio.shouts.size, 1);
  f.audio.setScreams(false);
  assert.equal(f.audio.cries.size, 0); assert.equal(f.audio.shouts.size, 1); assert.equal(f.audio.effects.size, 1);
  f.audio.setShouts(false);
  assert.equal(f.audio.shouts.size, 0); assert.equal(f.audio.effects.size, 1);
  f.audio.setVolume('voicesVolume', 0); assert.equal(f.audio.voicesBus.gain.value, 0);
  assert.ok(f.audio.effectsBus.gain.value > 0);
  await f.audio.destroy();
});
test('the animation adapter passes the actual captured class to the audio system', async () => {
  const f = fixture(); let captured;
  f.movement.audio = { capture: (type, duration, signal, victim) => { captured = victim; return () => {}; } };
  const game = new Game('7k/8/8/4n3/3P4/8/8/7K w - - 0 1');
  const before = game.snapshot(); const move = game.move('dxe5');
  const playing = f.movement.present({ move, before, after: game.snapshot() }, new AbortController().signal);
  assert.equal(captured, 'n'); f.movement.finish(); await playing; f.movement.destroy();
});
test('battle preview uses selected profiles and never creates a king death sound', async () => {
  const f = audioFixture(); f.audio.setAmbience(false); f.audio.setShouts(false); await f.audio.setEnabled(true);
  f.audio.capture('p', COMBAT_DURATION, undefined, 'k'); assert.equal(f.context.sources.length, 0);
  f.audio.previewBattle('b', 'r');
  assert.ok(f.context.sources.some(source => source.wave && source.frequency.events[0]?.value === 155));
  const previous = [...f.context.sources]; f.audio.previewBattle('k', 'n');
  assert.ok(previous.every(source => source.immediateStop));
  f.audio.stopEffects();
  assert.equal(f.audio.effects.size + f.audio.cries.size + f.audio.shouts.size, 0);
  await f.audio.destroy();
});

test('natural capture completion unlocks play while the cry survives into the next move', async () => {
  const f = fixture(); const a = audioFixture(); a.audio.setAmbience(false); await a.audio.setEnabled(true);
  f.movement.audio = a.audio;
  const game = new Game(); game.move('e4'); game.move('d5');
  const controller = new MoveController(game, { present: (...args) => f.movement.present(...args) });
  const capture = controller.play('exd5');
  f.animations.forEach(animation => animation.finish()); await capture;
  assert.equal(controller.busy, false); assert.equal(a.audio.cries.size, 1);
  const reply = controller.play('Qd6');
  assert.equal(a.audio.cries.size, 1, 'A new move must not cut the previous defeat cry');
  f.animations.forEach(animation => animation.finish()); await reply;
  assert.equal(game.snapshot().history.length, 4); assert.equal(a.audio.cries.size, 1);
  a.audio.stopEffects(); assert.equal(a.audio.cries.size, 0);
  f.movement.destroy(); await a.audio.destroy();
});
test('undo after visual completion still aborts the remaining two-second scream', async () => {
  const f = fixture(); const a = audioFixture(); a.audio.setAmbience(false); await a.audio.setEnabled(true);
  f.movement.audio = a.audio;
  const game = new Game(); game.move('e4'); game.move('d5');
  const controller = new MoveController(game, { present: (...args) => f.movement.present(...args) });
  const capture = controller.play('exd5');
  f.animations.forEach(animation => animation.finish()); await capture;
  assert.equal(a.audio.cries.size, 1);
  controller.undo(); assert.equal(a.audio.cries.size, 0); assert.equal(game.snapshot().board.length, 32);
  f.movement.destroy(); await a.audio.destroy();
});
test('disabling animations retains long cries and rapid captures cap voice overlap', async () => {
  const f = fixture(); const a = audioFixture(); a.audio.setAmbience(false); a.audio.setShouts(false); await a.audio.setEnabled(true);
  f.movement.audio = a.audio; f.movement.setEnabled(false); f.movement.setCombatEnabled(false);
  const game = new Game(); game.move('e4'); game.move('d5');
  const controller = new MoveController(game, { present: (...args) => f.movement.present(...args) });
  await controller.play('exd5'); assert.equal(a.audio.cries.size, 1);
  await controller.play('Qd6'); assert.equal(a.audio.cries.size, 1);
  a.audio.capture('p', 0); a.audio.capture('n', 0);
  assert.equal(a.audio.cries.size, 2);
  a.audio.stopEffects(); assert.equal(a.audio.cries.size, 0);
  f.movement.destroy(); await a.audio.destroy();
});
test('wet impact transients remain short and stop immediately with all other effects', async () => {
  const f = audioFixture(); f.audio.setAmbience(false); f.audio.setShouts(false); f.audio.setScreams(false);
  await f.audio.setEnabled(true); const stop = f.audio.capture('p', COMBAT_DURATION);
  const impact = f.context.currentTime + .015 + .72;
  const wetHits = f.context.sources.filter(source => source.startTime > impact && source.startTime < impact + .13
    && source.frequency.events[0]?.value > 50 && source.frequency.events[0]?.value < 300);
  assert.ok(wetHits.length >= 3, 'Several brief low transients should follow contact');
  stop(); assert.ok(f.context.sources.every(source => source.immediateStop)); await f.audio.destroy();
});
