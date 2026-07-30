// ========================================================================
// V0730001: 统一刀势系统 — 纯函数层
// 将 Boss V1 与普通关卡的刀势逻辑统一到同一套公共函数中
// ========================================================================
import {
  BLADE_MOMENTUM_CONFIG,
  type BladeMomentumBand,
  type BladeMomentumState,
  type BladeMomentumEffect,
  type BladeMomentumSettleInput,
  type BladeMomentumSettleOutput,
  type EnemyDurabilityTier,
  type BladeRunModifiers,
  type BladeAbilityNodeId,
} from "../config/bladeMomentum";
import { clamp } from "../../utils/math";

// Re-export types
export type {
  BladeMomentumBand,
  BladeMomentumState,
  BladeMomentumEffect,
  BladeMomentumSettleInput,
  BladeMomentumSettleOutput,
  EnemyDurabilityTier,
  BladeRunModifiers,
  BladeAbilityNodeId,
};

// ========================================================================
// 1. 基础纯函数
// ========================================================================

/**
 * 计算 ratio = current / max，clamp 到 [0, 1]。
 * 防御性处理：NaN、Infinity、max ≤ 0、current < 0、current > max。
 */
export function resolveBladeMomentumRatio(current: number, max: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(max)) return 0;
  const safeMax = Math.max(1, max);
  const safeCurrent = clamp(current, 0, safeMax);
  return clamp(safeCurrent / safeMax, 0, 1);
}

/**
 * 根据 ratio 判定统一三档 band。
 * - ratio < 0.40 → "low"
 * - 0.40 ≤ ratio < 0.70 → "mid"
 * - ratio ≥ 0.70 → "high"
 *
 * 防御性处理 NaN/Infinity ratio → "low"。
 */
export function resolveBladeMomentumBand(ratio: number): BladeMomentumBand {
  if (!Number.isFinite(ratio)) return "low";
  const safeRatio = clamp(ratio, 0, 1);
  if (safeRatio >= BLADE_MOMENTUM_CONFIG.bandThresholds.midMax) return "high";
  if (safeRatio >= BLADE_MOMENTUM_CONFIG.bandThresholds.lowMax) return "mid";
  return "low";
}

/**
 * 创建完整刀势状态。
 * @param current 当前刀势值
 * @param max 刀势上限
 */
export function createBladeMomentumState(
  current: number,
  max: number,
): BladeMomentumState {
  const safeMax = Math.max(1, Number.isFinite(max) ? max : 1);
  const safeCurrent = clamp(Number.isFinite(current) ? current : 0, 0, safeMax);
  const ratio = resolveBladeMomentumRatio(safeCurrent, safeMax);
  const band = resolveBladeMomentumBand(ratio);

  return { current: safeCurrent, max: safeMax, ratio, band };
}

// ========================================================================
// 2. 刀势效果（档位能力）
// ========================================================================

/**
 * 根据刀势状态计算视觉效果/威力参数。
 * 禁止低刀势缩短刀路——低刀势也使用完整 360px/0.9s 基础刀路，
 * 区别体现在命中宽度、反馈倍率和视觉长度上。
 */
export function resolveBladeMomentumEffect(
  state: BladeMomentumState,
): BladeMomentumEffect {
  const band = state.band;
  const cfg = BLADE_MOMENTUM_CONFIG.bladePower[band];
  return {
    bladePower: cfg.power,
    widthMultiplier: cfg.widthMultiplier,
    visualLengthMultiplier: cfg.visualLengthMultiplier,
    feedbackMultiplier: cfg.feedbackMultiplier,
    band,
    ratio: state.ratio,
  };
}

/**
 * 根据当前刀势上限计算主动收益倍率。
 * gainMultiplier = clamp(1 + (currentMax - 100) / 200, 1, 1.4)
 */
export function resolveBladeGainMultiplier(currentMax: number): number {
  if (!Number.isFinite(currentMax) || currentMax <= 0) return 1.0;
  const cfg = BLADE_MOMENTUM_CONFIG.gainMultiplier;
  return clamp(
    cfg.base + (currentMax - BLADE_MOMENTUM_CONFIG.baseMax) / 200,
    cfg.base,
    cfg.max,
  );
}

// ========================================================================
// 3. 被动恢复
// ========================================================================

