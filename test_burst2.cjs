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
  // 每30ms截图，覆盖4s内
  for (let i = 0; i < 130; i++) {
    await page.screenshot({ path: `screenshots/arc30ms-${String(i).padStart(3,'0')}.png` });
    await page.waitForTimeout(30);
  }
  await browser.close();
})();
