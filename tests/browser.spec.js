import { test, expect } from '@playwright/test';
const square = (page, name) => page.locator(`[data-square="${name}"]`);
async function move(page, from, to) {
  await square(page, from).click(); await square(page, to).click();
  await expect(page.locator('#board')).not.toHaveAttribute('aria-busy', 'true');
}
test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.locator('.square')).toHaveCount(64); });
test('selection, legal destinations, capture, flip, undo and restart', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await expect(page.locator('#board .soldier')).toHaveCount(32);
  await square(page, 'e2').click();
  await expect(square(page, 'e3')).toHaveClass(/legal/); await expect(square(page, 'e4')).toHaveClass(/legal/);
  await square(page, 'e5').click(); await expect(page.locator('#turn-title')).toHaveText('Light to move');
  await move(page, 'e2', 'e4'); await move(page, 'd7', 'd5'); await move(page, 'e4', 'd5');
  await expect(page.locator('#board .soldier')).toHaveCount(31);
  await expect(square(page, 'd5')).toHaveAttribute('data-piece', 'wp');
  await page.getByRole('button', { name: 'Flip board' }).click();
  await expect(page.locator('.square').first()).toHaveAttribute('data-square', 'h1');
  await expect(square(page, 'd5')).toHaveAttribute('data-piece', 'wp');
  await page.getByRole('button', { name: 'Undo move' }).click();
  await expect(page.locator('#board .soldier')).toHaveCount(32);
  await page.getByRole('button', { name: 'New battle' }).click();
  await page.getByRole('button', { name: 'Start battle', exact: true }).click();
  await expect(page.locator('#turn-title')).toHaveText('Light to move');
  await expect(page.locator('#undo')).toBeDisabled(); expect(errors).toEqual([]);
});
test('checkmate stops moves and undo resumes', async ({ page }) => {
  for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) await move(page, from, to);
  await expect(page.locator('#status')).toHaveText('Dark army wins by checkmate');
  await expect(square(page, 'e1')).toHaveClass(/check/);
  await move(page, 'a2', 'a3'); await expect(square(page, 'a2')).toHaveAttribute('data-piece', 'wp');
  await page.locator('#undo').click(); await expect(page.locator('#turn-title')).toHaveText('Dark to move');
});
test('promotion dialog cancels without mutation and supports knight promotion', async ({ page }) => {
  for (const [from, to] of [['a2','a4'],['h7','h5'],['a4','a5'],['h5','h4'],['a5','a6'],['h4','h3'],['a6','b7'],['h3','g2']]) await move(page,from,to);
  await move(page,'b7','a8'); await expect(page.locator('#promotion')).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(square(page,'b7')).toHaveAttribute('data-piece','wp');
  await square(page,'a8').click();
  await page.locator('#promotion-options').getByRole('button',{name:'Knight'}).click();
  await expect(square(page,'a8')).toHaveAttribute('data-piece','wn');
  await page.locator('#undo').click(); await expect(square(page,'a8')).toHaveAttribute('data-piece','br');
});
test('responsive board and keyboard selection', async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await square(page,'e2').focus(); await page.keyboard.press('Enter');
  await expect(square(page,'e2')).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
  await expect(square(page,'e3')).toHaveAttribute('data-piece','wp');
});

async function slowMovement(page) {
  await page.evaluate(async () => {
    const { movementStyles } = await import('/js/animation.js');
    for (const style of Object.values(movementStyles)) style.duration = 10000;
  });
}
test('movement locks input, skip settles and undo restores the warrior', async ({ page }) => {
  await slowMovement(page);
  await square(page, 'e2').click(); await square(page, 'e4').click();
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.moving-warrior')).toHaveCount(1);
  await square(page, 'd7').click(); await square(page, 'd5').click();
  await expect(square(page, 'd7')).toHaveAttribute('data-piece', 'bp');
  await page.getByRole('button', { name: 'Skip movement' }).click();
  await expect(page.locator('.movement-layer')).toHaveCount(0);
  await expect(square(page, 'e4')).toHaveAttribute('data-piece', 'wp');
  await page.locator('#undo').click();
  await expect(square(page, 'e2')).toHaveAttribute('data-piece', 'wp');
});
test('undo and flip during motion clean up all transient warriors', async ({ page }) => {
  await slowMovement(page);
  await square(page, 'e2').click(); await square(page, 'e4').click();
  await page.locator('#undo').click();
  await expect(page.locator('.movement-layer')).toHaveCount(0);
  await expect(square(page, 'e2')).toHaveAttribute('data-piece', 'wp');
  await square(page, 'e2').click(); await square(page, 'e4').click();
  await page.locator('#flip').click();
  await expect(page.locator('.movement-layer')).toHaveCount(0);
  await expect(square(page, 'e4')).toHaveAttribute('data-piece', 'wp');
  expect(await square(page, 'e4').locator('.piece').evaluate(node => node.style.visibility)).toBe('');
});
test('reduced motion and movement toggle bypass travel', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await move(page, 'e2', 'e4');
  await expect(page.locator('.movement-layer')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByLabel('Warrior movement').uncheck();
  await move(page, 'e7', 'e5');
  await expect(page.locator('.movement-layer')).toHaveCount(0);
});
test('castling animates king and guardian together, then settles both squares', async ({ page }) => {
  await page.getByLabel('Warrior movement').uncheck();
  for (const [from, to] of [['g1', 'f3'], ['g8', 'f6'], ['e2', 'e3'], ['e7', 'e6'], ['f1', 'e2'], ['f8', 'e7']]) await move(page, from, to);
  await page.getByLabel('Warrior movement').check();
  await slowMovement(page);
  await square(page, 'e1').click(); await square(page, 'g1').click();
  await expect(page.locator('.moving-warrior')).toHaveCount(2);
  await page.getByRole('button', { name: 'Skip movement' }).click();
  await expect(square(page, 'g1')).toHaveAttribute('data-piece', 'wk');
  await expect(square(page, 'f1')).toHaveAttribute('data-piece', 'wr');
  await expect(square(page, 'h1')).toHaveAttribute('data-piece', '');
  await expect(page.locator('.movement-layer')).toHaveCount(0);
});

