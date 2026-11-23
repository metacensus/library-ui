import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.HARNESS_PORT ?? 5919)

export default defineConfig({
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
  ],
  webServer: {
    // The next port serves the layout components composed in an Astro site, as the README shows.
    command: `node ../scripts/pdf-corpus.mjs && astro build --root site && node serve.mjs ${port}`,
    url: `http://localhost:${port}`,
  },
})
