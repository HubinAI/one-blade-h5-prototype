import { test, expect } from "@playwright/test";

/**
 * P4.4B-R5.3 P0-1: Reactive Boss 全 Pointer 三甲→pursuit E2E（重写）
 *
 * 审计 §P0-1 指出：R5.2 的测试假设一刀一甲，但 Reactive 初始刀势为 35（中刀势），
 * 第一次命中只造成 55 伤害，不是"一刀碎"。测试设计本身不成立。
 *
 * 重写：每块护甲通过真实 page.mouse 循环命中，直到 armorProgress 真实增加（每块最多 4 刀）。
 * 逐段断言 0/3→1/3→2/3→3/3、activeArmorIndex 0→1→2、bridgeTriggered、gameMode boss、phase pursuit。
 *
 * 全程只能使用 page.mouse，禁止 slashArmor/setProgrammaticSlashEnergy/resolveSegment/resolveGeometry/finishSlash。
 */
test.describe("Reactive Boss 全Pointer三甲→pursuit", () => {
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
      // 读取护甲世界坐标
      const targets = await page.evaluate(() => window.__ONE_BLADE_E2E__.getTargets());
      const armorPos = (targets.armorTargets as any[])?.[0];
      if (!armorPos) throw new Error("No armor target");

      const canvasBox = await page.locator("canvas").boundingBox();
      const scaleX = canvasBox!.width / 390;
      const scaleY = canvasBox!.height / 844;

      // 从护甲右侧向左拖拽穿过护甲中心
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
      await page.waitForTimeout(300);
    }

    // 辅助：循环命中直到当前护甲破碎（最多 4 刀）
    async function breakCurrentArmorWithMouse(expectedIndex: number) {
      const before = await getState();
      const beforeDurability = before.armorDurability?.[expectedIndex] ?? 100;

      for (let attempt = 1; attempt <= 4; attempt++) {
        // 等待 opportunity
        await expect.poll(async () => {
          const s = await getState();
          return s.phase;
        }, { timeout: 15000 }).toBe("armor_opportunity");

        await realMouseDragThroughArmor();

        const after = await getState();

        // 检查是否已切换到下一护甲
        if (after.activeArmorIndex !== expectedIndex || after.armorProgress !== before.armorProgress) {
          return after; // 护甲已破碎
        }

        // 耐久必须下降
        const afterDurability = after.armorDurability?.[expectedIndex] ?? 100;
        expect(afterDurability).toBeLessThan(beforeDurability);
      }

      // 如果4刀后仍未破碎，抛出错误
      const finalState = await getState();
      throw new Error(`Armor ${expectedIndex} not broken after 4 attempts. durability=${finalState.armorDurability?.[expectedIndex]}`);
    }

    // 初始状态断言
    let state = await getState();
    expect(state.armorProgress).toBe("0/3");
    expect(state.activeArmorIndex).toBe(0);

    // 左肩（index 0）→ 1/3
    state = await breakCurrentArmorWithMouse(0);
    expect(state.armorProgress).toBe("1/3");
    expect(state.activeArmorIndex).toBe(1);

    // 右肩（index 1）→ 2/3
    state = await breakCurrentArmorWithMouse(1);
    expect(state.armorProgress).toBe("2/3");
    expect(state.activeArmorIndex).toBe(2);

    // 胸甲（index 2）→ 3/3 + bridge
    state = await breakCurrentArmorWithMouse(2);
    expect(state.armorProgress).toBe("3/3");
    expect(state.bridgeTriggered).toBe(true);

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
