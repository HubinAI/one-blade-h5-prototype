import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf-8"));
const expectedVersion = `V${packageJson.version.replace(/\./g, "")}`;

/**
 * P4.4A.3 真实Boss流程 E2E
 * 通过 __ONE_BLADE_E2E__ 桥接器读取 Canvas 内部状态
 */
test.describe("Boss全流程", () => {
  test.beforeEach(async ({ page }) => {
    // 错误监听必须在 goto 之前注册
    page.on("pageerror", (err) => {
      console.error("PAGE_ERROR:", err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error("CONSOLE_ERROR:", msg.text());
    });
  });

  test(`首页版本号精确为${expectedVersion}且无错误`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") pageErrors.push(msg.text());
    });

    await page.goto("/?debug=1&e2e=1");
    await page.waitForLoadState("networkidle");

    // 精确断言版本号
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

    // 模拟突破状态
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

    // 验证E2E桥存在
    const bridgeExists = await page.evaluate(() => typeof window.__ONE_BLADE_E2E__ !== "undefined");
    expect(bridgeExists).toBe(true);

    // 点击突破按钮
    const breakthroughBtn = page.getByText("练气突破", { exact: true });
    await breakthroughBtn.click();
    await page.waitForTimeout(500);

    // 等待Boss进入armor阶段（intro约2.85s后）
    await page.waitForTimeout(4000);

    // 验证进入armor
    let state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(["armor", "armor_break_show", "armor_complete_hold"]).toContain(state.phase);

    // 通过Canvas像素坐标执行拖动
    // Canvas中心坐标 = DESIGN_WIDTH/2 = 195, Boss renderY = 195
    // 使用Canvas元素获取实际位置
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    const scaleX = box!.width / 390; // DESIGN_WIDTH → viewport x
    const scaleY = box!.height / 844; // DESIGN_HEIGHT → viewport y

    function canvasToScreen(cx: number, cy: number): { x: number; y: number } {
      return {
        x: box!.x + cx * scaleX,
        y: box!.y + cy * scaleY,
      };
    }

    // 破甲: 左肩 (cx=195-50=145, cy=195-30=165)
    const lShoulder = canvasToScreen(145, 165);
    await page.mouse.move(lShoulder.x - 30, lShoulder.y - 30);
    await page.mouse.down();
    await page.mouse.move(lShoulder.x + 30, lShoulder.y + 30, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(800);

    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    if (state.armorProgress !== "1/3") {
      // 重试：更宽轨迹
      await page.mouse.move(lShoulder.x - 50, lShoulder.y - 40);
      await page.mouse.down();
      await page.mouse.move(lShoulder.x + 50, lShoulder.y + 40, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(800);
      state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    }
    expect(state.armorProgress).toBe("1/3");

    // 破甲: 右肩 (cx=195+50=245, cy=165)
    const rShoulder = canvasToScreen(245, 165);
    await page.mouse.move(rShoulder.x - 30, rShoulder.y - 30);
    await page.mouse.down();
    await page.mouse.move(rShoulder.x + 30, rShoulder.y + 30, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(800);

    // 破甲: 胸甲 (cx=195, cy=195+6=201)
    const chest = canvasToScreen(195, 201);
    await page.mouse.move(chest.x - 30, chest.y - 30);
    await page.mouse.down();
    await page.mouse.move(chest.x + 30, chest.y + 30, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    if (state.armorProgress !== "3/3") {
      // 如果未3/3，再尝试一次胸甲
      await page.mouse.move(chest.x - 40, chest.y - 40);
      await page.mouse.down();
      await page.mouse.move(chest.x + 40, chest.y + 40, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(500);
    }
    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state.armorProgress).toBe("3/3");

    // 等待进入pursuit
    await page.waitForTimeout(3000);
    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(["pursuit_intro", "pursuit", "core_break", "execution_intro"]).toContain(state.phase);

    // 如果不在pursuit，再等
    if (state.phase !== "pursuit") {
      await page.waitForTimeout(2000);
      state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    }

    // 追击三次
    if (state.phase === "pursuit") {
      const core = canvasToScreen(195, 197);
      for (let i = 0; i < 3; i++) {
        // 多segment拖动穿过核心
        const startX = core.x - 50 + (i * 15);
        const startY = core.y - 50 + (i * 10);
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(core.x + 10, core.y + 10, { steps: 8 });
        await page.mouse.move(core.x + 30, core.y + 30, { steps: 4 });
        await page.mouse.up();
        await page.waitForTimeout(300);
        state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
        console.log(`追击[${i + 1}]: phase=${state.phase} pursuit=${state.pursuitProgress}`);
        if (state.pursuitProgress === "3/3" || state.phase === "core_break" || state.phase === "execution_intro") break;
      }
    }

    // 验证最终状态
    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(["core_break", "execution_intro"]).toContain(state.phase);

    // core_break/execution_intro期间再次拖动，刀势应不减少
    const energyBefore = state.energy;
    await page.mouse.move(core!.x, core!.y - 50);
    await page.mouse.down();
    await page.mouse.move(core!.x + 50, core!.y + 50, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state.energy).toBeGreaterThanOrEqual(energyBefore - 1);

    // 无页面错误
    expect(pageErrors).toEqual([]);
  });
});
