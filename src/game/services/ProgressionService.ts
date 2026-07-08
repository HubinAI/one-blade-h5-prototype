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
import type { BattleResult, EnemyKind, RatingGrade, RunProgress, RunRewards } from "../types";
import { logEvent } from "./Analytics";

const STORAGE_KEY = "one_blade_v04_progression";

export type RunMode = "normal" | "dailyChallenge" | "highYield";
type DailyTaskId = (typeof DAILY_TASK_CONFIG)[number]["id"];

type DailyTaskProgress = {
  progress: number;
  claimed: boolean;
};

type DailyState = {
  date: string;
  firstWinClaimed: boolean;
  challengeCompleted: boolean;
  tasks: Record<DailyTaskId, DailyTaskProgress>;
};

export type PlayerProgress = {
  runIndex: number;
  coins: number;
  stamina: number;
  lastStaminaAt: number;
  lastSeenAt: number;
  offlineCoins: number;
  chestProgress: number;
  chestOpened: number;
  oneBladeChallenge: number;
  fragments: Record<string, number>;
  upgrades: Record<UpgradeId, number>;
  codex: EnemyKind[];
  rewardedStreak: number;
  lastInterstitialRun: number;
  lastInterstitialAt: number;
  currentRunMode: RunMode;
  daily: DailyState;
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
  dailyChallengeName: string;
  dailyChallengeDescription: string;
  offlineCoins: number;
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
    tasks: createTaskState()
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
    offlineCoins: 0,
    chestProgress: 0,
    chestOpened: 0,
    oneBladeChallenge: 0,
    fragments: createFragments(),
    upgrades: createUpgrades(),
    codex: ["infantry"],
    rewardedStreak: 0,
    lastInterstitialRun: 0,
    lastInterstitialAt: 0,
    currentRunMode: "normal",
    daily: createDailyState()
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
  return progress;
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

function writeProgress(progress: PlayerProgress) {
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

export function spendStamina(amount = REWARD_CONFIG.stamina.challengeCost, reason = "high_yield_challenge") {
  const progress = readProgress();
  if (progress.stamina < amount) return false;
  progress.stamina -= amount;
  progress.lastStaminaAt = Date.now();
  writeProgress(progress);
  logEvent("stamina_spend", { amount, reason, staminaLeft: progress.stamina });
  return true;
}

export function restoreStaminaByAd(reason = "stamina_restore") {
  const progress = readProgress();
  progress.stamina = Math.min(REWARD_CONFIG.stamina.max, progress.stamina + REWARD_CONFIG.stamina.adRestore);
  markRewardedWatched(progress, reason);
  autoClaimDailyTasks(progress, REWARD_CONFIG.shards.firstName);
  writeProgress(progress);
  logEvent("stamina_ad_restore", {
    amount: REWARD_CONFIG.stamina.adRestore,
    stamina: progress.stamina
  });
  return getHomeSnapshot();
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
    dailyChallengeName: challenge.name,
    dailyChallengeDescription: challenge.description,
    offlineCoins: progress.offlineCoins,
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
