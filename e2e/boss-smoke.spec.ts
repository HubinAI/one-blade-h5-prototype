import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf-8"));
const expectedVersion = `V${packageJson.version.replace(/\./g, "")}`;

/**
 * Layer A — Boss 状态机浏览器 Smoke（程序化）
 * 通过 __ONE_BLADE_E2E__ 桥程序化推进 Boss 状态机，验证：
 *   - 阶段可推进（armor → pursuit → core_break → execution_intro）
 *   - 状态映射正确（armor/pursuit 进度字符串）
 *   - 不会卡死（能到达 execution_intro）
 * 该层不使用真实鼠标拖拽，100% 稳定，作为 CI 阻挡测试。
 * 真实指针输入覆盖见 boss-real-input.spec.ts。
 */
test.describe("Boss状态机浏览器Smoke", () => {
  test(`首页版本号精确为${expectedVersion}且无Console错误`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") pageErrors.push(msg.text());
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const versionText = await page.locator(".version-footer").textContent();
    expect(versionText).toContain(expectedVersion);
    expect(pageErrors).toEqual([]);
  });

  test("程序化推进 armor0/3→3/3 → pursuit0/3→3/3 → execution_intro", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") pageErrors.push(msg.text());
    });

    // 设置突破状态
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      const key = "one_blade_v04_progression";
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      data.highestFloor = 6;
      localStorage.setItem(key, JSON.stringify(data));
    });
    await page.reload();
    await page.waitForLoadState("networkidle");

    // 点击突破（首页突破卡片h2与开始按钮span都会出现"练气突破"，
    // 用 button role + 正则精确定位开始按钮，避免 strict-mode 多匹配冲突）
    await page.getByRole("button", { name: /练气突破/ }).click();

    // 等待Canvas可见
    await expect(page.locator("canvas")).toBeVisible();

    // 等待E2E桥创建（e2e 构建期已暴露）
    await expect.poll(async () =>
      page.evaluate(() => typeof window.__ONE_BLADE_E2E__ !== "undefined")
    , { timeout: 10000 }).toBe(true);

    // 跳过开场动画，加速到达 armor（e2e-only 调试方法，不验证 intro 计时）
    await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.skipIntro());

    // 等待Boss进入armor阶段
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 10000 }).toBe("armor");

    let state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state.armorProgress).toBe("0/3");
    expect(state.pursuitProgress).toBe("0/3");

    // 破甲：等待可命中状态 → 单次严格程序化命中 → 严格断言进度（无内部retry）
    for (let i = 1; i <= 3; i++) {
      await expect.poll(async () =>
        page.evaluate(() => window.__ONE_BLADE_E2E__.getState().inputLocked)
      , { timeout: 8000 }).toBe(false);

      const ok = await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.slashArmor());
      expect(ok).toBe(true);

      await expect.poll(async () => {
        const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
        return s.armorProgress;
      }, { timeout: 5000 }).toBe(`${i}/3`);
    }

    // 等待进入pursuit（armor_complete_hold 0.35s + pursuit_intro 0.9s ≈ 1.25s）
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 15000 }).toBe("pursuit");

    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state.pursuitProgress).toBe("0/3");

    // 追击：等待可命中状态 → 单次严格程序化命中 → 严格断言进度（无内部retry）
    for (let i = 1; i <= 3; i++) {
      await expect.poll(async () =>
        page.evaluate(() => window.__ONE_BLADE_E2E__.getState().inputLocked)
      , { timeout: 8000 }).toBe(false);

      const ok = await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.slashCore());
      expect(ok).toBe(true);

      await expect.poll(async () => {
        const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
        return s.pursuitProgress;
      }, { timeout: 5000 }).toBe(`${i}/3`);
    }

    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(["core_break", "execution_intro"]).toContain(state.phase);

    // 等待进入execution_intro（core_break 1.2s）
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 20000 }).toBe("execution_intro");

    // 无页面错误
    expect(pageErrors).toEqual([]);
  });
});
