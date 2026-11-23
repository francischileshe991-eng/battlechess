import { Game, MoveController } from './game.js';
import { Board } from './board.js';
import { Movement } from './animation.js';
import { BattleAudio } from './audio.js';
import { attacks } from './attacks.js';
import { Stockfish, ComputerPlayer } from './ai.js';
import { character, names, pieceNames } from './characters.js';
const $ = id => document.getElementById(id);
const game = new Game();
let selected = null;
let pendingPromotion = null;
let presentationToken = 0;
let computer;
const board = new Board($('board'), select);
const audio = new BattleAudio({ onStateChange: renderAudioControls });
const movement = new Movement(board, { audio });
const controller = new MoveController(game, {
  render,
  present: async (event, signal) => {
    const token = ++presentationToken;
    $('undo').disabled = computer?.mode === 'computer' && !event.after.history.some(move => move.color === computer.humanColor);
    $('skip-motion').textContent = event.move.captured && movement.combatEnabled ? 'Skip battle' : 'Skip movement';
    $('skip-motion').hidden = false;
    $('status').textContent = event.move.captured && movement.combatEnabled
      ? `${event.move.color === 'w' ? 'Light' : 'Dark'} ${names[event.move.piece].toLowerCase()} uses ${attacks[event.move.piece].name.toLowerCase()} on ${event.move.to}.`
      : `${event.move.color === 'w' ? 'Light' : 'Dark'} ${names[event.move.piece].toLowerCase()} advances to ${event.move.to}.`;
    try { await movement.present(event, signal); }
    finally { if (token === presentationToken) $('skip-motion').hidden = true; }
  },
});

computer = new ComputerPlayer(game, controller, new Stockfish(), () => {
  if (!controller.busy) render();
});

