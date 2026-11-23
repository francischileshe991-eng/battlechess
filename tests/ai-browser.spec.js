import { test, expect } from '@playwright/test';

async function fakeEngine(page) {
  await page.addInitScript(() => {
    window.testEngines = [];
    window.Worker = class {
      constructor() { this.messages = []; this.terminated = false; window.testEngines.push(this); }
      postMessage(command) {
        this.messages.push(command);
        if (command === 'uci' || command === 'isready') {
          queueMicrotask(() => this.emit(command === 'uci' ? 'uciok' : 'readyok'));
        }
      }
      emit(data) { this.onmessage?.({ data }); }
      terminate() { this.terminated = true; }
    };
  });
}
const cell = (page, square) => page.locator(`[data-square="${square}"]`);
async function openGame(page) {
  await page.goto('/'); await expect(page.locator('.square')).toHaveCount(64);
  await page.getByLabel('Warrior movement').uncheck();
  await page.getByLabel('Capture battles').uncheck();
}
async function humanMove(page) {
  await cell(page, 'e2').click(); await cell(page, 'e4').click();
  await expect.poll(() => page.evaluate(() => window.testEngines.at(-1)?.messages.some(message => message.startsWith('go ')))).toBe(true);
}

test('local play loads no worker; computer replies once and undo takes back both moves', async ({ page }) => {
  await fakeEngine(page); await openGame(page);
  expect(await page.evaluate(() => window.testEngines.length)).toBe(0);
  await page.getByLabel('Game mode').selectOption('computer');
  await humanMove(page);
  await expect(page.locator('#opponent-status')).toHaveText('Stockfish is thinking…');
  await cell(page, 'd7').click(); await cell(page, 'd5').click();
  await expect(cell(page, 'd7')).toHaveAttribute('data-piece', 'bp');
  await page.evaluate(() => window.testEngines[0].emit('bestmove e7e5'));
  await expect(cell(page, 'e5')).toHaveAttribute('data-piece', 'bp');
  await expect(page.locator('#move-count')).toHaveText('2 moves');
  await page.getByRole('button', { name: 'Undo turn' }).click();
  await expect(page.locator('#move-count')).toHaveText('0 moves');
  await expect(cell(page, 'e2')).toHaveAttribute('data-piece', 'wp');
});
test('undo while thinking discards a late worker response', async ({ page }) => {
  await fakeEngine(page); await openGame(page);
  await page.getByLabel('Game mode').selectOption('computer'); await humanMove(page);
  await page.getByRole('button', { name: 'Undo turn' }).click();
  await page.evaluate(() => window.testEngines[0].emit('bestmove e7e5'));
  await expect(page.locator('#move-count')).toHaveText('0 moves');
  expect(await page.evaluate(() => window.testEngines[0].terminated)).toBe(true);
});
test('playing dark schedules the opening and switching to local cancels it', async ({ page }) => {
  await fakeEngine(page); await openGame(page);
  await page.getByLabel('Game mode').selectOption('computer');
  await page.getByLabel('Your army').selectOption('b');
  await expect.poll(() => page.evaluate(() => window.testEngines.length)).toBe(1);
  await expect(page.locator('#undo')).toBeDisabled();
  await page.getByLabel('Game mode').selectOption('local');
  await page.evaluate(() => window.testEngines[0].emit('bestmove e2e4'));
  await expect(page.locator('#move-count')).toHaveText('0 moves');
  await cell(page, 'e2').click(); await cell(page, 'e4').click();
  await expect(page.locator('#move-count')).toHaveText('1 move');
});
test('settings restart the search; engine failure offers retry and local recovery', async ({ page }) => {
  await fakeEngine(page); await openGame(page);
  await page.getByLabel('Game mode').selectOption('computer'); await humanMove(page);
  await page.getByLabel('Difficulty').selectOption('easy');
  await page.getByLabel('Thinking time').selectOption('250');
  await expect.poll(() => page.evaluate(() => window.testEngines.at(-1)?.messages.includes('go depth 4 movetime 250'))).toBe(true);
  await page.evaluate(() => window.testEngines.at(-1).onerror());
  await expect(page.locator('#ai-error')).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#ai-error')).toBeHidden();
  await page.evaluate(() => window.testEngines.at(-1).onerror());
  await page.getByRole('button', { name: 'Local play', exact: true }).click();
  await expect(page.locator('#play-mode')).toHaveValue('local');
  await cell(page, 'e7').click(); await cell(page, 'e5').click();
  await expect(page.locator('#move-count')).toHaveText('2 moves');
});
test('actual downloaded Stockfish responds through a real browser worker', async ({ page }) => {
  test.skip(process.env.SHADOW_CHESS_REAL_AI !== '1', 'Requires downloaded engine assets; set SHADOW_CHESS_REAL_AI=1.');
  await openGame(page);
  await page.getByLabel('Game mode').selectOption('computer');
  await page.getByLabel('Difficulty').selectOption('easy');
  await page.getByLabel('Thinking time').selectOption('250');
  await page.getByLabel('Your army').selectOption('b');
  await expect(page.locator('#move-count')).toHaveText('1 move', { timeout: 40000 });
  await expect(page.locator('#turn-title')).toHaveText('Dark to move');
  await expect(page.locator('#ai-error')).toBeHidden();
});
