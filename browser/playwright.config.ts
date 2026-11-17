import { defineConfig, devices } from '@playwright/test'

const port = 5919

export default defineConfig({
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
  ],
  webServer: {
    command: `node serve.mjs ${port}`,
    url: `http://localhost:${port}`,
  },
})
