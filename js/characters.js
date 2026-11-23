export const names = { p: 'Infantry', n: 'Knight', b: 'Mage', r: 'Guardian', q: 'Commander', k: 'King' };
export const pieceNames = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

// Shared viewBox and named rig parts let movement/combat animate body, legs,
// cloak, and weapon independently without changing the chess representation.
const legs = `<g class="legs"><path d="M26 39 22 54H30L33 44 37 54H45L40 39Z"/>
  <path class="detail" d="M24 50H29M38 50H43"/></g>`;
const body = `<g class="torso"><path d="M26 23 33 20 40 23 43 41H23Z"/>
  <path class="detail" d="M26 36H40M33 23V35"/></g>`;
const helmet = `<g class="head"><path d="M26 14Q26 5 33 5T40 14V21H26Z"/>
  <path d="M30 5V2H36V6Z"/><path class="detail" d="M28 14H38M33 14V19"/></g>`;
const shapes = {
  p: `${legs}${body}${helmet}
    <g class="weapon"><path d="M18 17 20 13 22 17 21 43H18Z"/><path d="M15 26H25V29H15Z"/></g>
    <g class="shield"><path d="M37 27 49 24 51 37 44 45 37 37Z"/>
    <path class="detail" d="M44 28V39M40 33H48"/></g>`,
  n: `<g class="mount"><path d="M11 36Q17 28 35 32L43 24 42 14 47 7 51 13 56 21 52 28 48 27 44 41 44 47H36L33 42H24L20 46 15 44Z"/>
    <g class="legs"><path d="m16 40-3 14h7l5-14ZM35 40l3 14h8l-3-14Z"/></g>
    <path class="detail" d="M47 19H50M18 34 26 33M43 28 36 35M25 38H35"/>
    <path d="M12 34 7 29 8 39 14 43Z"/></g>
    <g class="torso"><path class="cloak" d="M26 19 17 29 24 34 31 26Z"/>
    <path d="M25 19H35L39 31 33 38 28 31H22Z"/><path class="detail" d="M31 31 30 37"/></g>
    <g class="head"><path d="M24 13Q24 6 30 6T36 13V18H24Z"/><path d="M27 6V3H34V7Z"/><path class="detail" d="M26 13H34"/></g>
    <g class="weapon"><path d="M8 11H11V45H8ZM6 11 9 2 13 11Z"/>
    <path class="pennant" d="M12 12 23 15 12 19Z"/></g>`,
  b: `<g class="cloak"><path d="M32 5Q22 13 23 23L17 54H47L40 24Q43 15 32 5Z"/>
    <path class="detail" d="M25 29 22 47M37 31 42 49M32 29V48"/></g>
    <g class="head"><path class="hood-shadow" d="m32 12-6 9 6 5 6-5Z"/><path class="detail" d="M29 21H35"/></g>
    <g class="weapon"><path d="M49 16H52V55H49Z"/><path d="m50 3 6 8-6 8-6-8Z"/>
    <path class="detail" d="m50 7 2 4-2 3-2-3Z"/></g>`,
  r: `${legs}<g class="torso"><path d="M20 24 26 20H40L47 25 43 44H22Z"/>
    <path d="M18 23 27 20 29 28 19 30ZM38 20 48 24 46 31 37 28Z"/>
    <path class="detail" d="M28 30V39M35 30V39M25 41H40"/></g>
    <g class="head"><path d="M25 7H41V21H25Z"/><path d="M28 4H38V8H28Z"/><path class="detail" d="M28 14H38M33 14V20"/></g>
    <g class="weapon"><path d="m10 16 4-1 12 39-4 1Z"/><path d="m3 13 17-5 4 13-17 5Z"/>
    <path class="detail" d="m7 15 10-3"/></g>`,
  q: `<path class="cloak" d="M26 21 19 24 16 51 29 44 43 49 40 23Z"/>${legs}${body}
    <g class="head"><path d="M26 10 23 3 30 6 33 1 36 6 43 3 40 11V20H26Z"/>
    <path class="detail" d="M28 14H38M29 9H37"/></g>
    <g class="weapon"><path d="m19 20-2-6-3 6 3 29h4ZM13 28H25V31H13Z"/></g>
    <path d="m42 25 8 7-3 13-5-8Z"/><path class="detail" d="M28 29 33 34 38 29"/>`,
  k: `<path class="cloak" d="M24 23 17 52 30 47H41L49 52 41 23Z"/>${legs}${body}
    <g class="head"><path d="M25 9 23 3 30 6 33 2 36 6 43 3 41 10V21H25Z"/>
    <path class="detail" d="M28 14H38M29 9H38"/></g>
    <g class="weapon"><path d="M47 20 50 13 53 20 51 46H48Z"/><path d="M44 28H56V31H44Z"/>
    <path class="detail" d="M50 20V26"/></g><path class="detail" d="M29 28H37M33 25V36"/>`,
};

export function character(type, color) {
  return `<svg class="soldier army-${color} warrior-${type}" viewBox="0 0 64 64" aria-hidden="true"><ellipse class="ground" cx="33" cy="57" rx="22" ry="3"/><g class="figure">${shapes[type]}</g></svg>`;
}
