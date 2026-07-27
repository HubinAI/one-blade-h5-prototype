// ========================================================================
// Boss Strategy Slice — S2 战场信息语法实验
// 位置/运动/形状/颜色语法 + 压力模型 + 简化刀势经济
// ========================================================================

export type SliceCoreState = "seed" | "charged" | "overloaded" | "cut" | "reflected";
export type SliceWindowType = "none" | "small" | "large";
export type SliceWindowSource = "clean_clear" | "charged_reflect";
export type SliceDecision = "attack_armor" | "clean_field" | "skip_window" | "long_route";
export type SlicePhase = "slice_intro" | "cycle_evolve" | "cycle_window" | "cycle_resolve" | "slice_complete";

export const STRATEGY_SLICE_CONFIG = {
  /** 切片总时长上限（秒）— S2单轮10–14s，两轮约25s上限 */
  maxSliceDuration: 30,

  /** 阶段计时 — S2: 缩小窗口以加快节奏 */
  phaseTimers: {
    sliceIntro: 0.4,
    windowSmall: 0.9,
    windowLarge: 1.5,
    resolveTransition: 0.3,
  },

  // ---- S2.2 刀势经济 ----
  bladeEconomy: {
    initialRatio: 0.55,      // 初始刀势55%
    feederCutGain: 0.20,     // 斩1枚供能弹+20%
    normalSlashCost: 0.05,   // 每刀消耗5%
    reflectThreshold: 0.70,  // 反射门槛70%
    postReflectRatio: 0.20,  // 反射成功后降至20%
    postOverloadRatio: 0.20, // 过载受击后降至20%
    overloadHpDamage: 0.15,  // 过载HP伤害15%
  },

  /** 核心弹吸收区 */
  absorbZone: {
    cx: 195,
    cy: 320,     // S2: 稍高以容纳弧线轨迹
    radius: 50,
  },

  /** 供能弹 */
  feeder: {
    count: 2,
    speed: 22,           // S2: 加快弹速，供能弹约7s到达
    spawnRadius: 130,
    absorbDistance: 22,
  },

  /** 核心弹 */
  coreProjectile: {
    spawnPos: { x: 195, y: 260 },
    chargedDuration: 4.0,   // S2: 延长窗口给反射判断
    overloadedSpeed: 90,    // S2: 稍慢，但方向指向玩家
  },

  /** 危险弹 — S2: 路径经过刀路，横向切割 */
  danger: {
    initialCount: 1,
    speed: 85,
    spawnRadius: 140,
    basePerCycle: 1,
    /** S2: 危险弹水平偏移（从左右两侧横穿玩家刀路） */
    horizontalOffset: 100,
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
