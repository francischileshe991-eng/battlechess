import { test, expect } from '@playwright/test';

const sizes = [
  { width: 320, height: 568 }, { width: 360, height: 640 },
  { width: 390, height: 844 }, { width: 430, height: 932 },
  { width: 768, height: 1024 }, { width: 820, height: 1180 },
  { width: 844, height: 390 }, { width: 1024, height: 768 },
  { width: 1280, height: 800 },
];
const cell = (page, square) => page.locator(`[data-square="${square}"]`);
async function noHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test('board, expanded settings, and controls fit phone, tablet and desktop widths', async ({ page }) => {
  for (const viewport of sizes) {
    await page.setViewportSize(viewport); await page.goto('/');
    await expect(page.locator('.square')).toHaveCount(64);
    await noHorizontalOverflow(page);
    const board = await page.locator('#board').boundingBox();
    expect(Math.abs(board.width - board.height)).toBeLessThan(1);
    expect(board.x).toBeGreaterThanOrEqual(0);
    expect(board.x + board.width).toBeLessThanOrEqual(viewport.width + 1);
    const square = await cell(page, 'e2').boundingBox();
    expect(Math.abs(square.width - square.height)).toBeLessThan(1);
    if (viewport.width <= 820 && viewport.height > viewport.width) expect(board.width).toBeGreaterThan(Math.min(viewport.width - 70, 620));
    const frame = await page.locator('.board-frame').boundingBox();
    const controls = await page.locator('.controls').boundingBox();
    expect(controls.y).toBeGreaterThanOrEqual(frame.y + frame.height);
    expect(controls.y - frame.y - frame.height).toBeLessThan(100);
    for (const id of ['undo', 'flip', 'restart', 'audio-toggle', 'preview-audio']) {
      const target = await page.locator(`#${id}`).boundingBox();
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.width).toBeGreaterThanOrEqual(44);
    }
    await page.getByLabel('Game mode').selectOption('computer');
    await expect(page.locator('#ai-options')).toBeVisible();
    await noHorizontalOverflow(page);
    await page.evaluate(() => {
      document.getElementById('audio-state').textContent = 'NotAllowedError: ' + 'AudioDeviceUnavailable'.repeat(12);
    });
    await noHorizontalOverflow(page);
  }
});

test('tap selection, flip and undo work with the compact board status', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch interaction requires a mobile browser project.');
  await page.setViewportSize({ width: 360, height: 740 }); await page.goto('/');
  await expect(page.locator('.square')).toHaveCount(64);
  await cell(page, 'e2').tap(); await expect(cell(page, 'e4')).toHaveClass(/legal/);
  await cell(page, 'e4').tap(); await expect(cell(page, 'e4')).toHaveAttribute('data-piece', 'wp');
  await expect(page.locator('#board-turn')).toHaveText('Dark to move');
  await page.locator('#flip').tap();
  await expect(page.locator('.square').first()).toHaveAttribute('data-square', 'h1');
  await page.locator('#undo').tap();
  await expect(cell(page, 'e2')).toHaveAttribute('data-piece', 'wp');
  await expect(page.locator('#board-turn')).toHaveText('Light to move');
  await noHorizontalOverflow(page);
});

test('changing orientation during a move reconciles the board and clears animation actors', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.locator('.square')).toHaveCount(64);
  await page.evaluate(async () => { (await import('/js/animation.js')).movementStyles.n.duration = 10000; });
  await cell(page, 'g1').click(); await cell(page, 'f3').click();
  await expect(page.locator('.movement-layer')).toHaveCount(1);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('.movement-layer')).toHaveCount(0);
  await expect(cell(page, 'f3')).toHaveAttribute('data-piece', 'wn');
  expect(await cell(page, 'f3').locator('.piece').evaluate(node => node.style.visibility)).not.toBe('hidden');
  await noHorizontalOverflow(page);
});

test('promotion choices stay inside a small phone viewport and remain tappable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await page.goto('/');
  await expect(page.locator('.square')).toHaveCount(64);
  await page.getByLabel('Warrior movement').uncheck();
  await page.getByLabel('Capture battles').uncheck();
  for (const [from, to] of [['a2','a4'],['h7','h5'],['a4','a5'],['h5','h4'],['a5','a6'],['h4','h3'],['a6','b7'],['h3','g2'],['b7','a8']]) {
    await cell(page, from).click(); await cell(page, to).click();
  }
  await expect(page.locator('#promotion')).toBeVisible();
  const dialog = await page.locator('#promotion').boundingBox();
  expect(dialog.x).toBeGreaterThanOrEqual(0); expect(dialog.x + dialog.width).toBeLessThanOrEqual(320);
  expect(dialog.y).toBeGreaterThanOrEqual(0); expect(dialog.y + dialog.height).toBeLessThanOrEqual(568);
  for (const button of await page.locator('#promotion-options button').all()) {
    const box = await button.boundingBox(); expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#promotion-options').getByRole('button', { name: 'Knight' }).click();
  await expect(cell(page, 'a8')).toHaveAttribute('data-piece', 'wn');
  await noHorizontalOverflow(page);
});
