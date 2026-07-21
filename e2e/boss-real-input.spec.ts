import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf-8"));

/**
 * Layer B — Boss 真实 Pointer 输入 E2E（最小真实输入覆盖）
 * 保护：Canvas坐标换算、Game指针输入生命周期、多segment采样、Game→Controller路由、输入锁。
 * 流程：
 *   1. 真实Pointer拖动左肩一次 → 破甲 0/3→1/3（验证真实输入链路）
 *   2. 程序化桥推进至 3/3 → pursuit
 *   3. 真实多segment拖动雷核一次 → 追击 0/3→1/3（验证真实输入链路）
 *   4. 进入 execution_intro 后真实拖动 → 不得创建刀路/消耗刀势/改变阶段（输入锁验证）
 * 该层仅运行于 dpr1 阻挡 job；高DPR坐标验证见 playwright.dpr3.config（非阻挡）。
 */
test.describe("Boss真实Pointer输入E2E", () => {
  test("真实拖动完成破甲1刀+追击1刀，且终结阶段输入被锁", async ({ page }) => {
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

    // 点击突破
    await page.getByRole("button", { name: /练气突破/ }).click();
    await expect(page.locator("canvas")).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(() => typeof window.__ONE_BLADE_E2E__ !== "undefined")
    , { timeout: 10000 }).toBe(true);

    // 等待Boss自然进入armor阶段（验证 intro→armor 真实计时链路）
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 10000 }).toBe("armor");

    let state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state.armorProgress).toBe("0/3");

    // Canvas坐标换算（design → client 的精确逆映射，与 GameCanvas 指针映射一致）
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const scaleX = box!.width / 390;
    const scaleY = box!.height / 844;
    const canvasToScreen = (dx: number, dy: number) => ({
      x: box!.x + dx * scaleX,
      y: box!.y + dy * scaleY,
    });
    // 真实Pointer拖拽：水平穿过目标中心（短距多采样，任何一端都在命中椭圆内）
    const realDragThrough = async (dx: number, dy: number, offset = 28) => {
      const p = canvasToScreen(dx, dy);
      await page.mouse.move(p.x - offset, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x - offset / 2, p.y, { steps: 16 });
      await page.mouse.move(p.x + offset / 2, p.y, { steps: 16 });
      await page.mouse.move(p.x + offset, p.y, { steps: 16 });
      await page.mouse.up();
    };

    // 1) 真实拖动左肩护甲一次 → 0/3→1/3
    await expect.poll(async () =>
      page.evaluate(() => window.__ONE_BLADE_E2E__.getState().inputLocked)
    , { timeout: 8000 }).toBe(false);
    const armor0 = await page.evaluate(() => window.__ONE_BLADE_E2E__.getTargets().armorTargets[0]);
    expect(armor0).toBeTruthy();
    await realDragThrough(armor0.cx, armor0.cy);
    // 拖拽后轮询读取，避免慢速CI提前读旧值（审计四）
    await expect.poll(async () =>
      page.evaluate(() => window.__ONE_BLADE_E2E__.getState().armorProgress)
    , { timeout: 5000 }).toBe("1/3");

    // 程序化桥推进至 3/3（每次先等待可命中状态，避免护甲切换延迟 _switchTimer 拦截）
    for (const target of ["2/3", "3/3"]) {
      await expect.poll(async () =>
        page.evaluate(() => window.__ONE_BLADE_E2E__.getState().inputLocked)
      , { timeout: 8000 }).toBe(false);
      await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.slashArmor());
      await expect.poll(async () =>
        page.evaluate(() => window.__ONE_BLADE_E2E__.getState().armorProgress)
      ).toBe(target);
    }

    // 等待进入pursuit
    await expect.poll(async () => page.evaluate(() => window.__ONE_BLADE_E2E__.getState().phase), { timeout: 15000 }).toBe("pursuit");
    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state.pursuitProgress).toBe("0/3");

    // 3) 真实多segment拖动雷核一次 → 0/3→1/3
    await expect.poll(async () =>
      page.evaluate(() => window.__ONE_BLADE_E2E__.getState().inputLocked)
    , { timeout: 8000 }).toBe(false);
    const core = await page.evaluate(() => window.__ONE_BLADE_E2E__.getTargets().coreTarget);
    expect(core).toBeTruthy();
    await realDragThrough(core.cx, core.cy);
    // 拖拽后轮询读取（审计四）
    await expect.poll(async () =>
      page.evaluate(() => window.__ONE_BLADE_E2E__.getState().pursuitProgress)
    , { timeout: 5000 }).toBe("1/3");

    // 程序化推进至 execution_intro（每次先等待可命中状态）
    for (const target of ["2/3"]) {
      await expect.poll(async () =>
        page.evaluate(() => window.__ONE_BLADE_E2E__.getState().inputLocked)
      , { timeout: 8000 }).toBe(false);
      await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.slashCore());
      await expect.poll(async () =>
        page.evaluate(() => window.__ONE_BLADE_E2E__.getState().pursuitProgress)
      ).toBe(target);
    }
    await expect.poll(async () => page.evaluate(() => window.__ONE_BLADE_E2E__.getState().inputLocked), { timeout: 8000 }).toBe(false);
    await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.slashCore());
    await expect.poll(async () => page.evaluate(() => window.__ONE_BLADE_E2E__.getState().phase), { timeout: 8000 })
      .toContain("execution_intro");

    // 4) execution_intro 期间真实拖动：不得创建刀路/消耗刀势/改变阶段（输入锁验证）
    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    const energyBefore = state.energy;
    const phaseBefore = state.phase;
    const c = canvasToScreen(core.cx, core.cy);
    await page.mouse.move(c.x - 30, c.y - 30);
    await page.mouse.down();
    await page.mouse.move(c.x + 30, c.y + 30, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state.energy).toBeCloseTo(energyBefore, 1);
    expect(state.pointerDown).toBe(false);
    expect(state.currentSlashActive).toBe(false);
    expect(state.phase).toBe(phaseBefore);

    expect(pageErrors).toEqual([]);
  });
});
