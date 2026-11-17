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
    command: `node ../scripts/pdf-corpus.mjs && node serve.mjs ${port}`,
    url: `http://localhost:${port}`,
  },
})
