import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf-8"));
const expectedVersion = `V${packageJson.version.replace(/\./g, "")}`;

/**
 * 高DPR 真实坐标轻量用例（非阻挡，仅 deviceScaleFactor=3 下运行）。
 * 覆盖审计三的缺口：高DPR Canvas 坐标换算、真实 Pointer 输入、目标 Hit Area 是否错位。
 * 只拖动左肩护甲一次 → 0/3→1/3，不跑完整 Boss 流程。
 */
test.describe("Boss高DPR真实坐标E2E（非阻挡）", () => {
  test("高DPR下真实mouse拖动左肩一次 → 破甲0/3→1/3", async ({ page }) => {
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

    await page.getByRole("button", { name: /练气突破/ }).click();
    await expect(page.locator("canvas")).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(() => typeof window.__ONE_BLADE_E2E__ !== "undefined")
    , { timeout: 10000 }).toBe(true);

    // 跳过开场动画，加速到达 armor
    await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.skipIntro());
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return s.phase;
    }, { timeout: 10000 }).toBe("armor");

    // 等待可命中（护甲切换延迟清零）
    await expect.poll(async () =>
      page.evaluate(() => window.__ONE_BLADE_E2E__.getState().inputLocked)
    , { timeout: 8000 }).toBe(false);

    const state0 = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
    expect(state0.armorProgress).toBe("0/3");

    // Canvas 坐标换算（design → client 的精确逆映射，与 GameCanvas 指针映射一致）
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const scaleX = box!.width / 390;
    const scaleY = box!.height / 844;
    const armor0 = await page.evaluate(() => window.__ONE_BLADE_E2E__.getTargets().armorTargets[0]);
    expect(armor0).toBeTruthy();
    const p = { x: box!.x + armor0.cx * scaleX, y: box!.y + armor0.cy * scaleY };

    // 真实 mouse 拖拽：水平穿过目标中心（高DPR 下验证坐标换算不偏差）
    const offset = 28;
    await page.mouse.move(p.x - offset, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x - offset / 2, p.y, { steps: 16 });
    await page.mouse.move(p.x + offset / 2, p.y, { steps: 16 });
    await page.mouse.move(p.x + offset, p.y, { steps: 16 });
    await page.mouse.up();

    // 拖拽后轮询读取，避免慢速CI提前读旧值（审计四）
    await expect.poll(async () =>
      page.evaluate(() => window.__ONE_BLADE_E2E__.getState().armorProgress)
    , { timeout: 5000 }).toBe("1/3");

    expect(pageErrors).toEqual([]);
  });
});
