import type { RatingGrade } from "../types";

export type UpgradeId = "regen" | "bladeLength" | "explosionRadius" | "initialEnergy";

export const UPGRADE_CONFIG: Record<
  UpgradeId,
  {
    name: string;
    description: string;
    maxLevel: number;
    baseCost: number;
    costStep: number;
    effectPerLevel: number;
    unit: "%" | "point";
  }
> = {
  regen: {
    name: "刀势恢复",
    description: "每级刀势被动恢复 +2%",
    maxLevel: 10,
    baseCost: 80,
    costStep: 45,
    effectPerLevel: 0.02,
    unit: "%"
  },
  bladeLength: {
    name: "刀芒长度",
    description: "每级刀芒路径长度 +2%",
    maxLevel: 10,
    baseCost: 90,
    costStep: 50,
    effectPerLevel: 0.02,
    unit: "%"
  },
  explosionRadius: {
    name: "爆炸范围",
    description: "每级火药和火油爆炸范围 +3%",
    maxLevel: 10,
    baseCost: 100,
    costStep: 55,
    effectPerLevel: 0.03,
    unit: "%"
  },
  initialEnergy: {
    name: "初始刀势",
    description: "每级开局刀势 +3 点",
    maxLevel: 10,
    baseCost: 120,
    costStep: 60,
    effectPerLevel: 3,
    unit: "point"
  }
};

export const FRAGMENT_CONFIG = [
  {
    name: "长锋刀碎片",
    unlockName: "长锋刀",
    unlockedEffect: "刀芒长度 +5%"
  },
  {
    name: "爆裂刀穗碎片",
    unlockName: "爆裂刀穗",
    unlockedEffect: "爆炸范围 +5%"
  },
  {
    name: "破盾兵符碎片",
    unlockName: "破盾兵符",
    unlockedEffect: "盾兵伤害 +5%"
  },
  {
    name: "护心镜碎片",
    unlockName: "护心镜",
    unlockedEffect: "开局生命 +1"
  }
] as const;

export const DAILY_CHALLENGES = [
  { id: "more_powder", name: "火药日", description: "今日火药兵更多，连爆奖励提高" },
  { id: "fast_energy", name: "疾风日", description: "今日刀势恢复更快" },
  { id: "hard_shield", name: "盾墙日", description: "今日盾兵更密，破盾奖励提高" },
  { id: "core_bonus", name: "阵眼日", description: "今日阵眼奖励翻倍" },
  { id: "more_pickups", name: "补给日", description: "今日补给更频繁" }
] as const;

export const DAILY_TASK_CONFIG = [
  { id: "runs3", name: "完成 3 局", target: 3, rewardCoins: 60, rewardBattlePass: 8 },
  { id: "oneBlade3", name: "触发 3 次一刀破阵", target: 3, rewardCoins: 90, rewardBattlePass: 12 },
  { id: "watchAd1", name: "看 1 次广告", target: 1, rewardCoins: 50, rewardBattlePass: 6 },
  { id: "kills300", name: "击杀 300 个敌军", target: 300, rewardCoins: 120, rewardBattlePass: 18 },
  { id: "dailyChallenge1", name: "完成 1 次每日挑战", target: 1, rewardCoins: 100, rewardBattlePass: 15 }
] as const;

export const REWARD_CONFIG = {
  baseClearCoins: 40,
  failCoins: 12,
  killCoin: 1,
  highYieldMultiplier: 1.6,
  dailyFirstWin: {
    coinMultiplier: 2,
    battlePass: 20,
    shardCount: 1
  },
  ratingCoins: {
    C: 0,
    B: 20,
    A: 50,
    S: 100,
    SS: 180,
    神之一刀: 300
  } satisfies Record<RatingGrade, number>,
  battlePass: {
    clear: 20,
    failMin: 5,
    failMax: 10,
    s: 10,
    ss: 20,
    god: 30
  },
  chest: {
    target: 100,
    freeCoins: 60,
    adCoins: 90,
    freeShards: 1,
    adShards: 2
  },
  shards: {
    target: 10,
    names: FRAGMENT_CONFIG.map((item) => item.name),
    firstName: FRAGMENT_CONFIG[0].name,
    secondName: FRAGMENT_CONFIG[1].name
  },
  stamina: {
    max: 30,
    loginTopUp: 10,
    challengeCost: 5,
    regenMinutes: 10,
    adRestore: 10
  },
  offline: {
    maxHours: 8,
    coinsPerHour: 20
  },
  codexTotal: 8,
  oneBladeChallengeTarget: 3,
  godSlashThreshold: 13
} as const;

export function getRatingReward(rating: RatingGrade) {
  return REWARD_CONFIG.ratingCoins[rating];
}

export function getUpgradeCost(id: UpgradeId, level: number) {
  const config = UPGRADE_CONFIG[id];
  if (level >= config.maxLevel) return Number.POSITIVE_INFINITY;
  return config.baseCost + (level - 1) * config.costStep;
}
