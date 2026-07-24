// ========================================================================
// Boss Reactive Flow — 配置中心
// 全部数值常量集中在此，方便调参
// ========================================================================

export const REACTIVE_BOSS_CONFIG = {
  // P4.4B-R5 P1-B: Boss 视觉缩放统一配置（构造与 reset 都读此值，避免不一致）
  visual: {
    bossScale: 1.15,
  },
  phaseTimers: {
    armorPrepare: 0.3,
    threatDuration: [2.0, 3.0],
    opportunityDuration: 1.5,
    resolveDuration: 0.12,
    recoveryDuration: 0.2,
  },
  bladeEnergy: {
    passiveRegenPerSecond: 1.5,
    wrongHitPenalty: 10,
    normalBulletReward: 8,
    reflectReward: 16,
    armorCrackReward: 5,
    armorBreakReward: 22,
  },
  playerHp: {
    max: 100,
    // P4.4B-R3 P0-B: 验证期降低伤害，确保测试者能稳定跑完三甲→追击。
    // 普通 6→3、强化 12→6、误砍 5→3。
    // 上线前再调回正式难度。
    normalBulletDamage: 3,
    reflectiveBulletDamage: 6,
    bossHeavyDamage: 10,
    mistakenCutDamage: 3,
    invincibleDuration: 0.3,
    // P0-B: 玩家受击线 Y（720→690，配合弹速提升让弹幕能真实到达）
    playerLineY: 690,
    // P0-B: 每次切换到新护甲时恢复 12 HP（首次进入新护甲的回血）。
    // 让测试者即使前一段漏弹也能继续验证后续阶段。
    armorTransitionHeal: 12,
  },
  armor: {
    durabilityPerPiece: 100,
    lowEnergyCrack: 25,
    midEnergyDamage: 55,
    highEnergyOneShot: 100,
    damageFormula: "20 + energy * 0.8",
  },
  projectiles: {
    normal: {
      // P4.4B-R2 P0-B: 120→145，确保弹幕能在阶段切换前到达玩家线
      speed: 145,
      radius: 10,
      color: "#9b59b6",
      glowColor: "rgba(155,89,182,0.6)",
      maxLife: 4,
    },
    reflective: {
      // P4.4B-R2 P0-B: 90→120（强化弹幕建议 110-130）
      speed: 120,
      radius: 14,
      color: "#d4a0ff",
      glowColor: "rgba(212,160,255,0.7)",
      maxLife: 5,
      rotationSpeed: 3,
    },
    dangerous: {
      speed: 160,
      radius: 16,
      color: "#c0392b",
      glowColor: "rgba(192,57,43,0.8)",
      maxLife: 3.5,
    },
  },
  // P4.4B-R3 P0-B: 弹幕生成间隔配置化（验证期 0.6→0.85，减少单段弹幕数）。
  // threat 阶段时长 2.0~3.0s × 0.85s 间隔 ≈ 2-3 发弹幕/护甲，原 0.6s ≈ 3-5 发。
  threatSpawn: {
    intervalBase: 0.85,
    intervalJitter: 0.2,
  },
  bladeEffect: {
    minLength: 30,
    maxLength: 130,
    minWidth: 3,
    maxWidth: 20,
    minBrightness: 0.3,
    maxBrightness: 1.2,
    lowEnergyColor: "#666666",
    midEnergyColor: "#5bc0ff",
    highEnergyColor: "#fff4a0",
  },
  // P4.4B-R5.6 P0-A/P0-B: Reactive 独立刀路规则 — 唯一消耗配置源。
  // 旧 bladeEnergy 配置不再用于 Reactive 挥刀消耗。
  // 验证：两次300px后 35-16=19 >=19（旧两刀归零）
  reactiveSlash: {
    activationDistance: 14,
    maxDuration: 0.9,
    maxPathLength: 360,
    /** 基础消耗 */
    baseCost: 4,
    /** 每100px额外消耗 */
    costPer100Px: 1,
    /** 单次最大消耗 */
    maxCost: 8,
    /** 空挥惩罚（验证期暂关闭，基础消耗已足够抑制无脑挥刀） */
    emptySwingPenalty: 0,
  },
} as const;