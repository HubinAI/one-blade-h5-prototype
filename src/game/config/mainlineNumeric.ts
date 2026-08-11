/**
 * V0811043R: 主线 GrowthCurve = round(1.05*n² + 8*n + 100), n=floor-1
 * V0811044:  装备 GrowthCurve = round(1.04*n² + 7*n + 100), n=index-1
 * 两套配置互相独立，禁止交叉引用。
 */

// ═══════════════════════════════════════
// 主线
// ═══════════════════════════════════════

export interface GrowthParams { a: number; b: number; c: number; }

export const MAINLINE_GROWTH_CONFIG: GrowthParams = { a: 1.05, b: 8, c: 100 };

export interface MainlineNumericConfig {
  attackStart: number; attackGrowth: number;
  speedMulBase: number; speedMulPerFloor: number; speedMulMax: number;
  densityMulBase: number; densityMulPerFloor: number; densityMulMax: number;
}

export const MAINLINE_NUMERIC_CONFIG: MainlineNumericConfig = {
  attackStart: 10, attackGrowth: 1.008,
  speedMulBase: 0.98, speedMulPerFloor: 0.0021, speedMulMax: 1.35,
  densityMulBase: 1.00, densityMulPerFloor: 0.0025, densityMulMax: 1.45,
};

/** 主线 baseHp = round(a*n² + b*n + c), n=floor-1 */
export function mainlineGrowthCurve(floor: number): number {
  const n = floor - 1;
  const g = MAINLINE_GROWTH_CONFIG;
  return Math.round(g.a * n * n + g.b * n + g.c);
}

// ═══════════════════════════════════════
// 装备（独立）
// ═══════════════════════════════════════

export const BLADE_ATTACK_GROWTH_CONFIG: GrowthParams = { a: 1.04, b: 7, c: 100 };

/** 装备 growthIndex → attack, n=index-1 */
export function bladeGrowthIndexAttack(growthIndex: number): number {
  const n = growthIndex - 1;
  const g = BLADE_ATTACK_GROWTH_CONFIG;
  return Math.round(g.a * n * n + g.b * n + g.c);
}

/** 品质 → growthIndex 区间 */
export const QUALITY_INDEX_RANGE: Record<string, [number, number]> = {
  green:   [1, 5],
  blue:    [6, 15],
  purple:  [16, 30],
  orange:  [31, 50],
  red:     [51, 75],
  gold:    [76, 105],
  pink:    [106, 140],
  rainbow: [141, 180],
};

/** Lv1~40 线性映射到品质区间内 growthIndex */
export function bladeLevelToGrowthIndex(quality: string, level: number): number {
  const range = QUALITY_INDEX_RANGE[quality] ?? [1, 5];
  const t = (level - 1) / 39; // 0..1
  return Math.round(range[0] + t * (range[1] - range[0]));
}

export function getBladeAttack(quality: string, level: number): number {
  return bladeGrowthIndexAttack(bladeLevelToGrowthIndex(quality, level));
}

// ═══════════════════════════════════════
// 通用
// ═══════════════════════════════════════

export const ENEMY_TYPE_HP_MULTIPLIER: Record<string, number> = {
  infantry: 0.75, powder: 0.80, tractor: 0.85, splitter: 0.90,
  core: 0.95, shield: 1.20,
  elite_fireRing: 35, elite_aura: 40, elite_heal: 45,
};

/** V0811057: 统一精英HP = baseHp × multiplier */
export function eliteMaxHp(floor: number, eliteKind: string): number {
  const mul = ENEMY_TYPE_HP_MULTIPLIER[`elite_${eliteKind}`] ?? 8;
  return Math.round(mainlineGrowthCurve(floor) * mul);
}

export function getBaseHp(floor: number): number { return mainlineGrowthCurve(floor); }

export function getBaseAttack(floor: number): number {
  return Math.round(MAINLINE_NUMERIC_CONFIG.attackStart * Math.pow(MAINLINE_NUMERIC_CONFIG.attackGrowth, floor - 1));
}

export function getSpeedMultiplier(floor: number): number {
  const c = MAINLINE_NUMERIC_CONFIG;
  return Math.min(c.speedMulMax, c.speedMulBase + (floor - 1) * c.speedMulPerFloor);
}

export function getDensityMultiplier(floor: number): number {
  const c = MAINLINE_NUMERIC_CONFIG;
  return Math.min(c.densityMulMax, c.densityMulBase + (floor - 1) * c.densityMulPerFloor);
}

export function getEnemyFinalHp(floor: number, enemyType: string, nodeHpMul: number): number {
  return Math.round(mainlineGrowthCurve(floor) * (ENEMY_TYPE_HP_MULTIPLIER[enemyType] ?? 1.0) * nodeHpMul);
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

// V0811042: 军令节奏模板
export function postEdictTotal(floor: number): number {
  return Math.round(90 * getDensityMultiplier(floor));
}
export const PHASE_SPLIT = { P1: 24, P2: 30, P3: 36 } as const;
export function phaseEnemyCount(floor: number, phase: 'P1' | 'P2' | 'P3'): number {
  const sum = 90; return Math.round(postEdictTotal(floor) * PHASE_SPLIT[phase] / sum);
}
export function edictTriggerKills(floor: number): number {
  return Math.round(postEdictTotal(floor) * 0.55);
}
export function phaseSpeedMul(floor: number, phase: 'P1' | 'P2' | 'P3'): number {
  const bases = { P1: 1.00, P2: 1.25, P3: 1.45 };
  return bases[phase] * getSpeedMultiplier(floor);
}
export function genericEliteHp(floor: number): number {
  return mainlineGrowthCurve(floor) * 8;
}
