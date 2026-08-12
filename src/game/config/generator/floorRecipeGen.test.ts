import { describe, it, expect, beforeAll } from "vitest";
import { generateAllRecipes, auditRecipes, FloorRecipe } from "./floorRecipeGen";

let recipes: FloorRecipe[];
describe("FloorRecipe 1-180", () => {
  beforeAll(() => { recipes = generateAllRecipes(); });

  it("生成 180 关", () => expect(recipes.length).toBe(180));
  it("F1=tutorial固定", () => {
    const r = recipes[0];
    expect(r.primaryEnemy).toBe("infantry");
    expect(r.mode).toBe("STANDARD");
    expect(r.scene).toBe("tutorial");
  });

  it("F2~5 primary只有early池(infantry/powder/shield)", () => {
    const early = ["infantry","powder","shield"];
    for (const r of recipes.slice(1,5)) expect(early).toContain(r.primaryEnemy);
  });
  it("F31~180 primary全部9种", () => {
    const all9 = ["infantry","powder","shield","splitter","tractor","core","charger","mover","shooter"];
    for (const r of recipes.slice(30)) expect(all9).toContain(r.primaryEnemy);
  });

  it("相邻关 primary不重复", () => {
    for (let i=1; i<recipes.length; i++) expect(recipes[i].primaryEnemy).not.toBe(recipes[i-1].primaryEnemy);
  });

  it("连续2关 primary不同", () => {
    for (let i=2; i<recipes.length; i++) {
      const a=recipes[i-2].primaryEnemy, b=recipes[i-1].primaryEnemy, c=recipes[i].primaryEnemy;
      expect(new Set([a,b,c]).size).toBeGreaterThanOrEqual(2);
    }
  });

  it("相邻关 mode/formation/rhythm ≥2项不同", () => {
    for (let i=1; i<recipes.length; i++) {
      const p=recipes[i-1], r=recipes[i];
      let d=0; if(r.mode!==p.mode)d++; if(r.formation!==p.formation)d++; if(r.rhythm!==p.rhythm)d++;
      expect(d).toBeGreaterThanOrEqual(2);
    }
  });

  it("mode不连续重复", () => {
    for (let i=1; i<recipes.length; i++) expect(recipes[i].mode).not.toBe(recipes[i-1].mode);
  });

  it("elite最近2关不重复", () => {
    for (let i=1; i<recipes.length; i++) expect(recipes[i].elite).not.toBe(recipes[i-1].elite);
  });

  it("deterministic: 重跑一致", () => {
    const r2 = generateAllRecipes();
    for (let i=0; i<180; i++) expect(r2[i]).toEqual(recipes[i]);
  });

  it("intensityRole 5关循环 RELAX→INTRO→MIX→PRESSURE→CHECK", () => {
    const cycle = ["RELAX","INTRO","MIX","PRESSURE","CHECK"];
    for (let f=1; f<=180; f++) {
      expect(recipes[f-1].intensityRole).toBe(cycle[(f-1)%5]);
    }
  });

  it("审计 无违规", () => {
    const a = auditRecipes(recipes);
    expect(a.consecutiveViolations).toBe(0);
    expect(a.primaryRepeat3).toBe(0);
    expect(a.modeRepeat).toBe(0);
  });

  // Stats output
  it("打印统计", () => {
    const a = auditRecipes(recipes);
    console.log("=== Primary分布 ===", JSON.stringify(a.primaries));
    console.log("=== Mode分布 ===", JSON.stringify(a.modes));
    console.log("=== Formation分布 ===", JSON.stringify(a.formations));
    console.log("=== Rhythm分布 ===", JSON.stringify(a.rhythms));
    console.log("=== Elite分布 ===", JSON.stringify(a.elites));
    expect(Object.values(a.primaries).every(v => v > 0)).toBe(true);
  });
});
