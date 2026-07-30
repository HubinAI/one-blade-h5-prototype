# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: boss-reactive-real-input.spec.ts >> Reactive Boss 真实 Pointer 命中验证 >> V0723015 有目标打空扣1 — opportunity阶段偏离护甲挥刀
- Location: e2e\boss-reactive-real-input.spec.ts:444:3

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 52.12360000001117
Received:   52.756900000011136
```

# Page snapshot

```yaml
- main [ref=e3]:
  - region "战斗" [ref=e4]:
    - button "暂停" [ref=e7] [cursor=pointer]: ❚❚
```

# Test source

```ts
  382 |     expect(pageErrors).toEqual([]);
  383 |   });
  384 | 
  385 |   // ================================================================
  386 |   // V0723015-Final: 4 条真实 Pointer E2E（修正 getTargets 契约 + 完整进入游戏流程）
  387 |   // ================================================================
  388 | 
  389 |   // 共享 setup：进入 Reactive Boss 游戏
  390 |   async function setupReactive(page: import("@playwright/test").Page) {
  391 |     await page.goto("/?bossFlow=reactive");
  392 |     await page.waitForLoadState("networkidle");
  393 |     await page.evaluate(() => {
  394 |       const key = "one_blade_v04_progression";
  395 |       const data = JSON.parse(localStorage.getItem(key) || "{}");
  396 |       data.highestFloor = 6;
  397 |       localStorage.setItem(key, JSON.stringify(data));
  398 |     });
  399 |     await page.reload();
  400 |     await page.waitForLoadState("networkidle");
  401 |     await page.getByRole("button", { name: /练气突破/ }).click();
  402 |     await expect(page.locator("canvas")).toBeVisible();
  403 |     await expect.poll(() => page.evaluate(() => typeof window.__ONE_BLADE_E2E__ !== "undefined"), { timeout: 15000 }).toBe(true);
  404 |   }
  405 | 
  406 |   test("V0723015 armor_closed — threat阶段划过关闭护甲不造成伤害", async ({ page }) => {
  407 |     const pageErrors: string[] = [];
  408 |     page.on("pageerror", (err) => pageErrors.push(err.message));
  409 |     await setupReactive(page);
  410 | 
  411 |     await expect.poll(async () => {
  412 |       const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
  413 |       return s.phase;
  414 |     }, { timeout: 15000 }).toBe("armor_threat");
  415 | 
  416 |     const stateBefore = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
  417 |     const durabilityBefore = stateBefore.armorDurability?.[0] ?? 100;
  418 | 
  419 |     const targets = await page.evaluate(() => window.__ONE_BLADE_E2E__.getTargets());
  420 |     const armor = targets.armorTargets?.[0];
  421 |     expect(armor).toBeDefined();
  422 | 
  423 |     const canvasBox = await page.locator("canvas").boundingBox();
  424 |     const cScaleX = canvasBox!.width / 390;
  425 |     const cScaleY = canvasBox!.height / 844;
  426 | 
  427 |     const sx = canvasBox!.x + (armor.cx - armor.rx) * cScaleX;
  428 |     const sy = canvasBox!.y + armor.cy * cScaleY;
  429 |     const ex = canvasBox!.x + (armor.cx + armor.rx) * cScaleX;
  430 |     const ey = canvasBox!.y + armor.cy * cScaleY;
  431 | 
  432 |     await page.mouse.move(sx, sy);
  433 |     await page.mouse.down();
  434 |     await page.mouse.move(ex, ey, { steps: 5 });
  435 |     await page.mouse.up();
  436 |     await page.waitForTimeout(500);
  437 | 
  438 |     const stateAfter = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
  439 |     const durabilityAfter = stateAfter.armorDurability?.[0] ?? 100;
  440 |     expect(durabilityAfter).toBe(durabilityBefore);
  441 |     expect(pageErrors).toEqual([]);
  442 |   });
  443 | 
  444 |   test("V0723015 有目标打空扣1 — opportunity阶段偏离护甲挥刀", async ({ page }) => {
  445 |     const pageErrors: string[] = [];
  446 |     page.on("pageerror", (err) => pageErrors.push(err.message));
  447 |     await setupReactive(page);
  448 |     // V0723016最终收口P0-1: 正常操作斩弹推进目标（不调 forceCompleteObjective 作弊）
  449 |     for (let cut = 0; cut < 6; cut++) {
  450 |       const s = await page.evaluate(() => window.__ONE_BLADE_E2E__?.getState?.());
  451 |       if (s?.objectiveCompleted) break;
  452 |       await page.evaluate(() => (window as any).__ONE_BLADE_E2E__?.forceCutProjectileForTest?.());
  453 |     }
  454 | 
  455 |     await expect.poll(async () => {
  456 |       const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
  457 |       return s.phase;
  458 |     }, { timeout: 15000 }).toBe("armor_opportunity");
  459 |     // 等 1 秒让弹幕飞出屏幕（forceCutProjectileForTest 产生的弹幕少，1 秒足够）
  460 |     await page.waitForTimeout(1000);
  461 | 
  462 |     const stateBefore = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
  463 |     const energyBefore = stateBefore.bladeMomentum?.current ?? 0;
  464 | 
  465 |     const canvasBox = await page.locator("canvas").boundingBox();
  466 |     const cScaleX = canvasBox!.width / 390;
  467 |     const cScaleY = canvasBox!.height / 844;
  468 | 
  469 |     const sx = canvasBox!.x + 50 * cScaleX;
  470 |     const sy = canvasBox!.y + 700 * cScaleY;
  471 |     const ex = canvasBox!.x + 100 * cScaleX;
  472 |     const ey = canvasBox!.y + 750 * cScaleY;
  473 | 
  474 |     await page.mouse.move(sx, sy);
  475 |     await page.mouse.down();
  476 |     await page.mouse.move(ex, ey, { steps: 5 });
  477 |     await page.mouse.up();
  478 |     await page.waitForTimeout(500);
  479 | 
  480 |     const stateAfter = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
  481 |     const energyAfter = stateAfter.bladeMomentum?.current ?? 0;
> 482 |     expect(energyAfter).toBeLessThan(energyBefore);
      |                         ^ Error: expect(received).toBeLessThan(expected)
  483 |     expect(pageErrors).toEqual([]);
  484 |   });
  485 | 
  486 |   test("V0723015 无目标打空不扣 — threat阶段无弹幕时挥刀无额外惩罚", async ({ page }) => {
  487 |     const pageErrors: string[] = [];
  488 |     page.on("pageerror", (err) => pageErrors.push(err.message));
  489 |     await setupReactive(page);
  490 | 
  491 |     await expect.poll(async () => {
  492 |       const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
  493 |       return s.phase;
  494 |     }, { timeout: 15000 }).toBe("armor_threat");
  495 | 
  496 |     const stateBefore = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
  497 |     const energyBefore = stateBefore.bladeMomentum?.current ?? 0;
  498 | 
  499 |     const canvasBox = await page.locator("canvas").boundingBox();
  500 |     const cScaleX = canvasBox!.width / 390;
  501 |     const cScaleY = canvasBox!.height / 844;
  502 | 
  503 |     const sx = canvasBox!.x + 50 * cScaleX;
  504 |     const sy = canvasBox!.y + 700 * cScaleY;
  505 |     const ex = canvasBox!.x + 100 * cScaleX;
  506 |     const ey = canvasBox!.y + 750 * cScaleY;
  507 | 
  508 |     await page.mouse.move(sx, sy);
  509 |     await page.mouse.down();
  510 |     await page.mouse.move(ex, ey, { steps: 5 });
  511 |     await page.mouse.up();
  512 |     await page.waitForTimeout(500);
  513 | 
  514 |     const stateAfter = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
  515 |     const energyAfter = stateAfter.bladeMomentum?.current ?? 0;
  516 |     expect(energyAfter).toBeLessThanOrEqual(energyBefore);
  517 |     expect(pageErrors).toEqual([]);
  518 |   });
  519 | 
  520 |   test("V0723015 0刀势仍可挥刀 — 刀势不足不禁止PointerDown", async ({ page }) => {
  521 |     const pageErrors: string[] = [];
  522 |     page.on("pageerror", (err) => pageErrors.push(err.message));
  523 |     await setupReactive(page);
  524 | 
  525 |     await expect.poll(async () => {
  526 |       const s = await page.evaluate(() => window.__ONE_BLADE_E2E__.getState());
  527 |       return s.phase === "armor_threat" || s.phase === "armor_opportunity";
  528 |     }, { timeout: 15000 }).toBe(true);
  529 | 
  530 |     const canvasBox = await page.locator("canvas").boundingBox();
  531 |     const cScaleX = canvasBox!.width / 390;
  532 |     const cScaleY = canvasBox!.height / 844;
  533 | 
  534 |     for (let i = 0; i < 10; i++) {
  535 |       const sx = canvasBox!.x + 50 * cScaleX;
  536 |       const sy = canvasBox!.y + 700 * cScaleY;
  537 |       const ex = canvasBox!.x + 200 * cScaleX;
  538 |       const ey = canvasBox!.y + 750 * cScaleY;
  539 |       await page.mouse.move(sx, sy);
  540 |       await page.mouse.down();
  541 |       await page.mouse.move(ex, ey, { steps: 3 });
  542 |       await page.mouse.up();
  543 |       await page.waitForTimeout(200);
  544 |     }
  545 | 
  546 |     const sx = canvasBox!.x + 50 * cScaleX;
  547 |     const sy = canvasBox!.y + 700 * cScaleY;
  548 |     const ex = canvasBox!.x + 200 * cScaleX;
  549 |     const ey = canvasBox!.y + 750 * cScaleY;
  550 |     await page.mouse.move(sx, sy);
  551 |     await page.mouse.down();
  552 |     await page.mouse.move(ex, ey, { steps: 3 });
  553 |     await page.mouse.up();
  554 |     await page.waitForTimeout(300);
  555 | 
  556 |     expect(pageErrors).toEqual([]);
  557 |   });
  558 | });
```