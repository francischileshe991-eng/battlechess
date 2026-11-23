// Piece-specific presentation data. All offsets share the capture's 1.2-second
// clock; these tracks never schedule callbacks or touch the chess engine.
const slash = '<path class="slash-trail" d="M9 43Q23 5 55 15Q29 20 9 43Z"/>';
const sparks = '<path class="impact-sparks" d="m33 20 2 8 8-4-4 8 9 3-9 2 3 9-8-5-4 8 1-10-10 1 8-6-6-6 9 2Z"/>';
const ring = '<circle class="energy-ring" cx="32" cy="32" r="17"/>';
export const attacks = {
  p: { name: 'Sword slash', effect: slash + sparks, windup: -55, strike: 65, lean: 5 },
  n: { name: 'Mounted charge', effect: '<path class="charge-lines" d="M5 23H27M1 32H25M7 41H27"/>' + sparks, windup: 0, strike: 6, lean: 12 },
  b: { name: 'Arcane bolt', effect: ring + '<path class="magic-rays" d="M32 7V16M32 48V57M7 32H16M48 32H57M14 14 21 21M43 43 50 50M14 50 21 43M43 21 50 14"/>', windup: -12, strike: 10, lean: 2 },
  r: { name: 'Hammer smash', effect: '<ellipse class="shockwave" cx="32" cy="47" rx="26" ry="9"/><path class="impact-cracks" d="m32 28-4 13 7 2-5 15M28 42 17 38 12 44M34 43 45 40 51 47"/>' + sparks, windup: -135, strike: 30, lean: 9 },
  q: { name: 'Commander flurry', effect: slash + '<path class="counter-slash" d="M9 15Q40 16 55 49Q30 27 9 15Z"/>' + ring, windup: -55, strike: 70, lean: 7 },
  k: { name: 'Royal cleave', effect: '<path class="royal-cleave" d="m30 5 4 0 7 47-9 7-9-7Z"/>' + sparks, windup: -95, strike: 45, lean: 6 },
};

export function weaponFrames(type, direction) {
  const attack = attacks[type];
  const aim = Math.atan2(direction.y, direction.x) * 180 / Math.PI + 90;
  const rotate = angle => `rotate(${angle}deg)`;
  if (type === 'q') return [
    { transform: rotate(0), offset: 0 }, { transform: rotate(aim), offset: .25 },
    { transform: rotate(aim - 65), offset: .35 }, { transform: rotate(aim + 65), offset: .44 },
    { transform: rotate(aim - 55), offset: .51 }, { transform: rotate(aim + 70), offset: .6 },
    { transform: rotate(0), offset: .8 }, { transform: rotate(0), offset: 1 },
  ];
  return [
    { transform: rotate(0), offset: 0 }, { transform: rotate(aim), offset: .25 },
    { transform: rotate(aim + attack.windup), offset: .43 },
    { transform: rotate(aim + attack.strike), offset: .6 },
    { transform: rotate(0), offset: .8 }, { transform: rotate(0), offset: 1 },
  ];
}

export function bodyFrames(type, direction) {
  const sign = direction.x < 0 ? -1 : 1;
  const lean = attacks[type].lean * sign;
  return [
    { transform: 'rotate(0deg) translateY(0px)', offset: 0 },
    { transform: 'rotate(0deg) translateY(0px)', offset: .25 },
    { transform: `rotate(${-lean}deg) translateY(${type === 'r' ? -3 : -1}px)`, offset: .43 },
    { transform: `rotate(${lean}deg) translateY(${type === 'r' ? 2 : 0}px)`, offset: .6 },
    { transform: 'rotate(0deg) translateY(0px)', offset: .8 },
    { transform: 'rotate(0deg) translateY(0px)', offset: 1 },
  ];
}

export function effectFrames(type) {
  const first = type === 'q' ? .44 : .6;
  const frames = [
    { opacity: 0, transform: 'scale(.6)', offset: 0 },
    { opacity: 0, transform: 'scale(.6)', offset: first },
  ];
  if (type === 'q') frames.push(
    { opacity: .8, transform: 'scale(.85)', offset: .47 },
    { opacity: .1, transform: 'scale(.7)', offset: .54 },
  );
  frames.push(
    { opacity: 1, transform: 'scale(1)', offset: .64 },
    { opacity: 0, transform: `scale(${type === 'r' ? 1.3 : 1.12})`, offset: .8 },
    { opacity: 0, transform: 'scale(1.12)', offset: 1 },
  );
  return frames;
}

export function projectileFrames(start, victim) {
  const x = victim.left - start.left;
  const y = victim.top - start.top;
  return [
    { opacity: 0, transform: 'translate(0px, 0px) scale(.3)', offset: 0 },
    { opacity: 0, transform: 'translate(0px, 0px) scale(.3)', offset: .32 },
    { opacity: 1, transform: 'translate(0px, 0px) scale(.8)', offset: .4 },
    { opacity: 1, transform: `translate(${x}px, ${y}px) scale(1)`, offset: .6 },
    { opacity: 0, transform: `translate(${x}px, ${y}px) scale(1.3)`, offset: .64 },
    { opacity: 0, transform: `translate(${x}px, ${y}px) scale(1.3)`, offset: 1 },
  ];
}
