import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "http://localhost:5173",
    actionTimeout: 5000,
  },
  projects: [
    {
      name: "mobile-dpr1",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 430, height: 914 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: "mobile-dpr3",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 430, height: 914 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: {
    command: "npm run preview -- --host 0.0.0.0 --port 5173",
    port: 5173,
    reuseExistingServer: true,
  },
});
