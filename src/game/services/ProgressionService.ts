import { AD_CONFIG } from "../config/ads";
import {
  DAILY_CHALLENGES,
  DAILY_TASK_CONFIG,
  FRAGMENT_CONFIG,
  REWARD_CONFIG,
  UPGRADE_CONFIG,
  getRatingReward,
  getUpgradeCost,
  type UpgradeId
} from "../config/rewards";
import type { BattleResult, BossId, EliteKind, EnemyKind, LevelConfig, RatingGrade, RunProgress, RunRewards } from "../types";
import type { Quality, RankId, StageGate } from "../config/synthesis";
import { RANK_ORDER, RANK_CONFIG, QUALITY_ORDER, QUALITY_META, MAIN_STAGE_GATES, getCurrentGate, SYNTHESIS_RULES } from "../config/synthesis";
import { synthesizeBlades, addExpToBlade, generateBlade, createBlade } from "./BladeService";
import type { SynthesisResult, Blade } from "./BladeService";
import { logEvent } from "./Analytics";

const STORAGE_KEY = "one_blade_v04_progression";

export type RunMode = "normal" | "dailyChallenge" | "highYield" | "freeBurst" | "challenge";
type DailyTaskId = (typeof DAILY_TASK_CONFIG)[number]["id"];

type DailyTaskProgress = {
  progress: number;
  claimed: boolean;
};

type DailyState = {
  date: string;
  firstWinClaimed: boolean;
  challengeCompleted: boolean;
  freeBurstUsed: boolean;
  tasks: Record<DailyTaskId, DailyTaskProgress>;
  fastIdleUsed: number;
  staminaShareUsed: boolean;
};

export type PlayerProgress = {
  runIndex: number;
  coins: number;
  stamina: number;
  lastStaminaAt: number;
  lastSeenAt: number;
  lastShareAt: number;
  offlineCoins: number;
  chestProgress: number;
  chestOpened: number;
  oneBladeChallenge: number;
  fragments: Record<string, number>;
  upgrades: Record<UpgradeId, number>;
  codex: EnemyKind[];
  codexElites: string[];
  codexBosses: string[];
  rewardedStreak: number;
  lastInterstitialRun: number;
  lastInterstitialAt: number;
  currentRunMode: RunMode;
  daily: DailyState;
  // ---- 修仙合成系统 ----
  /** 刀库 */
  blades: Blade[];
  /** 玩家当前段位索引（0=练气） */
  rankIndex: number;
  /** 主线最高层数 */
  highestFloor: number;
  /** 当前装备的主刀ID */
  equippedMainBladeId: string | null;
  /** 当前装备的副刀ID列表 */
  equippedSubBladeIds: string[];
  /** 各品质合成失败计数 */
  synFailCount: Record<string, number>;
  /** 已完成的突破ID列表 */
  clearedBreakthroughs: string[];
  /** P3.10：显式待突破ID */
  pendingBreakthroughId: string | null;
};

export type BattleRewardInput = {
  win: boolean;
  levelId: number;
  kills: number;
  maxSingleBlade: number;
  maxChain: number;
  oneBladeBreaks: number;
  coreCollapseCount: number;
  explosiveCount: number;
  rating: RatingGrade;
  discoveredEnemies: EnemyKind[];
};

export type HomeSnapshot = {
  runIndex: number;
  coins: number;
  stamina: number;
  staminaMax: number;
  staminaNextText: string;
  chestProgress: number;
  chestTarget: number;
  dailyFirstWinReady: boolean;
  freeBurstAvailable: boolean;
  dailyChallengeName: string;
  dailyChallengeDescription: string;
  offlineCoins: number;
  highestFloor: number;
  rankIndex: number;
  lastSeenAt: number;
  fragments: Array<{
    name: string;
    count: number;
    target: number;
    unlocked: boolean;
    effect: string;
  }>;
  upgrades: Array<{
    id: UpgradeId;
    name: string;
    level: number;
    maxLevel: number;
    cost: number;
    canBuy: boolean;
    description: string;
  }>;
  dailyTasks: Array<{
    id: DailyTaskId;
    name: string;
    progress: number;
    target: number;
    claimed: boolean;
    rewardText: string;
  }>;
};

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createTaskState(): Record<DailyTaskId, DailyTaskProgress> {
  return Object.fromEntries(DAILY_TASK_CONFIG.map((task) => [task.id, { progress: 0, claimed: false }])) as Record<
    DailyTaskId,
    DailyTaskProgress
  >;
}

function createDailyState(date = todayKey()): DailyState {
  return {
    date,
    firstWinClaimed: false,
    challengeCompleted: false,
    freeBurstUsed: false,
    tasks: createTaskState(),
    fastIdleUsed: 0,
    staminaShareUsed: false
  };
}

function createFragments() {
  return Object.fromEntries(FRAGMENT_CONFIG.map((item) => [item.name, 0])) as Record<string, number>;
}

function createUpgrades(): Record<UpgradeId, number> {
  return {
    regen: 1,
    bladeLength: 1,
    explosionRadius: 1,
    initialEnergy: 1
  };
}

function createDefaultProgress(): PlayerProgress {
  const now = Date.now();
  return {
    runIndex: 0,
    coins: 0,
    stamina: REWARD_CONFIG.stamina.max,
    lastStaminaAt: now,
    lastSeenAt: now,
    lastShareAt: 0,
    offlineCoins: 0,
    chestProgress: 0,
    chestOpened: 0,
    oneBladeChallenge: 0,
    fragments: createFragments(),
    upgrades: createUpgrades(),
    codex: ["infantry"],
    codexElites: [],
    codexBosses: [],
    rewardedStreak: 0,
    lastInterstitialRun: 0,
    lastInterstitialAt: 0,
    currentRunMode: "normal",
    daily: createDailyState(),
    blades: [],
    rankIndex: 0,
    highestFloor: 1,
    equippedMainBladeId: null,
    equippedSubBladeIds: [],
    synFailCount: {},
    clearedBreakthroughs: [],
    pendingBreakthroughId: null,
  };
}

function normalizeDaily(raw: Partial<DailyState> | undefined): DailyState {
  const current = createDailyState(raw?.date ?? todayKey());
  return {
    ...current,
    ...raw,
    tasks: {
      ...current.tasks,
      ...(raw?.tasks ?? {})
    }
  };
}

function normalizeProgress(raw: Partial<PlayerProgress> | null): PlayerProgress {
  const fallback = createDefaultProgress();
  const progress = {
    ...fallback,
    ...(raw ?? {}),
    fragments: {
      ...fallback.fragments,
      ...(raw?.fragments ?? {})
    },
    upgrades: {
      ...fallback.upgrades,
      ...(raw?.upgrades ?? {})
    },
    codex: Array.from(new Set(raw?.codex ?? fallback.codex)),
    daily: normalizeDaily(raw?.daily)
  };
  repairBreakthroughProgress(progress);
  return progress;
}

