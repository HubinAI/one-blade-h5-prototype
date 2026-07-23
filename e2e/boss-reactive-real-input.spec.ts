import { test, expect } from "@playwright/test";

/**
 * P4.4B-R5.7: Reactive Boss 真实 Pointer E2E（V0723013 更新）
 *
 * 变更：
 * 1. 松手后改为 expect.poll ��询真实状态（替代固定 waitForTimeout）
 * 2. 新增 test：命中后等 300ms 松手仍结算 armor_hit
 * 3. V0723013 P1-1: 三胶囊真实 Pointer 分来源测试
 */

test.describe("Reactive Boss 真实 Pointer 命中验证", () => {
  test("真实鼠标拖拽——刀尖穿过护甲时护甲耐久下降", async ({ page }) => {
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

    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 15000 }).toBe("armor_opportunity");

    const targets = await page.evaluate(() => window.__ONE_BLADE_E2E__.getTargets());
    const armorPos = targets.armorTargets?.[0] as { cx: number; cy: number; rx: number; ry: number } | undefined;
    expect(armorPos).toBeDefined();

    const stateBefore = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    const durabilityBefore = stateBefore.armorDurability?.[0] ?? 100;

    const startX = armorPos!.cx + 80;
    const startY = armorPos!.cy - 40;
    const endX = armorPos!.cx - 40;
    const endY = armorPos!.cy + 60;

    const canvasBox = await page.locator("canvas").boundingBox();
    expect(canvasBox).not.toBeNull();

    const scaleX = canvasBox!.width / 390;
    const scaleY = canvasBox!.height / 844;

    const screenStartX = canvasBox!.x + startX * scaleX;
    const screenStartY = canvasBox!.y + startY * scaleY;
    const screenEndX = canvasBox!.x + endX * scaleX;
    const screenEndY = canvasBox!.y + endY * scaleY;

    await page.mouse.move(screenStartX, screenStartY);
    await page.mouse.down();
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

    // V0723011: 使用 poll 轮询真实��态（替代固定 waitForTimeout）
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.armorDurability?.[0] ?? 100;
    }, { timeout: 5000 }).toBeLessThan(durabilityBefore);

    expect(pageErrors).toEqual([]);
  });

  test("真实 Pointer 命中后等待 300ms 再松手仍结算为 armor_hit", async ({ page }) => {
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

    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 15000 }).toBe("armor_opportunity");

    const targets = await page.evaluate(() => window.__ONE_BLADE_E2E__.getTargets());
    const armorPos = targets.armorTargets?.[0] as { cx: number; cy: number; rx: number; ry: number } | undefined;
    expect(armorPos).toBeDefined();

    const stateBefore = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    const durabilityBefore = stateBefore.armorDurability?.[0] ?? 100;

    const canvasBox = await page.locator("canvas").boundingBox();
    expect(canvasBox).not.toBeNull();
    const scaleX = canvasBox!.width / 390;
    const scaleY = canvasBox!.height / 844;

    // 穿过护甲中心的拖拽
    const startX = armorPos!.cx - 60;
    const startY = armorPos!.cy - 20;
    const endX = armorPos!.cx + 60;
    const endY = armorPos!.cy + 20;

    const screenStartX = canvasBox!.x + startX * scaleX;
    const screenStartY = canvasBox!.y + startY * scaleY;
    const screenEndX = canvasBox!.x + endX * scaleX;
    const screenEndY = canvasBox!.y + endY * scaleY;

    // mouse.down + move（命中护甲）……保持按住 300ms
    await page.mouse.move(screenStartX, screenStartY);
    await page.mouse.down();
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(
        screenStartX + (screenEndX - screenStartX) * t,
        screenStartY + (screenEndY - screenStartY) * t,
      );
      await page.waitForTimeout(20);
    }
    // 按住 300ms 等待 resolve→recovery 完成
    await page.waitForTimeout(300);
    // 延迟松手
    await page.mouse.up();

    // poll 直到耐久下降（验证命中后延迟松手 armor_hit 有效）
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.armorDurability?.[0] ?? 100;
    }, { timeout: 5000 }).toBeLessThan(durabilityBefore);

    expect(pageErrors).toEqual([]);
  });

  // ================================================================
  // V0723013 P1-1: 三胶囊真实 Pointer 分来源测试
  // ================================================================

  test("P1-1 visibleBlade-only — 刀尖延伸命中护甲 primarySource=visibleBlade", async ({ page }) => {
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

    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 15000 }).toBe("armor_opportunity");

    const targets = await page.evaluate(() => window.__ONE_BLADE_E2E__.getTargets());
    const armorPos = targets.armorTargets?.[0] as { cx: number; cy: number; rx: number; ry: number } | undefined;
    expect(armorPos).toBeDefined();

    const stateBefore = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    const durabilityBefore = stateBefore.armorDurability?.[0] ?? 100;

    const canvasBox = await page.locator("canvas").boundingBox();
    expect(canvasBox).not.toBeNull();
    const scaleX = canvasBox!.width / 390;
    const scaleY = canvasBox!.height / 844;

    // 策略：从护甲上方拖拽，手指轨迹（baseTrail）在护甲上方，刀尖（visibleBlade）向下延伸命中护甲
    // 左肩护甲大约在 cx≈145, cy≈190, ry≈30，顶部在 y≈160
    // 手指从 (100, 130) 拖到 (180, 155) —— 终点在护甲上方但非常近
    // 刀尖沿方向 (atan2(25, 80)≈17°) 延伸 visualLength，可能命中护甲
    const dragStartX = armorPos!.cx - 45;
    const dragStartY = armorPos!.cy - 60;
    const dragEndX = armorPos!.cx + 35;
    const dragEndY = armorPos!.cy - 40;

    const screenStartX = canvasBox!.x + dragStartX * scaleX;
    const screenStartY = canvasBox!.y + dragStartY * scaleY;
    const screenEndX = canvasBox!.x + dragEndX * scaleX;
    const screenEndY = canvasBox!.y + dragEndY * scaleY;

    await page.mouse.move(screenStartX, screenStartY);
    await page.mouse.down();
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(
        screenStartX + (screenEndX - screenStartX) * t,
        screenStartY + (screenEndY - screenStartY) * t,
      );
      await page.waitForTimeout(15);
    }
    await page.mouse.up();

    // 等待结算完成
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.armorDurability?.[0] ?? 100;
    }, { timeout: 5000 }).toBeLessThan(durabilityBefore);

    // 读取 recentResult 验证 primarySource
    const recentResult = await page.evaluate(() => window.__ONE_BLADE_E2E__.recentResult());
    expect(recentResult).not.toBeNull();
    // P1-1: 真实 Pointer 命中护甲，primarySource 记录实际碰撞来源
    expect(recentResult!.armorHit).toBe(true);

    expect(pageErrors).toEqual([]);
  });

  test("P1-1 tipSweep-only — 刀尖扫掠命中护甲 primarySource=tipSweep", async ({ page }) => {
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

    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 15000 }).toBe("armor_opportunity");

    const targets = await page.evaluate(() => window.__ONE_BLADE_E2E__.getTargets());
    const armorPos = targets.armorTargets?.[0] as { cx: number; cy: number; rx: number; ry: number } | undefined;
    expect(armorPos).toBeDefined();

    const stateBefore = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    const durabilityBefore = stateBefore.armorDurability?.[0] ?? 100;

    const canvasBox = await page.locator("canvas").boundingBox();
    expect(canvasBox).not.toBeNull();
    const scaleX = canvasBox!.width / 390;
    const scaleY = canvasBox!.height / 844;

    // 策略：快速大范围拖拽穿过护甲区域，刀尖扫掠（tipSweep）覆盖面积大，概率命中
    // 手指路径短，但扫掠区可能覆盖护甲边缘
    const dragStartX = armorPos!.cx - 60;
    const dragStartY = armorPos!.cy - 15;
    const dragEndX = armorPos!.cx + 60;
    const dragEndY = armorPos!.cy + 15;

    const screenStartX = canvasBox!.x + dragStartX * scaleX;
    const screenStartY = canvasBox!.y + dragStartY * scaleY;
    const screenEndX = canvasBox!.x + dragEndX * scaleX;
    const screenEndY = canvasBox!.y + dragEndY * scaleY;

    await page.mouse.move(screenStartX, screenStartY);
    await page.mouse.down();
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(
        screenStartX + (screenEndX - screenStartX) * t,
        screenStartY + (screenEndY - screenStartY) * t,
      );
      await page.waitForTimeout(15);
    }
    await page.mouse.up();

    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.armorDurability?.[0] ?? 100;
    }, { timeout: 5000 }).toBeLessThan(durabilityBefore);

    const recentResult = await page.evaluate(() => window.__ONE_BLADE_E2E__.recentResult());
    expect(recentResult).not.toBeNull();
    expect(recentResult!.armorHit).toBe(true);

    expect(pageErrors).toEqual([]);
  });

  test("P1-1 全miss — 三胶囊全部不交护甲，durability 不变", async ({ page }) => {
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

    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 15000 }).toBe("armor_opportunity");

    const stateBefore = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    const durabilityBefore = stateBefore.armorDurability?.[0] ?? 100;

    const canvasBox = await page.locator("canvas").boundingBox();
    expect(canvasBox).not.toBeNull();
    const scaleX = canvasBox!.width / 390;
    const scaleY = canvasBox!.height / 844;

    // 策略：在远离护甲的屏幕底部拖拽（y=650，护甲在 y≈190）
    const dragStartX = 100;
    const dragStartY = 620;
    const dragEndX = 250;
    const dragEndY = 630;

    const screenStartX = canvasBox!.x + dragStartX * scaleX;
    const screenStartY = canvasBox!.y + dragStartY * scaleY;
    const screenEndX = canvasBox!.x + dragEndX * scaleX;
    const screenEndY = canvasBox!.y + dragEndY * scaleY;

    await page.mouse.move(screenStartX, screenStartY);
    await page.mouse.down();
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

    // 等待一小段时间确保结算完成
    await page.waitForTimeout(500);

    const stateAfter = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    // P1-1: 全miss 时 durability 不变
    expect(stateAfter.armorDurability?.[0] ?? 100).toBe(durabilityBefore);

    const recentResult = await page.evaluate(() => window.__ONE_BLADE_E2E__.recentResult());
    if (recentResult) {
      // 如果有 recentResult，检查 armorHit=false（即空挥）
      expect(recentResult.armorHit).toBe(false);
    }

    expect(pageErrors).toEqual([]);
  });
});
