/**
 * V0812017: Encounter Preset 职责拆分 — 每层只控制自己的维度
 *
 * Formation  → 空间 (spawn x zones, column style, mirror)
 * Rhythm     → 时间 (wave weight distribution, gap, pulse)
 * Mode       → 结构 (base/special ratio, type bias)
 * Environment → 轻量修正 (一个独立效果)
 *
 * 删除旧的 countMul / speedMul 等跨层重叠字段。
 */

// ══════════════════ FORMATION: 只管空间 ══════════════════
export interface FormationPreset {
  id: string;
  /** spawn x 区域跨度 [minOffset, maxOffset] 相对DESIGN_WIDTH */
  spawnZone: [number, number];
  /** 列形态: line(横排) / v(三角) / scatter(分散) */
  columnStyle: 'line' | 'v' | 'scatter';
  /** 左右镜像分布 */
  mirror: boolean;
}

export const FORMATIONS: Record<string, FormationPreset> = {
  WIDE:    { id: "WIDE",    spawnZone: [28, 340], columnStyle: "line",    mirror: true },
  CENTER:  { id: "CENTER",  spawnZone: [100, 240], columnStyle: "v",      mirror: true },
  WINGS:   { id: "WINGS",   spawnZone: [28, 340], columnStyle: "scatter", mirror: false },
  COLUMN:  { id: "COLUMN",  spawnZone: [120, 220], columnStyle: "line",   mirror: false },
  STAGGER: { id: "STAGGER", spawnZone: [40, 300], columnStyle: "v",       mirror: true },
  WALL:    { id: "WALL",    spawnZone: [20, 350], columnStyle: "line",    mirror: true },
};

// ══════════════════ RHYTHM: 只管时间 ══════════════════
export interface RhythmPreset {
  id: string;
  /** 6波Quota分布权重 (总和归一化) */
  waveWeights: number[];
  /** 波间隔倍率 (1.0=默认4.5s间隔) */
  waveGapMul: number;
  /** pulse 节拍 (PULSE=批次, FRONT=前半, BACK=后半, ALTERNATE=交替) */
  style: 'steady' | 'pulse' | 'front' | 'back' | 'alternate';
}

export const RHYTHMS: Record<string, RhythmPreset> = {
  STEADY:    { id: "STEADY",    waveWeights: [0.18, 0.18, 0.17, 0.16, 0.16, 0.15], waveGapMul: 1.0,  style: "steady" },
  PULSE:     { id: "PULSE",     waveWeights: [0.28, 0.12, 0.25, 0.10, 0.18, 0.07], waveGapMul: 0.85, style: "pulse" },
  FRONT:     { id: "FRONT",     waveWeights: [0.26, 0.23, 0.19, 0.14, 0.10, 0.08], waveGapMul: 0.9,  style: "front" },
  BACK:      { id: "BACK",      waveWeights: [0.08, 0.12, 0.15, 0.18, 0.22, 0.25], waveGapMul: 1.1,  style: "back" },
  ALTERNATE: { id: "ALTERNATE", waveWeights: [0.24, 0.10, 0.22, 0.10, 0.24, 0.10], waveGapMul: 1.0,  style: "alternate" },
};

// ══════════════════ MODE: 只管结构 ══════════════════
export interface ModePreset {
  id: string;
  /** base/primary比例偏移: >1=更多base怪, <1=更多特殊怪 */
  baseBias: number;
  /** HARD/TIMING_THREAT类倾向: >1=优先盾/冲锋 */
  hardBias: number;
  /** MOVEMENT类倾向: >1=优先游袭/牵引 */
  movementBias: number;
}

export const MODES: Record<string, ModePreset> = {
  STANDARD: { id: "STANDARD", baseBias: 1.0,  hardBias: 1.0,  movementBias: 1.0 },
  SWARM:    { id: "SWARM",    baseBias: 1.25, hardBias: 0.8,  movementBias: 0.8 },
  BREACH:   { id: "BREACH",   baseBias: 0.7,  hardBias: 1.3,  movementBias: 0.9 },
  RUSH:     { id: "RUSH",     baseBias: 0.9,  hardBias: 1.1,  movementBias: 1.0 },
  FLANK:    { id: "FLANK",    baseBias: 1.0,  hardBias: 0.8,  movementBias: 1.25 },
};

// ══════════════════ ENVIRONMENT: 一个轻量效果 ══════════════════
export interface EnvironmentPreset {
  id: string;
  effect: 'none' | 'tide' | 'gale' | 'heavy' | 'gather';
  magnitude: number;
}

export const ENVIRONMENTS: Record<string, EnvironmentPreset> = {
  NONE:   { id: "NONE",   effect: "none",   magnitude: 0 },
  TIDE:   { id: "TIDE",   effect: "tide",   magnitude: 1.0 },
  GALE:   { id: "GALE",   effect: "gale",   magnitude: 0.10 },
  HEAVY:  { id: "HEAVY",  effect: "heavy",  magnitude: 1.3 },
  GATHER: { id: "GATHER", effect: "gather", magnitude: 0.6 },
};

// ══════════════════ 统一查询 ══════════════════

export function getFormation(id: string): FormationPreset | undefined { return FORMATIONS[id]; }
export function getRhythm(id: string): RhythmPreset | undefined { return RHYTHMS[id]; }
export function getMode(id: string): ModePreset | undefined { return MODES[id]; }
export function getEnvironment(id: string): EnvironmentPreset | undefined { return ENVIRONMENTS[id]; }

/** @deprecated 旧EncounterPreset接口仅legacy兼容 */
export function getEncounterPreset(_category: string, _id: string): any {
  return undefined;
}
