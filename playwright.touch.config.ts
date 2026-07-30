import { defineConfig, devices } from "@playwright/test";

/**
 * 真实触摸输入非阻挡 E2E 配置（发布前补充，审计五）。
 * 运行 boss-touch.spec.ts：通过 CDP Input.dispatchTouchEvent 派发真实 touch 指针，
 * 验证 pointerType=touch、触摸滑动、pointercancel 输入清空。
 * hasTouch:true（不启用 isMobile，避免 rAF 节流）；deviceScaleFactor=1。
 * 该 job 在 CI 中 continue-on-error，不阻塞主链路。
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/boss-touch.spec.ts",
  timeout: 60000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:4175",
    actionTimeout: 5000,
  },
  projects: [
    {
      name: "mobile-touch",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 430, height: 914 },
        deviceScaleFactor: 1,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "npm run build:e2e && npm run preview -- --host 0.0.0.0 --port 4175",
    port: 4175,
    reuseExistingServer: false,
  },
});
