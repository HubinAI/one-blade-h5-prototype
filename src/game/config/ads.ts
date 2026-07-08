export const AD_CONFIG = {
  rewardedRevive: {
    enabled: true,
    maxPerRun: 1,
    minSurviveTime: 40
  },
  rewardedDoubleReward: {
    enabled: true
  },
  rewardedExtraChest: {
    enabled: true
  },
  interstitial: {
    enabled: true,
    startAfterRuns: 3,
    minRunsBetweenAds: 2,
    cooldownSeconds: 90
  }
} as const;
