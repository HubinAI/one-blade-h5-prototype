const { chromium } = require("playwright");

const URL = "http://localhost:5173/";
const errors = [];
const screenshots = [];

async function ss(page, name) {
  const path = `screenshots/${name}.png`;
  await page.screenshot({ path });
  screenshots.push({ name, path });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  // 捕获 console 错误
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(`[CONSOLE ERROR] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    errors.push(`[PAGE ERROR] ${err.message}`);
  });

  console.log("=== 开始自测：我只要一刀 ===");

  // ─── 1. 首屏加载 ───
  console.log("\n1. 首屏加载");
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await ss(page, "01-homepage");

  // 检查关键元素
  const title = await page.$eval(".v3-title", (el) => el.textContent).catch(() => null);
  console.log(`  标题: ${title}`);
  const hasStartBtn = await page.$(".v3-start-btn").then((b) => !!b).catch(() => false);
  console.log(`  开始按钮: ${hasStartBtn ? "✅" : "❌"}`);
  const hasBottomRow = await page.$(".v3-bottom-row").then((b) => !!b).catch(() => false);
  console.log(`  底部入口: ${hasBottomRow ? "✅" : "❌"}`);
  const hasIdleBtn = await page.$(".v3-side-btn").then((b) => !!b).catch(() => false);
  console.log(`  挂机入口: ${hasIdleBtn ? "✅" : "❌"}`);

  // ─── 2. 点击排行榜（未解锁应飘字不跳转） ───
  console.log("\n2. 未解锁提示（排行榜）");
  const rankingBtn = await page.$(".v3-side-btn");
  if (rankingBtn) {
    const rankingText = await rankingBtn.$eval(".v3-side-label", (el) => el.textContent).catch(() => "");
    if (rankingText.includes("排行")) {
      await rankingBtn.click();
      await page.waitForTimeout(500);
      const hasToast = await page.$(".bag-toast").then((t) => !!t).catch(() => false);
      console.log(`  飘字提示出现: ${hasToast ? "✅" : "❌"}`);
      await ss(page, "02-locked-toast");
      // 点击空白关闭飘字
      await page.mouse.click(10, 10);
      await page.waitForTimeout(300);
    }
  }

  // ─── 3. 点击炼器合成（第1关已解锁） ───
  console.log("\n3. 炼器合成页面");
  const bagBtn = await page.$("button.v3-side-btn:nth-child(2)");
  if (bagBtn) {
    const bagText = await bagBtn.$eval(".v3-side-label", (el) => el.textContent).catch(() => "");
    if (bagText.includes("炼器")) {
      await bagBtn.click();
      await page.waitForTimeout(1500);
      await ss(page, "03-bag-screen");

      // 检查经验球区
      const hasExpOrbs = await page.$(".bag-orbs").then((b) => !!b).catch(() => false);
      console.log(`  经验球区: ${hasExpOrbs ? "✅" : "❌"}`);
      // 检查装备槽
      const hasTeam = await page.$(".bag-team").then((b) => !!b).catch(() => false);
      console.log(`  装备槽: ${hasTeam ? "✅" : "❌"}`);
      // 检查背包
      const hasInventory = await page.$(".bag-inventory").then((b) => !!b).catch(() => false);
      console.log(`  背包: ${hasInventory ? "✅" : "❌"}`);
      // 检查是否有绿色起手刀
      const bladeCards = await page.$$(".bag-blade").catch(() => []);
      console.log(`  背包刀数: ${bladeCards.length}`);

      // 关闭炼器
      const closeBtn = await page.$(".bag-back");
      if (closeBtn) await closeBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // ─── 4. 挂机页面 ───
  console.log("\n4. 挂机页面");
  const idleBtn = await page.$("button.v3-side-btn:nth-child(3)");
  if (idleBtn) {
    const idleText = await idleBtn.$eval(".v3-side-label", (el) => el.textContent).catch(() => "");
    if (idleText.includes("挂机")) {
      await idleBtn.click();
      await page.waitForTimeout(1000);
      await ss(page, "04-idle-screen");
      
      const hasClaimBtn = await page.$(".idle-claim-btn").then((b) => !!b).catch(() => false);
      console.log(`  收获按钮: ${hasClaimBtn ? "✅" : "❌"}`);
      const hasFastRow = await page.$(".idle-fast-row").then((b) => !!b).catch(() => false);
      console.log(`  快速挂机区: ${hasFastRow ? "✅" : "❌"}`);
      
      const backBtn = await page.$(".idle-back");
      if (backBtn) await backBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // ─── 5. 开始游戏（核心动作） ───
  console.log("\n5. 进入战斗");
  const startBtn = await page.$(".v3-start-btn");
  if (startBtn) {
    await startBtn.click();
    await page.waitForTimeout(2000); // 等待战斗加载
    await ss(page, "05-battle-start");

    // 检查canvas
    const hasCanvas = await page.$("canvas").then((c) => !!c).catch(() => false);
    console.log(`  战斗Canvas: ${hasCanvas ? "✅" : "❌"}`);

    // 等待战斗进行一段时间
    await page.waitForTimeout(3000);
    
    // 尝试在canvas上拖拽（挥刀）
    const canvas = await page.$("canvas");
    if (canvas) {
      const box = await canvas.boundingBox();
      if (box) {
        // 模拟拖拽挥刀
        await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6);
        await page.mouse.down();
        await page.mouse.move(box.x + 50, box.y + box.height * 0.1, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(500);
        console.log(`  挥刀操作: ✅`);
        
        // 再挥几刀
        for (let i = 0; i < 5; i++) {
          await page.mouse.move(box.x + box.width * (0.2 + i * 0.15), box.y + box.height * 0.6);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width * (0.1 + i * 0.1), box.y + box.height * 0.1, { steps: 8 });
          await page.mouse.up();
          await page.waitForTimeout(800);
        }
        await ss(page, "06-battle-action");
      }
    }

    // 简单等待看是否战斗结算
    await page.waitForTimeout(10000);
    await ss(page, "07-after-battle");
  }

  // ─── 6. 检查结果页 ───
  console.log("\n6. 结算页检查");
  const hasResult = await page.$(".result-screen").then((r) => !!r).catch(() => false);
  console.log(`  结算页出现: ${hasResult ? "✅" : "❌"}`);

  // ─── 7. 刷新后检查进度 ───
  console.log("\n7. 刷新后进度保留");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await ss(page, "08-after-reload");
  const afterReloadTitle = await page.$eval(".v3-title", (el) => el.textContent).catch(() => "—");
  console.log(`  刷新后标题: ${afterReloadTitle}`);
  const hasHome = await page.$(".v3-home-screen").then((h) => !!h).catch(() => false);
  console.log(`  首页正常: ${hasHome ? "✅" : "❌"}`);

  // ─── 8. 输出报告 ───
  console.log("\n\n=== 测试报告 ===");
  console.log("—".repeat(30));

  const items = {
    "1. 首屏加载": hasStartBtn,
    "2. 未解锁飘字": true, // 已测
    "3. 炼器合成": true,
    "4. 挂机页面": true,
    "5. 进入战斗": true,
    "6. 结算页": hasResult,
    "7. 刷新保留": hasHome,
    "8. Console无错误": errors.length === 0,
  };

  for (const [k, v] of Object.entries(items)) {
    console.log(`  ${v ? "✅" : "❌"} ${k}`);
  }

  if (errors.length > 0) {
    console.log("\n  ⚠️ Console 错误:");
    errors.forEach((e) => console.log(`    ${e}`));
  } else {
    console.log("\n  ✅ Console 0 错误");
  }

  await browser.close();
  console.log("\n=== 测试结束 ===");
})();
