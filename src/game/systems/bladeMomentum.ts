// ========================================================================
// V0723014: 三档刀势模型 — 纯函数层
// ========================================================================
import {
  BLADE_MOMENTUM_CONFIG,
  DEFAULT_BLADE_RUN_MODIFIERS,
  type BladeMomentumBand,
  type BladeAbilityNodeId,
  type BladeMomentumState,
  type BladeRunModifiers,
} from "../config/bladeMomentum";
import { clamp } from "../../utils/math";

// Re-export types for backward compatibility
export type { BladeMomentumBand, BladeAbilityNodeId, BladeMomentumState, BladeRunModifiers };

// ---- 能力节点稳定排序 ----
const NODE_ORDER: BladeAbilityNodeId[] = ["blade_reach", "armor_break", "precision_reflect"];

// ---- 纯函数实现 ----

/**
 * 计算 ratio = current / max，clamp 到 [0, 1]，max 最小为 1。
 */
export function resolveBladeMomentumRatio(current: number, max: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(max)) return 0;
  const safeMax = Math.max(1, max);
  const safeCurrent = clamp(current, 0, safeMax);
  return clamp(safeCurrent / safeMax, 0, 1);
}

/**
 * 根据 ratio 判定三档 band。
 * - ratio < 0.30 → "base"
 * - 0.30 ≤ ratio < 0.70 → "enhanced"
 * - ratio ≥ 0.70 → "burst"
 */
export function resolveBladeMomentumBand(ratio: number): BladeMomentumBand {
  if (!Number.isFinite(ratio)) return "base";
  const safeRatio = clamp(ratio, 0, 1);
  if (safeRatio >= BLADE_MOMENTUM_CONFIG.bandThresholds.burst) return "burst";
  if (safeRatio >= BLADE_MOMENTUM_CONFIG.bandThresholds.enhanced) return "enhanced";
  return "base";
}

/**
 * 计算有效节点阈值（base threshold + modifier shift，clamp 到 5%~100%）。
 */
export function resolveEffectiveNodeThresholds(
  modifiers: BladeRunModifiers,
): Record<BladeAbilityNodeId, number> {
  const result: Record<string, number> = {};
  const { min, max } = BLADE_MOMENTUM_CONFIG.thresholdClamp;
  for (const nodeId of NODE_ORDER) {
    const base = BLADE_MOMENTUM_CONFIG.abilityNodes[nodeId];
    const shift = modifiers.nodeThresholdShift[nodeId] ?? 0;
    result[nodeId] = clamp(base + shift, min, max);
  }
  return result as Record<BladeAbilityNodeId, number>;
}

/**
 * 推导当前激活的能力节点（ratio >= threshold 即激活，按 NODE_ORDER 稳定排序）。
 */
export function resolveActiveBladeNodes(
  ratio: number,
  thresholds: Record<BladeAbilityNodeId, number>,
): BladeAbilityNodeId[] {
  const safeRatio = clamp(ratio, 0, 1);
  return NODE_ORDER.filter((nodeId) => safeRatio >= (thresholds[nodeId] ?? 1));
}

/**
 * 创建完整刀势快照。
 * @param current 当前刀势值
 * @param max 刀势上限
 * @param modifiers 肉鸽修正器（可选，默认使用 DEFAULT）
 */
export function createBladeMomentumState(
  current: number,
  max: number,
  modifiers?: BladeRunModifiers,
): BladeMomentumState {
  const safeCurrent = clamp(Number.isFinite(current) ? current : 0, 0, Math.max(1, max));
  const safeMax = Math.max(1, Number.isFinite(max) ? max : 1);
  const ratio = resolveBladeMomentumRatio(safeCurrent, safeMax);
  const band = resolveBladeMomentumBand(ratio);

  const defaultModifiers: BladeRunModifiers = {
    maxBonus: 0,
    floorBonus: 0,
    gainMultiplier: 1,
    costMultiplier: 1,
    nodeThresholdShift: {},
  };

  const effectiveModifiers = modifiers ?? defaultModifiers;
  const effectiveThresholds = resolveEffectiveNodeThresholds(effectiveModifiers);
  const activeNodes = resolveActiveBladeNodes(ratio, effectiveThresholds);

  return {
    current: safeCurrent,
    max: safeMax,
    ratio,
    band,
    activeNodes,
    effectiveNodeThresholds: effectiveThresholds,
  };
}

/**
 * 上限成长保持比例：将 current 等比例缩放到新上限。
 * 例：80/100 → (112, 140, 0.8)
 *
 * @returns { current, max, ratio }
 */
export function applyBladeMaxChangePreserveRatio(
  current: number,
  oldMax: number,
  newMax: number,
): { current: number; max: number; ratio: number } {
  const safeOldMax = Math.max(1, oldMax);
  const safeNewMax = Math.max(1, newMax);
  const ratio = resolveBladeMomentumRatio(current, safeOldMax);
  const newCurrent = Math.round(ratio * safeNewMax);
  return {
    current: clamp(newCurrent, 0, safeNewMax),
    max: safeNewMax,
    ratio: resolveBladeMomentumRatio(newCurrent, safeNewMax),
  };
}

/**
 * 应用肉鸽修正器重新计算刀势快照。
 * 使用 state.current 和 (state.max + modifiers.maxBonus) 作为新的 (current, max)。
 */
export function applyBladeRunMaxModifier(
  state: BladeMomentumState,
  modifiers: BladeRunModifiers,
): BladeMomentumState {
  const newMax = state.max + (modifiers.maxBonus ?? 0);
  return createBladeMomentumState(state.current, newMax, modifiers);
}
