import type { RatingGrade } from "../types";

export const REWARD_CONFIG = {
  baseClearCoins: 40,
  failCoins: 12,
  killCoin: 1,
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
    firstName: "长锋刀碎片",
    secondName: "爆裂刀穗碎片"
  },
  codexTotal: 8,
  oneBladeChallengeTarget: 3,
  godSlashThreshold: 13
} as const;

export function getRatingReward(rating: RatingGrade) {
  return REWARD_CONFIG.ratingCoins[rating];
}
