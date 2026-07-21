import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf-8"));

/**
 * 轻量真实触摸输入 E2E（非阻挡）。
 * 覆盖审计五：pointerType=touch、触摸滑动、pointercancel。
 *   - 真实 touch 拖动左肩一次 → 0/3→1/3
 *   - 触摸中途取消（touchCancel → 浏览器派发 pointercancel → onPointerCancel→handlePointerUp）
 *     → pointerDown=false、currentSlashActive=false
 * 不重复完整 Boss 六刀流程。
 * 运行于 playwright.touch.config.ts（hasTouch:true，非阻挡）。
 */
test.describe("Boss真实触摸输入E2E（非阻挡）", () => {
  test("触摸拖动左肩→1/3；触摸取消→输入清空", async ({ page, context }) => {
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

    await expect.poll(async () =>
      page.evaluate(() => window.__ONE_BLADE_E2E__.getState().inputLocked)
    , { timeout: 8000 }).toBe(false);

    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const scaleX = box!.width / 390;
    const scaleY = box!.height / 844;
    const armor0 = await page.evaluate(() => window.__ONE_BLADE_E2E__.getTargets().armorTargets[0]);
    expect(armor0).toBeTruthy();
    const p = { x: box!.x + armor0.cx * scaleX, y: box!.y + armor0.cy * scaleY };

    // 真实触摸：通过 CDP Input.dispatchTouchEvent 派发 pointerType=touch 的拖拽
    const client = await context.newCDPSession(page);
    const offset = 28;
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x - offset, y: p.y }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x - offset / 2, y: p.y }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x + offset / 2, y: p.y }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x + offset, y: p.y }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await expect.poll(async () =>
      page.evaluate(() => window.__ONE_BLADE_E2E__.getState().armorProgress)
    , { timeout: 5000 }).toBe("1/3");

    // 触摸中途取消：按下并滑动后取消 → 浏览器派发 pointercancel
    await expect.poll(async () =>
      page.evaluate(() => window.__ONE_BLADE_E2E__.getState().inputLocked)
    , { timeout: 8000 }).toBe(false);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x + 10, y: p.y }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });

    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
      return { pointerDown: s.pointerDown, currentSlashActive: s.currentSlashActive };
    }, { timeout: 5000 }).toEqual({ pointerDown: false, currentSlashActive: false });

    expect(pageErrors).toEqual([]);
  });
});
