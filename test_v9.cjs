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

  // Initial state
  const canvas = await page.$("canvas");
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;

      // Slash once
      await page.mouse.move(cx + 30, cy - 50);
      await page.mouse.down();
      await page.mouse.move(cx + 150, cy - 200, { steps: 8 });
      await page.waitForTimeout(100);
      await page.mouse.up();
      await page.waitForTimeout(2500);

      // Capture HUD area only
      await page.screenshot({
        path: "screenshots/v9-01-hud-1.png",
        clip: { x: 0, y: 700, width: 390, height: 144 }
      });

      // Wait and capture again
      await page.waitForTimeout(3000);
      await page.screenshot({
        path: "screenshots/v9-02-hud-2.png",
        clip: { x: 0, y: 700, width: 390, height: 144 }
      });
    }
  }

  console.log("errors:", errors.length);
  if (errors.length > 0) errors.forEach(e => console.log("  ", e));
  await browser.close();
})();
