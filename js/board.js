import { character, pieceNames } from './characters.js';
export class Board {
  constructor(element, select) {
    this.element = element; this.flipped = false; this.cells = new Map();
    element.addEventListener('click', e => { const cell = e.target.closest('[data-square]'); if (cell) select(cell.dataset.square); });
    element.addEventListener('keydown', e => {
      const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
      if (!(e.key in steps)) return;
      e.preventDefault();
      const cells = [...this.element.children];
      const index = cells.indexOf(document.activeElement);
      cells[Math.max(0, Math.min(63, index + steps[e.key]))]?.focus();
    });
    this.create();
  }
  create() {
    this.element.replaceChildren(); this.cells.clear();
    const files = [...'abcdefgh']; const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
    if (this.flipped) { files.reverse(); ranks.reverse(); }
    for (const [row, rank] of ranks.entries()) for (const [col, file] of files.entries()) {
      const square = file + rank;
      const cell = document.createElement('button');
      cell.type = 'button'; cell.dataset.square = square;
      cell.className = `square ${(file.charCodeAt(0) + rank) % 2 ? 'light' : 'dark'}`;
      cell.innerHTML = `<span class="piece"></span><span class="marker"></span>${col === 0 ? `<span class="rank coord">${rank}</span>` : ''}${row === 7 ? `<span class="file coord">${file}</span>` : ''}`;
      this.cells.set(square, cell); this.element.append(cell);
    }
  }
  render(state, selected, moves = []) {
    const pieces = new Map(state.board.map(p => [p.square, p]));
    const last = state.history.at(-1);
    for (const [square, cell] of this.cells) {
      const piece = pieces.get(square);
      const key = piece ? piece.color + piece.type : '';
      if (cell.dataset.piece !== key) { cell.querySelector('.piece').innerHTML = piece ? character(piece.type, piece.color) : ''; cell.dataset.piece = key; }
      cell.classList.toggle('selected', square === selected);
      cell.classList.toggle('legal', moves.some(m => m.to === square));
      cell.classList.toggle('capture', moves.some(m => m.to === square && m.captured));
      cell.classList.toggle('last', last?.from === square || last?.to === square);
      cell.classList.toggle('check', state.check && piece?.type === 'k' && piece.color === state.turn);
      cell.setAttribute('aria-label', `${square}${piece ? `, ${piece.color === 'w' ? 'Light' : 'Dark'} ${pieceNames[piece.type]}` : ', empty'}${moves.some(m => m.to === square) ? ', legal destination' : ''}`);
      cell.setAttribute('aria-pressed', String(square === selected));
    }
  }
  flip() { this.flipped = !this.flipped; this.create(); }
}
