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

  await page.click(".v3-start-btn");
  await page.waitForTimeout(4500); // 4s首发
  await page.screenshot({ path: "screenshots/subslash-1.png" });
  await page.waitForTimeout(80); // 弧线中点
  await page.screenshot({ path: "screenshots/subslash-2.png" });
  await page.waitForTimeout(80); // 弧线尾
  await page.screenshot({ path: "screenshots/subslash-3.png" });
  console.log("Console错误:", errors.length);
  if (errors.length) errors.forEach((e) => console.log("  " + e));
  await browser.close();
})();
