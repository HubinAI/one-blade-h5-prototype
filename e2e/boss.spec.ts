import { test, expect } from "@playwright/test";

test.describe("首页", () => {
  test("突破状态显示玄甲雷将预览", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    // 设置突破状态的localStorage
    await page.goto("/?debug=1");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      const key = "one_blade_progress";
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      data.highestFloor = 6;
      localStorage.setItem(key, JSON.stringify(data));
    });
    await page.reload();
    await page.waitForLoadState("networkidle");

    // 验证Boss预览存在
    await expect(page.locator('[data-testid="thunder-general-preview"]')).toBeVisible();
    // 验证砍树动画不存在
    await expect(page.locator('[data-testid="idle-tree-animation"]')).not.toBeVisible();
    // 验证无页面错误
    expect(errors).toEqual([]);
  });
});
