import { Movement } from '../../js/animation.js';

export function fixture({ reduced = false, hidden = false, animate = true } = {}) {
  const nodes = [];
  const listeners = new Map();
  const media = { matches: reduced, addEventListener() {}, removeEventListener() {} };
  const animations = [];
  const node = () => {
    const item = {
      style: { visibility: '', setProperty() {} },
      classList: { add() {}, remove() {} },
      children: [], clientLeft: 1, clientTop: 1,
      setAttribute(name, value) { this.attributes ||= new Map(); this.attributes.set(name, value); },
      getAttribute(name) { return this.attributes?.get(name) ?? null; },
      removeAttribute(name) { this.attributes?.delete(name); },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 80, height: 80 }),
      append(child) { this.children.push(child); child.parent = this; },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); },
      querySelector(selector) {
        this.parts ||= new Map();
        if (!this.parts.has(selector)) this.parts.set(selector, node());
        return this.parts.get(selector);
      },
      animate(keyframes, options) {
        let resolve, reject;
        const finished = new Promise((yes, no) => { resolve = yes; reject = no; });
        const animation = { node: this, keyframes, options, finished, cancel: () => reject(new Error('cancelled')), finish: resolve };
        animations.push(animation); return animation;
      },
    };
    nodes.push(item); return item;
  };
  const document = {
    hidden,
    createElement: node,
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: name => listeners.delete(name),
    defaultView: {
      matchMedia: () => media,
      addEventListener: (name, handler) => listeners.set(name, handler),
      removeEventListener: name => listeners.delete(name),
    },
  };
  const frame = node(); const element = node(); element.parentElement = frame; element.ownerDocument = document;
  if (!animate) element.animate = undefined;
  const cells = new Map();
  for (const file of 'abcdefgh') for (let rank = 1; rank <= 8; rank++) {
    const cell = node();
    cell.getBoundingClientRect = () => ({ left: 'abcdefgh'.indexOf(file) * 80, top: (8 - rank) * 80, width: 80, height: 80 });
    cell.piece = node(); cell.querySelector = () => cell.piece;
    cells.set(file + rank, cell);
  }
  const board = { element, cells, render() {} };
  return { board, frame, document, listeners, animations, movement: new Movement(board) };
}

