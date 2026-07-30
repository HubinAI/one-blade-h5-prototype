// ========================================================================
// V0723015: 三档刀势模型配置 + 类型定义
// ========================================================================

// ---- 类型定义 ----

/** 刀势三档：base / enhanced / burst */
export type BladeMomentumBand = "base" | "enhanced" | "burst";

/** 能力节点 ID */
export type BladeAbilityNodeId = "blade_reach" | "armor_break" | "precision_reflect";

/** 刀势完整快照 */
export interface BladeMomentumState {
  /** 当前刀势值 */
  current: number;
  /** 刀势上限 */
  max: number;
  /** 当前比例 (current / max)，范围 [0, 1] */
  ratio: number;
  /** 当前档位 */
  band: BladeMomentumBand;
  /** 当前激活的能力节点（按阈值从低到高排序） */
  activeNodes: BladeAbilityNodeId[];
  /** 有效节点阈值（考虑 modifier shift 后） */
  effectiveNodeThresholds: Record<BladeAbilityNodeId, number>;
}

/** 肉鸽修正器 */
export interface BladeRunModifiers {
  /** 刀势上限加成 */
  maxBonus: number;

  /**
   * V0723015: 比例下限加成（0～1），默认0。
   * floorEnergy = momentumBefore.max * clamp(floorRatioBonus, 0, 0.5)
   * 作为 energyAfter 的下限，不影响 momentumBefore。
   */
  floorRatioBonus: number;

  /**
   * V0723015: 获取倍率，只作用于正向主动收益（弹幕/反射/护甲奖励），默认1。
   * 不作用于：被动恢复、危险误砍、身体误砍、空挥、HP伤害。
   */
  gainMultiplier: number;

  /**
   * V0723015: 消耗倍率，只作用于基础挥刀消耗，默认1。
   * 不作用于：空挥惩罚、危险误砍惩罚、身体误砍惩罚。
   * modifiedBaseCost = rawBaseCost * costMultiplier，clamp [0, maxCost]
   */
  costMultiplier: number;

  /** 节点阈值偏移（负值 = 提前解锁） */
  nodeThresholdShift: Partial<Record<BladeAbilityNodeId, number>>;
}

// ---- 配置常量 ----

export const BLADE_MOMENTUM_CONFIG = {
  /** 默认刀势上限 */
  baseMax: 100,
  /** 初始刀势比例（35/100 = 35%） */
  initialRatio: 0.35,
  /** 三档阈值 */
  bandThresholds: {
    /** ratio >= 0.30 → enhanced 档 */
    enhanced: 0.30,
    /** ratio >= 0.70 → burst 档 */
    burst: 0.70,
  },
  /** 能力节点解锁阈值（ratio 达到即激活） */
  abilityNodes: {
    blade_reach: 0.30,
    armor_break: 0.60,
    precision_reflect: 0.90,
  },
  /** 阈值修正 clamp 范围 */
  thresholdClamp: {
    min: 0.05,
    max: 1.00,
  },
} as const;

export const DEFAULT_BLADE_RUN_MODIFIERS: BladeRunModifiers = {
  maxBonus: 0,
  floorRatioBonus: 0,
  gainMultiplier: 1,
  costMultiplier: 1,
  nodeThresholdShift: {},
};
