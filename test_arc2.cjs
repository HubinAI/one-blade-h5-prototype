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
  // 等4秒 + 0.15s（弧线中点）
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(50);
    await page.screenshot({ path: `screenshots/arc2-${i}.png` });
  }
  await browser.close();
})();
