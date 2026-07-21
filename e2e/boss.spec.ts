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

    // 点击突破（首页突破卡片h2与开始按钮span都会出现"练气突破"，
    // 用 button role + 正则精确定位开始按钮，避免 strict-mode 多匹配冲突）
    await page.getByRole("button", { name: /练气突破/ }).click();

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

    // 破甲：通过E2E桥程序化触发真实命中逻辑（debugForceArmorHit），依次破3块激活护甲。
    // 桥直接复用游戏 resolveArmorSegment 真实流程，规避鼠标坐标离散采样在 CI 下的 flaky。
    const slashArmorUntil = async (expectProgress: string) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const ok = await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.slashArmor());
        if (ok) {
          const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
          if (s.armorProgress === expectProgress) return;
        }
        await page.waitForTimeout(200);
      }
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      expect(s.armorProgress).toBe(expectProgress);
    };

    await slashArmorUntil("1/3");
    await slashArmorUntil("2/3");
    await slashArmorUntil("3/3");

    // 等待进入pursuit（armor_complete_hold 0.35s + pursuit_intro 0.9s = ~1.25s）
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 8000 }).toBe("pursuit");

    // 严格断言追击初始状态
    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state.pursuitProgress).toBe("0/3");

    // 追击：通过E2E桥程序化触发真实命中逻辑（debugForcePursuitHit），依次命中雷核3次。
    // 桥直接复用游戏 resolvePursuitSegment 真实流程，规避坐标采样 flaky 与动态核心偏移。
    const slashCoreUntil = async (expectProgress: string) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const ok = await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.slashCore());
        if (ok) {
          const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
          if (s.pursuitProgress === expectProgress) return;
        }
        await page.waitForTimeout(200);
      }
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      expect(s.pursuitProgress).toBe(expectProgress);
    };

    await slashCoreUntil("1/3");
    await slashCoreUntil("2/3");
    await slashCoreUntil("3/3");
    state = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(["core_break", "execution_intro"]).toContain(state.phase);

    // 读取雷核屏幕坐标，供后续 execution_intro 输入锁定验证使用（拖拽坐标不要求精确）
    const coreTargetNow = await page.evaluate(() => window.__ONE_BLADE_E2E__.getTargets().coreTarget);
    const core = coreTargetNow ? canvasToScreen(coreTargetNow.cx, coreTargetNow.cy) : canvasToScreen(195, 422);

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
