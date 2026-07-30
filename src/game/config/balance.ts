import type { BladeTier, EnemyKind, PickupKind } from "../types";

export const BALANCE = {
  player: {
    maxHp: 3
  },

  /** P0: Reactive Boss 玩家生命配置 */
  playerHp: {
    max: 100,
    normalBulletDamage: 6,
    reflectiveBulletDamage: 12,
    bossHeavyDamage: 20,
    mistakenCutDamage: 5,
    invincibleDuration: 0.3,
  },

  /** P0: Reactive Boss 刀势能量配置 */
  reactiveBladeEnergy: {
    max: 100,
    initial: 35,
    passiveRegenPerSecond: 1.5,
    slashRejectedByEnergyCount: 0,
    normalBulletReward: 8,
    reflectReward: 16,
    armorCrackReward: 5,
    armorBreakReward: 22,
    wrongHitPenalty: 10,
    mistakenCutPenalty: 10,
  },

  swordEnergy: {
    max: 100,
    passiveRegenPerSecond: 12,
    regenDelayAfterSlash: 0.25,
    /** 最低挥刀门槛（0-9%不可挥刀） */
    minSlashEnergy: 10,
    /** 消耗倍率: [轻斩, 强斩, 破阵斩] 消耗当前刀势的比例 */
    consumeRatio: { light: 0.6, strong: 0.75, break: 0.5 } as const,
    /** 单次挥刀返还上限 */
    maxRefund: 55,
    /** 阶梯返还: [击杀门槛, 返还量] */
    refundTiers: [
      [5, 8],
      [8, 15],
      [12, 25]
    ] as Array<[number, number]>,
    /** 破阵斩的阶梯返还更高 */
    breakRefundTiers: [
      [5, 20],
      [8, 35],
      [12, 50]
    ] as Array<[number, number]>,
    /** 命中返还（每命中1个敌人）+1% */
    hitRefund: 1,
    /** 击杀返还（每击杀1个敌人）+2% */
    killRefund: 2,
    /** 火药引爆返还 +5%（上限+20%） */
    powderRefund: 5,
    /** 阵眼崩散返还 +15% */
    coreRefund: 15,
    /** 保留旧字段以防引用，实际逻辑由 bladeEnergySystem.ts 接管 */
    consumeAllOnSlashStart: false,
    applyKillEnergyAfterSlash: false,
    maxEnergyGainPerSlash: 55
  },

  slash: {
    minEnergyToSlash: 1,
    hitSameEnemyOncePerSlash: true,
    sharpTurnAngle: 70,
    sharpTurnExtraCost: 50,
    lowBladeRemainRatio: 0.25,
    minMoveDistance: 1.5,
    activationDistance: 10, // P4.1A.7: 按下后至少滑动10px才正式成立挥刀
    touchHitPadding: 6
  },

  score: {
    infantry: 10,
    shield: 25,
    explosive: 30,
    core: 45,
    chainKillBonus: 5,
    slashKillBonus4: 30,
    slashKillBonus8: 80,
    slashKillBonus12: 160
  },

  battlefield: {
    topY: 90,
    bottomDefenseY: 710,
    enemySpawnY: 70,
    warriorY: 760
  },

  waves: {
    firstWaveDelay: 0.3,
    betweenWavesDelay: 0.5,
    randomPickupLimit: 6
  },

  feedback: {
    floatingTextLife: 0.8,
    stageTextLife: 0.5,
    hintTextLife: 2,
    burstSlowMotionSeconds: 0.12
  }
} as const;

/** 战斗纵向区域定义（第四轮微调：455） */
export const BATTLEFIELD_ZONES = {
  spawnTopY: -20,
  spawnVisibleY: 60,
  // 继续微调：480 → 455
  entryEndY: 455,
  // 中场随之轻微上移
  midfieldStartY: 350,
  midfieldCenterY: 455,
  midfieldEndY: 540,
  harvestStartY: 500,
  harvestEndY: 700,
  defenseLineY: 720
} as const;

