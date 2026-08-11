/**
 * V0811043: 主线数值配置 + GrowthCurve 二次曲线
 * 唯一源：主线BaseHP / 品质攻击锚点 / 速度 / 密度
 */
export interface MainlineNumericConfig {
  growthA: number; growthB: number; growthC: number;
  baseAttackStart: number; attackGrowth: number;
  speedMulBase: number; speedMulPerFloor: number; speedMulMax: number;
  densityMulBase: number; densityMulPerFloor: number; densityMulMax: number;
}

export const MAINLINE_NUMERIC_CONFIG: MainlineNumericConfig = {
  growthA: 0.4, growthB: 4, growthC: 10,
  baseAttackStart: 10, attackGrowth: 1.008,
  speedMulBase: 0.98, speedMulPerFloor: 0.0021, speedMulMax: 1.35,
  densityMulBase: 1.00, densityMulPerFloor: 0.0025, densityMulMax: 1.45,
};

const Cfg = MAINLINE_NUMERIC_CONFIG;

/** GrowthCurve = round(a*n² + b*n + c), n = floor-1 */
export function growthCurve(floor: number): number {
  const n = floor - 1;
  return Math.round(Cfg.growthA * n * n + Cfg.growthB * n + Cfg.growthC);
}

/** 品质攻击锚点 — 品质对应基准关卡 */
export const QUALITY_ATTACK_ANCHOR_FLOOR: Record<string, number> = {
  green: 5, blue: 15, purple: 30, orange: 50, red: 75,
  gold: 105, pink: 140, rainbow: 180,
};

export function getQualityBaseAttack(quality: string): number {
  return growthCurve(QUALITY_ATTACK_ANCHOR_FLOOR[quality] ?? 1);
}

// 乘数表
export const ENEMY_TYPE_HP_MULTIPLIER: Record<string, number> = {
  infantry: 0.75, powder: 0.80, tractor: 0.85, splitter: 0.90,
  core: 0.95, shield: 1.20,
};

// 公式
export function getBaseHp(floor: number): number { return growthCurve(floor); }

export function getBaseAttack(floor: number): number {
  return Math.round(Cfg.baseAttackStart * Math.pow(Cfg.attackGrowth, floor - 1));
}

export function getSpeedMultiplier(floor: number): number {
  return Math.min(Cfg.speedMulMax, Cfg.speedMulBase + (floor - 1) * Cfg.speedMulPerFloor);
}

export function getDensityMultiplier(floor: number): number {
  return Math.min(Cfg.densityMulMax, Cfg.densityMulBase + (floor - 1) * Cfg.densityMulPerFloor);
}

export function getEnemyFinalHp(floor: number, enemyType: string, nodeHpMul: number): number {
  return Math.round(growthCurve(floor) * (ENEMY_TYPE_HP_MULTIPLIER[enemyType] ?? 1.0) * nodeHpMul);
}

// 境界区间
export const REALM_ZONES = [
  { name: "未入境", start: 1, end: 5 },
  { name: "练气",   start: 6, end: 15 },
  { name: "筑基",   start: 16, end: 30 },
  { name: "结丹",   start: 31, end: 50 },
  { name: "元婴",   start: 51, end: 75 },
  { name: "化神",   start: 76, end: 105 },
  { name: "大乘",   start: 106, end: 140 },
  { name: "渡劫",   start: 141, end: 180 },
];

// ═══════════════════════════════════════
// V0811042: 军令节奏模板
// ═══════════════════════════════════════

/** 军令后总敌数 = round(90 × densityMul(floor)) */
export function postEdictTotal(floor: number): number {
  return Math.round(90 * getDensityMultiplier(floor));
}

/** P1/P2/P3 拆分比例 */
export const PHASE_SPLIT = { P1: 24, P2: 30, P3: 36 } as const;

export function phaseEnemyCount(floor: number, phase: 'P1' | 'P2' | 'P3'): number {
  const total = postEdictTotal(floor);
  const sum = PHASE_SPLIT.P1 + PHASE_SPLIT.P2 + PHASE_SPLIT.P3;
  return Math.round(total * PHASE_SPLIT[phase] / sum);
}

/** 军令触发阈值 = round(当前关postEdictTotal × 0.55) */
export function edictTriggerKills(floor: number): number {
  return Math.round(postEdictTotal(floor) * 0.55);
}

/** 阶段速度 = base × speedMul(floor), base=[1.00,1.25,1.45] */
export function phaseSpeedMul(floor: number, phase: 'P1' | 'P2' | 'P3'): number {
  const bases = { P1: 1.00, P2: 1.25, P3: 1.45 };
  return bases[phase] * getSpeedMultiplier(floor);
}

/** generic elite hp = growthCurve(floor) × 8 */
export function genericEliteHp(floor: number): number {
  return growthCurve(floor) * 8;
}
