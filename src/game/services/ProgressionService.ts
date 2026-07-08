import { AD_CONFIG } from "../config/ads";
import { REWARD_CONFIG, getRatingReward } from "../config/rewards";
import type { BattleResult, EnemyKind, RatingGrade, RunProgress, RunRewards } from "../types";
import { logEvent } from "./Analytics";

const STORAGE_KEY = "one_blade_v04_progression";

type PlayerProgress = {
  runIndex: number;
  coins: number;
  chestProgress: number;
  chestOpened: number;
  oneBladeChallenge: number;
  fragments: Record<string, number>;
  codex: EnemyKind[];
  rewardedStreak: number;
  lastInterstitialRun: number;
  lastInterstitialAt: number;
};

const DEFAULT_PROGRESS: PlayerProgress = {
  runIndex: 0,
  coins: 0,
  chestProgress: 0,
  chestOpened: 0,
  oneBladeChallenge: 0,
  fragments: {
    [REWARD_CONFIG.shards.firstName]: 0,
    [REWARD_CONFIG.shards.secondName]: 0
  },
  codex: ["infantry"],
  rewardedStreak: 0,
  lastInterstitialRun: 0,
  lastInterstitialAt: 0
};

export type BattleRewardInput = {
  win: boolean;
  levelId: number;
  kills: number;
  maxSingleBlade: number;
  maxChain: number;
  rating: RatingGrade;
  discoveredEnemies: EnemyKind[];
};

function clampProgress(progress: PlayerProgress): PlayerProgress {
  return {
    ...DEFAULT_PROGRESS,
    ...progress,
    fragments: {
      ...DEFAULT_PROGRESS.fragments,
      ...(progress.fragments ?? {})
    },
    codex: Array.from(new Set(progress.codex ?? DEFAULT_PROGRESS.codex))
  };
}

export function readProgress(): PlayerProgress {
  if (typeof window === "undefined") return DEFAULT_PROGRESS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return clampProgress(raw ? JSON.parse(raw) : DEFAULT_PROGRESS);
  } catch {
    return DEFAULT_PROGRESS;
  }
}

function writeProgress(progress: PlayerProgress) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clampProgress(progress)));
}

export function beginRun(levelId: number) {
  const progress = readProgress();
  progress.runIndex += 1;
  writeProgress(progress);
  logEvent("game_start", { levelId, runIndex: progress.runIndex });
  return progress.runIndex;
}

function fragmentNameForLevel(levelId: number) {
  return levelId % 2 === 0 ? REWARD_CONFIG.shards.secondName : REWARD_CONFIG.shards.firstName;
}

export function makeProgressView(progress: PlayerProgress, fragmentName: string = REWARD_CONFIG.shards.firstName): RunProgress {
  return {
    runIndex: progress.runIndex,
    chestProgress: progress.chestProgress,
    chestTarget: REWARD_CONFIG.chest.target,
    codexFound: progress.codex.length,
    codexTotal: REWARD_CONFIG.codexTotal,
    oneBladeChallenge: progress.oneBladeChallenge,
    oneBladeChallengeTarget: REWARD_CONFIG.oneBladeChallengeTarget,
    fragmentName,
    fragmentCount: progress.fragments[fragmentName] ?? 0,
    fragmentTarget: REWARD_CONFIG.shards.target
  };
}

function getBattlePassReward(input: BattleRewardInput) {
  if (!input.win) return Math.min(REWARD_CONFIG.battlePass.failMax, REWARD_CONFIG.battlePass.failMin + Math.floor(input.kills / 18));
  let value = REWARD_CONFIG.battlePass.clear;
  if (input.rating === "S") value += REWARD_CONFIG.battlePass.s;
  if (input.rating === "SS") value += REWARD_CONFIG.battlePass.ss;
  if (input.rating === "神之一刀") value += REWARD_CONFIG.battlePass.god;
  return value;
}

