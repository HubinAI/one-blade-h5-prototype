import type { BladeTier } from "../types";
import { BALANCE, SWORD_STAGE_BY_ID, SWORD_STAGES } from "../config/balance";
import { TIER_CONFIGS } from "../config/tuning";
import { clamp } from "../../utils/math";

export function getTierConfig(tier: BladeTier) {
  return TIER_CONFIGS[tier];
}

/**
 * 获取当前刀势所处的段位
 */
export function getBladeTier(energy: number): BladeTier {
  const stage = SWORD_STAGES.find((item) => energy >= item.minEnergy && energy <= item.maxEnergy);
  return stage?.id ?? "weak";
}

/**
 * 当前段位的展示名
 */
export function getBladeTierName(energy: number): string {
  return SWORD_STAGE_BY_ID[getBladeTier(energy)]?.name ?? "蓄势";
}

/**
 * 是否可以挥刀（刀势 >= 10% 才可挥刀）
 * 在 reactive mode 下永远返回 true（P0-1 自由挥刀）
 */
export function canSlash(energy: number, reactiveMode?: boolean): boolean {
  if (reactiveMode) return true;
  return energy >= BALANCE.swordEnergy.minSlashEnergy;
}

/**
 * 根据当前段位计算刀势消耗
 *
 * 段位制消耗：
 *   蓄势(0-9): 不可挥刀，消耗不适用
 *   轻斩(10-39): 消耗当前刀势的 60%
 *   强斩(40-89): 消耗当前刀势的 75%
 *   破阵斩(90-100): 消耗当前刀势的 50%
 */
export function consumeEnergyByTier(current: number, tier: BladeTier): number {
  if (tier === "weak") {
    // 蓄势状态不可挥刀（调用方应在挥刀前先判断 canSlash）
    return current;
  }
  const ratio = BALANCE.swordEnergy.consumeRatio;
  const consumeMultiplier =
    tier === "burst" ? ratio.break :
    tier === "strong" ? ratio.strong :
    ratio.light;
  const consumed = Math.ceil(current * consumeMultiplier);
  return clamp(current - consumed, 0, BALANCE.swordEnergy.max);
}

/**
 * 根据段位和击杀数据计算刀势返还
 *
 * @param kills 本次挥刀击杀数
 * @param tier 挥刀时的段位
 * @param extra 额外返还因子（火药、阵眼等）
 * @returns 返还的刀势（已受 MAX_REFUND 约束）
 */
export function calculateMomentumRefund(
  kills: number,
  tier: BladeTier,
  extra?: { powderChains: number; coreCollapses: number }
): number {
  // 选择阶梯返还表
  const tiers = tier === "burst" ? BALANCE.swordEnergy.breakRefundTiers : BALANCE.swordEnergy.refundTiers;
  const maxRefund = BALANCE.swordEnergy.maxRefund;

  let refund = 0;

  // 基础击杀返还: 每击杀 +2%
  refund += kills * BALANCE.swordEnergy.killRefund;

  // 阶梯额外返还
  for (const [threshold, reward] of tiers) {
    if (kills >= threshold) {
      refund += reward;
    }
  }

  // 火药返还
  if (extra?.powderChains) {
    refund += Math.min(extra.powderChains * BALANCE.swordEnergy.powderRefund, 20);
  }

  // 阵眼返还
  if (extra?.coreCollapses) {
    refund += extra.coreCollapses * BALANCE.swordEnergy.coreRefund;
  }

  return Math.min(refund, maxRefund);
}

/**
 * 主刀影响副刀——根据主刀单次击杀数减少副刀 CD
 * 击杀5+: -0.8s / 击杀8+: -1.5s / 击杀12+: -50%
 */
export function getSubBladeCDReduction(kills: number): { seconds: number; ratio: number } {
  if (kills >= 12) return { seconds: 0, ratio: 0.5 };
  if (kills >= 8)  return { seconds: 1.5, ratio: 0 };
  if (kills >= 5)  return { seconds: 0.8, ratio: 0 };
  // 每次命中保底减 0.2s
  return { seconds: kills > 0 ? 0.2 : 0, ratio: 0 };
}

/**
 * 自然恢复（保留原有逻辑但提高基础值）
 */
export function recoverEnergy(current: number, dt: number, drumTimer: number, reactiveMode?: boolean) {
  if (reactiveMode) {
    // P0: reactive模式使用1.5/s被动兜底
    return clamp(current + 1.5 * dt, 0, 100);
  }
  const multiplier = drumTimer > 0 ? 1.8 : 1;
  return clamp(current + BALANCE.swordEnergy.passiveRegenPerSecond * multiplier * dt, 0, BALANCE.swordEnergy.max);
}

/**
 * P0: 通过正向行为获得刀势能量（reactive模式专用）
 */
export function gainEnergyByAction(current: number, amount: number, maxEnergy: number = 100): number {
  return clamp(current + amount, 0, maxEnergy);
}
