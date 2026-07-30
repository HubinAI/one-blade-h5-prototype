const { chromium } = require("playwright");
const URL = "http://localhost:5173/";
const errors = [];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  await page.screenshot({ path: "screenshots/rollback-01-home.png" });

  // 点击货币+测试
  const coinPill = await page.$(".currency-pill");
  if (coinPill) {
    const box = await coinPill.boundingBox();
    console.log("货币栏位置:", box);
  }

  console.log("Console 错误:", errors.length);
  if (errors.length) errors.forEach((e) => console.log("  " + e));

  await browser.close();
})();
