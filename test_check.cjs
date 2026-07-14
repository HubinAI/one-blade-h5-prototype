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
  await page.waitForTimeout(4500);
  // 注入console观察
  const result = await page.evaluate(() => {
    return {
      storage: JSON.stringify(localStorage.getItem("one_blade_v04_progression")).substring(0, 800)
    };
  });
  console.log("localStorage:", result.storage);
  await browser.close();
})();
