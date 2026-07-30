import { test, expect } from "@playwright/test";

/**
 * P4.4B-R5.7: Reactive Boss 全 Pointer 三甲→pursuit E2E（V0723011 更新）
 *
 * 变更：第三甲断言改用 lastReactiveExitSnapshot（不依赖瞬时 armorProgress=3/3 + activeArmorIndex=2）。
 */
test.describe("Reactive Boss 全Pointer三甲→pursuit", () => {
  test.setTimeout(90000);

  test("真实鼠标循环命中完成三甲并进入追击", async ({ page }) => {
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

    // V0723014: 开局刀势只读断言
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      const bm = s.bladeMomentum;
      return bm != null && typeof bm.current === "number" && typeof bm.max === "number";
    }, { timeout: 5000 }).toBe(true);

    const initialBM = await page.evaluate(() => {
      const s = window.__ONE_BLADE_E2E__.getState();
      return s.bladeMomentum;
    });
    expect(initialBM.current).toBeCloseTo(35, 0);
    expect(initialBM.max).toBe(100);
    expect(initialBM.ratio).toBeCloseTo(0.35, 1);
    expect(initialBM.band).toBe("enhanced");
    expect(initialBM.activeNodes).toContain("blade_reach");

    // 辅助：读取当前状态
    async function getState() {
      return await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    }

    // 辅助：用真实鼠标拖拽穿过当前护甲
    async function realMouseDragThroughArmor() {
      const targets = await page.evaluate(() => window.__ONE_BLADE_E2E__.getTargets());
      const armorPos = (targets.armorTargets as any[])?.[0];
      if (!armorPos) throw new Error("No armor target");

      const canvasBox = await page.locator("canvas").boundingBox();
      const scaleX = canvasBox!.width / 390;
      const scaleY = canvasBox!.height / 844;

      const startX = canvasBox!.x + (armorPos.cx + 60) * scaleX;
      const startY = canvasBox!.y + armorPos.cy * scaleY;
      const endX = canvasBox!.x + (armorPos.cx - 60) * scaleX;
      const endY = canvasBox!.y + armorPos.cy * scaleY;

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
    }

    // 辅助：循环命中直到当前护甲破碎（最多 4 刀）
    async function breakCurrentArmorWithMouse(expectedIndex: number) {
      const before = await getState();
      const beforeProgress = before.armorProgress;
      let previousDurability = before.armorDurability?.[expectedIndex] ?? 100;

      for (let attempt = 1; attempt <= 4; attempt++) {
        // V0723016最终收口P0-1: 正常操作斩弹/反射推进目标（不调 forceCompleteObjective 作弊）
        for (let cut = 0; cut < 6; cut++) {
          const s = await getState();
          if (s.objectiveCompleted) break;
          await page.evaluate(() => (window as any).__ONE_BLADE_E2E__?.forceCutProjectileForTest?.());
        }
        await expect.poll(async () => {
          const s = await getState();
          return s.phase;
        }, { timeout: 15000 }).toBe("armor_opportunity");

        await realMouseDragThroughArmor();

        // P0-2: mouseUp 后改为 expect.poll 轮询 durability/progress/mode 变化
        await expect.poll(async () => {
          const s = await getState();
          return s.armorProgress !== beforeProgress
            || (s.armorDurability?.[expectedIndex] ?? 100) < previousDurability
            || s.gameMode === "boss";
        }, { timeout: 10000 }).toBe(true);

        const after = await getState();

        if (after.armorProgress !== beforeProgress) {
          // P0-1: 切换到下一护甲后 poll activeArmorIndex；但第三甲破后 reactiveController 被置空，
          // activeArmorIndex 变 undefined — 此时改用 exitSnapshot 验证
          if (after.armorProgress === "3/3") {
            return after;
          }
          await expect.poll(async () => {
            const s = await getState();
            return `${s.armorProgress}|${s.activeArmorIndex}`;
          }, { timeout: 5000 }).toBe(`${after.armorProgress}|${expectedIndex + 1}`);
          return await getState();
        }

        const afterDurability = after.armorDurability?.[expectedIndex] ?? 100;
        expect(afterDurability).toBeLessThan(previousDurability);
        previousDurability = afterDurability;
      }

      const finalState = await getState();
      throw new Error(`Armor ${expectedIndex} not broken after 4 attempts. durability=${finalState.armorDurability?.[expectedIndex]}`);
    }

    // 初始状态断言
    let state = await getState();
    expect(state.armorProgress).toBe("0/3");
    expect(state.activeArmorIndex).toBe(0);

    // 左肩 → 1/3
    state = await breakCurrentArmorWithMouse(0);
    expect(state.armorProgress).toBe("1/3");

    // 右肩 → 2/3
    state = await breakCurrentArmorWithMouse(1);
    expect(state.armorProgress).toBe("2/3");

    // 胸甲 → 3/3
    await breakCurrentArmorWithMouse(2);

    // V0723011: 使用 lastReactiveExitSnapshot 稳定断言第三甲（不依赖瞬时 activeArmorIndex=2）
    await expect.poll(async () => {
      const s = await getState();
      return s.lastReactiveExitSnapshot?.armorProgress ?? s.armorProgress;
    }, { timeout: 10000 }).toBe("3/3");

    // 验证 exitSnapshot 中 bridgeTriggered=true, armorBroken=[true,true,true], gameMode=bossReactive
    await expect.poll(async () => {
      const s = await getState();
      return s.lastReactiveExitSnapshot?.bridgeTriggered ?? false;
    }, { timeout: 5000 }).toBe(true);

    const exitSnap = (await getState()).lastReactiveExitSnapshot;
    expect(exitSnap).toBeDefined();
    expect(exitSnap!.armorBroken).toEqual([true, true, true]);
    expect(exitSnap!.gameMode).toBe("bossReactive");
    expect(exitSnap!.armorDurability).toEqual([0, 0, 0]);

    // 等待 bridge → gameMode 切换为 boss
    await expect.poll(async () => {
      const s = await getState();
      return s.gameMode;
    }, { timeout: 20000 }).toBe("boss");

    // 等待进入 pursuit
    await expect.poll(async () => {
      const s = await getState();
      return s.phase;
    }, { timeout: 15000 }).toBe("pursuit");

    expect(pageErrors).toEqual([]);
  });
});