/** 快速入场阶段配置（第四轮微调） */
export const ENTRY_PHASE_CONFIG = {
  defaultMultiplier: 2.45,
  earlyStageMultiplier: 2.75,
  lateStageMultiplier: 2.15,
  defaultEndY: 455,
  defaultMaxDuration: 1.7
} as const;

/** 第四轮微调：统一刷怪入口参数 */
export const ENTRY_PROFILE_COMMON = {
  spawnY: -20,
  entryEndY: 455,
  entryMultiplier: 2.75,
  entryMaxDuration: 1.7
} as const;

export const ENTRY_PROFILE_EDICT_BURST = {
  spawnY: -20,
  entryEndY: 490,
  entryMultiplier: 2.95,
  entryMaxDuration: 1.85
} as const;

/** 第五轮修正：精英专用 entry profile（比普通怪浅，给更多反应时间） */
export const ENTRY_PROFILE_ELITE = {
  spawnY: -20,
  entryEndY: 430,
  entryMultiplier: 2.35,
  entryMaxDuration: 1.9
} as const;

/** P2.5：怪物落点个体化扰动配置 */
export const ENTRY_END_JITTER = {
  enabled: true,
  commonMin: -35,
  commonMax: 35,
  rowWeights: { back: 0.22, middle: 0.56, front: 0.22 },
  rowOffset: { back: -32, middle: 0, front: 32 },
  kindOffset: {
    infantry: 0,
    shield: -18,
    powder: -8,
    core: -12,
    elite: -20
  }
} as const;

/** P3.4：分裂兵配置（强制释放） */
export const SPLITTER_CONFIG = {
  hp: 2, score: 20, radius: 34,
  triggerY: 360, chargeDuration: 0.75,
  maxSplitCount: 1, childCount: 4,
  childKind: "infantry" as EnemyKind,
  maxActiveSplitters: 6,
  tutorialProtectedSeconds: 0.75
} as const;

/** P3：牵引兵配置 */
export const TRACTOR_CONFIG = {
  hp: 1, score: 16, radius: 21,
  triggerY: 410, firstDelay: 0.6, chargeDuration: 1.1,
  maxPullCount: 2, cooldown: 3.0,
  minTargets: 3, maxTargets: 5, pullRadius: 135,
  pullStrength: 0.28, maxActiveTractors: 1
} as const;

/** P2.7：战斗安全区域（防止怪物贴左边缘，手机左滑返回兼容） */
export const BATTLE_SAFE_X = {
  normalMin: 88,
  normalMax: 300,
  extendedMin: 72,
  extendedMax: 318,
  eliteMin: 120,
  eliteMax: 260,
  burstMin: 64,
  burstMax: 324,
  absoluteMin: 56,
  absoluteMax: 336
} as const;

/** 性能上限 */
export const PERFORMANCE_LIMITS = {
  maxEnemiesOnScreen: 60,
  maxParticlesOnScreen: 180,
  maxFloatingText: 12
} as const;

/** 怪物软分离参数（第二轮修正：轻微加强防止抖动） */
export const ENEMY_SOFT_SEPARATION = {
  enabled: true,
  minXDistance: 40,
  minYDistance: 26,
  strength: 0.42,
  maxCorrectionPerFrame: 10,
  yMin: 300,
  yMax: 720
} as const;

/** 浮字聚合器参数（三次修正） */
export const FLOATING_TEXT_LIMITS = {
  maxOnScreen: 10,
  mergeWindowMs: 700,
  mergeRadius: 100,
  lowPriorityMax: 3
} as const;

