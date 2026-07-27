const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    for (const b of btns) { if (b.textContent?.includes("开始游戏")) { b.click(); break; } }
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    for (const b of btns) { if (b.textContent?.includes("进入") || b.textContent?.includes("开始")) { b.click(); break; } }
  });
  await page.waitForTimeout(2500);
  await page.waitForTimeout(12000);
  await page.screenshot({ path: "screenshots/v10-elite-entry.png" });
  console.log("done");
  await browser.close();
})();
