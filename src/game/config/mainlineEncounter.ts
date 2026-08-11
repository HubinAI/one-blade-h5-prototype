/**
 * V0811060: Encounter Preset 配置层
 * 纯参数描述，不修改任何游戏逻辑
 */

export interface EncounterPreset {
  id: string;
  countMul: number;
  speedMul: number;
  specialRatioMul: number;
  spawnArea: number[];
  spacing: number;
  waveTiming: number;
  formationWeight: Record<string, number>;
}

// ══════════════════ FORMATION ══════════════════

export const FORMATIONS: Record<string, EncounterPreset> = {
  WIDE: {
    id: "WIDE", countMul: 1.2, speedMul: 0.9, specialRatioMul: 1.0,
    spawnArea: [80, 120], spacing: 28, waveTiming: 1.0,
    formationWeight: { line: 0.7, v: 0.2, scatter: 0.1 },
  },
  CENTER: {
    id: "CENTER", countMul: 0.8, speedMul: 1.1, specialRatioMul: 1.0,
    spawnArea: [45, 75], spacing: 18, waveTiming: 1.0,
    formationWeight: { line: 0.5, v: 0.3, scatter: 0.2 },
  },
  WINGS: {
    id: "WINGS", countMul: 1.0, speedMul: 1.0, specialRatioMul: 1.0,
    spawnArea: [30, 60], spacing: 22, waveTiming: 1.0,
    formationWeight: { line: 0.3, v: 0.5, scatter: 0.2 },
  },
  COLUMN: {
    id: "COLUMN", countMul: 0.6, speedMul: 1.3, specialRatioMul: 1.0,
    spawnArea: [30, 50], spacing: 14, waveTiming: 1.0,
    formationWeight: { line: 0.8, v: 0.1, scatter: 0.1 },
  },
  STAGGER: {
    id: "STAGGER", countMul: 1.1, speedMul: 0.95, specialRatioMul: 1.0,
    spawnArea: [60, 100], spacing: 24, waveTiming: 1.0,
    formationWeight: { line: 0.4, v: 0.3, scatter: 0.3 },
  },
  WALL: {
    id: "WALL", countMul: 1.5, speedMul: 0.7, specialRatioMul: 1.0,
    spawnArea: [90, 140], spacing: 32, waveTiming: 1.0,
    formationWeight: { line: 0.9, v: 0.05, scatter: 0.05 },
  },
};

// ══════════════════ RHYTHM ══════════════════

export const RHYTHMS: Record<string, EncounterPreset> = {
  STEADY: {
    id: "STEADY", countMul: 1.0, speedMul: 1.0, specialRatioMul: 1.0,
    spawnArea: [60, 100], spacing: 20, waveTiming: 1.0,
    formationWeight: { line: 0.5, v: 0.3, scatter: 0.2 },
  },
  PULSE: {
    id: "PULSE", countMul: 0.7, speedMul: 1.2, specialRatioMul: 1.0,
    spawnArea: [50, 80], spacing: 16, waveTiming: 0.7,
    formationWeight: { line: 0.3, v: 0.4, scatter: 0.3 },
  },
  FRONT: {
    id: "FRONT", countMul: 0.9, speedMul: 0.8, specialRatioMul: 1.0,
    spawnArea: [70, 110], spacing: 24, waveTiming: 1.2,
    formationWeight: { line: 0.7, v: 0.2, scatter: 0.1 },
  },
  BACK: {
    id: "BACK", countMul: 1.1, speedMul: 0.9, specialRatioMul: 1.0,
    spawnArea: [40, 70], spacing: 20, waveTiming: 1.1,
    formationWeight: { line: 0.4, v: 0.4, scatter: 0.2 },
  },
  ALTERNATE: {
    id: "ALTERNATE", countMul: 1.0, speedMul: 1.0, specialRatioMul: 1.0,
    spawnArea: [50, 90], spacing: 20, waveTiming: 0.9,
    formationWeight: { line: 0.3, v: 0.3, scatter: 0.4 },
  },
};

// ══════════════════ MODE ══════════════════

export const MODES: Record<string, EncounterPreset> = {
  STANDARD: {
    id: "STANDARD", countMul: 1.0, speedMul: 1.0, specialRatioMul: 1.0,
    spawnArea: [60, 100], spacing: 20, waveTiming: 1.0,
    formationWeight: { line: 0.5, v: 0.3, scatter: 0.2 },
  },
  SWARM: {
    id: "SWARM", countMul: 1.6, speedMul: 0.85, specialRatioMul: 1.0,
    spawnArea: [80, 130], spacing: 12, waveTiming: 0.8,
    formationWeight: { line: 0.4, v: 0.2, scatter: 0.4 },
  },
  BREACH: {
    id: "BREACH", countMul: 0.7, speedMul: 1.4, specialRatioMul: 1.0,
    spawnArea: [30, 55], spacing: 10, waveTiming: 0.6,
    formationWeight: { line: 0.2, v: 0.6, scatter: 0.2 },
  },
  RUSH: {
    id: "RUSH", countMul: 1.2, speedMul: 1.25, specialRatioMul: 1.0,
    spawnArea: [50, 80], spacing: 14, waveTiming: 0.7,
    formationWeight: { line: 0.3, v: 0.5, scatter: 0.2 },
  },
  FLANK: {
    id: "FLANK", countMul: 0.9, speedMul: 1.1, specialRatioMul: 1.0,
    spawnArea: [25, 50], spacing: 18, waveTiming: 0.9,
    formationWeight: { line: 0.2, v: 0.4, scatter: 0.4 },
  },
};

// ══════════════════ ENV ══════════════════

export const ENVS: Record<string, EncounterPreset> = {
  NONE: {
    id: "NONE", countMul: 1.0, speedMul: 1.0, specialRatioMul: 1.0,
    spawnArea: [60, 100], spacing: 20, waveTiming: 1.0,
    formationWeight: { line: 0.5, v: 0.3, scatter: 0.2 },
  },
  TIDE: {
    id: "TIDE", countMul: 1.15, speedMul: 1.05, specialRatioMul: 1.0,
    spawnArea: [70, 110], spacing: 18, waveTiming: 0.9,
    formationWeight: { line: 0.6, v: 0.2, scatter: 0.2 },
  },
  GALE: {
    id: "GALE", countMul: 0.85, speedMul: 1.3, specialRatioMul: 1.0,
    spawnArea: [40, 70], spacing: 22, waveTiming: 0.7,
    formationWeight: { line: 0.3, v: 0.5, scatter: 0.2 },
  },
  HEAVY: {
    id: "HEAVY", countMul: 1.3, speedMul: 0.75, specialRatioMul: 1.0,
    spawnArea: [80, 130], spacing: 28, waveTiming: 1.2,
    formationWeight: { line: 0.7, v: 0.1, scatter: 0.2 },
  },
  GATHER: {
    id: "GATHER", countMul: 1.05, speedMul: 0.95, specialRatioMul: 1.0,
    spawnArea: [50, 80], spacing: 16, waveTiming: 1.0,
    formationWeight: { line: 0.4, v: 0.3, scatter: 0.3 },
  },
};

/** 统一查询 */
export function getEncounterPreset(category: string, id: string): EncounterPreset | undefined {
  const maps: Record<string, Record<string, EncounterPreset>> = { FORMATION: FORMATIONS, RHYTHM: RHYTHMS, MODE: MODES, ENV: ENVS };
  return maps[category]?.[id];
}
