const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 390, height: 844 } }).then(c => c.newPage());

  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // 直接进游戏（不打开炼器合成）
  await page.click(".v3-start-btn");
  await page.waitForTimeout(5000); // 等待4s首发 + 1s观察
  await page.screenshot({ path: "screenshots/subblade-test.png" });
  console.log("Console错误:", errors.length);
  if (errors.length) errors.forEach((e) => console.log("  " + e));
  await browser.close();
})();
