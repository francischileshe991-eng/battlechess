import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '*.spec.js',
  use: { baseURL: 'http://127.0.0.1:5173' },
  webServer: { command: 'npm start', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } }, { name: 'firefox', use: { ...devices['Desktop Firefox'] } }, { name: 'safari', use: { ...devices['iPhone 13'], browserName: 'webkit' } }],
});
