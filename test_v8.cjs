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

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    for (const b of btns) { if (b.textContent?.includes("开始游戏")) { b.click(); return; } }
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    for (const b of btns) { if (b.textContent?.includes("进入") || b.textContent?.includes("开始")) { b.click(); return; } }
  });
  await page.waitForTimeout(2000);

  // Capture battle HUD showing energy bar
  const canvas = await page.$("canvas");
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      // Screenshot the bottom HUD area only
      await page.screenshot({
        path: "screenshots/v8-01-hud.png",
        clip: { x: 0, y: 700, width: 390, height: 144 }
      });

      // Wait a bit and capture again to see energy change
      await page.waitForTimeout(5000);
      await page.screenshot({
        path: "screenshots/v8-02-hud-later.png",
        clip: { x: 0, y: 700, width: 390, height: 144 }
      });
    }
  }

  console.log("errors:", errors.length);
  if (errors.length > 0) errors.forEach(e => console.log("  ", e));
  await browser.close();
})();