function render(state = game.snapshot()) {
  const moves = selected ? game.legalMoves(selected) : [];
  board.render(state, selected, moves);
  const side = state.turn === 'w' ? 'Light' : 'Dark';
  $('turn-title').textContent = state.result ? (state.result.startsWith('Draw') ? 'Battle drawn' : `${state.turn === 'w' ? 'Dark' : 'Light'} army wins`) : `${side} to move`;
  $('turn-emblem').className = `army-emblem ${state.turn === 'w' ? 'light' : 'dark'}-emblem`;
  $('status').textContent = state.result || (state.check ? `${side}'s king is in check. Protect your sovereign.` : selected ? `${names[state.board.find(p => p.square === selected)?.type] || 'Warrior'} on ${selected}. Choose a highlighted square.` : state.history.length ? 'The field has changed. Your next move awaits.' : 'The battlefield awaits your first move.');
  for (const [color, id] of [['w', 'light-turn'], ['b', 'dark-turn']]) {
    $(id).textContent = state.result ? 'BATTLE ENDED' : state.turn === color ? 'TO MOVE' : 'STANDING BY';
    $(id).classList.toggle('active', !state.result && state.turn === color);
  }
  $('undo').disabled = !state.history.length || (computer?.mode === 'computer' && !state.history.some(move => move.color === computer.humanColor));
  $('move-count').textContent = `${state.history.length} ${state.history.length === 1 ? 'move' : 'moves'}`;
  const history = $('history');
  const atEnd = history.scrollTop + history.clientHeight >= history.scrollHeight - 8;
  history.replaceChildren();
  if (!state.history.length) history.innerHTML = '<p class="empty-history">A quiet board.<br>A thousand possibilities.</p>';
  for (let i = 0; i < state.history.length; i += 2) {
    const row = document.createElement('div'); row.className = 'history-row';
    for (const value of [String(i / 2 + 1).padStart(2, '0'), state.history[i].san, state.history[i + 1]?.san || '—']) {
      const span = document.createElement('span'); span.textContent = value; row.append(span);
    }
    history.append(row);
  }
  if (atEnd) history.scrollTop = history.scrollHeight;
  if (computer) {
    $('ai-options').hidden = computer.mode !== 'computer';
    $('play-mode').value = computer.mode;
    $('player-color').value = computer.humanColor;
    $('difficulty').value = computer.difficulty;
    $('thinking-time').value = String(computer.thinkingMs);
    $('mode-badge').textContent = computer.mode === 'computer' ? 'PLAYER VS COMPUTER' : 'LOCAL TWO-PLAYER';
    $('undo').textContent = computer.mode === 'computer' ? 'Undo turn' : 'Undo move';
    $('ai-error').hidden = !computer.error;
    $('ai-message').textContent = computer.error || '';
    $('opponent-status').textContent = computer.mode === 'computer'
      ? computer.thinking ? 'Stockfish is thinking…' : `You command the ${computer.humanColor === 'w' ? 'Light' : 'Dark'} army.`
      : 'Two players share this battlefield.';
    if (computer.thinking) {
      $('turn-title').textContent = `${side} is thinking`;
      $('status').textContent = state.check ? 'The computer is in check and is choosing its reply.' : 'The opposing commander is planning a move.';
    } else if (computer.error && computer.isComputerTurn(state)) $('status').textContent = computer.error;
  }
  $('board-turn').textContent = $('turn-title').textContent;
  $('board-notice').textContent = state.result ? 'Battle ended' : state.check ? 'King in check'
    : computer?.thinking ? 'Choosing a move' : computer?.mode === 'computer' ? 'Player vs computer' : 'Local two-player';
  $('board-turn').classList.toggle('in-check', Boolean(state.check && !state.result));
  // Rendering follows committed moves and animation cleanup. Scheduling here
  // lets mode changes during a presentation wait until the controller unlocks.
  queueMicrotask(() => { void computer?.maybeMove(); });
}
async function commit(input) {
  selected = null;
  try { await controller.play(input); }
  catch (error) { console.error('Move presentation failed; board reconciled.', error); }
}
function select(square) {
  if (controller.busy || pendingPromotion || $('restart-dialog').open) return;
  const state = game.snapshot();
  if (state.result || computer.isComputerTurn(state)) return;
  const candidates = selected ? game.legalMoves(selected).filter(m => m.to === square) : [];
  if (candidates.length) {
    if (candidates.some(m => m.promotion)) { showPromotion(selected, square, state.turn); return; }
    void commit({ from: selected, to: square }); return;
  }
  const piece = state.board.find(p => p.square === square);
  selected = selected !== square && piece?.color === state.turn ? square : null;
  render(state);
}
function showPromotion(from, to, color) {
  pendingPromotion = { from, to };
  const options = $('promotion-options'); options.replaceChildren();
  for (const type of ['q', 'r', 'b', 'n']) {
    const button = document.createElement('button'); button.type = 'button';
    button.innerHTML = `${character(type, color)}<span>${pieceNames[type][0].toUpperCase() + pieceNames[type].slice(1)}</span>`;
    button.addEventListener('click', () => {
      if (!pendingPromotion) return;
      const input = { ...pendingPromotion, promotion: type };
      pendingPromotion = null; $('promotion').close(); void commit(input);
    });
    options.append(button);
  }
  $('promotion').showModal();
}
function cancelPromotion() { pendingPromotion = null; $('promotion').close(); render(); }
$('cancel-promotion').addEventListener('click', cancelPromotion);
$('promotion').addEventListener('cancel', e => { e.preventDefault(); cancelPromotion(); });
$('undo').addEventListener('click', () => { audio.stopEffects(); selected = null; cancelPromotion(); computer.undo(); });
$('flip').addEventListener('click', () => { audio.stopEffects(); movement.finish(); board.flip(); render(); });
$('restart').addEventListener('click', () => {
  if (!game.snapshot().history.length) { audio.stopEffects(); selected = null; computer.restart(); }
  else $('restart-dialog').showModal();
});
$('cancel-restart').addEventListener('click', () => $('restart-dialog').close());
$('confirm-restart').addEventListener('click', () => { audio.stopEffects(); selected = null; cancelPromotion(); $('restart-dialog').close(); computer.restart(); });
for (const type of ['p', 'n', 'b', 'r', 'q', 'k']) {
  const item = document.createElement('div'); item.className = 'roster-item';
  item.innerHTML = `${character(type, 'w')}<span>${pieceNames[type][0].toUpperCase() + pieceNames[type].slice(1)}</span>`;
  item.title = `${names[type]}: ${attacks[type].name}`; $('roster').append(item);
}
render();

