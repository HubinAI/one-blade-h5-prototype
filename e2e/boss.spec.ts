import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf-8"));
const expectedVersion = `V${packageJson.version.replace(/\./g, "")}`;

/**
 * P4.4A.3 真实Boss Canvas流程 E2E
 * 通过 __ONE_BLADE_E2E__ 桥读取Canvas内部状态
 * 使用 getTargets() 真实坐标，无fallback，严格断言
 */
test.describe("Boss全流程", () => {
  test(`首页版本号精确为${expectedVersion}且无Console错误`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") pageErrors.push(msg.text());
    });

    await page.goto("/?debug=1&e2e=1");
    await page.waitForLoadState("networkidle");

    const versionText = await page.locator(".version-footer").textContent();
    expect(versionText).toContain(expectedVersion);
    expect(pageErrors).toEqual([]);
  });

  test("突破→破甲0/3→3/3→追击0/3→3/3→execution_intro", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") pageErrors.push(msg.text());
    });

    // 设置突破状态
    await page.goto("/?debug=1&e2e=1");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      const key = "one_blade_v04_progression";
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      data.highestFloor = 6;
      localStorage.setItem(key, JSON.stringify(data));
    });
    await page.reload();
    await page.waitForLoadState("networkidle");

    // 首页阶段：E2E桥不应该存在（GameCanvas未挂载）
    const bridgeBefore = await page.evaluate(() => typeof window.__ONE_BLADE_E2E__ !== "undefined");
    expect(bridgeBefore).toBe(false);

    // 点击突破
    await page.getByText("练气突破", { exact: true }).click();

    // 等待Canvas可见
    await expect(page.locator("canvas")).toBeVisible();

    // 等待E2E桥创建（Game构造后才有）
    await expect.poll(async () =>
      page.evaluate(() => typeof window.__ONE_BLADE_E2E__ !== "undefined")
    , { timeout: 10000 }).toBe(true);

    // 等待Boss进入armor阶段（intro约2.85s）
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 10000 }).toBe("armor");

    // 严格断言初始状态
    let state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state.armorProgress).toBe("0/3");
    expect(state.pursuitProgress).toBe("0/3");

    // 获取Canvas坐标转换
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const scaleX = box!.width / 390;
    const scaleY = box!.height / 844;
    const canvasToScreen = (cx: number, cy: number) => ({
      x: box!.x + cx * scaleX,
      y: box!.y + cy * scaleY,
    });

    // 读取真实护甲目标坐标
    const targets = await page.evaluate(() => window.__ONE_BLADE_E2E__.getTargets());
    expect(targets.armorTargets.length).toBeGreaterThanOrEqual(3);

    // 破甲第1刀：左肩（armorTargets[0]）
    const lShoulder = canvasToScreen(targets.armorTargets[0].cx, targets.armorTargets[0].cy);
    await page.mouse.move(lShoulder.x - 30, lShoulder.y - 30);
    await page.mouse.down();
    await page.mouse.move(lShoulder.x + 30, lShoulder.y + 30, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(800);

    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state.armorProgress).toBe("1/3");

    // 破甲第2刀：右肩（armorTargets[1]）
    const rShoulder = canvasToScreen(targets.armorTargets[1].cx, targets.armorTargets[1].cy);
    await page.mouse.move(rShoulder.x - 30, rShoulder.y - 30);
    await page.mouse.down();
    await page.mouse.move(rShoulder.x + 30, rShoulder.y + 30, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(800);

    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state.armorProgress).toBe("2/3");

    // 破甲第3刀：胸甲（armorTargets[2]）
    const chest = canvasToScreen(targets.armorTargets[2].cx, targets.armorTargets[2].cy);
    await page.mouse.move(chest.x - 30, chest.y - 30);
    await page.mouse.down();
    await page.mouse.move(chest.x + 30, chest.y + 30, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state.armorProgress).toBe("3/3");

    // 等待进入pursuit（armor_complete_hold 0.35s + pursuit_intro 0.9s = ~1.25s）
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 8000 }).toBe("pursuit");

    // 严格断言追击初始状态
    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state.pursuitProgress).toBe("0/3");

    // 读取真实雷核坐标
    const coreTarget = await page.evaluate(() => window.__ONE_BLADE_E2E__.getTargets().coreTarget);
    expect(coreTarget).toBeTruthy();
    const core = canvasToScreen(coreTarget.cx, coreTarget.cy);

    // 追击第1刀：多segment穿过雷核
    await page.mouse.move(core.x - 50, core.y - 30);
    await page.mouse.down();
    await page.mouse.move(core.x - 20, core.y - 10, { steps: 5 });
    await page.mouse.move(core.x + 10, core.y + 10, { steps: 5 });
    await page.mouse.move(core.x + 40, core.y + 30, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state.pursuitProgress).toBe("1/3");

    // 追击第2刀
    await page.mouse.move(core.x - 50, core.y + 30);
    await page.mouse.down();
    await page.mouse.move(core.x - 20, core.y + 10, { steps: 5 });
    await page.mouse.move(core.x + 10, core.y - 10, { steps: 5 });
    await page.mouse.move(core.x + 40, core.y - 30, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state.pursuitProgress).toBe("2/3");

    // 追击第3刀
    await page.mouse.move(core.x - 40, core.y - 40);
    await page.mouse.down();
    await page.mouse.move(core.x, core.y, { steps: 6 });
    await page.mouse.move(core.x + 40, core.y + 40, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state.pursuitProgress).toBe("3/3");
    expect(["core_break", "execution_intro"]).toContain(state.phase);

    // 等待进入execution_intro（core_break 1.2s）
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 5000 }).toBe("execution_intro");

    // 严格验证execution_intro期间输入锁定
    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    const energyBefore = state.energy;
    const phaseBefore = state.phase;

    // 尝试拖动
    await page.mouse.move(core.x - 30, core.y - 30);
    await page.mouse.down();
    await page.mouse.move(core.x + 30, core.y + 30, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // 严格断言：刀势不变、无活跃刀路、pointerDown已释放、阶段不变
    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state.energy).toBeCloseTo(energyBefore, 1);
    expect(state.pointerDown).toBe(false);
    expect(state.currentSlashActive).toBe(false);
    expect(state.phase).toBe(phaseBefore);

    // 无页面错误
    expect(pageErrors).toEqual([]);
  });
});
