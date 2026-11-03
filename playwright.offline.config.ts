import { defineConfig } from '@playwright/test';
import browserChecks from './playwright.config';

export default defineConfig({
  ...browserChecks,
  testDir: './tests/offline',
  testIgnore: [],
  webServer: undefined,
});
