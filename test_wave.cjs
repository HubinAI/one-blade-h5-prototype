const { chromium } = require("playwright");
const URL = "http://localhost:5173/";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 390, height: 844 } }).then(c => c.newPage());

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // 点击排行榜（应该飘字）
  const rankBtn = await page.$("button.v3-side-btn");
  if (rankBtn) {
    await rankBtn.click();
    await page.waitForTimeout(500);
    const toastText = await page.$eval(".bag-toast", e => e.textContent).catch(() => null);
    console.log("排行榜飘字:", toastText);
    await page.screenshot({ path: "screenshots/wave-rank-toast.png" });
  }

  // 点击开始游戏，看局内波次
  const startBtn = await page.$(".v3-start-btn");
  if (startBtn) {
    await startBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "screenshots/wave-battle-start.png" });

    // 等待 5秒，截图战斗
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "screenshots/wave-battle-5s.png" });
  }

  await browser.close();
})();