/**
 * 计算一帧被动恢复量。
 * 规则：
 * - 仅在刀势比例 < 20% 时恢复
 * - 最多恢复至当前上限的 20%
 * - 恢复速度为当前上限的 2%/秒
 *
 * @returns { gain, newCurrent } — 本帧实际恢复量和恢复后的刀势值。
 */
export function resolveBladePassiveRecovery(
  current: number,
  max: number,
  dt: number,
): { gain: number; newCurrent: number } {
  const safeMax = Math.max(1, Number.isFinite(max) ? max : 1);
  const safeCurrent = clamp(Number.isFinite(current) ? current : 0, 0, safeMax);
  const cfg = BLADE_MOMENTUM_CONFIG.passiveRecovery;
  const capValue = safeMax * cfg.capRatio;

  // 已经达到或超过 20%，不再恢复
  if (safeCurrent >= capValue) {
    return { gain: 0, newCurrent: safeCurrent };
  }

  const rate = safeMax * cfg.ratePerSecondRatio;
  const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);
  const gain = Math.min(rate * safeDt, capValue - safeCurrent);
  const newCurrent = clamp(safeCurrent + gain, 0, safeMax);
  return { gain, newCurrent };
}

// ========================================================================
// 4. 刀势结算（统一入口）
// ========================================================================

/**
 * 统一刀势结算 — 所有挥刀结算必须走此入口。
 *
 * 结算顺序：
 *   结算前刀势
 *   - 基础挥刀消耗
 *   + 主动收益 × 收益倍率
 *   - 错误惩罚
 *   = 结算后刀势 (clamp 到 [0, max])
 *
 * 禁止普通关、Boss 和敌人逻辑散落直接修改 energy += ... / energy -= ...。
 */
export function resolveBladeMomentumAfterSlash(
  input: BladeMomentumSettleInput,
): BladeMomentumSettleOutput {
  const { momentumBefore, baseCost, activeGain, penalty, gainMultiplier } = input;
  const safeMax = momentumBefore.max;

  // sanitize inputs
  const safeBefore = clamp(
    Number.isFinite(momentumBefore.current) ? momentumBefore.current : 0,
    0,
    safeMax,
  );
  const safeBaseCost = Math.max(0, Number.isFinite(baseCost) ? baseCost : 0);
  const safeActiveGain = Math.max(0, Number.isFinite(activeGain) ? activeGain : 0);
  const safePenalty = Math.max(0, Number.isFinite(penalty) ? penalty : 0);
  const safeMultiplier = Math.max(0, Number.isFinite(gainMultiplier) ? gainMultiplier : 1);

  // 结算
  let after = safeBefore - safeBaseCost;
  after += safeActiveGain * safeMultiplier;
  after -= safePenalty;
  after = clamp(after, 0, safeMax);

  const netChange = after - safeBefore;
  const newState = createBladeMomentumState(after, safeMax);

  return { current: after, netChange, newState };
}

// ========================================================================
// 5. 刀势收支（统一接口）
// ========================================================================

/**
 * 支出刀势。必须通过此接口扣减，禁止直接 energy -= N。
 */
export function spendBladeMomentum(
  current: number,
  max: number,
  amount: number,
): number {
  const safeMax = Math.max(1, Number.isFinite(max) ? max : 1);
  const safeCurrent = clamp(Number.isFinite(current) ? current : 0, 0, safeMax);
  const safeAmount = Math.max(0, Number.isFinite(amount) ? amount : 0);
  return clamp(safeCurrent - safeAmount, 0, safeMax);
}

/**
 * 获取刀势。必须通过此接口增加，禁止直接 energy += N。
 */
export function gainBladeMomentum(
  current: number,
  max: number,
  amount: number,
): number {
  const safeMax = Math.max(1, Number.isFinite(max) ? max : 1);
  const safeCurrent = clamp(Number.isFinite(current) ? current : 0, 0, safeMax);
  const safeAmount = Math.max(0, Number.isFinite(amount) ? amount : 0);
  return clamp(safeCurrent + safeAmount, 0, safeMax);
}

// ========================================================================
// 6. 刀势上限成长（等比例缩放）
// ========================================================================

/**
 * 上限成长保持比例：将 current 等比例缩放到新上限。
 * 例：60/100 → newMax=140 → 84/140（ratio 60% 不变）
 *
 * 禁止变成 60/140（掉比例）。
 *
 * @returns { current, max } — 新刀势值和上限。
 */
