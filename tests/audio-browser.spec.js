import { test, expect } from '@playwright/test';

test('audio is opt-in, volume controls work, and muting suspends playback', async ({ page }) => {
  await page.addInitScript(() => {
    // Enforce Firefox's receiver contract even when this test uses Chromium.
    const nativeInterval = window.setInterval;
    const nativeClearInterval = window.clearInterval;
    window.setInterval = function (...args) {
      if (this !== window) throw new TypeError('setInterval requires Window');
      return nativeInterval.apply(window, args);
    };
    window.clearInterval = function (...args) {
      if (this !== window) throw new TypeError('clearInterval requires Window');
      return nativeClearInterval.apply(window, args);
    };
    const Context = window.AudioContext || window.webkitAudioContext;
    window.testAudioContexts = [];
    window.AudioContext = class extends Context {
      constructor(...args) { super(...args); window.testAudioContexts.push(this); }
    };
  });
  await page.goto('/'); await expect(page.locator('.square')).toHaveCount(64);
  expect(await page.evaluate(() => window.testAudioContexts.length)).toBe(0);
  await page.getByRole('button', { name: 'Enable audio', exact: true }).click();
  await expect(page.locator('#audio-badge')).toHaveText('On');
  expect(await page.evaluate(() => window.testAudioContexts.length)).toBe(1);
  await page.getByRole('button', { name: 'Test sound', exact: true }).click();
  expect(await page.evaluate(() => window.testAudioContexts.length)).toBe(1);
  await page.locator('#master-volume').evaluate(node => { node.value = '20'; node.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('#master-volume-value')).toHaveText('20%');
  await page.getByLabel('Gregorian-style chant').uncheck();
  await page.getByLabel('Defeat screams & cries').uncheck();
  await page.getByLabel('Enable sound').uncheck();
  await expect(page.locator('#audio-badge')).toHaveText('Off');
  await expect.poll(() => page.evaluate(() => window.testAudioContexts[0].state)).toBe('suspended');
});

test('a blocked AudioContext exposes the reason beside the board', async ({ page }) => {
  await page.addInitScript(() => {
    window.AudioContext = class { constructor() { throw new DOMException('Audio is blocked for this site', 'NotAllowedError'); } };
  });
  await page.goto('/'); await expect(page.locator('.square')).toHaveCount(64);
  await page.getByRole('button', { name: 'Test sound', exact: true }).click();
  await expect(page.locator('#audio-state')).toContainText('NotAllowedError: Audio is blocked for this site');
  await expect(page.locator('#sound-enabled')).not.toBeChecked();
  await expect(page.locator('#audio-toggle')).toHaveText('Enable audio');
});

test('piece-specific capture previews expose separate shout and voice controls', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('.square')).toHaveCount(64);
  await page.getByLabel('Attacker', { exact: true }).selectOption('b');
  await page.getByLabel('Captured', { exact: true }).selectOption('n');
  await page.getByRole('button', { name: 'Preview battle', exact: true }).click();
  await expect(page.locator('#audio-badge')).toHaveText('On');
  await page.getByLabel('Attack shouts', { exact: true }).uncheck();
  await page.getByLabel('Defeat screams & cries', { exact: true }).uncheck();
  await page.locator('#voices-volume').evaluate(node => { node.value = '35'; node.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('#voices-volume-value')).toHaveText('35%');
  await expect(page.locator('#board .soldier')).toHaveCount(32);
  await expect(page.locator('#move-count')).toHaveText('0 moves');
  await page.getByRole('button', { name: 'Mute audio', exact: true }).click();
  await expect(page.locator('#audio-badge')).toHaveText('Off');
});
