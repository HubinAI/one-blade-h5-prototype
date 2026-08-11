import { describe, it, expect } from "vitest";
import { generateWavePlan } from "./wavePlanGen";

// Sample recipe
function sampleRecipe(floor: number) {
  return {
    floor,
    primaryEnemy: "infantry",
    secondaryEnemy: "shield",
    mode: "STANDARD",
    formation: "CENTER",
    rhythm: "STEADY",
    environment: "NONE",
    elite: "fireRing",
    scene: `mainline_${floor}`,
    seed: 20260811 + floor,
  } as const;
}

describe("WavePlan Generator", () => {
  it("生成6波", () => {
    const p = generateWavePlan(sampleRecipe(1) as any);
    expect(p.waves.length).toBe(6);
  });

  it("F1 totalQuota>0", () => {
    const p = generateWavePlan(sampleRecipe(1) as any);
    expect(p.totalQuota).toBeGreaterThan(40);
    expect(p.baseQuota).toBeGreaterThan(0);
  });

  it("同seed完全一致", () => {
    const a = generateWavePlan(sampleRecipe(5) as any);
    const b = generateWavePlan(sampleRecipe(5) as any);
    expect(a).toEqual(b);
  });

  it("不同seed结果不同", () => {
    const a = generateWavePlan(sampleRecipe(3) as any);
    const b = generateWavePlan(sampleRecipe(4) as any);
    expect(a.totalQuota).not.toBe(b.totalQuota);
  });

  it("quota拆分之和=total", () => {
    for (let f=1; f<=10; f++) {
      const p = generateWavePlan(sampleRecipe(f) as any);
      expect(p.baseQuota + p.primaryQuota + p.secondaryQuota).toBe(p.totalQuota);
    }
  });

  it("每波总和=wave内分配", () => {
    const p = generateWavePlan(sampleRecipe(10) as any);
    const fromWaves = p.waves.reduce((s,w)=>s+w.baseCount+w.primary+w.secondary,0);
    expect(fromWaves).toBe(p.totalQuota);
  });

  it("special只在波2-5出现(或最后波收尾)", () => {
    const p = generateWavePlan(sampleRecipe(10) as any);
    expect(p.waves[0].primary).toBe(0);
    expect(p.waves[0].secondary).toBe(0);
    const hasSpecial = p.waves.slice(1,5).some(w => w.primary>0 || w.secondary>0);
    expect(hasSpecial || p.waves[5].primary>0 || p.waves[5].secondary>0).toBe(true);
  });

  it("1~180全部合法", () => {
    for (let f=1; f<=180; f++) {
      const p = generateWavePlan(sampleRecipe(f) as any);
      expect(p.waves.length).toBe(6);
      expect(p.totalQuota).toBeGreaterThan(0);
    }
  });
});