/** P4.3A: 战场三层流动压力配置 */
export const BATTLEFIELD_FLOW = {
  enabled: true,
  layerRatios: {
    main_waves: { rear: 0.28, mid: 0.42, front: 0.30 },
    elite: { rear: 0.25, mid: 0.50, front: 0.25 },
    edict_burst: { rear: 0.20, mid: 0.35, front: 0.45 },
  },
  roleSpeed: { vanguard: 1.14, main: 1.00, reserve: 0.86 },
  minSpeedMultiplier: 0.72,
  maxSpeedMultiplier: 1.22,
  speedLerp: 3.0,
  layerBlendHeight: 42,
  nearEmptyGrace: 1.20,
  spacing: { xRadius: 52, minYGap: 28, closeMultiplier: 0.78, recoverSpeed: 4.0 },
  drawDepth: { rearScale: 0.92, rearAlpha: 0.86, midScale: 1.00, frontScale: 1.06 }
} as const;

export type SwordStage = {
  id: BladeTier;
  name: string;
  minEnergy: number;
  maxEnergy: number;
  duration: number;
  maxPathLength: number;
  width: number;
  damage: number;
  canBreakShield: boolean;
  canTriggerCoreCollapse: boolean;
  explosionRadiusMultiplier: number;
  coreCollapseRadius: number;
  killEnergyMultiplier: number;
  brightness: number;
  visualLength: number;
  color: string;
  glowColor: string;
  scoreName: string;
  prompt: string;
};

export const SWORD_STAGES: SwordStage[] = [
  {
    id: "weak",
    name: "蓄势",
    minEnergy: 0,
    maxEnergy: 9,
    duration: 0.2,
    maxPathLength: 60,
    width: 3,
    damage: 0,
    canBreakShield: false,
    canTriggerCoreCollapse: false,
    explosionRadiusMultiplier: 0.5,
    coreCollapseRadius: 0,
    killEnergyMultiplier: 0.5,
    brightness: 0.3,
    visualLength: 30,
    color: "#666666",
    glowColor: "rgba(102, 102, 102, 0.25)",
    scoreName: "蓄势中",
    prompt: "蓄势"
  },
  {
    id: "normal",
    name: "轻斩",
    minEnergy: 10,
    maxEnergy: 39,
    duration: 0.45,
    maxPathLength: 180,
    width: 7,
    damage: 1,
    canBreakShield: false,
    canTriggerCoreCollapse: false,
    explosionRadiusMultiplier: 0.7,
    coreCollapseRadius: 0,
    killEnergyMultiplier: 0.7,
    brightness: 0.55,
    visualLength: 55,
    color: "#c0d0e0",
    glowColor: "rgba(192, 208, 224, 0.4)",
    scoreName: "轻斩",
    prompt: "轻斩"
  },
  {
    id: "strong",
    name: "强斩",
    minEnergy: 40,
    maxEnergy: 89,
    duration: 0.7,
    maxPathLength: 340,
    width: 13,
    damage: 2,
    canBreakShield: true,
    canTriggerCoreCollapse: true,
    explosionRadiusMultiplier: 1.1,
    coreCollapseRadius: 100,
    killEnergyMultiplier: 1.1,
    brightness: 0.85,
    visualLength: 90,
    color: "#5bc0ff",
    glowColor: "rgba(91, 192, 255, 0.6)",
    scoreName: "强斩",
    prompt: "强斩"
  },
  {
    id: "burst",
    name: "破阵斩",
    minEnergy: 90,
    maxEnergy: 100,
    duration: 1.0,
    maxPathLength: 500,
    width: 20,
    damage: 3,
    canBreakShield: true,
    canTriggerCoreCollapse: true,
    explosionRadiusMultiplier: 1.4,
    coreCollapseRadius: 150,
    killEnergyMultiplier: 1.3,
    brightness: 1.2,
    visualLength: 130,
    color: "#fff4a0",
    glowColor: "rgba(255, 244, 160, 0.85)",
    scoreName: "破阵斩",
    prompt: "破阵斩"
  }
];

