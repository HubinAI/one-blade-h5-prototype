import { test, expect } from "@playwright/test";

/**
 * P4.4B-R5.2 P0-4: Reactive Boss 全 Pointer 三甲→pursuit E2E
 *
 * 审计 §P0-4 指出：playwright.config.ts 已写入 boss-reactive-full-pointer.spec.ts 但文件不存在。
 *
 * 全程只能使用 page.mouse 真实输入，禁止 slashArmor/setProgrammaticSlashEnergy/resolveSegment/resolveGeometry/finishSlash。
 * 必须完成：左肩→右肩→胸甲→bridge→pursuit。
 *
 * 运行：npm run build:e2e && npx playwright test e2e/boss-reactive-full-pointer.spec.ts
 */
test.describe("Reactive Boss 全Pointer三甲→pursuit", () => {
  test("真实鼠标完成三甲并进入追击", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") pageErrors.push(msg.text());
    });

    await page.goto("/?bossFlow=reactive");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      const key = "one_blade_v04_progression";
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      data.highestFloor = 6;
      localStorage.setItem(key, JSON.stringify(data));
    });
    await page.reload();
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /练气突破/ }).click();
    await expect(page.locator("canvas")).toBeVisible();

    await expect.poll(async () =>
      page.evaluate(() => typeof window.__ONE_BLADE_E2E__ !== "undefined")
    , { timeout: 10000 }).toBe(true);

    // 辅助：用真实鼠标拖拽破当前护甲（高刀势一刀碎）
    async function breakCurrentArmorWithMouse() {
      // 等待 opportunity
      await expect.poll(async () => {
        const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
        return s.phase;
      }, { timeout: 15000 }).toBe("armor_opportunity");

      // 读取护甲世界坐标
      const targets = await page.evaluate(() => window.__ONE_BLADE_E2E__.getTargets());
      const armorPos = (targets.armorTargets as any[])?.[0];
      if (!armorPos) throw new Error("No armor target");

      // canvas 坐标换算
      const canvasBox = await page.locator("canvas").boundingBox();
      const scaleX = canvasBox!.width / 390;
      const scaleY = canvasBox!.height / 844;

      // 从护甲右侧向左拖拽（穿过护甲中心，高刀势一刀碎）
      const startX = canvasBox!.x + (armorPos.cx + 60) * scaleX;
      const startY = canvasBox!.y + (armorPos.cy) * scaleY;
      const endX = canvasBox!.x + (armorPos.cx - 60) * scaleX;
      const endY = canvasBox!.y + (armorPos.cy) * scaleY;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await page.mouse.move(
          startX + (endX - startX) * t,
          startY + (endY - startY) * t,
        );
        await page.waitForTimeout(15);
      }
      await page.mouse.up();
      await page.waitForTimeout(400);
    }

    // 左肩
    await breakCurrentArmorWithMouse();
    // 右肩
    await breakCurrentArmorWithMouse();
    // 胸甲
    await breakCurrentArmorWithMouse();

    // 等待 bridge → pursuit
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.gameMode;
    }, { timeout: 20000 }).toBe("boss");

    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 15000 }).toBe("pursuit");

    expect(pageErrors).toEqual([]);
  });
});
