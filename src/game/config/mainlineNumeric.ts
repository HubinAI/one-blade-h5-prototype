/**
 * V0811039: 主线1~180关数值公式化配置
 * 公式参数集中管理，不逐关手写
 */
export interface MainlineNumericConfig {
  baseHpStart: number;
  hpGrowth: number;
  baseAttackStart: number;
  attackGrowth: number;
  speedMulBase: number;
  speedMulPerFloor: number;
  speedMulMax: number;
  densityMulBase: number;
  densityMulPerFloor: number;
  densityMulMax: number;
}

export const MAINLINE_NUMERIC_CONFIG: MainlineNumericConfig = {
  baseHpStart: 100,
  hpGrowth: 1.015,
  baseAttackStart: 10,
  attackGrowth: 1.008,
  speedMulBase: 0.98,
  speedMulPerFloor: 0.0021,
  speedMulMax: 1.35,
  densityMulBase: 1.00,
  densityMulPerFloor: 0.0025,
  densityMulMax: 1.45,
};

// ── 乘数表 ──
export const ENEMY_TYPE_HP_MULTIPLIER: Record<string, number> = {
  infantry: 0.75,
  powder:   0.80,
  tractor:  0.85,
  splitter: 0.90,
  core:     0.95,
  shield:   1.20,
};

// ── 公式函数 ──
const C = MAINLINE_NUMERIC_CONFIG;

export function getBaseHp(floor: number): number {
  return Math.round(C.baseHpStart * Math.pow(C.hpGrowth, floor - 1));
}

export function getBaseAttack(floor: number): number {
  return Math.round(C.baseAttackStart * Math.pow(C.attackGrowth, floor - 1));
}

export function getSpeedMultiplier(floor: number): number {
  return Math.min(C.speedMulMax, C.speedMulBase + (floor - 1) * C.speedMulPerFloor);
}

export function getDensityMultiplier(floor: number): number {
  return Math.min(C.densityMulMax, C.densityMulBase + (floor - 1) * C.densityMulPerFloor);
}

export function getEnemyFinalHp(floor: number, enemyType: string, nodeHpMul: number): number {
  const base = getBaseHp(floor);
  const typeMul = ENEMY_TYPE_HP_MULTIPLIER[enemyType] ?? 1.0;
  return Math.round(base * typeMul * nodeHpMul);
}

// ── 境界区间 ──
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
