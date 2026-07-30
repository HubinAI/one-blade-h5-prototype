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
  await page.waitForTimeout(2000);
  const result = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("one_blade_v04_progression") || "{}");
    return {
      bladesCount: (raw.blades || []).length,
      bladeNames: (raw.blades || []).map(b => `${b.name}(${b.quality})`),
      main: raw.equippedMainBladeId,
      subs: raw.equippedSubBladeIds
    };
  });
  console.log("BATTLE 2s:", JSON.stringify(result, null, 2));
  await browser.close();
})();
