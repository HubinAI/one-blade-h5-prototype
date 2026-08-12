/**
 * V0812017: FloorRecipe → WavePlan Generator
 *
 * 职责收口:
 *   1. totalQuota = round(54 × getDensityMultiplier(floor)) — 固定
 *   2. primary/secondary采用替换制(从base扣除), 总量不变
 *   3. secondary=null → secondaryQuota=0
 *   4. 特殊怪≥2波分布(排除波1)
 *   5. 同floor+seed 100%复现
 *   6. Rhythm注入waveWeights + Mode注入type bias
 */
import type { FloorRecipe } from "./floorRecipeGen";
import { getDensityMultiplier } from "../mainlineNumeric";
import { getRhythm, getMode, type RhythmPreset, type ModePreset } from "../mainlineEncounter";

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
  /** V0812017: 运行时preset快照 */
  rhythm: RhythmPreset;
  mode: ModePreset;
}

function srng(seed: number): () => number {
  let s = seed | 0;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

const BASE_ENCOUNTER = 54;

export function generateWavePlan(recipe: FloorRecipe): WavePlan {
  const floor = recipe.floor;
  const seed = recipe.seed + floor * 13;
  const rand = srng(seed);

  // V0812017: 读取Rhythm+Mode presets
  const rhythm = getRhythm(recipe.rhythm) ?? RHYTHMS_FALLBACK;
  const mode = getMode(recipe.mode) ?? MODES_FALLBACK;
  const waveCount = rhythm.waveWeights.length;
  const waveWeights = rhythm.waveWeights;

  // ═══ 1. Total Quota — 唯一源, 无随机 ═══
  const densityMul = getDensityMultiplier(floor);
  const totalQuota = Math.round(BASE_ENCOUNTER * densityMul);

  // ═══ 2. Primary/Secondary Quota — 替换制 + Mode bias ═══
  const primaryBase = Math.round(totalQuota * 0.25 * mode.baseBias);
  const primaryJitter = Math.round(primaryBase * (rand() - 0.5) * 0.30); // ±15%
  const primaryQuota = Math.max(0, Math.min(primaryBase + primaryJitter, Math.floor(totalQuota * 0.45)));

  const secondaryBase = recipe.secondaryEnemy ? Math.round(totalQuota * 0.15 * mode.baseBias) : 0;
  const secondaryQuota = secondaryBase;

  const baseQuota = totalQuota - primaryQuota - secondaryQuota;

  // ═══ 3. 选择特殊怪出现波次 (≥2波, waves 2~5, 排除第1波) ═══
  const specialWaveCount = primaryQuota + secondaryQuota > 0
    ? Math.min(waveCount - 2, Math.max(2, 2 + Math.floor(rand() * 3)))
    : 0;

  const pool = Array.from({ length: waveCount - 2 }, (_, i) => i + 1); // wave indices 2~N-1
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const specialWaves: number[] = pool.slice(0, specialWaveCount).sort((a, b) => a - b);

  // ═══ 4. 分配: 先算每波total, 再拆base/primary/secondary ═══
  const perWaveTotal: number[] = [];
  let assignedTotal = 0;
  // 归一化权重
  const wSum = waveWeights.reduce((a, b) => a + b, 0);
  for (let w = 0; w < waveCount - 1; w++) {
    const t = Math.round(totalQuota * (waveWeights[w] / wSum));
    perWaveTotal.push(t);
    assignedTotal += t;
  }
  perWaveTotal.push(totalQuota - assignedTotal); // 最后一波收尾

  // 特怪分布: 均匀分配, 最后一波特怪波收尾
  const perWaveP: number[] = new Array(waveCount).fill(0);
  const perWaveS: number[] = new Array(waveCount).fill(0);

  if (specialWaves.length > 0 && (primaryQuota > 0 || secondaryQuota > 0)) {
    let pRem = primaryQuota, sRem = secondaryQuota;

    for (let si = 0; si < specialWaves.length && (pRem > 0 || sRem > 0); si++) {
      const w = specialWaves[si];
      const remainingSw = specialWaves.length - si;

      // 本波特怪上限: 不超过本波total的40% (确保base≥0)
      const maxSpecial = Math.floor(perWaveTotal[w] * 0.40);

      if (si === specialWaves.length - 1 || remainingSw === 1) {
        // 最后一波特怪收尾
        const totalSpecial = Math.min(pRem + sRem, maxSpecial);
        if (totalSpecial > 0) {
          const ratio = pRem / Math.max(1, pRem + sRem);
          perWaveP[w] = Math.round(totalSpecial * ratio);
          perWaveS[w] = totalSpecial - perWaveP[w];
        }
      } else {
        // 均匀分配
        const pPortion = Math.min(Math.max(1, Math.round(pRem / remainingSw)), maxSpecial - 1);
        perWaveP[w] = pPortion;
        perWaveS[w] = sRem > 0 ? Math.min(Math.max(1, Math.round(sRem / remainingSw)), maxSpecial - perWaveP[w]) : 0;
      }
      pRem -= perWaveP[w];
      sRem -= perWaveS[w];
    }
  }

  // ═══ 5. 构建waves — base = total - primary - secondary ═══
  const waves: WaveSlot[] = [];
  for (let w = 0; w < waveCount; w++) {
    const baseCount = Math.max(0, perWaveTotal[w] - perWaveP[w] - perWaveS[w]);
    waves.push({
      waveIndex: w + 1,
      baseCount,
      primary: perWaveP[w],
      secondary: perWaveS[w],
      spawnWindow: [w * 4 + 2, w * 4 + 6],
    });
  }

  // ═══ 6. 最终验证 — 使用实际总和 ═══
  const actualB = waves.reduce((s, w) => s + w.baseCount, 0);
  const actualP = waves.reduce((s, w) => s + w.primary, 0);
  const actualS = waves.reduce((s, w) => s + w.secondary, 0);

  return {
    floor, seed,
    totalQuota: actualB + actualP + actualS,
    baseQuota: actualB, primaryQuota: actualP, secondaryQuota: actualS,
    waves,
    recipeSnapshot: recipe,
    rhythm, mode,
  };
}

// V0812017 fallback
const RHYTHMS_FALLBACK: RhythmPreset = { id: "STEADY", waveWeights: [0.18, 0.18, 0.17, 0.16, 0.16, 0.15], waveGapMul: 1.0, style: "steady" };
const MODES_FALLBACK: ModePreset = { id: "STANDARD", baseBias: 1.0, hardBias: 1.0, movementBias: 1.0 };
