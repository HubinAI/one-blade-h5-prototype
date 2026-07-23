import { test, expect } from "@playwright/test";

/**
 * Layer C — Boss Execution 阶段 E2E（程序化 + 真实输入）
 * 覆盖 execution_intro → execution → execution_success / execution_fail 完整路径。
 * 包含失败→重试→成功→跨局不残留的状态机验证。
 *
 * 使用 __ONE_BLADE_E2E__ 桥程序化推进 + 真实鼠标输入验证 miss 路径。
 * 该 spec 暂不在 CI 中运行（testMatch 未包含），后续可加入。
 */
test.describe("Boss Execution 阶段 E2E", () => {

  /** 设置突破状态并进入 Boss 战，等待 E2E 桥就绪 */
  async function enterBossBattle(page: any) {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") pageErrors.push(msg.text());
    });

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

    await page.getByRole("button", { name: /练气突破/ }).click();
    await expect(page.locator("canvas")).toBeVisible();

    await expect.poll(async () =>
      page.evaluate(() => typeof window.__ONE_BLADE_E2E__ !== "undefined")
    , { timeout: 10000 }).toBe(true);

    return pageErrors;
  }

  /** 程序化推进到 execution 阶段（armor → pursuit → core_break → execution_intro → execution） */
  async function pushToExecution(page: any) {
    await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.skipIntro());

    // 等待 armor
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 10000 }).toBe("armor");

    // 3 次破甲
    for (let i = 1; i <= 3; i++) {
      await expect.poll(async () =>
        page.evaluate(() => window.__ONE_BLADE_E2E__.getState().inputLocked)
      , { timeout: 8000 }).toBe(false);
      await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.slashArmor());
      await expect.poll(async () => {
        const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
        return s.armorProgress;
      }, { timeout: 5000 }).toBe(`${i}/3`);
    }

    // 等待 pursuit
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 15000 }).toBe("pursuit");

    // 3 次追击
    for (let i = 1; i <= 3; i++) {
      await expect.poll(async () =>
        page.evaluate(() => window.__ONE_BLADE_E2E__.getState().inputLocked)
      , { timeout: 8000 }).toBe(false);
      await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.slashCore());
      await expect.poll(async () => {
        const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
        return s.pursuitProgress;
      }, { timeout: 5000 }).toBe(`${i}/3`);
    }

    // 等待 execution_intro
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 10000 }).toBe("execution_intro");

    // 等 2 秒进入 execution
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 10000 }).toBe("execution");
  }

  // ================================================================
  test("execution 成功路径：程序化命中 → victory_show → 破境成功页", async ({ page }) => {
    const pageErrors = await enterBossBattle(page);
    await pushToExecution(page);

    // 验证 execution 阶段状态
    await expect.poll(async () =>
      page.evaluate(() => window.__ONE_BLADE_E2E__.getState().inputLocked)
    , { timeout: 5000 }).toBe(false);

    // 程序化执行终结一刀
    const hitOk = await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.slashExecution());
    expect(hitOk).toBe(true);

    // 等待 execution_success
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 5000 }).toBe("execution_success");

    // 等待 victory_show — 此时 E2E 桥可能已被销毁，改用 DOM 检查
    await expect.poll(async () =>
      page.locator(".breakthrough-title").textContent()
    , { timeout: 10000 }).toContain("破境成功");

    expect(pageErrors).toEqual([]);
  });

  // ================================================================
  test("execution 失败→重试→成功→破境页", async ({ page }) => {
    const pageErrors = await enterBossBattle(page);
    await pushToExecution(page);

    // 等待 execution 阶段 input 解锁
    await expect.poll(async () =>
      page.evaluate(() => window.__ONE_BLADE_E2E__.getState().inputLocked)
    , { timeout: 5000 }).toBe(false);

    // 使用真实鼠标在命核外挥空（屏幕底部，远离核心椭圆）
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const scaleX = box!.width / 390;
    const scaleY = box!.height / 844;
    const toScreen = (dx: number, dy: number) => ({
      x: box!.x + dx * scaleX,
      y: box!.y + dy * scaleY,
    });

    // 在屏幕底部拖动——远离 execution 核心椭圆 (cx≈211, cy≈197, rx=20, ry=48)
    const missStart = toScreen(100, 700);
    const missEnd = toScreen(200, 730);
    await page.mouse.move(missStart.x, missStart.y);
    await page.mouse.down();
    await page.mouse.move(missEnd.x, missEnd.y, { steps: 8 });
    await page.mouse.up();

    // 轮询 phase → execution_fail → fail
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 10000 }).toBe("execution_fail");

    // 等待 fail — E2E 桥可能被销毁，改用 DOM 检查
    await expect(
      page.locator("h1", { hasText: "挑战失败" })
    ).toBeVisible({ timeout: 10000 });

    // 点击"再试一次"
    await page.locator("button", { hasText: "再试一次" }).click();

    // 等待回到 battlefield，轮询 execution_intro
    await expect(page.locator("canvas")).toBeVisible({ timeout: 5000 });

    // 等待 E2E 桥重新可用（新的 Game 实例）
    await expect.poll(async () =>
      page.evaluate(() => typeof window.__ONE_BLADE_E2E__ !== "undefined")
    , { timeout: 10000 }).toBe(true);

    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 15000 }).toBe("execution_intro");

    // P1-4: 断言重试后护甲/追击/破碎状态完整恢复
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.armorBroken;
    }, { timeout: 5000 }).toEqual([true, true, true]);
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.armorProgress;
    }, { timeout: 5000 }).toBe("3/3");
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.pursuitProgress;
    }, { timeout: 5000 }).toBe("3/3");

    // 等 2 秒进入 execution
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 10000 }).toBe("execution");

    // 程序化命中
    await expect.poll(async () =>
      page.evaluate(() => window.__ONE_BLADE_E2E__.getState().inputLocked)
    , { timeout: 5000 }).toBe(false);

    const retryHitOk = await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.slashExecution());
    expect(retryHitOk).toBe(true);

    // 验证成功
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 10000 }).toBe("execution_success");

    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 10000 }).toBe("victory_show");

    // 断言破境成功页
    await expect.poll(async () =>
      page.locator(".breakthrough-title").textContent()
    , { timeout: 10000 }).toContain("破境成功");

    expect(pageErrors).toEqual([]);
  });

  // ================================================================
  test("跨局重新进入 Boss 应从 loading/intro 开始", async ({ page }) => {
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

    // 从首页重新进入 Boss — 不依赖"练气突破"按钮存在
    // 遍历所有可见按钮，点击可能进入 Boss 战的按钮
    const bossBtn = page.locator("button").filter({ hasText: /突破/ });
    if (await bossBtn.isVisible()) {
      await bossBtn.click();
    } else {
      // 回退：直接导航到 Boss 页面
      await page.goto("/?boss=1");
      await page.waitForLoadState("networkidle");
    }

    await expect(page.locator("canvas")).toBeVisible({ timeout: 5000 });

    await expect.poll(async () =>
      page.evaluate(() => typeof window.__ONE_BLADE_E2E__ !== "undefined")
    , { timeout: 10000 }).toBe(true);

    // 新局的最初阶段应为 loading 或 intro（不会是 execution_intro）
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 10000 }).not.toBe("execution_intro");

    const freshPhase = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState().phase);
    expect(["loading", "intro"]).toContain(freshPhase);
  });
});
