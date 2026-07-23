import { test, expect } from "@playwright/test";

/**
 * P4.4B-R4 P0-C: Reactive Boss 真实 Pointer E2E（审计 §11.2）
 *
 * 审计文档核心诊断：
 * "玩家看到的是'发光刀身击中了护甲'，代码判定的却只是'手指采样点之间的细线是否穿过护甲中心'。"
 *
 * 本测试使用真实 page.mouse 事件（非程序化中心线），验证：
 * 1. 手指轨迹本身不穿过护甲中心
 * 2. 但可见刀身/刀尖穿过护甲（通过 P0-A 的 ReactiveSlashGeometry 统一几何）
 * 3. 护甲耐久下降
 *
 * 运行方式：需要 e2e 构建模式（__E2E_BRIDGE__=true）
 *   npx vite build --mode e2e --outDir dist_e2e
 *   npx playwright test e2e/boss-reactive-real-input.spec.ts
 */
test.describe("Reactive Boss 真实 Pointer 命中验证", () => {
  test("真实鼠标拖拽——刀尖穿过护甲时护甲耐久下降", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") pageErrors.push(msg.text());
    });

    // 设置突破状态 + reactive 模式
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

    // 点击突破
    await page.getByRole("button", { name: /练气突破/ }).click();
    await expect(page.locator("canvas")).toBeVisible();

    // 等待 E2E 桥
    await expect.poll(async () =>
      page.evaluate(() => typeof window.__ONE_BLADE_E2E__ !== "undefined")
    , { timeout: 10000 }).toBe(true);

    // 等待进入 armor_opportunity（reactive 模式无 intro，直接进入 armor_prepare→threat→opportunity）
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 15000 }).toBe("armor_opportunity");

    // 读取护甲世界坐标（乘 bossRenderScale 后的）
    const targets = await page.evaluate(() => window.__ONE_BLADE_E2E__.getTargets());
    const armorPos = targets.armorTargets?.[0] as { cx: number; cy: number; rx: number; ry: number } | undefined;
    expect(armorPos).toBeDefined();

    // 读取护甲耐久（命中前）
    const stateBefore = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    const durabilityBefore = stateBefore.armorDurability?.[0] ?? 100;

    // 真实鼠标拖拽：手指轨迹不穿过护甲中心，但刀尖延伸到护甲区域
    // 从护甲右侧 60px 处开始，向左下方拖拽，让刀尖（visualLength≈30-130px）穿过护甲
    const startX = armorPos!.cx + 80;
    const startY = armorPos!.cy - 40;
    const endX = armorPos!.cx - 40;
    const endY = armorPos!.cy + 60;

    // 获取 canvas 边界框（用于坐标换算）
    const canvasBox = await page.locator("canvas").boundingBox();
    expect(canvasBox).not.toBeNull();

    // 设计分辨率 390×844，canvas 可能被缩放
    const scaleX = canvasBox!.width / 390;
    const scaleY = canvasBox!.height / 844;

    const screenStartX = canvasBox!.x + startX * scaleX;
    const screenStartY = canvasBox!.y + startY * scaleY;
    const screenEndX = canvasBox!.x + endX * scaleX;
    const screenEndY = canvasBox!.y + endY * scaleY;

    // 真实 Pointer 事件：down → move（多步采样）→ up
    await page.mouse.move(screenStartX, screenStartY);
    await page.mouse.down();
    // 分多步移动，确保采样点足够（reactiveSlash.activationDistance=14px）
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(
        screenStartX + (screenEndX - screenStartX) * t,
        screenStartY + (screenEndY - screenStartY) * t,
      );
      await page.waitForTimeout(20);
    }
    await page.mouse.up();

    // 等待收刀结算
    await page.waitForTimeout(300);

    // 断言护甲耐久下降（P0-A 统一刀体几何后，刀尖穿过护甲应命中）
    const stateAfter = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    const durabilityAfter = stateAfter.armorDurability?.[0] ?? 100;

    // 容错：如果第一刀没命中（时机/方向问题），至少验证没有 page error
    if (durabilityAfter >= durabilityBefore) {
      // 刀尖方向可能未对准护甲，尝试第二次（从不同角度）
      const startX2 = armorPos!.cx - 80;
      const startY2 = armorPos!.cy + 40;
      const endX2 = armorPos!.cx + 40;
      const endY2 = armorPos!.cy - 60;
      const screenStartX2 = canvasBox!.x + startX2 * scaleX;
      const screenStartY2 = canvasBox!.y + startY2 * scaleY;
      const screenEndX2 = canvasBox!.x + endX2 * scaleX;
      const screenEndY2 = canvasBox!.y + endY2 * scaleY;

      // 等待下一次 opportunity
      await expect.poll(async () => {
        const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
        return s.phase;
      }, { timeout: 15000 }).toBe("armor_opportunity");

      await page.mouse.move(screenStartX2, screenStartY2);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await page.mouse.move(
          screenStartX2 + (screenEndX2 - screenStartX2) * t,
          screenStartY2 + (screenEndY2 - screenStartY2) * t,
        );
        await page.waitForTimeout(20);
      }
      await page.mouse.up();
      await page.waitForTimeout(300);

      const stateAfter2 = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      const durabilityAfter2 = stateAfter2.armorDurability?.[0] ?? 100;
      // 第二次必须命中（P0-A 统一刀体几何后刀尖应参与碰撞）
      expect(durabilityAfter2).toBeLessThan(durabilityBefore);
    }

    // 无页面错误
    expect(pageErrors).toEqual([]);
  });
});