/** P3.10：自动修复旧存档突破状态 */
function repairBreakthroughProgress(progress: PlayerProgress) {
  for (const gate of MAIN_STAGE_GATES) {
    const nextFloor = gate.nextUnlockFrom ?? gate.afterStage + 1;
    const hasRecord = progress.clearedBreakthroughs.includes(gate.breakthroughId);
    // 还没通过卡点却已有完成记录 → 旧Debug脏数据
    if (progress.highestFloor <= gate.afterStage && hasRecord) {
      progress.clearedBreakthroughs = progress.clearedBreakthroughs.filter(id => id !== gate.breakthroughId);
    }
    // 已被旧版本推进到下一关但突破未完成
    if (progress.highestFloor >= nextFloor && !progress.clearedBreakthroughs.includes(gate.breakthroughId) && !progress.pendingBreakthroughId) {
      progress.pendingBreakthroughId = gate.breakthroughId;
    }
  }
}

function applyTimeProgress(progress: PlayerProgress) {
  let changed = false;
  const now = Date.now();
  const today = todayKey();

  if (progress.daily.date !== today) {
    progress.daily = createDailyState(today);
    progress.stamina = Math.min(REWARD_CONFIG.stamina.max, progress.stamina + REWARD_CONFIG.stamina.loginTopUp);
    progress.lastStaminaAt = now;
    changed = true;
  }

  const staminaInterval = REWARD_CONFIG.stamina.regenMinutes * MS_PER_MINUTE;
  if (progress.stamina < REWARD_CONFIG.stamina.max) {
    const restored = Math.floor(Math.max(0, now - progress.lastStaminaAt) / staminaInterval);
    if (restored > 0) {
      progress.stamina = Math.min(REWARD_CONFIG.stamina.max, progress.stamina + restored);
      progress.lastStaminaAt += restored * staminaInterval;
      changed = true;
    }
  } else if (progress.lastStaminaAt !== now) {
    progress.lastStaminaAt = now;
    changed = true;
  }

  const offlineWindow = REWARD_CONFIG.offline.maxHours * MS_PER_HOUR;
  const offlineElapsed = Math.min(Math.max(0, now - progress.lastSeenAt), offlineWindow);
  const offlineHours = Math.floor(offlineElapsed / MS_PER_HOUR);
  if (offlineHours > 0) {
    const maxOfflineCoins = REWARD_CONFIG.offline.maxHours * REWARD_CONFIG.offline.coinsPerHour;
    progress.offlineCoins = Math.min(
      maxOfflineCoins,
      progress.offlineCoins + offlineHours * REWARD_CONFIG.offline.coinsPerHour
    );
    // 离线产出白色刀（每小时2把=48把/天）
    const bladeCount = offlineHours * 2;
    for (let i = 0; i < bladeCount; i++) {
      const blade = generateBlade("white");
      progress.blades.push(blade);
    }
    progress.lastSeenAt = now;
    changed = true;
  }

  return changed;
}

export function readProgress(): PlayerProgress {
  if (typeof window === "undefined") return createDefaultProgress();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const progress = normalizeProgress(raw ? JSON.parse(raw) : null);
    if (applyTimeProgress(progress)) writeProgress(progress);
    return progress;
  } catch {
    return createDefaultProgress();
  }
}

export function writeProgress(progress: PlayerProgress) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function getDailyChallenge(date = todayKey()) {
  const seed = Number(date.replace(/-/g, ""));
  return DAILY_CHALLENGES[seed % DAILY_CHALLENGES.length];
}

function fragmentNameForLevel(levelId: number) {
  const index = Math.abs(levelId - 1) % FRAGMENT_CONFIG.length;
  return FRAGMENT_CONFIG[index].name;
}

function addShard(progress: PlayerProgress, shardName: string, count: number) {
  progress.fragments[shardName] = Math.min(
    REWARD_CONFIG.shards.target,
    (progress.fragments[shardName] ?? 0) + Math.max(0, count)
  );
}

function addTaskProgress(progress: PlayerProgress, id: DailyTaskId, amount: number) {
  const task = progress.daily.tasks[id];
  if (!task || task.claimed) return;
  const config = DAILY_TASK_CONFIG.find((item) => item.id === id);
  task.progress = Math.min(config?.target ?? amount, task.progress + amount);
}

function openFreeChests(progress: PlayerProgress, shardName: string, reason: string) {
  let opened = false;
  while (progress.chestProgress >= REWARD_CONFIG.chest.target) {
    progress.chestProgress -= REWARD_CONFIG.chest.target;
    progress.chestOpened += 1;
    progress.coins += REWARD_CONFIG.chest.freeCoins;
    addShard(progress, shardName, REWARD_CONFIG.chest.freeShards);
    opened = true;
    logEvent("chest_open", {
      chestType: "free",
      reason,
      coins: REWARD_CONFIG.chest.freeCoins,
      shardName,
      shardCount: REWARD_CONFIG.chest.freeShards
    });
  }
  return opened;
}

function autoClaimDailyTasks(progress: PlayerProgress, shardName: string) {
  for (const taskConfig of DAILY_TASK_CONFIG) {
    const task = progress.daily.tasks[taskConfig.id];
    if (!task || task.claimed || task.progress < taskConfig.target) continue;
    task.claimed = true;
    progress.coins += taskConfig.rewardCoins;
    progress.chestProgress += taskConfig.rewardBattlePass;
    logEvent("daily_reward_claim", {
      rewardType: "task",
      taskId: taskConfig.id,
      coins: taskConfig.rewardCoins,
      battlePass: taskConfig.rewardBattlePass
    });
  }
  openFreeChests(progress, shardName, "daily_task");
}

function getBattlePassReward(input: BattleRewardInput) {
  if (!input.win) return Math.min(REWARD_CONFIG.battlePass.failMax, REWARD_CONFIG.battlePass.failMin + Math.floor(input.kills / 18));
  let value = REWARD_CONFIG.battlePass.clear;
  if (input.rating === "S") value += REWARD_CONFIG.battlePass.s;
  if (input.rating === "SS") value += REWARD_CONFIG.battlePass.ss;
  if (input.rating === "神之一刀") value += REWARD_CONFIG.battlePass.god;
  return value;
}

export function beginRun(levelId: number, mode: RunMode = "normal") {
  const progress = readProgress();
  progress.runIndex += 1;
  progress.currentRunMode = mode;
  writeProgress(progress);
  logEvent("game_start", { levelId, runIndex: progress.runIndex, mode });
  return progress.runIndex;
}

