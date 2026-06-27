const { defineConfig } = require('@playwright/test');

// Browser smoke tests for the built tkg.html. Run: npx playwright test
module.exports = defineConfig({
  testDir: './tests/ui',
  globalSetup: require.resolve('./tests/ui/global-setup.js'),
  fullyParallel: true,
  reporter: 'line',
  use: {
    headless: true,
  },
});