export const SWORD_STAGE_BY_ID = Object.fromEntries(SWORD_STAGES.map((stage) => [stage.id, stage])) as Record<
  BladeTier,
  SwordStage
>;

export const ENEMY_BALANCE: Record<
  EnemyKind,
  {
    name: string;
    hp: number;
    speed: number;
    radius: number;
    defenseDamage: number;
    score: number;
    energyReward: number;
    behavior: string;
    requireStageToKill?: BladeTier;
    explosionRadius?: number;
    explosionDamage?: number;
    collapseRadius?: number;
  }
> = {
  infantry: {
    name: "散修",
    hp: 1,
    speed: 42,
    radius: 18,
    defenseDamage: 1,
    score: BALANCE.score.infantry,
    energyReward: 2.5,
    behavior: "straight_down"
  },
  shield: {
    name: "妖卫",
    hp: 2,
    speed: 34,
    radius: 21,
    defenseDamage: 2,
    score: BALANCE.score.shield,
    energyReward: 5,
    behavior: "frontline",
    requireStageToKill: "strong"
  },
  powder: {
    name: "火修",
    hp: 1,
    speed: 38,
    radius: 19,
    defenseDamage: 1,
    score: BALANCE.score.explosive,
    energyReward: 5,
    behavior: "explosive",
    explosionRadius: 78,
    explosionDamage: 1
  },
  core: {
    name: "阵法核心",
    hp: 1,
    speed: 32,
    radius: 20,
    defenseDamage: 1,
    score: BALANCE.score.core,
    energyReward: 10,
    behavior: "formation_core",
    collapseRadius: 120
  },
  elite: {
    name: "精英护法",
    hp: 8,
    speed: 22,
    radius: 28,
    defenseDamage: 2,
    score: 120,
    energyReward: 15,
    behavior: "elite"
  },
  boss: {
    name: "大妖",
    hp: 16,
    speed: 20,
    radius: 36,
    defenseDamage: 2,
    score: 200,
    energyReward: 30,
    behavior: "boss"
  },
  splitter: {
    name: "分裂兵",
    hp: SPLITTER_CONFIG.hp,
    speed: 33,
    radius: SPLITTER_CONFIG.radius,
    defenseDamage: 1,
    score: SPLITTER_CONFIG.score,
    energyReward: 4,
    behavior: "normal"
  },
  tractor: {
    name: "牵引兵",
    hp: TRACTOR_CONFIG.hp,
    speed: 30,
    radius: TRACTOR_CONFIG.radius,
    defenseDamage: 1,
    score: TRACTOR_CONFIG.score,
    energyReward: 5,
    behavior: "normal"
  }
};

export const PICKUP_BALANCE: Record<
  PickupKind,
  {
    name: string;
    effect: string;
    duration: number | "next_slash";
    regenMultiplier?: number;
    pathLengthMultiplier?: number;
    widthMultiplier?: number;
    extraExplosionRadius?: number;
    energyGain: number;
    lifeSeconds: number;
    feedback: string;
    description: string;
  }
> = {
  drum: {
    name: "战鼓",
    effect: "energy_regen_boost",
    duration: 5,
    regenMultiplier: 1.8,
    energyGain: 8,
    lifeSeconds: 8,
    feedback: "战鼓激发",
    description: "5秒内刀势恢复加快"
  },
  soul: {
    name: "刀魂",
    effect: "next_slash_length_boost",
    duration: "next_slash",
    pathLengthMultiplier: 1.25,
    widthMultiplier: 1.1,
    energyGain: 6,
    lifeSeconds: 8,
    feedback: "刀魂入刃",
    description: "下一刀更长更宽"
  },
  oil: {
    name: "火油",
    effect: "next_slash_fire",
    duration: "next_slash",
    extraExplosionRadius: 60,
    energyGain: 6,
    lifeSeconds: 8,
    feedback: "火油附刃",
    description: "下一刀命中后附带小爆炸"
  }
};