test.describe("Reactive Boss 全流程时间轴断言", () => {
  test.setTimeout(120000);
  test("三甲破甲→追击→终结 完整时间轴在预期范围内", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => { if (msg.type() === "error") pageErrors.push(msg.text()); });
    await page.goto("/?bossFlow=reactive"); await page.waitForLoadState("networkidle");
    await page.evaluate(() => { const d = JSON.parse(localStorage.getItem("one_blade_v04_progression") || "{}"); d.highestFloor = 6; localStorage.setItem("one_blade_v04_progression", JSON.stringify(d)); });
    await page.reload(); await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /练气突破/ }).click();
    await expect(page.locator("canvas")).toBeVisible();
    await expect.poll(async () => page.evaluate(() => typeof window.__ONE_BLADE_E2E__ !== "undefined"), { timeout: 10000 }).toBe(true);

    async function gs() { return await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.getState()); }
    const iid = (await gs()).gameInstanceId;
    async function a2o() { for (let i = 0; i < 10; i++) { if ((await gs()).objectiveCompleted) break; await page.evaluate(() => (window as any).__ONE_BLADE_E2E__?.forceCutProjectileForTest?.()); await page.waitForTimeout(100); } await expect.poll(async () => (await gs()).phase, { timeout: 18000 }).toBe("armor_opportunity"); }
    async function drag() { const t = await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.getTargets()); const ap = (t.armorTargets as any[])?.[0]; if (!ap) throw new Error("No armor"); const cb = (await page.locator("canvas").boundingBox())!; const sx = cb.width / 390; const sy = cb.height / 844; const x1 = cb.x + (ap.cx + 60) * sx; const y1 = cb.y + ap.cy * sy; const x2 = cb.x + (ap.cx - 60) * sx; const y2 = cb.y + ap.cy * sy; await page.mouse.move(x1, y1); await page.mouse.down(); for (let i = 1; i <= 10; i++) { const r = i / 10; await page.mouse.move(x1 + (x2 - x1) * r, y1 + (y2 - y1) * r); await page.waitForTimeout(15); } await page.mouse.up(); }

    await a2o(); await drag();
    await expect.poll(async () => (await gs()).armorProgress, { timeout: 15000 }).toBe("1/3");
    { const s = await gs(); expect(s.leftBreakTs).toBeGreaterThanOrEqual(8); expect(s.leftBreakTs).toBeLessThanOrEqual(12); expect(s.gameInstanceId).toBe(iid); }

    await a2o(); await drag();
    await expect.poll(async () => (await gs()).armorProgress, { timeout: 15000 }).toBe("2/3");
    { const s = await gs(); expect(s.rightBreakTs).toBeGreaterThanOrEqual(20); expect(s.rightBreakTs).toBeLessThanOrEqual(28); expect(s.gameInstanceId).toBe(iid); }

    await a2o(); await drag();
    await expect.poll(async () => { const s = await gs(); return s.lastReactiveExitSnapshot?.armorProgress ?? s.armorProgress; }, { timeout: 15000 }).toBe("3/3");
    { const s = await gs(); expect(s.chestBreakTs).toBeGreaterThanOrEqual(34); expect(s.chestBreakTs).toBeLessThanOrEqual(45); expect(s.gameInstanceId).toBe(iid); }

    await expect.poll(async () => (await gs()).gameMode, { timeout: 20000 }).toBe("boss");
    await expect.poll(async () => (await gs()).phase, { timeout: 15000 }).toBe("pursuit");
    for (let i = 0; i < 3; i++) { await expect.poll(async () => (await gs()).inputLocked, { timeout: 10000 }).toBe(false); expect(await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.slashCore())).toBe(true); await page.waitForTimeout(100); }
    await expect.poll(async () => (await gs()).phase, { timeout: 15000 }).toBe("execution_intro");
    await expect.poll(async () => (await gs()).phase, { timeout: 10000 }).toBe("execution");
    expect(await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.slashExecution())).toBe(true);
    await expect.poll(async () => (await gs()).phase, { timeout: 10000 }).toBe("execution_success");
    { const s = await gs(); expect(s.breakthroughSuccessTs).toBeGreaterThanOrEqual(55); expect(s.breakthroughSuccessTs).toBeLessThanOrEqual(75); expect(s.gameInstanceId).toBe(iid); if (s.leftBreakTs && s.rightBreakTs && s.chestBreakTs && s.breakthroughSuccessTs) { expect(s.leftBreakTs).toBeLessThan(s.rightBreakTs); expect(s.rightBreakTs).toBeLessThan(s.chestBreakTs); expect(s.chestBreakTs).toBeLessThan(s.breakthroughSuccessTs); } }
    expect(pageErrors).toEqual([]);
  });
});
