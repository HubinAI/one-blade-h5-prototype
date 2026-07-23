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
          await expect.poll(async () => {
            const s = await getState();
            return `${s.armorProgress}|${s.activeArmorIndex}`;
          }, { timeout: 5000 }).toBe(`${after.armorProgress}|${expectedIndex + 1 <= 2 ? expectedIndex + 1 : expectedIndex}`);
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
