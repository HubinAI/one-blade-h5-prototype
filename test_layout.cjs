const { chromium } = require("playwright");
const URL = "http://localhost:5173/";
const errors = [];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`[CONSOLE] ${msg.text()}`); });
  page.on("pageerror", (err) => errors.push(`[PAGE] ${err.message}`));

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  // 清空localStorage，强制使用新逻辑
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // 截图：首页
  await page.screenshot({ path: "screenshots/fix-01-homepage.png" });

  // 检查各元素是否在合理位置
  const checks = {
    "标题存在": await page.$eval(".v3-title", (e) => e.textContent).then((t) => t.trim()).catch(() => null),
    "开始按钮存在": await page.$(".v3-start-btn").then((b) => !!b).catch(() => false),
    "对刀动效": await page.$(".v3-blade-clash").then((b) => !!b).catch(() => false),
    "挂机按钮": await page.$(".v3-idle-btn").then((b) => !!b).catch(() => false),
    "排行入口": await page.$$eval(".v3-side-btn .v3-side-label", (els) => els.map((e) => e.textContent)).catch(() => []),
  };

  // 检查布局：开始按钮应该在中央，不是右上角
  const btnBox = await page.$eval(".v3-start-btn", (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }).catch(() => null);
  checks["开始按钮位置"] = btnBox;

  const homeBox = await page.$eval(".v3-home-screen", (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }).catch(() => null);
  checks["首页容器"] = homeBox;

  const titleBox = await page.$eval(".v3-title", (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }).catch(() => null);
  checks["标题位置"] = titleBox;

  const idleBox = await page.$eval(".v3-idle-btn", (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }).catch(() => null);
  checks["挂机按钮位置"] = idleBox;

  // 截第二张图（验证布局）
  await page.screenshot({ path: "screenshots/fix-02-layout.png" });

  // 进入Debug
  const debugBtn = await page.$(".debug-toggle");
  if (debugBtn) {
    await debugBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: "screenshots/fix-03-debug.png" });

    const hasClearCache = await page.$eval(".debug-btn", (b) => b.textContent).catch(() => "");
    const allBtns = await page.$$eval(".debug-btn", (els) => els.map((e) => e.textContent.trim())).catch(() => []);
    checks["Debug按钮列表"] = allBtns;
  }

  console.log(JSON.stringify(checks, null, 2));
  console.log("\nConsole错误数:", errors.length);
  if (errors.length) errors.forEach((e) => console.log(e));

  await browser.close();
})();
