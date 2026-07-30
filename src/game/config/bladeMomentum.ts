// ========================================================================
// V0730001: 统一刀势系统 — 核心配置与类型定义
// 将 Boss V1 与普通关卡的刀势逻辑统一到同一套公共系统中
// ========================================================================

// ---- 类型定义 ----

/** 统一刀势三档：low / mid / high */
export type BladeMomentumBand = "low" | "mid" | "high";

/** 能力节点 ID（保留兼容，本轮不接入） */
export type BladeAbilityNodeId = "blade_reach" | "armor_break" | "precision_reflect";

/** 统一刀势状态 */
export interface BladeMomentumState {
  /** 当前刀势值 */
  current: number;
  /** 刀势上限 */
  max: number;
  /** 当前比例 (current / max)，范围 [0, 1] */
  ratio: number;
  /** 当前档位 */
  band: BladeMomentumBand;
}

/** 刀势视觉/效果参数 */
export interface BladeMomentumEffect {
  /** 刀势威力 (1/2/3) */
  bladePower: number;
  /** 命中宽度倍率 */
  widthMultiplier: number;
  /** 视觉长度倍率 */
  visualLengthMultiplier: number;
  /** 反馈倍率 */
  feedbackMultiplier: number;
  /** 当前档位 */
  band: BladeMomentumBand;
  /** 当前比例 */
  ratio: number;
}

/* @deprecated V0730001: BladeRunModifiers 在本轮统一重构中不再使用。
   保留类型定义以避免编译错误，后续轮次清理。 */
export interface BladeRunModifiers {
  maxBonus: number;
  floorRatioBonus: number;
  gainMultiplier: number;
  costMultiplier: number;
  nodeThresholdShift: Partial<Record<BladeAbilityNodeId, number>>;
}

/** 敌人数值层级 */
export type EnemyDurabilityTier = "basic" | "tough" | "armored" | "mechanic" | "elite";

/** 刀势结算输入 */
export interface BladeMomentumSettleInput {
  /** 结算前刀势 */
  momentumBefore: BladeMomentumState;
  /** 基础挥刀消耗 */
  baseCost: number;
  /** 主动收益（命中 + 击杀 + 多斩奖励后的总和） */
  activeGain: number;
  /** 错误惩罚（误砍/空挥等，正值） */
  penalty: number;
  /** 收益倍率（由上限成长决定） */
  gainMultiplier: number;
}

/** 刀势结算输出 */
export interface BladeMomentumSettleOutput {
  /** 结算后刀势值 */
  current: number;
  /** 该刀净变化 */
  netChange: number;
  /** 新的完整状态 */
  newState: BladeMomentumState;
}

// ---- 配置常量 ----

export const BLADE_MOMENTUM_CONFIG = {
  /** 默认刀势上限 */
  baseMax: 100,

  /** 初始刀势比例（40/100 = 40%，即中刀势门槛） */
  initialRatio: 0.40,

  /** 统一档位阈值 */
  bandThresholds: {
    /** ratio < 0.40 → low */
    lowMax: 0.40,
    /** 0.40 ≤ ratio < 0.70 → mid */
    midMax: 0.70,
    /** ratio ≥ 0.70 → high */
  },

  /** 基础挥刀参数 */
  slash: {
    /** 固定基础消耗 */
    baseCost: 8,
    /** 最大基础路径 (px) */
    maxPathLength: 360,
    /** 最大基础持续时间 (s) */
    maxDuration: 0.9,
  },

  /** 档位能力 */
  bladePower: {
    low: {
      power: 1,
      widthMultiplier: 1.0,
      visualLengthMultiplier: 1.0,
      feedbackMultiplier: 1.0,
    },
    mid: {
      power: 2,
      widthMultiplier: 1.4,
      visualLengthMultiplier: 1.35,
      feedbackMultiplier: 1.35,
    },
    high: {
      power: 3,
      widthMultiplier: 2.0,
      visualLengthMultiplier: 1.8,
      feedbackMultiplier: 1.8,
    },
  },

  /** 被动恢复 */
  passiveRecovery: {
    /** 仅在刀势比例低于此值时恢复 */
    triggerRatio: 0.20,
    /** 最多恢复至当前上限的此比例 */
    capRatio: 0.20,
    /** 恢复速度：当前上限的此比例/秒 */
    ratePerSecondRatio: 0.02,
  },

  /** 主动收益倍率（随上限成长） */
  gainMultiplier: {
    /** 基础值 */
    base: 1.0,
    /** 上限超出 100 时每 200 增加的量 */
    per200Beyond100: 1.0,
    /** 倍率上限 */
    max: 1.4,
  },
} as const;

/* @deprecated V0730001: 旧版三档名称（base/enhanced/burst）。保留以兼容 BossChaseController 等未迁移代码。 */
export const LEGACY_BAND_NAMES = {
  lowAlias: "low" as BladeMomentumBand,    // was "base"
  midAlias: "mid" as BladeMomentumBand,    // was "enhanced"
  highAlias: "high" as BladeMomentumBand,  // was "burst"
} as const;

/* @deprecated V0730001: 保留旧常量以避免编译错误。新代码应使用 BLADE_MOMENTUM_CONFIG。 */
export const DEFAULT_BLADE_RUN_MODIFIERS: BladeRunModifiers = {
  maxBonus: 0,
  floorRatioBonus: 0,
  gainMultiplier: 1,
  costMultiplier: 1,
  nodeThresholdShift: {},
};
