/**
 * V0811063: 180关体验差异防回归
 */
import { describe, it, expect } from "vitest";
import { generateAllRecipes, type FloorRecipe } from "./floorRecipeGen";

const recipes = generateAllRecipes();

type Sig = { primary: string; secondary: string | null; mode: string; formation: string; rhythm: string; elite: string };

function sig(r: FloorRecipe): Sig {
  return { primary: r.primaryEnemy, secondary: r.secondaryEnemy, mode: r.mode, formation: r.formation, rhythm: r.rhythm, elite: r.elite };
}

function checkAdjacent(i: number): number {
  const a = sig(recipes[i - 1]), b = sig(recipes[i]);
  let d = 0;
  if (a.primary !== b.primary) d++;
  if (a.mode !== b.mode) d++;
  if (a.formation !== b.formation) d++;
  if (a.rhythm !== b.rhythm) d++;
  if (a.elite !== b.elite) d++;
  return d;
}

describe("180关体验签名", () => {
  it("primary连续3关无重复", () => {
    const fails: number[] = [];
    for (let i = 2; i < recipes.length; i++) {
      const a = recipes[i - 2].primaryEnemy, b = recipes[i - 1].primaryEnemy, c = recipes[i].primaryEnemy;
      if (a === b && b === c) fails.push(i + 1);
    }
    if (fails.length > 0) {
      for (const f of fails) console.log("PRIMARY_REPEAT3", f, sig(recipes[f-1]));
    }
    expect(fails).toEqual([]);
  });

  it("mode无连续重复", () => {
    const fails: number[] = [];
    for (let i = 1; i < recipes.length; i++) {
      if (recipes[i].mode === recipes[i - 1].mode) fails.push(i + 1);
    }
    if (fails.length > 0) for (const f of fails) console.log("MODE_REPEAT", f, sig(recipes[f-2]));
    expect(fails).toEqual([]);
  });

  it("相邻两关≥2核心维度变化", () => {
    const fails: number[] = [];
    for (let i = 1; i < recipes.length; i++) {
      if (checkAdjacent(i) < 2) fails.push(i + 1);
    }
    if (fails.length > 0) for (const f of fails) console.log("ADJACENT_DIFF<2", f, sig(recipes[f-2]));
    expect(fails).toEqual([]);
  });

  it("任意连续3关≥2种formation", () => {
    const fails: number[] = [];
    for (let i = 2; i < recipes.length; i++) {
      if (new Set([recipes[i-2].formation, recipes[i-1].formation, recipes[i].formation]).size < 2) fails.push(i + 1);
    }
    if (fails.length > 0) for (const f of fails) console.log("FORMATION_3_DUP", f);
    expect(fails).toEqual([]);
  });

  it("任意连续3关≥2种rhythm", () => {
    const fails: number[] = [];
    for (let i = 2; i < recipes.length; i++) {
      if (new Set([recipes[i-2].rhythm, recipes[i-1].rhythm, recipes[i].rhythm]).size < 2) fails.push(i + 1);
    }
    if (fails.length > 0) for (const f of fails) console.log("RHYTHM_3_DUP", f);
    expect(fails).toEqual([]);
  });

  it("elite最近2关不重复", () => {
    const fails: number[] = [];
    for (let i = 1; i < recipes.length; i++) {
      if (recipes[i].elite === recipes[i - 1].elite) fails.push(i + 1);
    }
    if (fails.length > 0) for (const f of fails) console.log("ELITE_REPEAT", f);
    expect(fails).toEqual([]);
  });

  it("primary分布max-min≤3", () => {
    const counts: Record<string, number> = {};
    for (const r of recipes) counts[r.primaryEnemy] = (counts[r.primaryEnemy] ?? 0) + 1;
    const vals = Object.values(counts);
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(3);
  });

  it("elite分布max-min≤2", () => {
    const counts: Record<string, number> = {};
    for (const r of recipes) counts[r.elite] = (counts[r.elite] ?? 0) + 1;
    const vals = Object.values(counts);
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(2);
  });

  it("任意连续3关3种不同primary", () => {
    const fails: number[] = [];
    for (let i = 2; i < recipes.length; i++) {
      if (new Set([recipes[i-2].primaryEnemy, recipes[i-1].primaryEnemy, recipes[i].primaryEnemy]).size < 3) fails.push(i + 1);
    }
    if (fails.length > 0) for (const f of fails) console.log("PRIMARY_3_SAME", f, sig(recipes[f-1]));
    expect(fails).toEqual([]);
  });
});
