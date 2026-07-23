import { test, expect } from "@playwright/test";

/**
 * P4.4B-R5.7: Reactive Boss 真实 Pointer E2E（V0723013-Final 收口）
 *
 * 变更：
 * 1. 松手后改为 expect.poll 查询真实状态（替代固定 waitForTimeout）
 * 2. 新增 test：命中后等 300ms 松手仍结算 armor_hit
 * 3. V0723013 P1-1: 三胶囊真实 Pointer 分来源测试（严格断言）
 */

// ---- 碰撞检测辅助函数（与 reactiveSlashGeometry.ts 胶囊-椭圆检测逻辑一致） ----

function distanceToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq === 0) {
    return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
  }
  let t = (apx * abx + apy * aby) / abLenSq;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  const projX = ax + abx * t;
  const projY = ay + aby * t;
  return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
}

function capsuleHitsEllipse(
  segA: { x: number; y: number },
  segB: { x: number; y: number },
  radius: number,
  center: { x: number; y: number },
  rx: number,
  ry: number,
): boolean {
  const safeRx = Math.max(1, rx);
  const safeRy = Math.max(1, ry);
  const scaleX = 1 / safeRx;
  const scaleY = 1 / safeRy;
  const a = { x: (segA.x - center.x) * scaleX, y: (segA.y - center.y) * scaleY };
  const b = { x: (segB.x - center.x) * scaleX, y: (segB.y - center.y) * scaleY };
  const r = Math.max(radius * scaleX, radius * scaleY);
  return distanceToSegment(0, 0, a.x, a.y, b.x, b.y) <= 1 + r;
}

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
  // V0723013 P1-1: 三胶囊真实 Pointer 分来源测试（严格断言）
  // ================================================================

  test("P1-1 visibleBlade-only — 严格断言 armorHit=true, primarySource=visibleBlade, 其他胶囊未命中", async ({ page }) => {
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
    const cScaleX = canvasBox!.width / 390;
    const cScaleY = canvasBox!.height / 844;

    // 策略：从护甲右上方拖拽到左下方，斜穿护甲边缘。
    // 手指起点和终点在护甲外侧，baseTrail 只经过边缘，
    // visibleBlade 从 trail 两端向外延伸并覆盖护甲中心区域。
    const dragStartX = armorPos!.cx + armorPos!.rx + 15;
    const dragStartY = armorPos!.cy - armorPos!.ry - 15;
    const dragEndX = armorPos!.cx - armorPos!.rx - 15;
    const dragEndY = armorPos!.cy + armorPos!.ry + 15;

    const sx = canvasBox!.x + dragStartX * cScaleX;
    const sy = canvasBox!.y + dragStartY * cScaleY;
    const ex = canvasBox!.x + dragEndX * cScaleX;
    const ey = canvasBox!.y + dragEndY * cScaleY;

    await page.mouse.move(sx, sy);
    await page.mouse.down();
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(sx + (ex - sx) * t, sy + (ey - sy) * t);
      await page.waitForTimeout(10);
    }
    await page.mouse.up();

    // 等待结算完成
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.armorDurability?.[0] ?? 100;
    }, { timeout: 5000 }).toBeLessThan(durabilityBefore);

    // 严格断言 recentResult
    const recentResult: any = await page.evaluate(() => window.__ONE_BLADE_E2E__.recentResult());
    expect(recentResult).not.toBeNull();
    expect(recentResult!.armorHit).toBe(true);
    expect(recentResult!.primarySource).toBe("visibleBlade");

    // 严格断言 recentGeometry：三胶囊各自命中状态
    const recentGeom: any = await page.evaluate(() => window.__ONE_BLADE_E2E__.recentGeometry());
    expect(recentGeom).not.toBeNull();
    expect(recentGeom!.armor).not.toBeNull();

    const armor = recentGeom!.armor as { center: { x: number; y: number }; rx: number; ry: number };
    let baseTrailHit = false;
    let visibleBladeHit = false;
    let tipSweepHit = false;

    for (const cap of (recentGeom!.capsules as Array<{ source: string; a: { x: number; y: number }; b: { x: number; y: number }; radius: number }>)) {
      const hit = capsuleHitsEllipse(cap.a, cap.b, cap.radius, armor.center, armor.rx, armor.ry);
      if (cap.source === "baseTrail") baseTrailHit = hit;
      else if (cap.source === "visibleBlade") visibleBladeHit = hit;
      else if (cap.source === "tipSweep") tipSweepHit = hit;
    }

    expect(baseTrailHit).toBe(false);
    expect(visibleBladeHit).toBe(true);
    expect(tipSweepHit).toBe(false);

    expect(pageErrors).toEqual([]);
  });

  test("P1-1 tipSweep-only — 严格断言 armorHit=true, primarySource=tipSweep, 手指避开护甲但刀尖扫掠命中", async ({ page }) => {
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
    const cScaleX = canvasBox!.width / 390;
    const cScaleY = canvasBox!.height / 844;

    // 策略：高速斜向拖拽穿过护甲，方向角大幅变化使 tipSweep 扫掠覆盖护甲。
    // 起点和终点在护甲外侧，中间高速经过护甲边缘，刀尖扫掠区命中护甲。
    const sx = canvasBox!.x + (armorPos!.cx + armorPos!.rx + 15) * cScaleX;
    const sy = canvasBox!.y + (armorPos!.cy - armorPos!.ry - 15) * cScaleY;
    const ex = canvasBox!.x + (armorPos!.cx - armorPos!.rx - 15) * cScaleX;
    const ey = canvasBox!.y + (armorPos!.cy + armorPos!.ry + 15) * cScaleY;

    await page.mouse.move(sx, sy);
    await page.mouse.down();
    // 极速拖拽：少步数 + 短间隔 = 高速扫掠
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(sx + (ex - sx) * t, sy + (ey - sy) * t);
      await page.waitForTimeout(8);
    }
    await page.mouse.up();

    // 等待结算
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.armorDurability?.[0] ?? 100;
    }, { timeout: 5000 }).toBeLessThan(durabilityBefore);

    // 严格断言
    const recentResult: any = await page.evaluate(() => window.__ONE_BLADE_E2E__.recentResult());
    expect(recentResult).not.toBeNull();
    expect(recentResult!.armorHit).toBe(true);
    expect(recentResult!.primarySource).toBe("tipSweep");

    // 严格断言 recentGeometry：三胶囊各自命中状态
    const recentGeom: any = await page.evaluate(() => window.__ONE_BLADE_E2E__.recentGeometry());
    expect(recentGeom).not.toBeNull();
    expect(recentGeom!.armor).not.toBeNull();

    const armor = recentGeom!.armor as { center: { x: number; y: number }; rx: number; ry: number };
    let baseTrailHit = false;
    let visibleBladeHit = false;
    let tipSweepHit = false;

    for (const cap of (recentGeom!.capsules as Array<{ source: string; a: { x: number; y: number }; b: { x: number; y: number }; radius: number }>)) {
      const hit = capsuleHitsEllipse(cap.a, cap.b, cap.radius, armor.center, armor.rx, armor.ry);
      if (cap.source === "baseTrail") baseTrailHit = hit;
      else if (cap.source === "visibleBlade") visibleBladeHit = hit;
      else if (cap.source === "tipSweep") tipSweepHit = hit;
    }

    expect(baseTrailHit).toBe(false);
    expect(visibleBladeHit).toBe(false);
    expect(tipSweepHit).toBe(true);

    expect(pageErrors).toEqual([]);
  });

  test("P1-1 全miss — 严格断言 recentResult 存在, primaryResult=empty_swing, armorHit=false, eventCount=0, durability不变, 三胶囊全未命中", async ({ page }) => {
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
    const cScaleX = canvasBox!.width / 390;
    const cScaleY = canvasBox!.height / 844;

    // 策略：在远离护甲的屏幕底部拖拽（y=620，护甲在 y≈190），三胶囊全部不碰护甲
    const sx = canvasBox!.x + 100 * cScaleX;
    const sy = canvasBox!.y + 620 * cScaleY;
    const ex = canvasBox!.x + 250 * cScaleX;
    const ey = canvasBox!.y + 630 * cScaleY;

    await page.mouse.move(sx, sy);
    await page.mouse.down();
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(sx + (ex - sx) * t, sy + (ey - sy) * t);
      await page.waitForTimeout(20);
    }
    await page.mouse.up();

    // 等待结算完成
    await page.waitForTimeout(500);

    // 严格断言 durability 不变
    const stateAfter = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(stateAfter.armorDurability?.[0] ?? 100).toBe(durabilityBefore);

    // 严格断言 recentResult：存在且 primaryResult=empty_swing, armorHit=false, eventCount=0
    const recentResult: any = await page.evaluate(() => window.__ONE_BLADE_E2E__.recentResult());
    expect(recentResult).not.toBeNull();
    expect(recentResult!.primaryResult).toBe("empty_swing");
    expect(recentResult!.armorHit).toBe(false);
    expect(recentResult!.eventCount).toBe(0);

    // 严格断言 recentGeometry：三胶囊全未命中
    const recentGeom: any = await page.evaluate(() => window.__ONE_BLADE_E2E__.recentGeometry());
    expect(recentGeom).not.toBeNull();
    expect(recentGeom!.armor).not.toBeNull();

    const armor = recentGeom!.armor as { center: { x: number; y: number }; rx: number; ry: number };
    let baseTrailHit = false;
    let visibleBladeHit = false;
    let tipSweepHit = false;

    for (const cap of (recentGeom!.capsules as Array<{ source: string; a: { x: number; y: number }; b: { x: number; y: number }; radius: number }>)) {
      const hit = capsuleHitsEllipse(cap.a, cap.b, cap.radius, armor.center, armor.rx, armor.ry);
      if (cap.source === "baseTrail") baseTrailHit = hit;
      else if (cap.source === "visibleBlade") visibleBladeHit = hit;
      else if (cap.source === "tipSweep") tipSweepHit = hit;
    }

    expect(baseTrailHit).toBe(false);
    expect(visibleBladeHit).toBe(false);
    expect(tipSweepHit).toBe(false);

    expect(pageErrors).toEqual([]);
  });
});
