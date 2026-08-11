/**
 * V0811062: FloorRecipe → WavePlan Generator
 * Seed deterministic, quota-first allocation, 6 waves default
 */
import type { FloorRecipe } from "./floorRecipeGen";

export interface WaveSlot {
  waveIndex: number;
  baseCount: number;
  primary: number;
  secondary: number;
  spawnWindow: [number, number];
}

export interface WavePlan {
  floor: number;
  seed: number;
  totalQuota: number;
  baseQuota: number;
  primaryQuota: number;
  secondaryQuota: number;
  waves: WaveSlot[];
  recipeSnapshot: FloorRecipe;
}

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

/** ±12% variation */
function vary(r: () => number, base: number): number {
  const pct = (r() - 0.5) * 0.24;
  return Math.round(base * (1 + pct));
}

/** Wave count: default 6 */
const DEFAULT_WAVES = 6;

export function generateWavePlan(recipe: FloorRecipe): WavePlan {
  const floor = recipe.floor;
  const seed = recipe.seed + floor * 13;
  const rand = rng(seed);

  // Total quota from density system (simplified: floor-based scaling)
  const densityMul = 1.0 + (floor - 1) * 0.0025; // same as density formula
  const baseTotal = Math.round(54 * densityMul); // ~54 at F1, gradually grows
  const totalQuota = vary(rand, baseTotal);

  // Quota split: base ~60%, primary ~25%, secondary ~15%
  const primaryQuota = Math.round(totalQuota * 0.25);
  const secondaryQuota = Math.round(totalQuota * 0.15);
  const baseQuota = totalQuota - primaryQuota - secondaryQuota;

  // Wave allocation: front-loaded
  const waveWeights = [0.22, 0.20, 0.18, 0.16, 0.14, 0.10]; // decreasing

  const waves: WaveSlot[] = [];
  let baseRemaining = baseQuota, primaryRemaining = primaryQuota, secondaryRemaining = secondaryQuota;

  for (let w = 0; w < DEFAULT_WAVES; w++) {
    const weight = waveWeights[w];
    if (w === DEFAULT_WAVES - 1) {
      // Last wave cleans up all remaining
      waves.push({ waveIndex: w + 1, baseCount: Math.max(0, baseRemaining), primary: Math.max(0, primaryRemaining), secondary: Math.max(0, secondaryRemaining), spawnWindow: [w * 4 + 2, w * 4 + 6] });
      break;
    }
    let bc = Math.round(baseQuota * weight);
    let pc = 0, sc = 0;
    if (w >= 1 && w <= 4) {
      pc = Math.min(Math.round(primaryQuota * weight), primaryRemaining);
      sc = Math.min(Math.round(secondaryQuota * weight), secondaryRemaining);
      primaryRemaining -= pc;
      secondaryRemaining -= sc;
    }
    bc = Math.min(bc, baseRemaining);
    baseRemaining -= bc;
    waves.push({ waveIndex: w + 1, baseCount: bc, primary: pc, secondary: sc, spawnWindow: [w * 4 + 2, w * 4 + 6] });
  }

  return { floor, seed, totalQuota, baseQuota, primaryQuota, secondaryQuota, waves, recipeSnapshot: recipe };
}