$('motion-enabled').addEventListener('change', event => {
  movement.setEnabled(event.target.checked);
  document.body.classList.toggle('motion-disabled', !event.target.checked);
});
$('skip-motion').addEventListener('click', () => movement.finish());
document.addEventListener('visibilitychange', () => {
  document.body.classList.toggle('page-inactive', document.hidden);
  void audio.setHidden(document.hidden);
});

$('combat-enabled').addEventListener('change', event => movement.setCombatEnabled(event.target.checked));

function configureComputer() {
  audio.stopEffects();
  const settings = {
    mode: $('play-mode').value,
    humanColor: $('player-color').value,
    difficulty: $('difficulty').value,
    thinkingMs: Number($('thinking-time').value),
  };
  selected = null;
  movement.finish();
  cancelPromotion();
  computer.configure(settings);
}
for (const id of ['play-mode', 'player-color', 'difficulty', 'thinking-time']) $(id).addEventListener('change', configureComputer);
$('retry-ai').addEventListener('click', () => computer.retry());
$('local-play').addEventListener('click', () => { audio.stopEffects(); computer.configure({ mode: 'local' }); });
window.addEventListener('pagehide', () => { computer.cancel(); void audio.setHidden(true); });
window.addEventListener('pageshow', () => { void audio.setHidden(document.hidden); render(); });

let audioToggleRevision = 0;
function renderAudioControls() {
  const running = audio.enabled && !audio.hidden && audio.context?.state === 'running';
  $('sound-enabled').checked = audio.enabled;
  $('audio-badge').textContent = running ? 'On' : audio.enabled ? 'Paused' : 'Off';
  $('audio-toggle').textContent = running ? 'Mute audio' : audio.enabled ? 'Resume audio' : 'Enable audio';
  $('audio-toggle').setAttribute('aria-pressed', String(running));
  let message = !audio.enabled ? 'Sound is off. Enable audio to hear the battlefield.'
    : !running ? 'Audio is paused. Tap Resume audio to continue.'
    : audio.volume === 0 ? 'Master volume is at 0%. Raise it to hear sound.'
    : 'Audio is on. Use Test sound to check your speakers.';
  if (audio.lastError) message = `Could not start audio. ${audio.lastError}`;
  $('audio-state').textContent = message;
  $('sound-status').textContent = message;
  $('audio-state').classList.toggle('audio-error', Boolean(audio.lastError));
}
async function changeAudio(enabled, preview = false) {
  const revision = ++audioToggleRevision;
  $('audio-state').textContent = enabled ? 'Starting audio…' : 'Muting audio…';
  // No asynchronous work precedes resume(): Firefox receives a direct click.
  const started = await audio.setEnabled(enabled);
  if (revision !== audioToggleRevision) return;
  if (started && preview === 'battle') audio.previewBattle($('preview-attacker').value, $('preview-victim').value);
  else if (started && preview) audio.preview();
  renderAudioControls();
}
$('sound-enabled').addEventListener('click', event => { void changeAudio(event.target.checked, event.target.checked); });
$('audio-toggle').addEventListener('click', () => {
  const running = audio.enabled && audio.context?.state === 'running';
  void changeAudio(!running, !running);
});
$('preview-audio').addEventListener('click', () => { void changeAudio(true, true); });
$('preview-battle').addEventListener('click', () => { void changeAudio(true, 'battle'); });
renderAudioControls();
$('chant-enabled').addEventListener('change', event => audio.setAmbience(event.target.checked));
$('screams-enabled').addEventListener('change', event => audio.setScreams(event.target.checked));
$('shouts-enabled').addEventListener('change', event => audio.setShouts(event.target.checked));
for (const [id, kind] of [['master-volume', 'volume'], ['chant-volume', 'ambienceVolume'], ['effects-volume', 'effectsVolume'], ['voices-volume', 'voicesVolume']]) {
  $(id).addEventListener('input', event => {
    audio.setVolume(kind, Number(event.target.value) / 100);
    $(`${id}-value`).textContent = `${event.target.value}%`;
  });
}
