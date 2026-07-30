const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "..", "..", "e2e-test-output");
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:5173";

function log(msg) {
  console.log(`[TEST] ${msg}`);
  fs.appendFileSync(path.join(OUT, "test-log.txt"), `[${new Date().toISOString()}] ${msg}\n`);
}

const errors = [];

(async () => {
  log("=== 启动浏览器 ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errLog = [];

  page.on("console", (msg) => {
    const text = `[CONSOLE ${msg.type()}] ${msg.text()}`;
    if (msg.type() === "error") errLog.push(text);
  });
  page.on("pageerror", (err) => errLog.push(`[PAGE_ERROR] ${err.message}`));
  page.on("requestfailed", (req) => errLog.push(`[NET_ERR] ${req.url()} ${req.failure()?.errorText}`));

  // ────── 1. 启动加载 ──────
  log("【1/7】启动加载");
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "01-home.png"), fullPage: true });
  const html = await page.content();
  const hasCanvas = html.includes("challenge-card") || html.includes("game-canvas");
  log(`首页渲染: ${hasCanvas ? "正常" : "可能异常"}`);
  if (errLog.length > 0) log(`启动时错误: ${errLog.slice(0, 5).join(" | ")}`);

  // ────── 2. 进入游戏 ──────
  log("【2/7】进入游戏");
  const startBtn = await page.$("text=开始挑战");
  if (startBtn) {
    await startBtn.click();
    log("点击了开始挑战");
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, "02-battle.png"), fullPage: true });
  }

  // 检查是否进入了战斗 (game canvas)
  const hasGameCanvas = await page.$("canvas.game-canvas");
  if (hasGameCanvas) {
    log("战斗Canvas已出现");
  } else {
    // 可能体力不足或需要先交互
    log("战斗Canvas未出现,检查当前页面");
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 200));
    log(`页面文字: ${bodyText}`);
    // 尝试点击任意可交互区域
    await page.mouse.click(200, 200);
    await page.waitForTimeout(1000);
  }

  // ────── 3. 核心操作 ──────
  log("【3/7】核心操作");
  const canvas = await page.$("canvas.game-canvas");
  if (canvas) {
    // 拖拽挥刀操作
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      // 模拟拖拽挥刀
      await page.mouse.move(cx - 60, cy + 40);
      await page.mouse.down();
      await page.mouse.move(cx + 60, cy - 40, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      log("完成一次挥刀操作");
      await page.screenshot({ path: path.join(OUT, "03-slash.png"), fullPage: true });

      // 继续做几次操作
      for (let i = 0; i < 5; i++) {
        const ox = Math.random() * 60 - 30;
        const oy = Math.random() * 40 - 20;
        await page.mouse.move(cx + ox - 40, cy + oy + 20);
        await page.mouse.down();
        await page.mouse.move(cx + ox + 40, cy + oy - 20, { steps: 6 });
        await page.mouse.up();
        await page.waitForTimeout(800);
      }
      log("完成多轮挥刀");
      await page.screenshot({ path: path.join(OUT, "04-multi-slash.png"), fullPage: true });
    }
  }

  // ────── 4. 等待战斗结束或检查循环 ──────
  log("【4/7】战斗循环");
  await page.waitForTimeout(8000);
  await page.screenshot({ path: path.join(OUT, "05-after-battle.png"), fullPage: true });

  // 检查是否有结算页出现
  const resultScreen = await page.$("text=击败") || await page.$("text=评分") || await page.$("text=结算");
  if (resultScreen) {
    log("结算页已出现");
    await page.screenshot({ path: path.join(OUT, "06-result.png"), fullPage: true });
  }

  // ────── 5. 广告触点 ──────
  log("【5/7】商业化触点");
  const adRelated = await page.$("text=广告") || await page.$("text=翻倍") || await page.$("text=双倍");
  if (adRelated) log("广告触点可达");
  else log("广告触点未在当前页面找到");

  // ────── 6. 刷新检查留存 ──────
  log("【6/7】留存检查");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "07-reload.png"), fullPage: true });
  const reloadHtml = await page.content();
  const reloadNormal = reloadHtml.includes("challenge-card");
  log(`刷新后首页正常: ${reloadNormal}`);

  // ────── 7. Console 错误汇总 ──────
  log("【7/7】错误捕获");
  log(`全部 console 错误: ${errLog.length > 0 ? errLog.join("\n") : "无"}`);

  // ────── 输出报告 ──────
  log("\n========== 自测报告 ==========");
  const checks = [
    { name: "1. 启动加载", pass: hasCanvas, detail: hasCanvas ? "首页正常渲染" : "可能异常,未找到challenge-card" },
    { name: "2. 进入游戏", pass: hasGameCanvas !== null, detail: hasGameCanvas ? "战斗Canvas已出现" : "战斗未进入,需检查体力/交互" },
    { name: "3. 核心操作(挥刀)", pass: hasGameCanvas !== null, detail: hasGameCanvas ? "挥刀操作已执行" : "未进入战斗,无法验证" },
    { name: "4. 核心循环", pass: resultScreen !== null, detail: resultScreen ? "有结算页面" : "未在超时内看到结算" },
    { name: "5. 商业化触点", pass: adRelated !== null, detail: adRelated ? "广告触点可达" : "未在当前页找到广告相关文案" },
    { name: "6. 留存(刷新)", pass: reloadNormal, detail: reloadNormal ? "刷新后首页正常" : "刷新后异常" },
    { name: "7. 错误捕获", pass: errLog.length === 0, detail: errLog.length === 0 ? "无错误" : `有 ${errLog.length} 条错误` },
  ];

  for (const c of checks) {
    const icon = c.pass ? "✅" : "❌";
    fs.appendFileSync(path.join(OUT, "report.txt"), `${icon} ${c.name}: ${c.detail}\n`);
    log(`${icon} ${c.name}: ${c.detail}`);
  }

  if (errLog.length > 0) {
    fs.appendFileSync(path.join(OUT, "report.txt"), "\n--- Bug清单 ---\n");
    for (const e of errLog) {
      fs.appendFileSync(path.join(OUT, "report.txt"), `${e}\n`);
      log(`BUG: ${e}`);
    }
  }

  const allPass = checks.every(c => c.pass);
  fs.appendFileSync(path.join(OUT, "report.txt"), `\n交付判断: ${allPass ? "✅ Go" : "⚠️ 需修复后重新验证"}\n`);

  await browser.close();
  log("浏览器已关闭");
})();
