const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", err => errors.push(err.message));

  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "screenshots/v7-01-home.png" });

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    for (const b of btns) { if (b.textContent?.includes("开始游戏")) { b.click(); return; } }
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    for (const b of btns) { if (b.textContent?.includes("进入") || b.textContent?.includes("开始")) { b.click(); return; } }
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "screenshots/v7-02-battle.png" });

  // Wait and see elite
  await page.waitForTimeout(16000);
  await page.screenshot({ path: "screenshots/v7-03-elite.png" });

  // Slash to kill elite
  const canvas = await page.$("canvas");
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(1500);
        await page.mouse.move(cx + 50, cy - 60);
        await page.mouse.down();
        await page.mouse.move(cx + 180, cy - 250, { steps: 8 });
        await page.waitForTimeout(100);
        await page.mouse.up();
      }
      await page.screenshot({ path: "screenshots/v7-04-after-slash.png" });
    }
  }

  console.log("errors:", errors.length);
  if (errors.length > 0) errors.forEach(e => console.log("  ", e));
  await browser.close();
})();
