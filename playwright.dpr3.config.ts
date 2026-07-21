import { defineConfig, devices } from "@playwright/test";

/**
 * 高DPR 非阻挡 E2E 配置（nightly / 非阻挡 job）。
 * 仅运行 boss-smoke.spec.ts，在 deviceScaleFactor=3 下验证：
 *   - 高DPR 画布尺寸与逻辑坐标偏差
 *   - 程序化状态机在高DPR渲染下不卡死、可推进
 * 不使用 isMobile/hasTouch：headless 下 isMobile 模拟会让 Chromium 对移动视口节流 rAF，
 * 导致 Boss 开场 intro 无法推进（这是早期 dpr3 失败的根因）。deviceScaleFactor 单独提升仅影响
 * 渲染分辨率（客户端坐标映射与 dpr 无关），可安全验证高DPR场景。
 * 该 job 在 CI 中 continue-on-error，不阻塞主链路。
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/boss-smoke.spec.ts",
  timeout: 90000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:4174",
    actionTimeout: 5000,
  },
  projects: [
    {
      name: "mobile-dpr3",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 430, height: 914 },
        deviceScaleFactor: 3,
      },
    },
  ],
  webServer: {
    command: "npm run build:e2e && npm run preview -- --host 0.0.0.0 --port 4174",
    port: 4174,
    reuseExistingServer: false,
  },
});
