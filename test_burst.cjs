const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 390, height: 844 } }).then(c => c.newPage());

  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  await page.click(".v3-start-btn");
  // 注入一个监听器: 每隔0.05s截图，5s内30张
  for (let i = 0; i < 30; i++) {
    await page.screenshot({ path: `screenshots/arcburst-${String(i).padStart(2,'0')}.png` });
    await page.waitForTimeout(150); // 4s左右时副刀触发
  }
  await browser.close();
})();
