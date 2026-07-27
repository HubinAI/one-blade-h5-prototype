// ========================================================================
// Boss Strategy Slice — V0723016-S1.3 实验模式配置
// 右肩单甲、两轮局势循环，18–25秒策略验证切片
// ========================================================================

/** 核心弹状态 */
export type SliceCoreState = "seed" | "charged" | "overloaded" | "cut" | "reflected";

/** 窗口类型 */
export type SliceWindowType = "none" | "small" | "large";

/** 窗口来源 */
export type SliceWindowSource = "clean_clear" | "charged_reflect";

/** 玩家决策 */
export type SliceDecision = "attack_armor" | "clean_field" | "skip_window" | "long_route";

/** 切片阶段 */
export type SlicePhase =
  | "slice_intro"
  | "cycle_evolve"
  | "cycle_window"
  | "cycle_resolve"
  | "slice_complete";

export const STRATEGY_SLICE_CONFIG = {
  /** 切片总时长上限（秒） */
  maxSliceDuration: 25,

  /** 阶段计时 */
  phaseTimers: {
    sliceIntro: 0.6,
    windowSmall: 1.1,   // 安全清场小破绽
    windowLarge: 1.8,   // 充能反射大破绽
    resolveTransition: 0.3,
  },

  /** 核心弹吸收区 — S1.3下移到画面中部，弹幕进入玩家刀路可达范围 */
  absorbZone: {
    cx: 195,
    cy: 340,    // 从260下移到340，弹幕在y≈180–520范围
    radius: 50,
  },

  /** 供能弹 */
  feeder: {
    count: 2,
    speed: 16,           // 飞向吸收区的速度（约7s到达，两轮约18s）
    spawnRadius: 130,    // 出生点距吸收区的距离
    absorbDistance: 22,  // 进入此距离视为被吸收
  },

  /** 核心弹 */
  coreProjectile: {
    spawnPos: { x: 195, y: 260 },  // 核心弹出生位置（吸收区上方）
    chargedDuration: 3.0,
    overloadedSpeed: 100,
  },

  /** 危险弹 */
  danger: {
    initialCount: 1,
    speed: 70,
    spawnRadius: 130,
    basePerCycle: 1,
  },

  /** 护甲（右肩） */
  armor: {
    durability: 100,
    lowDamage: 25,
    midDamage: 55,
    highDamage: 100,
    /** 右肩世界坐标 */
    shoulderPos: { cx: 245, cy: 240, rx: 38, ry: 24 },
  },

  /** 空窗容忍 */
  maxEmptyWindow: 0.8,

  /** 过载惩罚 */
  overloadPenalty: {
    extraDangerCount: 1,
  },
};
