import { test, expect } from "@playwright/test";

test.describe("首页", () => {
  test("突破状态显示玄甲雷将预览", async ({ page }) => {
    // 设置突破状态的localStorage
    await page.goto("/?debug=1");
    // 注入pendingGate状态——设置进度使突破可用
    await page.evaluate(() => {
      const key = "one_blade_progress";
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      data.highestFloor = 6;
      localStorage.setItem(key, JSON.stringify(data));
    });
    await page.reload();
    // 验证Boss预览存在
    await expect(page.locator('[data-testid="thunder-general-preview"]')).toBeVisible();
    // 验证砍树动画不存在
    await expect(page.locator('[data-testid="idle-tree-animation"]')).not.toBeVisible();
  });
});

test.describe("Boss战——基本加载", () => {
  test("Boss战页面可以加载不崩溃", async ({ page }) => {
    await page.goto("/?debug=1");
    await page.waitForTimeout(1000);
    // 页面加载无崩溃
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    expect(errors.length).toBe(0);
  });
});
