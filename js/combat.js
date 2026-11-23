import { attacks, weaponFrames, bodyFrames, effectFrames, projectileFrames } from './attacks.js';

// Six class-specific attacks share one cancellable capture lifecycle.
// Every track uses the same 1.2-second clock; no timers or chess-state writes.
export const COMBAT_DURATION = 1200;
export const combatStages = { approach: 0.25, attack: 0.6, impact: 0.8, defeat: 1 };

export function combatGeometry(start, victim, destination, size) {
  const dx = victim.left - start.left;
  const dy = victim.top - start.top;
  const distance = Math.hypot(dx, dy) || size;
  const direction = { x: dx / distance, y: dy / distance };
  const contact = {
    x: dx - direction.x * size * 0.46,
    y: dy - direction.y * size * 0.46,
  };
  return {
    direction, contact,
    end: { x: destination.left - start.left, y: destination.top - start.top },
  };
}

const translate = (x, y) => `translate(${x}px, ${y}px)`;

export function captureTravelFrames({ contact, end, direction }, size, type = 'p') {
  if (type === 'b') return [
    { transform: translate(0, 0), offset: 0 },
    { transform: translate(0, 0), offset: combatStages.impact },
    { transform: translate(end.x / 2, end.y / 2 - size * .08), offset: .9 },
    { transform: translate(end.x, end.y), offset: 1 },
  ];
  if (type === 'n') return [
    { transform: translate(0, 0), offset: 0 },
    { transform: translate(contact.x / 2, contact.y / 2 - size * .35), offset: .12 },
    { transform: translate(contact.x, contact.y), offset: .25 },
    { transform: translate(contact.x - direction.x * size * .12, contact.y - direction.y * size * .12), offset: .43 },
    { transform: translate(contact.x + direction.x * size * .3, contact.y + direction.y * size * .3), offset: .6 },
    { transform: translate(contact.x, contact.y), offset: .8 },
    { transform: translate(end.x, end.y), offset: 1 },
  ];
  return [
    { transform: translate(0, 0), offset: 0 },
    { transform: translate(contact.x, contact.y), offset: combatStages.approach },
    { transform: translate(contact.x, contact.y), offset: 0.45 },
    { transform: translate(contact.x + direction.x * size * 0.12, contact.y + direction.y * size * 0.12), offset: combatStages.attack },
    { transform: translate(contact.x, contact.y), offset: combatStages.impact },
    { transform: translate(end.x, end.y), offset: combatStages.defeat },
  ];
}

export function createCombat({ event, capturedSquare, board, layer, place, play }) {
  const attackerPiece = event.before.board.find(piece => piece.square === event.move.from);
  const victimPiece = event.before.board.find(piece => piece.square === capturedSquare);
  if (!attackerPiece || !victimPiece || victimPiece.type === 'k') throw new Error('Invalid capture presentation');
  const start = board.cells.get(event.move.from).getBoundingClientRect();
  const victim = board.cells.get(capturedSquare).getBoundingClientRect();
  const destination = board.cells.get(event.move.to).getBoundingClientRect();
  const size = start.width;
  const geometry = combatGeometry(start, victim, destination, size);
  const type = attackerPiece.type;
  layer.classList.add('combat-layer', `attack-${type}`);
  layer.setAttribute('data-attack', attacks[type].name);
  const defender = place(capturedSquare, victimPiece, 'combat-warrior combat-defender');
  const attacker = place(event.move.from, attackerPiece, 'combat-warrior combat-attacker');
  const options = { duration: COMBAT_DURATION, easing: 'linear', fill: 'forwards' };
  play(attacker, captureTravelFrames(geometry, size, type), options);
  const weapon = attacker.querySelector('.weapon');
  if (weapon) play(weapon, weaponFrames(type, geometry.direction), options);
  const figure = attacker.querySelector('.figure');
  if (figure) play(figure, bodyFrames(type, geometry.direction), options);

  if (type === 'b') {
    const projectile = place(event.move.from, attackerPiece, 'combat-projectile');
    projectile.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="bolt-aura" cx="32" cy="30" r="10"/><path class="arcane-bolt" d="m32 18 8 12-8 12-8-12Z"/><circle class="bolt-core" cx="32" cy="30" r="3"/></svg>';
    play(projectile, projectileFrames(start, victim), options);
  }

  const lean = geometry.direction.x < 0 ? -1 : 1;
  play(defender, [
    { transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1, offset: 0 },
    { transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1, offset: combatStages.attack },
    { transform: `translate(${lean * size * 0.05}px, 0px) rotate(${lean * 8}deg)`, opacity: 1, offset: 0.65 },
    { transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1, offset: combatStages.impact },
    { transform: `translate(${geometry.direction.x * size * 0.15}px, ${size * 0.12}px) rotate(${lean * 75}deg)`, opacity: 0, offset: 1 },
  ], options);
  const victimFigure = defender.querySelector('.figure');
  if (victimFigure) play(victimFigure, [
    { opacity: 1, offset: 0 }, { opacity: 1, offset: combatStages.attack },
    { opacity: 0.25, offset: 0.64 }, { opacity: 1, offset: 0.69 },
    { opacity: 0.5, offset: 0.73 }, { opacity: 1, offset: combatStages.impact },
    { opacity: 1, offset: 1 },
  ], options);

  const effect = place(capturedSquare, victimPiece, 'combat-impact');
  effect.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true">${attacks[type].effect}</svg>`;
  play(effect, effectFrames(type), options);
}
