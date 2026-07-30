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
  // 等到4s时副刀触发，连续截图覆盖0.22s弧线
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(40);
    await page.screenshot({ path: `screenshots/arc-${i}.png` });
  }
  await browser.close();
})();