export function buildNearMisses(input: BattleRewardInput, progress: PlayerProgress) {
  const misses: string[] = [];
  if (input.win && input.rating !== "S" && input.rating !== "SS" && input.rating !== "神之一刀") {
    const needKills = Math.max(1, 46 - input.kills);
    misses.push(`差 ${needKills} 个击杀即可达到 S 级，要不要再试一次？`);
  }
  if (input.maxSingleBlade < REWARD_CONFIG.godSlashThreshold) {
    misses.push(`最大单刀 ${input.maxSingleBlade}，达到 ${REWARD_CONFIG.godSlashThreshold} 可触发神之一刀。`);
  }
  if (progress.codex.length < REWARD_CONFIG.codexTotal) {
    misses.push(`本章还有 ${REWARD_CONFIG.codexTotal - progress.codex.length} 个图鉴未发现。`);
  }
  const needChest = REWARD_CONFIG.chest.target - progress.chestProgress;
  if (needChest > 0 && needChest <= 30) {
    misses.push(`再获得 ${needChest} 战功即可开启宝箱。`);
  }
  if (!input.win) {
    misses.unshift("敌军只剩最后一波，再来一局即可破阵。");
  }
  return misses.slice(0, 3);
}

export function evaluateRating(input: {
  win: boolean;
  kills: number;
  maxSingleBlade: number;
  maxChain: number;
  triggeredOneBlade: boolean;
  coreCollapseCount: number;
  explosiveCount: number;
}): RatingGrade {
  if (!input.win) return "C";
  if (input.maxSingleBlade >= REWARD_CONFIG.godSlashThreshold) return "神之一刀";
  if (input.triggeredOneBlade) return "SS";
  if (input.maxChain >= 8 || input.coreCollapseCount >= 2 || input.explosiveCount >= 3) return "S";
  if (input.kills >= 52 || input.maxSingleBlade >= 9) return "A";
  if (input.kills >= 28) return "B";
  return "C";
}

export function nextRatingHint(input: BattleRewardInput) {
  if (!input.win) return "再来一局，优先切火药和阵眼。";
  if (input.rating === "神之一刀") return "已经打出神之一刀，继续冲更高连锁。";
  if (input.maxSingleBlade < REWARD_CONFIG.godSlashThreshold) {
    return `最大单刀 ${input.maxSingleBlade}，达到 ${REWARD_CONFIG.godSlashThreshold} 可获得神之一刀。`;
  }
  return "再多触发 1 次阵眼崩散即可冲击 SS。";
}

export function applyBattleRewards(input: BattleRewardInput): Pick<BattleResult, "rewards" | "progress" | "nearMisses" | "nextRatingHint"> {
  const progress = readProgress();
  for (const kind of input.discoveredEnemies) {
    if (!progress.codex.includes(kind)) progress.codex.push(kind);
  }

  const fragmentName = fragmentNameForLevel(input.levelId);
  const coins = (input.win ? REWARD_CONFIG.baseClearCoins : REWARD_CONFIG.failCoins) + input.kills * REWARD_CONFIG.killCoin + getRatingReward(input.rating);
  const battlePass = getBattlePassReward(input);
  const shardCount = input.win ? 1 + (input.rating === "SS" || input.rating === "神之一刀" ? 1 : 0) : input.kills >= 25 ? 1 : 0;

  progress.coins += coins;
  progress.chestProgress += battlePass;
  progress.fragments[fragmentName] = Math.min(REWARD_CONFIG.shards.target, (progress.fragments[fragmentName] ?? 0) + shardCount);
  if (input.maxSingleBlade >= REWARD_CONFIG.godSlashThreshold) {
    progress.oneBladeChallenge = Math.min(REWARD_CONFIG.oneBladeChallengeTarget, progress.oneBladeChallenge + 1);
  }

  let chestOpened = false;
  if (progress.chestProgress >= REWARD_CONFIG.chest.target) {
    chestOpened = true;
    progress.chestProgress -= REWARD_CONFIG.chest.target;
    progress.chestOpened += 1;
    progress.coins += REWARD_CONFIG.chest.freeCoins;
    progress.fragments[fragmentName] = Math.min(
      REWARD_CONFIG.shards.target,
      (progress.fragments[fragmentName] ?? 0) + REWARD_CONFIG.chest.freeShards
    );
  }

  writeProgress(progress);

  const rewards: RunRewards = {
    coins,
    battlePass,
    shardName: fragmentName,
    shardCount,
    doubled: false,
    chestOpened,
    adChestOpened: false
  };

  return {
    rewards,
    progress: makeProgressView(progress, fragmentName),
    nearMisses: buildNearMisses(input, progress),
    nextRatingHint: nextRatingHint(input)
  };
}

