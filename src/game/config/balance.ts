import type { BladeTier, EnemyKind, PickupKind } from "../types";

export const BALANCE = {
  player: {
    maxHp: 3
  },

  swordEnergy: {
    max: 100,
    passiveRegenPerSecond: 11,
    regenDelayAfterSlash: 0.25,
    consumeAllOnSlashStart: true,
    applyKillEnergyAfterSlash: true,
    maxEnergyGainPerSlash: 45
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
    firstWaveDelay: 0.45,
    betweenWavesDelay: 2,
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
    name: "残锋",
    minEnergy: 0,
    maxEnergy: 24,
    duration: 0.32,
    maxPathLength: 135,
    width: 5,
    damage: 1,
    canBreakShield: false,
    canTriggerCoreCollapse: false,
    explosionRadiusMultiplier: 0.75,
    coreCollapseRadius: 0,
    killEnergyMultiplier: 0.8,
    brightness: 0.44,
    visualLength: 48,
    color: "#d9b45b",
    glowColor: "rgba(217, 180, 91, 0.42)",
    scoreName: "应急斩",
    prompt: "残锋：应急"
  },
  {
    id: "normal",
    name: "常锋",
    minEnergy: 25,
    maxEnergy: 59,
    duration: 0.58,
    maxPathLength: 260,
    width: 9,
    damage: 1,
    canBreakShield: false,
    canTriggerCoreCollapse: true,
    explosionRadiusMultiplier: 1,
    coreCollapseRadius: 75,
    killEnergyMultiplier: 1,
    brightness: 0.72,
    visualLength: 72,
    color: "#ffe7a3",
    glowColor: "rgba(255, 231, 163, 0.52)",
    scoreName: "顺势斩",
    prompt: "常锋：可斩"
  },
  {
    id: "strong",
    name: "强锋",
    minEnergy: 60,
    maxEnergy: 89,
    duration: 0.82,
    maxPathLength: 390,
    width: 15,
    damage: 2,
    canBreakShield: true,
    canTriggerCoreCollapse: true,
    explosionRadiusMultiplier: 1.2,
    coreCollapseRadius: 115,
    killEnergyMultiplier: 1.15,
    brightness: 0.98,
    visualLength: 104,
    color: "#ffd35a",
    glowColor: "rgba(255, 211, 90, 0.68)",
    scoreName: "强锋破甲",
    prompt: "强锋：可破盾"
  },
  {
    id: "burst",
    name: "破阵锋",
    minEnergy: 90,
    maxEnergy: 100,
    duration: 1.02,
    maxPathLength: 520,
    width: 22,
    damage: 3,
    canBreakShield: true,
    canTriggerCoreCollapse: true,
    explosionRadiusMultiplier: 1.45,
    coreCollapseRadius: 155,
    killEnergyMultiplier: 1.3,
    brightness: 1.25,
    visualLength: 132,
    color: "#fff8d8",
    glowColor: "rgba(255, 230, 108, 0.86)",
    scoreName: "一刀破阵",
    prompt: "破阵锋：一刀破阵"
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
    name: "步兵",
    hp: 1,
    speed: 42,
    radius: 18,
    defenseDamage: 1,
    score: BALANCE.score.infantry,
    energyReward: 2.5,
    behavior: "straight_down"
  },
  shield: {
    name: "盾兵",
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
    name: "火药兵",
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
    name: "阵眼兵",
    hp: 1,
    speed: 32,
    radius: 20,
    defenseDamage: 1,
    score: BALANCE.score.core,
    energyReward: 10,
    behavior: "formation_core",
    collapseRadius: 120
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
