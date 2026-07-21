import { defineConfig, devices } from "@playwright/test";

/**
 * 主 E2E 配置（CI 阻挡）：仅 mobile-dpr1。
 * 运行 boss-smoke.spec.ts（Layer A 程序化状态机）与 boss-real-input.spec.ts（Layer B 真实指针输入）。
 * 构建期开启 E2E 桥：webServer 用 build:e2e（vite build --mode e2e + .env.e2e）。
 * 端口 4173 独立，避免与本地 dev server(5173) 冲突。
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:4173",
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
  ],
  webServer: {
    command: "npm run build:e2e && npm run preview -- --host 0.0.0.0 --port 4173",
    port: 4173,
    reuseExistingServer: false,
  },
});