export function claimDoubleReward(result: BattleResult): BattleResult {
  const progress = readProgress();
  const extraCoins = result.rewards.coins;
  const extraBattlePass = result.rewards.battlePass;
  progress.coins += extraCoins;
  progress.chestProgress += extraBattlePass;
  progress.fragments[result.rewards.shardName] = Math.min(
    REWARD_CONFIG.shards.target,
    (progress.fragments[result.rewards.shardName] ?? 0) + result.rewards.shardCount
  );
  while (progress.chestProgress >= REWARD_CONFIG.chest.target) {
    progress.chestProgress -= REWARD_CONFIG.chest.target;
    progress.chestOpened += 1;
    progress.coins += REWARD_CONFIG.chest.freeCoins;
  }
  progress.rewardedStreak += 1;
  writeProgress(progress);
  return {
    ...result,
    rewards: {
      ...result.rewards,
      coins: result.rewards.coins * 2,
      battlePass: result.rewards.battlePass * 2,
      shardCount: result.rewards.shardCount * 2,
      doubled: true
    },
    progress: makeProgressView(progress, result.rewards.shardName)
  };
}

export function claimAdChest(result: BattleResult): BattleResult {
  const progress = readProgress();
  progress.coins += REWARD_CONFIG.chest.adCoins;
  progress.fragments[result.rewards.shardName] = Math.min(
    REWARD_CONFIG.shards.target,
    (progress.fragments[result.rewards.shardName] ?? 0) + REWARD_CONFIG.chest.adShards
  );
  progress.rewardedStreak += 1;
  writeProgress(progress);
  return {
    ...result,
    rewards: {
      ...result.rewards,
      coins: result.rewards.coins + REWARD_CONFIG.chest.adCoins,
      shardCount: result.rewards.shardCount + REWARD_CONFIG.chest.adShards,
      adChestOpened: true
    },
    progress: makeProgressView(progress, result.rewards.shardName)
  };
}

export function registerRewardedAd() {
  const progress = readProgress();
  progress.rewardedStreak += 1;
  writeProgress(progress);
}

export function canShowInterstitial() {
  const progress = readProgress();
  if (!AD_CONFIG.interstitial.enabled) return false;
  if (progress.runIndex < AD_CONFIG.interstitial.startAfterRuns) return false;
  if (progress.runIndex - progress.lastInterstitialRun < AD_CONFIG.interstitial.minRunsBetweenAds) return false;
  if (progress.rewardedStreak >= 2) return false;
  const elapsedSeconds = (Date.now() - progress.lastInterstitialAt) / 1000;
  return elapsedSeconds >= AD_CONFIG.interstitial.cooldownSeconds;
}

export function markInterstitialShown() {
  const progress = readProgress();
  progress.lastInterstitialRun = progress.runIndex;
  progress.lastInterstitialAt = Date.now();
  progress.rewardedStreak = 0;
  writeProgress(progress);
}

export function markNonAdRunContinuation() {
  const progress = readProgress();
  progress.rewardedStreak = 0;
  writeProgress(progress);
}
