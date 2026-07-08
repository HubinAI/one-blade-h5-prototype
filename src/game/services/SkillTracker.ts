import type { SkillDimension, SkillMilestone, SkillScores, TacticalRoute } from "../types";
import { ROUTE_NAMES } from "../config/buffs";

const STORAGE_KEY = "one_blade_v07_skill_tracker";

type SkillHistory = {
  scores: SkillScores;
  route: TacticalRoute | null;
  levelId: number;
  timestamp: number;
};

type SkillTrackerData = {
  history: SkillHistory[];
  milestones: Record<string, number>;
};

function defaultData(): SkillTrackerData {
  return { history: [], milestones: {} };
}

function loadData(): SkillTrackerData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : defaultData();
  } catch {
    return defaultData();
  }
}

function saveData(data: SkillTrackerData) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* no-op */ }
}

/** 从战斗原始数据计算四维技能分 */
export function calculateSkillScores(input: {
  highBladeSlashCount: number;
  totalSlashEnergy: number;
  slashCount: number;
  kills: number;
  maxSingleBlade: number;
  sharpTurnCount: number;
  coreCollapses: number;
  chainKillTotal: number;
  explosions: number;
  defenseLineHits: number;
  remainingHp: number;
  maxHp: number;
  pickups: number;
  pickupsSpawned: number;
}): SkillScores {
  // 势（蓄势）：高刀势挥刀占比 + 平均挥刀能量
  const avgEnergy = input.slashCount > 0 ? input.totalSlashEnergy / input.slashCount : 0;
  const highBladeRatio = input.slashCount > 0 ? input.highBladeSlashCount / input.slashCount : 0;
  const momentum = clampScore(avgEnergy * 0.6 + highBladeRatio * 45 + (input.maxSingleBlade >= 8 ? 15 : 0));

  // 斩（精准）：每刀击杀效率 + 急转弯惩罚
  const killPerSlash = input.slashCount > 0 ? input.kills / input.slashCount : 0;
  const turnPenalty = input.sharpTurnCount * 3;
  const precision = clampScore(killPerSlash * 12 - turnPenalty + (input.maxSingleBlade >= 4 ? 10 : 0));

  // 破（破阵）：连锁击杀 + 阵眼崩塌 + 爆炸连锁
  const shatter = clampScore(
    input.chainKillTotal * 4 +
    input.coreCollapses * 18 +
    input.explosions * 8 +
    (input.coreCollapses >= 3 ? 15 : 0)
  );

  // 守（御守）：防线保护
  const hpRatio = input.remainingHp / Math.max(1, input.maxHp);
  const pickupRate = input.pickupsSpawned > 0 ? input.pickups / input.pickupsSpawned : 1;
  const guard = clampScore(
    hpRatio * 50 +
    (input.defenseLineHits === 0 ? 25 : 0) +
    pickupRate * 15 +
    (input.defenseLineHits <= 1 ? 10 : 0)
  );

  return { momentum, precision, shatter, guard };
}

function clampScore(raw: number): number {
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** 持久化本局技能分 */
export function recordSkillScores(scores: SkillScores, route: TacticalRoute | null, levelId: number) {
  const data = loadData();
  data.history.push({ scores, route, levelId, timestamp: Date.now() });
  // 只保留最近50局
  if (data.history.length > 50) data.history = data.history.slice(-50);
  saveData(data);
}

/** 获取历史最高分 */
export function getHistoricalBest(): SkillScores {
  const data = loadData();
  if (data.history.length === 0) return { momentum: 0, precision: 0, shatter: 0, guard: 0 };
  const best: SkillScores = { momentum: 0, precision: 0, shatter: 0, guard: 0 };
  for (const entry of data.history) {
    best.momentum = Math.max(best.momentum, entry.scores.momentum);
    best.precision = Math.max(best.precision, entry.scores.precision);
    best.shatter = Math.max(best.shatter, entry.scores.shatter);
    best.guard = Math.max(best.guard, entry.scores.guard);
  }
  return best;
}

/** 获取上一局分数（用于对比） */
export function getLastScores(): SkillScores | null {
  const data = loadData();
  if (data.history.length === 0) return null;
  return data.history[data.history.length - 1].scores;
}

/** 获取路线归因统计 */
export function getRouteStats(): Record<TacticalRoute, { count: number; avgShatter: number }> {
  const data = loadData();
  const stats: Record<TacticalRoute, { count: number; avgShatter: number }> = {
    scorch: { count: 0, avgShatter: 0 },
    pierce: { count: 0, avgShatter: 0 },
    ironWall: { count: 0, avgShatter: 0 }
  };
  for (const entry of data.history) {
    if (entry.route) {
      stats[entry.route].count += 1;
      stats[entry.route].avgShatter += entry.scores.shatter;
    }
  }
  for (const route of Object.keys(stats) as TacticalRoute[]) {
    if (stats[route].count > 0) stats[route].avgShatter /= stats[route].count;
  }
  return stats;
}

/** 检查里程碑达成 */
export function checkMilestones(scores: SkillScores, data: {
  consecutiveMomentum70: number;
  defenseLineHits: number;
  coreCollapses: number;
}): SkillMilestone[] {
  const stored = loadData();
  const milestones: SkillMilestone[] = [];

  // 蓄势大师：连续3局势>70
  const momentum70Count = stored.milestones["momentum70"] ?? 0;
  const newMomentumCount = scores.momentum > 70 ? momentum70Count + 1 : 0;
  stored.milestones["momentum70"] = newMomentumCount;
  milestones.push({
    id: "momentum_master",
    dimension: "momentum",
    title: "蓄势大师",
    achieved: newMomentumCount >= 3,
    progress: newMomentumCount,
    target: 3
  });

  // 精准刀客：单局斩>90
  milestones.push({
    id: "precision_blade",
    dimension: "precision",
    title: "精准刀客",
    achieved: scores.precision > 90,
    progress: scores.precision,
    target: 90
  });

  // 破阵宗师：单局阵眼崩塌>=3
  milestones.push({
    id: "shatter_master",
    dimension: "shatter",
    title: "破阵宗师",
    achieved: data.coreCollapses >= 3,
    progress: data.coreCollapses,
    target: 3
  });

  // 铁壁将军：单局0触线
  milestones.push({
    id: "iron_general",
    dimension: "guard",
    title: "铁壁将军",
    achieved: data.defenseLineHits === 0,
    progress: data.defenseLineHits === 0 ? 1 : 0,
    target: 1
  });

  saveData(stored);
  return milestones;
}

/** 获取首页迷你雷达数据 */
export function getMiniRadarData(): { scores: SkillScores; best: SkillScores; mainRoute: TacticalRoute | null } {
  const last = getLastScores();
  const best = getHistoricalBest();
  const data = loadData();
  const lastEntry = data.history.length > 0 ? data.history[data.history.length - 1] : null;
  return {
    scores: last ?? { momentum: 0, precision: 0, shatter: 0, guard: 0 },
    best,
    mainRoute: lastEntry?.route ?? null
  };
}

export function getRouteName(route: TacticalRoute | null): string {
  if (!route) return "—";
  return ROUTE_NAMES[route];
}