async function capturePosition(page) {
  await move(page, 'e2', 'e4'); await move(page, 'd7', 'd5');
  await pauseBattles(page);
}
async function pauseBattles(page) {
  // Pause actual Web Animations so cleanup/input assertions are deterministic.
  await page.evaluate(() => {
    const original = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = original.apply(this, args);
      if (this.closest('.combat-layer')) animation.pause();
      return animation;
    };
  });
}
test('capture shows one battle, locks input, and skipping settles exactly one capture', async ({ page }) => {
  await capturePosition(page);
  await square(page, 'e4').click(); await square(page, 'd5').click();
  await expect(page.locator('.combat-layer')).toHaveCount(1);
  await expect(page.locator('.combat-attacker')).toHaveCount(1);
  await expect(page.locator('.combat-defender')).toHaveCount(1);
  await expect(page.locator('.combat-impact')).toHaveCount(1);
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'true');
  await square(page, 'd8').click(); await square(page, 'd5').click();
  await expect(square(page, 'd8')).toHaveAttribute('data-piece', 'bq');
  await page.getByRole('button', { name: 'Skip battle' }).click();
  await expect(page.locator('.movement-layer')).toHaveCount(0);
  await expect(square(page, 'd5')).toHaveAttribute('data-piece', 'wp');
  await expect(page.locator('#board .soldier')).toHaveCount(31);
  await expect(page.locator('#move-count')).toHaveText('3 moves');
});
test('undo and restart during combat restore both armies without stuck pieces', async ({ page }) => {
  await capturePosition(page);
  await square(page, 'e4').click(); await square(page, 'd5').click();
  await page.locator('#undo').click();
  await expect(page.locator('.movement-layer')).toHaveCount(0);
  await expect(square(page, 'e4')).toHaveAttribute('data-piece', 'wp');
  await expect(square(page, 'd5')).toHaveAttribute('data-piece', 'bp');
  await square(page, 'e4').click(); await square(page, 'd5').click();
  await page.locator('#restart').click();
  await page.getByRole('button', { name: 'Start battle', exact: true }).click();
  await expect(page.locator('.movement-layer')).toHaveCount(0);
  await expect(page.locator('#board .soldier')).toHaveCount(32);
  await expect(page.locator('#move-count')).toHaveText('0 moves');
  expect(await page.locator('#board .piece').evaluateAll(nodes => nodes.every(node => node.style.visibility !== 'hidden'))).toBe(true);
});
test('capture toggle and reduced motion bypass battles', async ({ page }) => {
  await capturePosition(page);
  await page.getByLabel('Capture battles').uncheck();
  await move(page, 'e4', 'd5');
  await expect(page.locator('.combat-layer')).toHaveCount(0);
  await page.locator('#undo').click();
  await page.getByLabel('Capture battles').check();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await move(page, 'e4', 'd5');
  await expect(page.locator('.movement-layer')).toHaveCount(0);
  await expect(square(page, 'd5')).toHaveAttribute('data-piece', 'wp');
});

test('mage fires a projectile while holding position, then settles on the captured square', async ({ page }) => {
  for (const [from, to] of [['g2', 'g3'], ['e7', 'e5'], ['f1', 'g2'], ['d7', 'd5']]) await move(page, from, to);
  await pauseBattles(page);
  await square(page, 'g2').click(); await square(page, 'd5').click();
  await expect(page.locator('.combat-layer')).toHaveAttribute('data-attack', 'Arcane bolt');
  await expect(page.locator('.combat-projectile')).toHaveCount(1);
  const position = await page.evaluate(() => {
    const layer = document.querySelector('.combat-layer');
    for (const animation of layer.getAnimations({ subtree: true })) animation.currentTime = 720;
    const projectile = layer.querySelector('.combat-projectile').getBoundingClientRect();
    const destination = document.querySelector('[data-square="d5"]').getBoundingClientRect();
    const attacker = new DOMMatrixReadOnly(getComputedStyle(layer.querySelector('.combat-attacker')).transform);
    return { dx: projectile.left - destination.left, dy: projectile.top - destination.top, ax: attacker.m41, ay: attacker.m42 };
  });
  expect(Math.abs(position.dx)).toBeLessThan(2);
  expect(Math.abs(position.dy)).toBeLessThan(2);
  expect(position.ax).toBe(0); expect(position.ay).toBe(0);
  await page.getByRole('button', { name: 'Skip battle' }).click();
  await expect(page.locator('.combat-projectile')).toHaveCount(0);
  await expect(square(page, 'd5')).toHaveAttribute('data-piece', 'wb');
});
