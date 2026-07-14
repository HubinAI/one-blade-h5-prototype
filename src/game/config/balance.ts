import type { BladeTier, EnemyKind, PickupKind } from "../types";

export const BALANCE = {
  player: {
    maxHp: 3
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
