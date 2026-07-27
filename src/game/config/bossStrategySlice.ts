// ========================================================================
// Boss Strategy Slice — S2.3 战场心流重构
// 6-8s循环、charged直飞、无缝继承、精准封路
// ========================================================================

export type SliceCoreState = "seed" | "charged" | "overloaded" | "cut" | "reflected";
export type SliceWindowType = "none" | "small" | "large";
export type SliceWindowSource = "clean_clear" | "charged_reflect";
export type SliceDecision = "attack_armor" | "clean_field" | "skip_window" | "long_route";
export type SlicePhase = "slice_intro" | "cycle_evolve" | "cycle_window" | "cycle_resolve" | "slice_complete";

export const STRATEGY_SLICE_CONFIG = {
  /** S2.3: 两轮总上限 */
  maxSliceDuration: 20,

  /** S2.3: 紧凑窗口 */
  phaseTimers: {
    sliceIntro: 0.25,
    windowSmall: 0.8,
    windowLarge: 1.5,
    resolveTransition: 0.25,
  },

  // ---- S2.2 刀势经济（不变）----
  bladeEconomy: {
    initialRatio: 0.55,
    feederCutGain: 0.20,
    normalSlashCost: 0.05,
    reflectThreshold: 0.70,
    postReflectRatio: 0.20,
    postOverloadRatio: 0.20,
    overloadHpDamage: 0.15,
  },

  /** S2.3: 吸收区下移 */
  absorbZone: {
    cx: 195,
    cy: 310,
    radius: 45,
  },

  /** 供能弹 — S2.3: 2.2–2.6s到达 */
  feeder: {
    count: 2,
    speed: 72,           // S2.4: overcorrect ~1.8s 到达
    spawnRadius: 130,
    absorbDistance: 22,
  },

  /** 核心弹 */
  coreProjectile: {
    spawnPos: { x: 195, y: 260 },
    chargedDuration: 3.0,        // S2.3: 总时间窗口，但核心立即飞向玩家
    chargedLaunchDelay: 0.25,    // S2.3: charged后短暂停顿再发射
    overloadedSpeed: 120,        // S2.3: 加速
    chargedIncomingSpeed: 160,   // S2.3: charged直飞玩家速度
  },

  /** 危险弹 */
  danger: {
    initialCount: 1,
    speed: 95,
    basePerCycle: 1,
  },

  /** 护甲 */
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

  /** S2.4 矫枉过正：A/B对照超参数 */
  overcorrect: {
    /** 对象尺寸放大倍数 */
    scaleMultiplier: 1.6,
    /** 供能弹到达时间(s) */
    feederArrivalTime: 1.6,
    /** 关系线宽度 */
    channelWidth: 10,
    /** 危险走廊可见长度 */
    dangerCorridorLength: 160,
    /** 危险走廊可见宽度 */
    dangerCorridorWidth: 26,
    /** 误砍危险惩罚 */
    dangerWrongCutHpPct: 0.08,
    dangerWrongCutEnergyPct: 0.20,
    /** Boss 肩抬距离 */
    bossShoulderLiftPx: 24,
    /** Boss 侧倾角度 */
    bossTiltDeg: 10,
    /** 撞肩后退距离 */
    bossReflectKnockbackPx: 24,
  },
};
