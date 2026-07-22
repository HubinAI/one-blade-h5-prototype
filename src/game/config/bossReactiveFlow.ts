// ========================================================================
// Boss Reactive Flow — 配置中心
// 全部数值常量集中在此，方便调参
// ========================================================================

export const REACTIVE_BOSS_CONFIG = {
  phaseTimers: {
    armorPrepare: 0.3,
    threatDuration: [2.0, 3.0],
    opportunityDuration: 1.5,
    resolveDuration: 0.12,
    recoveryDuration: 0.2,
  },
  bladeEnergy: {
    max: 100,
    initial: 35,
    passiveRegenPerSecond: 1.5,
    shortSlashCost: 7,
    longSlashBonus: 3,
    emptySwingPenalty: 4,
    wrongHitPenalty: 10,
    normalBulletReward: 8,
    reflectReward: 16,
    armorCrackReward: 5,
    armorBreakReward: 22,
    baseSlashCost: 8,
    longSlashExtraCost: 3,
  },
  playerHp: {
    max: 100,
    normalBulletDamage: 6,
    reflectiveBulletDamage: 12,
    bossHeavyDamage: 20,
    mistakenCutDamage: 5,
    invincibleDuration: 0.3,
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
      speed: 120,
      radius: 10,
      color: "#9b59b6",
      glowColor: "rgba(155,89,182,0.6)",
      maxLife: 4,
    },
    reflective: {
      speed: 90,
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
} as const;