import type { BladeTier, EnemyKind, PickupKind } from "../types";

export const BALANCE = {
  player: {
    maxHp: 3
  },

  swordEnergy: {
    max: 100,
    passiveRegenPerSecond: 14,
    regenDelayAfterSlash: 0.25,
    consumeAllOnSlashStart: true,
    applyKillEnergyAfterSlash: true
  },

  slash: {
    minEnergyToSlash: 1,
    hitSameEnemyOncePerSlash: true,
    baseDuration: 0.35,
    basePathLength: 120,
    sharpTurnAngle: 75,
    sharpTurnExtraCost: 45,
    minMoveDistance: 1.5,
    touchHitPadding: 6
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
    randomPickupLimit: 4
  },

  feedback: {
    floatingTextLife: 0.8,
    burstSlowMotionSeconds: 0.26
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
  explosionRadiusMultiplier: number;
  coreCollapseRadius: number;
  brightness: number;
  visualLength: number;
  color: string;
  glowColor: string;
  scoreName: string;
};

export const SWORD_STAGES: SwordStage[] = [
  {
    id: "weak",
    name: "残锋",
    minEnergy: 0,
    maxEnergy: 24,
    duration: 0.35,
    maxPathLength: 160,
    width: 6,
    damage: 1,
    canBreakShield: false,
    explosionRadiusMultiplier: 0.8,
    coreCollapseRadius: 0,
    brightness: 0.44,
    visualLength: 54,
    color: "#d9b45b",
    glowColor: "rgba(217, 180, 91, 0.42)",
    scoreName: "应急斩"
  },
  {
    id: "normal",
    name: "常锋",
    minEnergy: 25,
    maxEnergy: 59,
    duration: 0.65,
    maxPathLength: 300,
    width: 10,
    damage: 1,
    canBreakShield: false,
    explosionRadiusMultiplier: 1,
    coreCollapseRadius: 80,
    brightness: 0.72,
    visualLength: 78,
    color: "#ffe7a3",
    glowColor: "rgba(255, 231, 163, 0.52)",
    scoreName: "顺势斩"
  },
  {
    id: "strong",
    name: "强锋",
    minEnergy: 60,
    maxEnergy: 89,
    duration: 0.95,
    maxPathLength: 460,
    width: 16,
    damage: 2,
    canBreakShield: true,
    explosionRadiusMultiplier: 1.2,
    coreCollapseRadius: 120,
    brightness: 0.98,
    visualLength: 108,
    color: "#ffd35a",
    glowColor: "rgba(255, 211, 90, 0.68)",
    scoreName: "强锋破甲"
  },
  {
    id: "burst",
    name: "破阵锋",
    minEnergy: 90,
    maxEnergy: 100,
    duration: 1.15,
    maxPathLength: 620,
    width: 24,
    damage: 3,
    canBreakShield: true,
    explosionRadiusMultiplier: 1.45,
    coreCollapseRadius: 160,
    brightness: 1.25,
    visualLength: 142,
    color: "#fff8d8",
    glowColor: "rgba(255, 230, 108, 0.86)",
    scoreName: "一刀破阵"
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
    explosionRadius?: number;
    explosionDamage?: number;
    collapseRadius?: number;
  }
> = {
  infantry: {
    name: "步兵",
    hp: 1,
    speed: 36,
    radius: 18,
    defenseDamage: 1,
    score: 10,
    energyReward: 3,
    behavior: "straight_down"
  },
  shield: {
    name: "盾兵",
    hp: 2,
    speed: 28,
    radius: 21,
    defenseDamage: 2,
    score: 25,
    energyReward: 6,
    behavior: "frontline"
  },
  powder: {
    name: "火药兵",
    hp: 1,
    speed: 32,
    radius: 19,
    defenseDamage: 1,
    score: 20,
    energyReward: 5,
    behavior: "explosive",
    explosionRadius: 85,
    explosionDamage: 1
  },
  core: {
    name: "阵眼兵",
    hp: 1,
    speed: 26,
    radius: 20,
    defenseDamage: 1,
    score: 30,
    energyReward: 12,
    behavior: "formation_core",
    collapseRadius: 130
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
