# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: boss-reactive-full-pointer.spec.ts >> Reactive Boss 全流程时间轴断言 >> 三甲破甲→追击→终结 完整时间轴在预期范围内
- Location: e2e\boss-reactive-full-pointer.spec.ts:191:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "1/3"
Received: "0/3"

Call Log:
- Timeout 15000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- main [ref=e3]:
  - region "战斗" [ref=e4]:
    - button "暂停" [ref=e7] [cursor=pointer]: ❚❚
```

# Test source

```ts
  108 |         await expect.poll(async () => {
  109 |           const s = await getState();
  110 |           return s.armorProgress !== beforeProgress
  111 |             || (s.armorDurability?.[expectedIndex] ?? 100) < previousDurability
  112 |             || s.gameMode === "boss";
  113 |         }, { timeout: 10000 }).toBe(true);
  114 | 
  115 |         const after = await getState();
  116 | 
  117 |         if (after.armorProgress !== beforeProgress) {
  118 |           // P0-1: 切换到下一护甲后 poll activeArmorIndex；但第三甲破后 reactiveController 被置空，
  119 |           // activeArmorIndex 变 undefined — 此时改用 exitSnapshot 验证
  120 |           if (after.armorProgress === "3/3") {
  121 |             return after;
  122 |           }
  123 |           await expect.poll(async () => {
  124 |             const s = await getState();
  125 |             return `${s.armorProgress}|${s.activeArmorIndex}`;
  126 |           }, { timeout: 5000 }).toBe(`${after.armorProgress}|${expectedIndex + 1}`);
  127 |           return await getState();
  128 |         }
  129 | 
  130 |         const afterDurability = after.armorDurability?.[expectedIndex] ?? 100;
  131 |         expect(afterDurability).toBeLessThan(previousDurability);
  132 |         previousDurability = afterDurability;
  133 |       }
  134 | 
  135 |       const finalState = await getState();
  136 |       throw new Error(`Armor ${expectedIndex} not broken after 4 attempts. durability=${finalState.armorDurability?.[expectedIndex]}`);
  137 |     }
  138 | 
  139 |     // 初始状态断言
  140 |     let state = await getState();
  141 |     expect(state.armorProgress).toBe("0/3");
  142 |     expect(state.activeArmorIndex).toBe(0);
  143 | 
  144 |     // 左肩 → 1/3
  145 |     state = await breakCurrentArmorWithMouse(0);
  146 |     expect(state.armorProgress).toBe("1/3");
  147 | 
  148 |     // 右肩 → 2/3
  149 |     state = await breakCurrentArmorWithMouse(1);
  150 |     expect(state.armorProgress).toBe("2/3");
  151 | 
  152 |     // 胸甲 → 3/3
  153 |     await breakCurrentArmorWithMouse(2);
  154 | 
  155 |     // V0723011: 使用 lastReactiveExitSnapshot 稳定断言第三甲（不依赖瞬时 activeArmorIndex=2）
  156 |     await expect.poll(async () => {
  157 |       const s = await getState();
  158 |       return s.lastReactiveExitSnapshot?.armorProgress ?? s.armorProgress;
  159 |     }, { timeout: 10000 }).toBe("3/3");
  160 | 
  161 |     // 验证 exitSnapshot 中 bridgeTriggered=true, armorBroken=[true,true,true], gameMode=bossReactive
  162 |     await expect.poll(async () => {
  163 |       const s = await getState();
  164 |       return s.lastReactiveExitSnapshot?.bridgeTriggered ?? false;
  165 |     }, { timeout: 5000 }).toBe(true);
  166 | 
  167 |     const exitSnap = (await getState()).lastReactiveExitSnapshot;
  168 |     expect(exitSnap).toBeDefined();
  169 |     expect(exitSnap!.armorBroken).toEqual([true, true, true]);
  170 |     expect(exitSnap!.gameMode).toBe("bossReactive");
  171 |     expect(exitSnap!.armorDurability).toEqual([0, 0, 0]);
  172 | 
  173 |     // 等待 bridge → gameMode 切换为 boss
  174 |     await expect.poll(async () => {
  175 |       const s = await getState();
  176 |       return s.gameMode;
  177 |     }, { timeout: 20000 }).toBe("boss");
  178 | 
  179 |     // 等待进入 pursuit
  180 |     await expect.poll(async () => {
  181 |       const s = await getState();
  182 |       return s.phase;
  183 |     }, { timeout: 15000 }).toBe("pursuit");
  184 | 
  185 |     expect(pageErrors).toEqual([]);
  186 |   });
  187 | });
  188 | 
  189 | test.describe("Reactive Boss 全流程时间轴断言", () => {
  190 |   test.setTimeout(120000);
  191 |   test("三甲破甲→追击→终结 完整时间轴在预期范围内", async ({ page }) => {
  192 |     const pageErrors: string[] = [];
  193 |     page.on("pageerror", (err) => pageErrors.push(err.message));
  194 |     page.on("console", (msg) => { if (msg.type() === "error") pageErrors.push(msg.text()); });
  195 |     await page.goto("/?bossFlow=reactive"); await page.waitForLoadState("networkidle");
  196 |     await page.evaluate(() => { const d = JSON.parse(localStorage.getItem("one_blade_v04_progression") || "{}"); d.highestFloor = 6; localStorage.setItem("one_blade_v04_progression", JSON.stringify(d)); });
  197 |     await page.reload(); await page.waitForLoadState("networkidle");
  198 |     await page.getByRole("button", { name: /练气突破/ }).click();
  199 |     await expect(page.locator("canvas")).toBeVisible();
  200 |     await expect.poll(async () => page.evaluate(() => typeof window.__ONE_BLADE_E2E__ !== "undefined"), { timeout: 10000 }).toBe(true);
  201 | 
  202 |     async function gs() { return await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.getState()); }
  203 |     const iid = (await gs()).gameInstanceId;
  204 |     async function a2o() { for (let i = 0; i < 10; i++) { if ((await gs()).objectiveCompleted) break; await page.evaluate(() => (window as any).__ONE_BLADE_E2E__?.forceCutProjectileForTest?.()); await page.waitForTimeout(100); } await expect.poll(async () => (await gs()).phase, { timeout: 18000 }).toBe("armor_opportunity"); }
  205 |     async function drag() { const t = await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.getTargets()); const ap = (t.armorTargets as any[])?.[0]; if (!ap) throw new Error("No armor"); const cb = (await page.locator("canvas").boundingBox())!; const sx = cb.width / 390; const sy = cb.height / 844; const x1 = cb.x + (ap.cx + 60) * sx; const y1 = cb.y + ap.cy * sy; const x2 = cb.x + (ap.cx - 60) * sx; const y2 = cb.y + ap.cy * sy; await page.mouse.move(x1, y1); await page.mouse.down(); for (let i = 1; i <= 10; i++) { const r = i / 10; await page.mouse.move(x1 + (x2 - x1) * r, y1 + (y2 - y1) * r); await page.waitForTimeout(15); } await page.mouse.up(); }
  206 | 
  207 |     await a2o(); await drag();
> 208 |     await expect.poll(async () => (await gs()).armorProgress, { timeout: 15000 }).toBe("1/3");
      |                                                                                   ^ Error: expect(received).toBe(expected) // Object.is equality
  209 |     { const s = await gs(); expect(s.leftBreakTs).toBeGreaterThanOrEqual(8); expect(s.leftBreakTs).toBeLessThanOrEqual(12); expect(s.gameInstanceId).toBe(iid); }
  210 | 
  211 |     await a2o(); await drag();
  212 |     await expect.poll(async () => (await gs()).armorProgress, { timeout: 15000 }).toBe("2/3");
  213 |     { const s = await gs(); expect(s.rightBreakTs).toBeGreaterThanOrEqual(20); expect(s.rightBreakTs).toBeLessThanOrEqual(28); expect(s.gameInstanceId).toBe(iid); }
  214 | 
  215 |     await a2o(); await drag();
  216 |     await expect.poll(async () => { const s = await gs(); return s.lastReactiveExitSnapshot?.armorProgress ?? s.armorProgress; }, { timeout: 15000 }).toBe("3/3");
  217 |     { const s = await gs(); expect(s.chestBreakTs).toBeGreaterThanOrEqual(34); expect(s.chestBreakTs).toBeLessThanOrEqual(45); expect(s.gameInstanceId).toBe(iid); }
  218 | 
  219 |     await expect.poll(async () => (await gs()).gameMode, { timeout: 20000 }).toBe("boss");
  220 |     await expect.poll(async () => (await gs()).phase, { timeout: 15000 }).toBe("pursuit");
  221 |     for (let i = 0; i < 3; i++) { await expect.poll(async () => (await gs()).inputLocked, { timeout: 10000 }).toBe(false); expect(await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.slashCore())).toBe(true); await page.waitForTimeout(100); }
  222 |     await expect.poll(async () => (await gs()).phase, { timeout: 15000 }).toBe("execution_intro");
  223 |     await expect.poll(async () => (await gs()).phase, { timeout: 10000 }).toBe("execution");
  224 |     expect(await page.evaluate(() => (window as any).__ONE_BLADE_E2E__.slashExecution())).toBe(true);
  225 |     await expect.poll(async () => (await gs()).phase, { timeout: 10000 }).toBe("execution_success");
  226 |     { const s = await gs(); expect(s.breakthroughSuccessTs).toBeGreaterThanOrEqual(55); expect(s.breakthroughSuccessTs).toBeLessThanOrEqual(75); expect(s.gameInstanceId).toBe(iid); if (s.leftBreakTs && s.rightBreakTs && s.chestBreakTs && s.breakthroughSuccessTs) { expect(s.leftBreakTs).toBeLessThan(s.rightBreakTs); expect(s.rightBreakTs).toBeLessThan(s.chestBreakTs); expect(s.chestBreakTs).toBeLessThan(s.breakthroughSuccessTs); } }
  227 |     expect(pageErrors).toEqual([]);
  228 |   });
  229 | });
  230 | 
```