export function changeBladeMomentumMaxPreserveRatio(
  current: number,
  oldMax: number,
  newMax: number,
): { current: number; max: number } {
  const safeOldMax = Math.max(1, Number.isFinite(oldMax) ? oldMax : 1);
  const safeNewMax = Math.max(1, Number.isFinite(newMax) ? newMax : 1);
  const ratio = resolveBladeMomentumRatio(current, safeOldMax);
  const newCurrent = clamp(ratio * safeNewMax, 0, safeNewMax);
  return { current: newCurrent, max: safeNewMax };
}

// ========================================================================
// 7. 多斩奖励计算（普通关）
// ========================================================================

/**
 * 计算多斩额外奖励（只取最高档）。
 *   达到 3 名：额外 +2
 *   达到 5 名：额外 +5
 *   达到 8 名：额外 +10
 */
export function resolveMultiSlashBonus(killCount: number): number {
  if (killCount >= 8) return 10;
  if (killCount >= 5) return 5;
  if (killCount >= 3) return 2;
  return 0;
}

// ========================================================================
// 8. 旧版兼容层（deprecated，保留以避免编译错误）
// ========================================================================

/* @deprecated V0730001: 旧版 resolveBladeMomentumBand 使用 30%/70% 阈值和 "base"/"enhanced"/"burst" 名称。
   保留以兼容 BossChaseController 等未迁移代码，新代码应直接使用上面的同名函数。 */

/** @deprecated 使用 createBladeMomentumState (2-arg version) 替代 */
export function createBladeMomentumStateLegacy(
  current: number,
  max: number,
  _modifiers?: BladeRunModifiers,
): BladeMomentumState & { activeNodes: BladeAbilityNodeId[]; effectiveNodeThresholds: Record<BladeAbilityNodeId, number> } {
  const safeMax = Math.max(1, Number.isFinite(max) ? max : 1);
  const safeCurrent = clamp(Number.isFinite(current) ? current : 0, 0, safeMax);
  const ratio = resolveBladeMomentumRatio(safeCurrent, safeMax);
  const band = resolveBladeMomentumBand(ratio);
  return {
    current: safeCurrent,
    max: safeMax,
    ratio,
    band,
    activeNodes: [],
    effectiveNodeThresholds: { blade_reach: 0.30, armor_break: 0.60, precision_reflect: 0.90 },
  };
}

/** @deprecated 使用 changeBladeMomentumMaxPreserveRatio 替代 */
export function applyBladeMaxChangePreserveRatio(
  current: number,
  oldMax: number,
  newMax: number,
): { current: number; max: number; ratio: number } {
  const result = changeBladeMomentumMaxPreserveRatio(current, oldMax, newMax);
  const ratio = resolveBladeMomentumRatio(result.current, result.max);
  return { ...result, ratio };
}

/** @deprecated 使用 resolveBladeMomentumEffect 替代 */
export function resolveBladeMomentumEffectLegacy(
  state: BladeMomentumState,
): BladeMomentumEffect {
  return resolveBladeMomentumEffect(state);
}

/** @deprecated 保留以避免编译错误 */
export function applyBladeRunMaxModifier(
  state: BladeMomentumState & { activeNodes?: BladeAbilityNodeId[]; effectiveNodeThresholds?: Record<BladeAbilityNodeId, number> },
  modifiers: BladeRunModifiers,
): BladeMomentumState & { activeNodes: BladeAbilityNodeId[]; effectiveNodeThresholds: Record<BladeAbilityNodeId, number> } {
  const safeMaxBonus = Number.isFinite(modifiers.maxBonus) ? modifiers.maxBonus : 0;
  const targetMax = BLADE_MOMENTUM_CONFIG.baseMax + safeMaxBonus;
  const preserved = changeBladeMomentumMaxPreserveRatio(state.current, state.max, targetMax);
  return createBladeMomentumStateLegacy(preserved.current, preserved.max);
}

/** @deprecated */
export function resolveEffectiveNodeThresholds(): Record<BladeAbilityNodeId, number> {
  return { blade_reach: 0.30, armor_break: 0.60, precision_reflect: 0.90 };
}

/** @deprecated */
export function resolveActiveBladeNodes(): BladeAbilityNodeId[] {
  return [];
}
