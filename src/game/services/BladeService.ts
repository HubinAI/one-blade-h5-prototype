import type { AffixId, Quality } from "../config/synthesis";
import {
  SYNTHESIS_RULES,
  QUALITY_META,
  QUALITY_ORDER,
  getExpCostForLevel,
  BLADE_MAX_LEVEL,
  getRandomAffixForQuality
} from "../config/synthesis";

// ════════════════════════════════════════════
// 刀的实体
// ════════════════════════════════════════════
export type Blade = {
  id: string;
  name: string;
  quality: Quality;
  level: number;
  exp: number;
  affix: AffixId | null;
  locked: boolean;
};

/** 合成时记录的概率状态 */
export type SynthesisState = {
  currentChance: number;
  failCount: number;
  maxAttempts: number;
};

/** 合成结果 */
export type SynthesisResult = {
  success: boolean;
  resultBlade?: Blade;
  expReward: number;
  expQuality: Quality;
  state: SynthesisState;
};

// ════════════════════════════════════════════
// 合成核心逻辑
// ════════════════════════════════════════════

function getNextQuality(q: Quality): Quality | null {
  const idx = QUALITY_ORDER.indexOf(q);
  if (idx < 0 || idx >= QUALITY_ORDER.length - 1) return null;
  return QUALITY_ORDER[idx + 1];
}

let bladeCounter = 0;
export function createBlade(name: string, quality: Quality, affix?: AffixId | null): Blade {
  bladeCounter++;
  return {
    id: `blade_${bladeCounter}_${Date.now()}`,
    name,
    quality,
    level: 1,
    exp: 0,
    affix: affix ?? getRandomAffixForQuality(quality),
    locked: false,
  };
}

/** 随机从品质名池中抽一个刀名 */
export function randomBladeName(quality: Quality): string {
  const pool = QUALITY_META[quality]?.namePool ?? ["无名"];
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 合成一次：2把同品质刀 → 赌升品 */
export function synthesizeBlades(
  material1: Blade,
  material2: Blade,
  failCount: number = 0
): SynthesisResult {
  const rule = SYNTHESIS_RULES[material1.quality];
  if (!rule) {
    return { success: false, expReward: 0, expQuality: material1.quality, state: { currentChance: 0, failCount: 0, maxAttempts: 1 } };
  }

  const currentChance = Math.min(100, rule.baseChance + failCount * rule.increment);
  const roll = Math.random() * 100;
  const success = roll < currentChance;

  const state: SynthesisState = {
    currentChance,
    failCount: success ? 0 : failCount + 1,
    maxAttempts: rule.maxAttempts,
  };

  if (success) {
    const nextQuality = getNextQuality(material1.quality);
    if (!nextQuality) {
      return { success: false, expReward: 2, expQuality: material1.quality, state };
    }
    const name = randomBladeName(nextQuality);
    const blade = createBlade(name, nextQuality);
    return { success: true, resultBlade: blade, expReward: 0, expQuality: material1.quality, state };
  } else {
    // 失败补偿：1个经验球（统一数量）
    const expReward = 1;
    return { success: false, expReward, expQuality: material1.quality, state };
  }
}

/** 给刀升级 */
export function addExpToBlade(blade: Blade, amount: number): { leveledUp: boolean; newLevel: number } {
  let leveledUp = false;
  for (let i = 0; i < amount; i++) {
    if (blade.level >= BLADE_MAX_LEVEL) break;
    blade.exp += 1;
    const cost = getExpCostForLevel(blade.level);
    if (blade.exp >= cost) {
      blade.level += 1;
      blade.exp = 0;
      leveledUp = true;
    }
  }
  return { leveledUp, newLevel: blade.level };
}

/** 根据品质给刀起个随机名 */
export function generateBlade(quality: Quality): Blade {
  const name = randomBladeName(quality);
  return createBlade(name, quality);
}
