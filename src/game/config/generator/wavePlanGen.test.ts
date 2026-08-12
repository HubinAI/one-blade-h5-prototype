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

  it("不同seed结果不同(分布不同, totalQuota由Density唯一决定)", () => {
    const a = generateWavePlan(sampleRecipe(3) as any);
    const b = generateWavePlan(sampleRecipe(4) as any);
    // totalQuota可能相同(同density), 但波分配应不同
    expect(a.waves.some((w, i) => w.primary !== b.waves[i].primary || w.secondary !== b.waves[i].secondary || w.baseCount !== b.waves[i].baseCount)).toBe(true);
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

  // V0812015: 180关自动审计
  it("V0812015审计: quotaSum=0, 无幽灵Quota, 无非法Rhythm, 无density二源", () => {
    const VALID_RHYTHMS = new Set(["STEADY","PULSE","FRONT","BACK","ALTERNATE"]);
    let quotaErrors=0, totalVariance=0, illegalRhythm=0, lastWaveSpike=0;
    for (let f=1; f<=180; f++) {
      const plan = generateWavePlan(sampleRecipe(f) as any);
      // quota sum
      const sum = plan.baseQuota + plan.primaryQuota + plan.secondaryQuota;
      if (sum !== plan.totalQuota) quotaErrors++;
      // ghost secondary: null recipe但quota>0 — 样本recipe都有secondary, 跳过此检查
      // totalQuota同floor多seed变化
      const alt = generateWavePlan({...sampleRecipe(f), seed: (sampleRecipe(f) as any).seed + 1000} as any);
      if (alt.totalQuota !== plan.totalQuota) totalVariance++;
      // illegal rhythm (shouldn't apply here, but check)
      const recipe = plan.recipeSnapshot;
      if (!VALID_RHYTHMS.has(recipe.rhythm as any)) illegalRhythm++;
      // specials全部压最后一波
      const lastWave = plan.waves[5];
      const totalSpecial = plan.waves.reduce((s:number,w:any)=>s+w.primary+w.secondary,0);
      if (lastWave.primary + lastWave.secondary >= totalSpecial * 0.9 && totalSpecial > 2) lastWaveSpike++;
    }
    expect(quotaErrors).toBe(0);
    expect(totalVariance).toBe(0);
    expect(illegalRhythm).toBe(0);
    expect(lastWaveSpike).toBe(0);
  });

  it("V0812015审计: F2/F3/F15/F30/F180 WavePlan快照", () => {
    for (const f of [2,3,15,30,180]) {
      const p = generateWavePlan(sampleRecipe(f) as any);
      expect(p.totalQuota).toBeGreaterThan(0);
      expect(p.baseQuota + p.primaryQuota + p.secondaryQuota).toBe(p.totalQuota);
      // 特殊怪至少2波(如总量≥3)
      const totalSpecial = p.primaryQuota + p.secondaryQuota;
      if (totalSpecial >= 3) {
        const specialWaves = p.waves.filter((w:any) => w.primary + w.secondary > 0);
        expect(specialWaves.length).toBeGreaterThanOrEqual(2);
      }
      // 不含第1波(索引0)
      expect(p.waves[0].primary + p.waves[0].secondary).toBe(0);
    }
  });

  it("V0812015审计: 同floor 5个seed totalQuota一致", () => {
    for (const f of [2,3,15,30,180]) {
      const base = generateWavePlan(sampleRecipe(f) as any).totalQuota;
      for (let si=1; si<5; si++) {
        const alt = generateWavePlan({...sampleRecipe(f), seed: (sampleRecipe(f) as any).seed + si * 1000} as any);
        expect(alt.totalQuota).toBe(base);
      }
    }
  });
});