export function getCurrentRunContext() {
  const progress = readProgress();
  return {
    mode: progress.currentRunMode,
    dailyChallengeId: getDailyChallenge(progress.daily.date).id
  };
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

export function buildNearMisses(input: BattleRewardInput, progress: PlayerProgress) {
  const misses: string[] = [];
  if (input.win && input.rating !== "S" && input.rating !== "SS" && input.rating !== "神之一刀") {
    const needKills = Math.max(1, 46 - input.kills);
    misses.push(`再多击杀 ${needKills} 个敌军即可达到 S 级，要不要再试一次？`);
  }
  if (input.maxSingleBlade < REWARD_CONFIG.godSlashThreshold) {
    misses.push(`最大单刀 ${input.maxSingleBlade}，达到 ${REWARD_CONFIG.godSlashThreshold} 可触发神之一刀。`);
  }
  if (input.coreCollapseCount === 0) {
    misses.push("再触发 1 次阵眼崩散即可冲击 SS。");
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
  if (input.rating === "神之一刀") return "已打出神之一刀，继续冲更高连锁。";
  if (input.maxSingleBlade < REWARD_CONFIG.godSlashThreshold) {
    return `最大单刀 ${input.maxSingleBlade}，达到 ${REWARD_CONFIG.godSlashThreshold} 可获得神之一刀。`;
  }
  return "再多触发 1 次阵眼崩散即可冲击 SS。";
}

export function applyBattleRewards(input: BattleRewardInput): Pick<BattleResult, "rewards" | "progress" | "nearMisses" | "nextRatingHint"> {
  const progress = readProgress();
  const runMode = progress.currentRunMode;
  for (const kind of input.discoveredEnemies) {
    if (!progress.codex.includes(kind)) progress.codex.push(kind);
  }

  const fragmentName = fragmentNameForLevel(input.levelId);
  let coins = (input.win ? REWARD_CONFIG.baseClearCoins : REWARD_CONFIG.failCoins) + input.kills * REWARD_CONFIG.killCoin + getRatingReward(input.rating);
  let battlePass = getBattlePassReward(input);
  let shardCount = input.win ? 1 + (input.rating === "SS" || input.rating === "神之一刀" ? 1 : 0) : input.kills >= 25 ? 1 : 0;
  const highYieldBonusApplied = runMode === "highYield";
  let dailyBonusApplied = false;

  if (highYieldBonusApplied) {
    coins = Math.round(coins * REWARD_CONFIG.highYieldMultiplier);
    battlePass = Math.round(battlePass * 1.35);
    shardCount += input.win ? 1 : 0;
  }

  if (input.win && !progress.daily.firstWinClaimed) {
    dailyBonusApplied = true;
    progress.daily.firstWinClaimed = true;
    coins = Math.round(coins * REWARD_CONFIG.dailyFirstWin.coinMultiplier);
    battlePass += REWARD_CONFIG.dailyFirstWin.battlePass;
    shardCount += REWARD_CONFIG.dailyFirstWin.shardCount;
    logEvent("daily_reward_claim", {
      rewardType: "daily_first_win",
      levelId: input.levelId,
      coins,
      battlePass: REWARD_CONFIG.dailyFirstWin.battlePass,
      shardName: fragmentName,
      shardCount: REWARD_CONFIG.dailyFirstWin.shardCount
    });
  }

  if (runMode === "dailyChallenge" && input.win) {
    progress.daily.challengeCompleted = true;
    coins += 80;
    battlePass += 15;
    shardCount += 1;
    addTaskProgress(progress, "dailyChallenge1", 1);
    logEvent("daily_reward_claim", {
      rewardType: "daily_challenge",
      levelId: input.levelId,
      coins: 80,
      battlePass: 15,
      shardName: fragmentName,
      shardCount: 1
    });
  }

  progress.coins += coins;
  progress.chestProgress += battlePass;
  addShard(progress, fragmentName, shardCount);
  if (input.maxSingleBlade >= REWARD_CONFIG.godSlashThreshold) {
    progress.oneBladeChallenge = Math.min(REWARD_CONFIG.oneBladeChallengeTarget, progress.oneBladeChallenge + 1);
  }

  addTaskProgress(progress, "runs3", 1);
  addTaskProgress(progress, "kills300", input.kills);
  addTaskProgress(progress, "oneBlade3", input.oneBladeBreaks);

  const chestOpened = openFreeChests(progress, fragmentName, "battle_reward");
  autoClaimDailyTasks(progress, fragmentName);

  // ---- 修仙合成：战斗产出刀 ----
  const currentRank = RANK_ORDER[progress.rankIndex] ?? RANK_ORDER[0];
  const rankConfig = RANK_CONFIG[currentRank];
  // 产出刀品质 = 段位可解锁的最低品质 / 或白色兜底
  const baseQuality: Quality = rankConfig?.unlockQuality ?? "white";
  const bladeQualityOrder: Quality[] = ["white", "green", "blue", "purple", "gold", "darkGold", "spirit", "immortal", "god"];
  const baseIdx = bladeQualityOrder.indexOf(baseQuality);
  // 胜利时可能出更好品质（+1），失败只出基础品质
  const rewardQuality = input.win
    ? bladeQualityOrder[Math.min(bladeQualityOrder.length - 1, baseIdx + (Math.random() < 0.15 ? 1 : 0))]
    : bladeQualityOrder[Math.max(0, baseIdx)];
  const newBlade = generateBlade(rewardQuality);
  progress.blades.push(newBlade);

  progress.currentRunMode = "normal";
  writeProgress(progress);

  const rewards: RunRewards = {
    coins,
    battlePass,
    shardName: fragmentName,
    shardCount,
    doubled: false,
    chestOpened,
    adChestOpened: false,
    dailyBonusApplied,
    highYieldBonusApplied
  };

  return {
    rewards,
    progress: makeProgressView(progress, fragmentName),
    nearMisses: buildNearMisses(input, progress),
    nextRatingHint: nextRatingHint(input)
  };
}

/** 保存精英/Boss图鉴解锁数据 */
export function saveCodexData(killedElites: string[], killedBoss: string | null) {
  const progress = readProgress();
  let changed = false;
  for (const ek of killedElites) {
    if (!progress.codexElites.includes(ek)) {
      progress.codexElites.push(ek);
      changed = true;
    }
  }
  if (killedBoss && !progress.codexBosses.includes(killedBoss)) {
    progress.codexBosses.push(killedBoss);
    changed = true;
  }
  if (changed) writeProgress(progress);
}

/** 获取已解锁的精英图鉴 */
export function getCodexElites(): string[] {
  return readProgress().codexElites;
}

/** 获取已解锁的Boss图鉴 */
export function getCodexBosses(): string[] {
  return readProgress().codexBosses;
}

function markRewardedWatched(progress: PlayerProgress, reason: string, levelId?: number) {
  progress.rewardedStreak += 1;
  addTaskProgress(progress, "watchAd1", 1);
  void reason;
  void levelId;
}

export function claimDoubleReward(result: BattleResult): BattleResult {
  const progress = readProgress();
  const extraCoins = result.rewards.coins;
  const extraBattlePass = result.rewards.battlePass;
  progress.coins += extraCoins;
  progress.chestProgress += extraBattlePass;
  addShard(progress, result.rewards.shardName, result.rewards.shardCount);
  markRewardedWatched(progress, "double_reward", result.levelId);
  const chestOpened = openFreeChests(progress, result.rewards.shardName, "double_reward");
  autoClaimDailyTasks(progress, result.rewards.shardName);
  writeProgress(progress);
  return {
    ...result,
    rewards: {
      ...result.rewards,
      coins: result.rewards.coins * 2,
      battlePass: result.rewards.battlePass * 2,
      shardCount: result.rewards.shardCount * 2,
      doubled: true,
      chestOpened: result.rewards.chestOpened || chestOpened
    },
    progress: makeProgressView(progress, result.rewards.shardName)
  };
}

export function claimAdChest(result: BattleResult): BattleResult {
  const progress = readProgress();
  progress.coins += REWARD_CONFIG.chest.adCoins;
  addShard(progress, result.rewards.shardName, REWARD_CONFIG.chest.adShards);
  markRewardedWatched(progress, "bonus_chest", result.levelId);
  logEvent("chest_open", {
    chestType: "ad_bonus",
    reason: "bonus_chest",
    coins: REWARD_CONFIG.chest.adCoins,
    shardName: result.rewards.shardName,
    shardCount: REWARD_CONFIG.chest.adShards
  });
  autoClaimDailyTasks(progress, result.rewards.shardName);
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

export function registerRewardedAd(reason = "rewarded", levelId?: number) {
  const progress = readProgress();
  markRewardedWatched(progress, reason, levelId);
  autoClaimDailyTasks(progress, REWARD_CONFIG.shards.firstName);
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

export function getUpgradeModifiers() {
  const progress = readProgress();
  const longBladeUnlocked = (progress.fragments[FRAGMENT_CONFIG[0].name] ?? 0) >= REWARD_CONFIG.shards.target;
  const burstTasselUnlocked = (progress.fragments[FRAGMENT_CONFIG[1].name] ?? 0) >= REWARD_CONFIG.shards.target;
  const shieldTokenUnlocked = (progress.fragments[FRAGMENT_CONFIG[2].name] ?? 0) >= REWARD_CONFIG.shards.target;
  const mirrorUnlocked = (progress.fragments[FRAGMENT_CONFIG[3].name] ?? 0) >= REWARD_CONFIG.shards.target;
  return {
    energyRegen: 1 + (progress.upgrades.regen - 1) * UPGRADE_CONFIG.regen.effectPerLevel,
    pathLength:
      1 +
      (progress.upgrades.bladeLength - 1) * UPGRADE_CONFIG.bladeLength.effectPerLevel +
      (longBladeUnlocked ? 0.05 : 0),
    explosionRadius:
      1 +
      (progress.upgrades.explosionRadius - 1) * UPGRADE_CONFIG.explosionRadius.effectPerLevel +
      (burstTasselUnlocked ? 0.05 : 0),
    initialEnergyBonus: (progress.upgrades.initialEnergy - 1) * UPGRADE_CONFIG.initialEnergy.effectPerLevel,
    shieldDamageMultiplier: shieldTokenUnlocked ? 1.05 : 1,
    openingShield: mirrorUnlocked ? 1 : 0
  };
}

export function buyUpgrade(id: UpgradeId) {
  const progress = readProgress();
  const level = progress.upgrades[id] ?? 1;
  const config = UPGRADE_CONFIG[id];
  const cost = getUpgradeCost(id, level);
  if (level >= config.maxLevel || progress.coins < cost) {
    return { ok: false, reason: "not_enough_coins" as const, progress: getHomeSnapshot() };
  }
  progress.coins -= cost;
  progress.upgrades[id] = level + 1;
  writeProgress(progress);
  logEvent("upgrade_buy", { upgradeId: id, level: level + 1, cost });
  return { ok: true, progress: getHomeSnapshot() };
}

export function spendStamina(amount: number, reason = "challenge_run") {
  const progress = readProgress();
  if (progress.stamina < amount) return false;
  progress.stamina -= amount;
  progress.lastStaminaAt = Date.now();
  writeProgress(progress);
  logEvent("stamina_spend", { amount, reason, staminaLeft: progress.stamina });
  return true;
}

/** 分享获得体力（15分钟冷却） */
export function earnShareStamina() {
  const progress = readProgress();
  const shareCD = 15 * 60 * 1000; // 15分钟
  const now = Date.now();
  const lastShare = progress.lastShareAt ?? 0;
  if (now - lastShare < shareCD) {
    const remaining = Math.ceil((shareCD - (now - lastShare)) / 60000);
    return { ok: false, message: `冷却中，${remaining}分钟后可再分享`, stamina: progress.stamina };
  }
  progress.lastShareAt = now;
  progress.stamina = Math.min(REWARD_CONFIG.stamina.max, progress.stamina + 5);
  writeProgress(progress);
  logEvent("stamina_restore", { amount: 5, reason: "share", stamina: progress.stamina });
  return { ok: true, stamina: progress.stamina };
}

export function restoreStaminaByAd(): { success: boolean; reason?: string; newStamina?: number } {
  const progress = readProgress();
  const max = REWARD_CONFIG.stamina.max;
  if (progress.stamina >= max) {
    return { success: false, reason: "体力已满" };
  }
  progress.stamina = Math.min(max, progress.stamina + 10);
  markRewardedWatched(progress, "stamina_restore");
  autoClaimDailyTasks(progress, REWARD_CONFIG.shards.firstName);
  writeProgress(progress);
  logEvent("stamina_ad_restore", { amount: 10, stamina: progress.stamina });
  return { success: true, newStamina: progress.stamina };
}

export function restoreStaminaByShare(): { success: boolean; reason?: string; newStamina?: number } {
  const progress = readProgress();
  if (progress.daily.staminaShareUsed) {
    return { success: false, reason: "今日分享已达上限" };
  }
  const max = REWARD_CONFIG.stamina.max;
  if (progress.stamina >= max) {
    return { success: false, reason: "体力已满" };
  }
  progress.daily.staminaShareUsed = true;
  progress.stamina = Math.min(max, progress.stamina + 5);
  writeProgress(progress);
  return { success: true, newStamina: progress.stamina };
}

/** 自动累积挂机收益（每分钟1次） */
export function claimAutoIdle(): { added: number; totalCoins: number } {
  const progress = readProgress();
  const now = Date.now();
  const lastTick = (progress as any).lastAutoIdleAt ?? (progress.lastSeenAt ?? now);
  const elapsedMin = Math.floor((now - lastTick) / 60_000);
  if (elapsedMin <= 0) {
    return { added: 0, totalCoins: progress.offlineCoins };
  }
  // 每分钟: +2 金币 + 概率 30% 落 1 把白刀
  const coinsPerMin = 2;
  const addedCoins = elapsedMin * coinsPerMin;
  const addedBlades = Math.floor(elapsedMin * 0.3);
  const maxCoins = 24 * 60 * coinsPerMin;
  progress.offlineCoins = Math.min(maxCoins, (progress.offlineCoins ?? 0) + addedCoins);
  for (let i = 0; i < addedBlades; i++) {
    progress.blades.push(generateBlade("white"));
  }
  (progress as any).lastAutoIdleAt = lastTick + elapsedMin * 60_000;
  writeProgress(progress);
  return { added: addedCoins + addedBlades, totalCoins: progress.offlineCoins };
}

export function claimOfflineReward(doubleByAd = false) {
  const progress = readProgress();
  const claimed = progress.offlineCoins;
  if (claimed <= 0) return getHomeSnapshot();
  progress.coins += claimed * (doubleByAd ? 2 : 1);
  progress.offlineCoins = 0;
  if (doubleByAd) markRewardedWatched(progress, "offline_reward_double");
  autoClaimDailyTasks(progress, REWARD_CONFIG.shards.firstName);
  writeProgress(progress);
  logEvent("daily_reward_claim", {
    rewardType: "offline",
    coins: claimed * (doubleByAd ? 2 : 1),
    doubled: doubleByAd
  });
  return getHomeSnapshot();
}

export function useFastIdle(): { remaining: number } {
  const progress = readProgress();
  const used = progress.daily.fastIdleUsed ?? 0;
  const remaining = Math.max(0, 4 - used);
  return { remaining };
}

/** 经验球二合：2个同品质球→1个高一级球（和刀二合概率一致） */
export function synthesizeExpOrbs(quality: Quality): { success: boolean; resultQuality?: Quality } {
  const progress = readProgress();
  const orbs = ((progress as any).expOrbs ?? {}) as Partial<Record<Quality, number>>;
  const count = orbs[quality] ?? 0;
  if (count < 2) return { success: false };

  const nextIdx = QUALITY_ORDER.indexOf(quality) + 1;
  if (nextIdx >= QUALITY_ORDER.length) return { success: false };
  const nextQuality = QUALITY_ORDER[nextIdx];

  const rule = SYNTHESIS_RULES[quality];
  if (!rule) return { success: false };

  // 消耗2个当前品质球
  orbs[quality] = (orbs[quality] ?? 0) - 2;

  const currentChance = Math.min(100, rule.baseChance);
  const roll = Math.random() * 100;
  if (roll < currentChance) {
    // 成功：加1个高一级球
    orbs[nextQuality] = (orbs[nextQuality] ?? 0) + 1;
    (progress as any).expOrbs = orbs;
    writeProgress(progress);
    return { success: true, resultQuality: nextQuality };
  } else {
    // 失败：返1个当前品质球
    orbs[quality] = (orbs[quality] ?? 0) + 1;
    (progress as any).expOrbs = orbs;
    writeProgress(progress);
    return { success: false };
  }
}

export function claimFastIdle(): boolean {
  const progress = readProgress();
  const used = progress.daily.fastIdleUsed ?? 0;
  if (used >= 4) return false;
  progress.daily.fastIdleUsed = used + 1;
  // 看广告奖励：追加4h离线白刀产出（8把）
  for (let i = 0; i < 8; i++) {
    const blade = generateBlade("white");
    progress.blades.push(blade);
  }
  writeProgress(progress);
  return true;
}

export function getHomeSnapshot(): HomeSnapshot {
  const progress = readProgress();
  const now = Date.now();
  const staminaInterval = REWARD_CONFIG.stamina.regenMinutes * MS_PER_MINUTE;
  const nextStaminaMs = Math.max(0, staminaInterval - (now - progress.lastStaminaAt));
  const staminaNextText =
    progress.stamina >= REWARD_CONFIG.stamina.max ? "已满" : `${Math.max(1, Math.ceil(nextStaminaMs / MS_PER_MINUTE))} 分钟 +1`;
  const challenge = getDailyChallenge(progress.daily.date);

  return {
    runIndex: progress.runIndex,
    coins: progress.coins,
    stamina: progress.stamina,
    staminaMax: REWARD_CONFIG.stamina.max,
    staminaNextText,
    chestProgress: progress.chestProgress,
    chestTarget: REWARD_CONFIG.chest.target,
    dailyFirstWinReady: !progress.daily.firstWinClaimed,
    freeBurstAvailable: !progress.daily.freeBurstUsed,
    dailyChallengeName: challenge.name,
    dailyChallengeDescription: challenge.description,
    offlineCoins: progress.offlineCoins,
    highestFloor: progress.highestFloor,
    rankIndex: progress.rankIndex,
    lastSeenAt: progress.lastSeenAt,
    fragments: FRAGMENT_CONFIG.map((item) => {
      const count = progress.fragments[item.name] ?? 0;
      return {
        name: item.name,
        count,
        target: REWARD_CONFIG.shards.target,
        unlocked: count >= REWARD_CONFIG.shards.target,
        effect: item.unlockedEffect
      };
    }),
    upgrades: (Object.keys(UPGRADE_CONFIG) as UpgradeId[]).map((id) => {
      const config = UPGRADE_CONFIG[id];
      const level = progress.upgrades[id] ?? 1;
      const cost = getUpgradeCost(id, level);
      return {
        id,
        name: config.name,
        level,
        maxLevel: config.maxLevel,
        cost: Number.isFinite(cost) ? cost : 0,
        canBuy: level < config.maxLevel && progress.coins >= cost,
        description: config.description
      };
    }),
    dailyTasks: DAILY_TASK_CONFIG.map((task) => {
      const state = progress.daily.tasks[task.id];
      return {
        id: task.id,
        name: task.name,
        progress: state?.progress ?? 0,
        target: task.target,
        claimed: state?.claimed ?? false,
        rewardText: `${task.rewardCoins} 金币 / ${task.rewardBattlePass} 战功`
      };
    })
  };
}

/** 每日免费满势符是否可用 */
export function isFreeBurstAvailable(): boolean {
  const progress = readProgress();
  return !progress.daily.freeBurstUsed;
}

/** 使用每日免费满势符 */
export function useFreeBurst(): void {
  const progress = readProgress();
  progress.daily.freeBurstUsed = true;
  writeProgress(progress);
}

// ════════════════════════════════════════════
// 修仙合成系统 - 刀库管理
// ════════════════════════════════════════════

/** 获取刀库 */
export function getBladeInventory(): Blade[] {
  return readProgress().blades;
}

/** 添加一把刀到刀库 */
export function addBlade(blade: Blade): void {
  const progress = readProgress();
  progress.blades.push(blade);
  writeProgress(progress);
}

/** 从刀库移除刀（用作合成材料） */
export function removeBlade(bladeId: string): boolean {
  const progress = readProgress();
  const idx = progress.blades.findIndex(b => b.id === bladeId);
  if (idx < 0) return false;
  progress.blades.splice(idx, 1);
  writeProgress(progress);
  return true;
}

/** 执行合成 */
export function forgeBlades(mat1Id: string, mat2Id: string): SynthesisResult | null {
  const progress = readProgress();
  const b1 = progress.blades.find(b => b.id === mat1Id);
  const b2 = progress.blades.find(b => b.id === mat2Id);
  if (!b1 || !b2 || b1.quality !== b2.quality) return null;

  const failCount = progress.synFailCount[b1.quality] ?? 0;
  const result = synthesizeBlades(b1, b2, failCount);

  // 移除材料
  progress.blades = progress.blades.filter(b => b.id !== mat1Id && b.id !== mat2Id);

  if (result.success && result.resultBlade) {
    progress.blades.push(result.resultBlade);
    progress.synFailCount[b1.quality] = 0;
  } else {
    // 失败：记录递增 + 产出1个原料品质经验球
    progress.synFailCount[b1.quality] = result.state.failCount;
    addExpOrbToProgress(progress, b1.quality, result.expReward);
  }

  writeProgress(progress);
  return result;
}

/** 获取当前段位ID */
export function getCurrentRankId(): RankId {
  const progress = readProgress();
  return RANK_ORDER[progress.rankIndex] ?? RANK_ORDER[0];
}

/** 获取可解锁的最高段位（基于主线层数） */
export function getAvailableRankIndex(highestFloor: number): number {
  // 每50层可升一段
  return Math.min(RANK_ORDER.length - 1, Math.floor(highestFloor / 50));
}

/** 检查并添加突破完成记录 */
export function addClearedBreakthrough(id: string): void {
  const progress = readProgress();
  if (!progress.clearedBreakthroughs.includes(id)) {
    progress.clearedBreakthroughs.push(id);
    writeProgress(progress);
  }
}

/** 检查突破是否已完成 */
export function hasClearedBreakthrough(id: string): boolean {
  return readProgress().clearedBreakthroughs.includes(id);
}

/** 获取当前需要突破的门(如果有) */
export function getPendingGate(): StageGate | null {
  const progress = readProgress();

  // P3.10：显式待突破状态为最高优先级
  if (progress.pendingBreakthroughId) {
    const gate = MAIN_STAGE_GATES.find(g => g.breakthroughId === progress.pendingBreakthroughId) ?? null;
    if (gate) return gate;
  }

  // P3.2：highestFloor 语义是"下一关可挑战" → 已通关最高关 = highestFloor - 1
  const clearedFloor = Math.max(0, progress.highestFloor - 1);
  const gate = getCurrentGate(clearedFloor);
  if (gate && !progress.clearedBreakthroughs.includes(gate.breakthroughId)) {
    return gate;
  }
  // 没有精确卡点，检查是否在某个阶段的突破未完成
  for (const g of MAIN_STAGE_GATES) {
    if (clearedFloor >= g.afterStage && !progress.clearedBreakthroughs.includes(g.breakthroughId)) {
      return g;
    }
  }
  return null;
}

/** P3.10：主线通关原子函数——记录通关、处理突破 */
export function recordMainlineClear(clearedFloor: number): { nextFloor: number; requiresBreakthrough: boolean; gate: StageGate | null } {
  const progress = readProgress();
  const gate = MAIN_STAGE_GATES.find(item => item.afterStage === clearedFloor) ?? null;

  if (gate) {
    const nextFloor = gate.nextUnlockFrom ?? clearedFloor + 1;
    const legitimatelyCleared = progress.clearedBreakthroughs.includes(gate.breakthroughId) && progress.highestFloor >= nextFloor;

    if (!legitimatelyCleared) {
      // 修复旧存档中伪完成记录
      progress.clearedBreakthroughs = progress.clearedBreakthroughs.filter(id => id !== gate.breakthroughId);
      progress.pendingBreakthroughId = gate.breakthroughId;
      // 第5关通关后仍停留在5，不提前解锁6
      progress.highestFloor = Math.max(progress.highestFloor, clearedFloor);
      writeProgress(progress);
      return { nextFloor: clearedFloor, requiresBreakthrough: true, gate };
    }
  }

  const nextFloor = clearedFloor + 1;
  progress.highestFloor = Math.max(progress.highestFloor, nextFloor);
  writeProgress(progress);
  return { nextFloor, requiresBreakthrough: false, gate: null };
}

/** P3.10：突破完成原子函数 */
export function completeBreakthroughProgress(breakthroughId: string): { ok: boolean; nextFloor: number } {
  const progress = readProgress();
  const gate = MAIN_STAGE_GATES.find(item => item.breakthroughId === breakthroughId);

  if (!gate) return { ok: false, nextFloor: progress.highestFloor };

  if (progress.pendingBreakthroughId && progress.pendingBreakthroughId !== breakthroughId) {
    return { ok: false, nextFloor: progress.highestFloor };
  }

  if (!progress.clearedBreakthroughs.includes(breakthroughId)) {
    progress.clearedBreakthroughs.push(breakthroughId);
  }

  progress.pendingBreakthroughId = null;
  const nextFloor = gate.nextUnlockFrom ?? gate.afterStage + 1;
  progress.highestFloor = Math.max(progress.highestFloor, nextFloor);

  const rankIdx = RANK_ORDER.indexOf(gate.rankId);
  if (rankIdx >= 0) progress.rankIndex = Math.max(progress.rankIndex, rankIdx);

  writeProgress(progress);
  return { ok: true, nextFloor };
}

/** 尝试升段 */
export function tryRankUp(): { ok: boolean; newRank?: RankId } {
  const progress = readProgress();
  const available = getAvailableRankIndex(progress.highestFloor);
  if (progress.rankIndex < available) {
    progress.rankIndex += 1;
    writeProgress(progress);
    return { ok: true, newRank: RANK_ORDER[progress.rankIndex] };
  }
  return { ok: false };
}

/** P3.9：检查目标关卡是否被突破卡点拦截 */
export function getBlockingGateForFloor(targetFloor: number): StageGate | null {
  const progress = readProgress();
  for (const gate of MAIN_STAGE_GATES) {
    const entersNextStage = gate.nextUnlockFrom !== null && targetFloor >= gate.nextUnlockFrom;
    const notCleared = !progress.clearedBreakthroughs.includes(gate.breakthroughId);
    if (entersNextStage && notCleared) return gate;
  }
  return null;
}

/** 更新主线最高层数 */
export function updateHighestFloor(floor: number): void {
  const progress = readProgress();
  if (floor > progress.highestFloor) {
    progress.highestFloor = floor;
    writeProgress(progress);
  }
}

/** 副刀管理解锁：通关第4关后可更换副刀 */
export function canManageSubBlades(): boolean {
  const progress = readProgress();
  return progress.highestFloor >= 4;
}

/** 获取副刀槽位的职责类型（根据装备顺序索引） */
export function getSubBladeSlotType(index: number): 'momentum_sweep' | 'weakpoint_chase' {
  return index === 0 ? 'momentum_sweep' : 'weakpoint_chase';
}

/** 获取槽位的用户友好名称 */
export function getSubBladeSlotLabel(index: number): string {
  return index === 0 ? '蓄势副刀' : '破点副刀';
}

/** 获取槽位的职责描述 */
export function getSubBladeSlotDesc(index: number): string {
  return index === 0 ? '横扫清兵·击杀回势' : '追击高价值·标记破绽';
}

/** 获取装备的刀 */
export function getEquippedBlades(): { main: Blade | null; subs: Blade[] } {
  const progress = readProgress();
  const main = progress.blades.find(b => b.id === progress.equippedMainBladeId) ?? null;
  const subs = progress.equippedSubBladeIds
    .map(id => progress.blades.find(b => b.id === id))
    .filter((b): b is Blade => b !== undefined);
  return { main, subs };
}

/** 装备主刀 */
export function equipMainBlade(bladeId: string | null): void {
  const progress = readProgress();
  progress.equippedMainBladeId = bladeId;
  writeProgress(progress);
}

/** 装备副刀（替换指定槽位） */
export function equipSubBlade(bladeId: string, slotIndex: number): void {
  const progress = readProgress();
  while (progress.equippedSubBladeIds.length <= slotIndex) {
    progress.equippedSubBladeIds.push("");
  }
  progress.equippedSubBladeIds[slotIndex] = bladeId;
  writeProgress(progress);
}

/** 卸下副刀 */
export function unequipSubBlade(slotIndex: number): void {
  const progress = readProgress();
  if (slotIndex < progress.equippedSubBladeIds.length) {
    progress.equippedSubBladeIds[slotIndex] = "";
  }
  writeProgress(progress);
}

export type EquippedBlades = { main: Blade | null; subs: Blade[] };
export const setEquippedMainBlade = equipMainBlade;
export const setEquippedSubBlade = equipSubBlade;
export const removeEquippedSubBlade = unequipSubBlade;

// 经验球类型（按品质聚合的）
export type ExpOrbEntry = { quality: Quality; count: number };

/** 读取经验球库存（按品质聚合） */
export function getExpOrbInventory(): ExpOrbEntry[] {
  const progress = readProgress();
  const map: Partial<Record<Quality, number>> = {};
  for (const b of progress.blades) {
    // exp 字段 >= 100 表示已吃满？这里改用 bladedata 的 exp 字段
    // 经验球独立存储在 expOrbs 字段（不与刀混在一起）
  }
  // 经验球独立存储
  const orbs = (progress as any).expOrbs as Partial<Record<Quality, number>> | undefined;
  if (orbs) {
    for (const q of Object.keys(orbs) as Quality[]) {
      map[q] = (orbs[q] ?? 0);
    }
  }
  return Object.entries(map)
    .filter(([_, c]) => (c ?? 0) > 0)
    .map(([q, c]) => ({ quality: q as Quality, count: c ?? 0 }));
}

/** 经验球+1（合成失败时调用） */
export function addExpOrb(quality: Quality, count: number = 1): void {
  const progress = readProgress();
  const orbs = ((progress as any).expOrbs ?? {}) as Partial<Record<Quality, number>>;
  orbs[quality] = (orbs[quality] ?? 0) + count;
  (progress as any).expOrbs = orbs;
  writeProgress(progress);
}

/** 批量合成：把背包里所有指定品质刀两两配对二合 */
export function batchForgeAll(quality: Quality): { successCount: number; failCount: number; firstSuccessName?: string } | null {
  const progress = readProgress();
  const rule = SYNTHESIS_RULES[quality];
  if (!rule) return null;

  // 收集该品质刀（排除已装备的，避免误吞）
  const equipped = new Set<string>();
  if (progress.equippedMainBladeId) equipped.add(progress.equippedMainBladeId);
  for (const id of progress.equippedSubBladeIds) equipped.add(id);

  const pool = progress.blades.filter((b) => b.quality === quality && !equipped.has(b.id));
  if (pool.length < 2) {
    return { successCount: 0, failCount: 0 };
  }

  let successCount = 0;
  let failCount = 0;
  let firstSuccessName: string | undefined;

  let i = 0;
  while (i + 1 < pool.length) {
    const b1 = pool[i];
    const b2 = pool[i + 1];
    const failCountForQuality = progress.synFailCount[quality] ?? 0;
    const result = synthesizeBlades(b1, b2, failCountForQuality);

    // 消耗2把材料
    progress.blades = progress.blades.filter((b) => b.id !== b1.id && b.id !== b2.id);

    if (result.success && result.resultBlade) {
      progress.blades.push(result.resultBlade);
      successCount++;
      if (!firstSuccessName) firstSuccessName = result.resultBlade.name;
      progress.synFailCount[quality] = 0;
    } else {
      // 失败：给1个原料品质经验球
      addExpOrbToProgress(progress, quality, 1);
      failCount++;
      progress.synFailCount[quality] = result.state.failCount;
    }

    // 从 pool 中移除 b1 b2（重新计算索引）
    pool.splice(0, 2);
    i = 0;
  }

  writeProgress(progress);
  return { successCount, failCount, firstSuccessName };
}

function addExpOrbToProgress(progress: PlayerProgress, quality: Quality, count: number) {
  const orbs = ((progress as any).expOrbs ?? {}) as Partial<Record<Quality, number>>;
  orbs[quality] = (orbs[quality] ?? 0) + count;
  (progress as any).expOrbs = orbs;
}

/** 第一次进入武器背包时确保有默认白刀 + 主刀已装备 + 2把默认副刀 */
export function saveDefaultWhiteBlade(): void {
  const progress = readProgress();
  // 第一次进入时确保有默认绿刀+主刀已装备+2把默认副刀
  let changed = false;
  if (!progress.blades.some(b => b.quality === "green")) {
    const main = generateBlade("green");
    main.name = "常锋";
    progress.blades.push(main);
    if (!progress.equippedMainBladeId) progress.equippedMainBladeId = main.id;
    // 两把默认副刀（绿色）
    if (progress.equippedSubBladeIds.length < 2) {
      const sub1 = createBlade("木短刀", "green");
      const sub2 = createBlade("铁短刀", "green");
      progress.blades.push(sub1, sub2);
      progress.equippedSubBladeIds = [sub1.id, sub2.id];
    }
    changed = true;
  } else if (!progress.equippedMainBladeId) {
    // 有绿刀但没装备，装备第一把
    const firstGreen = progress.blades.find(b => b.quality === "green");
    if (firstGreen) progress.equippedMainBladeId = firstGreen.id;
    changed = true;
  }
  // 确保至少有2把副刀装备（防止旧存档只装备1把）
  const validSubs = progress.equippedSubBladeIds.filter(id =>
    progress.blades.some(b => b.id === id)
  );
  if (validSubs.length < 2) {
    const need = 2 - validSubs.length;
    const namePool = ["木短刀", "铁短刀", "玄铁匕", "短匕"];
    for (let i = 0; i < need; i++) {
      const sub = generateBlade("green");
      sub.name = namePool[validSubs.length + i] ?? "副刀";
      progress.blades.push(sub);
      validSubs.push(sub.id);
    }
    progress.equippedSubBladeIds = validSubs;
    changed = true;
  }
  if (changed) writeProgress(progress);
}

// ═════════════════════════════════════════════════════════════════
// 今日Buff 系统
// ═════════════════════════════════════════════════════════════════
const STORE_KEY_TODAY = "one_blade_today_buffs";

export type OwnedBuff = {
  buffId: string;
  acquiredAt: number;
};

export type DailyBuffState = {
  date: string; // YYYY-MM-DD
  shopPoolIds: string[];   // 6个金币直购
  drawPoolIds: string[];   // 6-7个广告抽奖
  owned: OwnedBuff[];      // 玩家已购入的（最多5个）
  drawCount: number;       // 今日已用广告抽奖次数（每日最多3次）
  lastDrawAt: number;      // 上次抽奖时间（5分钟CD）
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readBuffState(): DailyBuffState {
  try {
    const raw = window.localStorage.getItem(STORE_KEY_TODAY);
    if (raw) {
      const data = JSON.parse(raw) as DailyBuffState;
      if (data.date === todayStr()) return data;
    }
  } catch { /* ignore */ }
  return createNewDailyState();
}

function writeBuffState(state: DailyBuffState) {
  window.localStorage.setItem(STORE_KEY_TODAY, JSON.stringify(state));
}

import { rollTodayShopPool, rollTodayDrawPool, type TodayBuff } from "../config/synthesis";

function createNewDailyState(): DailyBuffState {
  const shop = rollTodayShopPool();
  const draw = rollTodayDrawPool();
  const state: DailyBuffState = {
    date: todayStr(),
    shopPoolIds: shop.map(b => b.id),
    drawPoolIds: draw.map(b => b.id),
    owned: [],
    drawCount: 0,
    lastDrawAt: 0,
  };
  writeBuffState(state);
  return state;
}

export function getTodayBuffState(): DailyBuffState {
  const state = readBuffState();
  if (state.date !== todayStr()) {
    return createNewDailyState();
  }
  return state;
}

export function getBuffById(id: string): TodayBuff | null {
  return TODAY_BUFF_POOL_LOCAL.find(b => b.id === id) ?? null;
}

// 从synthesis导入的常量缓存引用（避免循环依赖）
let TODAY_BUFF_POOL_LOCAL: TodayBuff[] = [];
import { TODAY_BUFF_POOL as _TODAY_BUFF_POOL } from "../config/synthesis";
TODAY_BUFF_POOL_LOCAL = _TODAY_BUFF_POOL;

export function buyBuffFromShop(buffId: string): { ok: boolean; reason?: string; state?: DailyBuffState } {
  const state = getTodayBuffState();
  if (state.owned.length >= 5) return { ok: false, reason: "最多持有5个Buff" };
  if (state.owned.some(b => b.buffId === buffId)) return { ok: false, reason: "已拥有该Buff" };
  const buff = getBuffById(buffId);
  if (!buff) return { ok: false, reason: "Buff不存在" };
  if (!state.shopPoolIds.includes(buffId)) return { ok: false, reason: "该Buff不在今日商店" };
  const progress = readProgress();
  if (progress.coins < buff.price) return { ok: false, reason: "金币不足" };
  progress.coins -= buff.price;
  writeProgress(progress);
  state.owned.push({ buffId, acquiredAt: Date.now() });
  writeBuffState(state);
  return { ok: true, state };
}

export function drawBuffFromDrawPool(buffId: string): { ok: boolean; reason?: string; state?: DailyBuffState; buff?: TodayBuff } {
  const state = getTodayBuffState();
  if (state.drawCount >= 3) return { ok: false, reason: "今日已用完3次抽奖" };
  const now = Date.now();
  if (state.lastDrawAt && now - state.lastDrawAt < 5 * 60 * 1000) {
    return { ok: false, reason: `冷却中，还剩${Math.ceil((5 * 60 * 1000 - (now - state.lastDrawAt)) / 60000)}分钟` };
  }
  if (state.owned.length >= 5) return { ok: false, reason: "Buff已满5个，请先替换" };
  if (state.owned.some(b => b.buffId === buffId)) return { ok: false, reason: "已拥有该Buff" };
  const buff = getBuffById(buffId);
  if (!buff) return { ok: false, reason: "Buff不存在" };
  if (!state.drawPoolIds.includes(buffId)) return { ok: false, reason: "该Buff不在今日奖池" };
  state.drawCount += 1;
  state.lastDrawAt = now;
  state.owned.push({ buffId, acquiredAt: now });
  writeBuffState(state);
  return { ok: true, state, buff };
}

export function replaceBuff(oldBuffId: string, newBuffId: string): { ok: boolean; reason?: string; state?: DailyBuffState } {
  const state = getTodayBuffState();
  if (!state.owned.some(b => b.buffId === oldBuffId)) return { ok: false, reason: "旧Buff不存在" };
  if (state.owned.some(b => b.buffId === newBuffId)) return { ok: false, reason: "已拥有该Buff" };
  if (!state.shopPoolIds.includes(newBuffId) && !state.drawPoolIds.includes(newBuffId)) {
    return { ok: false, reason: "新Buff不在今日池" };
  }
  const newBuff = getBuffById(newBuffId);
  if (!newBuff) return { ok: false, reason: "Buff不存在" };
  const progress = readProgress();
  if (progress.coins < newBuff.price) return { ok: false, reason: "金币不足" };
  progress.coins -= newBuff.price;
  writeProgress(progress);
  state.owned = state.owned.filter(b => b.buffId !== oldBuffId);
  state.owned.push({ buffId: newBuffId, acquiredAt: Date.now() });
  writeBuffState(state);
  return { ok: true, state };
}

/** 获取今日已购Buff的effect汇总（应用时调用） */
export function getActiveBuffEffects(): TodayBuff[] {
  const state = getTodayBuffState();
  return state.owned.map(b => getBuffById(b.buffId)).filter((b): b is TodayBuff => b !== null);
}

// ════════════════════════════════════════════
// Debug 调试函数
// ════════════════════════════════════════════

/** P3.4：强制设置 highestFloor（突破完成阶段归位） */
export function forceSetHighestFloor(floor: number): void {
  const progress = readProgress();
  progress.highestFloor = Math.max(1, floor);
  writeProgress(progress);
}

/** Debug: 设置最高主线层数 */
export function debugSetHighestFloor(floor: number): void {
  const progress = readProgress();
  progress.highestFloor = Math.max(1, floor);
  writeProgress(progress);
}

/** P4.1A.13: Debug原子跳关（清理突破状态） */
export function debugJumpToFloor(floor: number): void {
  const progress = readProgress();
  progress.highestFloor = Math.max(1, floor);
  progress.pendingBreakthroughId = null;
  progress.rankIndex = 0;
  if (floor <= 5) {
    progress.clearedBreakthroughs = [];
  } else {
    progress.clearedBreakthroughs = ["breakthrough_lianqi"];
  }
  writeProgress(progress);
}

/** Debug: 设置段位索引 */
export function debugSetRankIndex(index: number): void {
  const progress = readProgress();
  progress.rankIndex = Math.max(0, index);
  writeProgress(progress);
}

/** P3.2：根据 rankId 直接设置 rankIndex */
export function setRankById(rankId: string): void {
  const progress = readProgress();
  const idx = (RANK_ORDER as string[]).indexOf(rankId);
  if (idx >= 0 && idx > progress.rankIndex) {
    progress.rankIndex = idx;
    writeProgress(progress);
  }
}

/** P3.9：统一 Debug 主线场景设置 */
export function debugSetMainlineScenario(floor: number, completedBreakthroughIds: string[], rankIndex: number): void {
  const progress = readProgress();
  progress.highestFloor = floor;
  progress.clearedBreakthroughs = completedBreakthroughIds.slice();
  progress.rankIndex = rankIndex;
  writeProgress(progress);
}

/** Debug: 清除某突破完成记录 */
export function debugRemoveClearedBreakthrough(id: string): void {
  const progress = readProgress();
  progress.clearedBreakthroughs = progress.clearedBreakthroughs.filter(x => x !== id);
  writeProgress(progress);
}

/** Debug: 标记某突破已完成 */
export function debugAddClearedBreakthrough(id: string): void {
  const progress = readProgress();
  if (!progress.clearedBreakthroughs.includes(id)) {
    progress.clearedBreakthroughs.push(id);
  }
  writeProgress(progress);
}

/** Debug: 重置突破状态 */
export function debugResetBreakthroughs(): void {
  const progress = readProgress();
  progress.clearedBreakthroughs = [];
  progress.rankIndex = 0;
  writeProgress(progress);
}

/** 生成段位Boss关的LevelConfig */
export function getBossLevelConfig(rankId: RankId): LevelConfig {
  const rank = RANK_CONFIG[rankId];
  const bossNames: Record<BossId, string> = { yaoWang: "练气大妖", moXiu: "筑基魔修", huaYao: "灵月圣女" };
  const bossName = rank ? bossNames[rank.bossId] ?? "Boss" : "Boss";
  const rankIdx = RANK_ORDER.indexOf(rankId);
  const hpBonus = rankIdx * 2; // 越往后Boss战时间越长
  return {
    id: 100 + rankIdx,
    title: `${rank?.name ?? "练气"}突破`,
    subtitle: `击败${bossName}，解锁${rank ? QUALITY_META[rank.unlockQuality]?.label ?? "" : ""}品质合成`,
    initialEnergy: 80,
    hp: 3,
    enemySpeed: 1.2,
    pickupChance: 0.05,
    durationSeconds: 60 + hpBonus,
    buffTimes: [],
    // Boss战: 1波士兵热身 + Boss
    waves: [
      {
        name: "Boss护卫",
        delay: 0.2,
        spawnAt: 0.5,
        speedMultiplier: 1.0,
        enemies: [
          { kind: "infantry", x: 60, count: 2 },
          { kind: "infantry", x: 140, count: 2 },
          { kind: "infantry", x: 220, count: 2 },
          { kind: "infantry", x: 300, count: 2 },
        ],
      },
    ],
    bossId: rank?.bossId ?? "yaoWang",
    eliteSpawnAt: 0,
    briefing: {
      highlightEnemies: [{ kind: "boss", label: bossName, icon: "B" }],
      tacticalHint: "蓄满刀势，一击破阵！Boss战不消耗体力以外的资源。",
      initialBladeTier: "满势"
    }
  };
}
