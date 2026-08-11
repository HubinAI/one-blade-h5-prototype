/**
 * V0811046: 1~180挂机产出全量配置
 * 独立于主线/装备/首通, 仅挂机系统读取
 */

export interface IdleStage {
  floorStart: number; floorEnd: number;
  quality: string;
  rateStart: number; rateEnd: number;
}

export const IDLE_STAGE_CONFIG: IdleStage[] = [
  { floorStart: 2,  floorEnd: 5,   quality: "white",  rateStart: 2.0, rateEnd: 2.4 },
  { floorStart: 6,  floorEnd: 15,  quality: "white",  rateStart: 2.4, rateEnd: 3.0 },
  { floorStart: 16, floorEnd: 30,  quality: "white",  rateStart: 3.0, rateEnd: 4.0 },
  { floorStart: 31, floorEnd: 50,  quality: "green",  rateStart: 2.0, rateEnd: 3.0 },
  { floorStart: 51, floorEnd: 75,  quality: "blue",   rateStart: 1.8, rateEnd: 2.8 },
  { floorStart: 76, floorEnd: 105, quality: "purple", rateStart: 1.6, rateEnd: 2.6 },
  { floorStart: 106,floorEnd: 140, quality: "orange", rateStart: 1.4, rateEnd: 2.4 },
  { floorStart: 141,floorEnd: 180, quality: "red",    rateStart: 1.2, rateEnd: 2.2 },
];

export const IDLE_CONFIG_COMMON = {
  capHours: 24,
  fastIdleMinutes: 120,
  fastIdleLimit: 4,
  fastIdleEnabled: false,
};

export function getIdleStage(floor: number): IdleStage {
  const s = IDLE_STAGE_CONFIG.find(s => floor >= s.floorStart && floor <= s.floorEnd);
  if (s) return s;
  if (floor < 2) return IDLE_STAGE_CONFIG[0]; // 未解锁
  return IDLE_STAGE_CONFIG[IDLE_STAGE_CONFIG.length - 1]; // F180+
}

export function getIdleRatePerHour(floor: number): number {
  if (floor < 2) return 0;
  const s = getIdleStage(floor);
  const range = s.floorEnd - s.floorStart || 1;
  const t = (floor - s.floorStart) / range;
  return Math.round((s.rateStart + t * (s.rateEnd - s.rateStart)) * 100) / 100;
}

export function getIdleQuality(floor: number): string {
  if (floor < 2) return "white";
  return getIdleStage(floor).quality;
}

// ═══════════════════════════════════════
// V0811049: 品质概率池
// ═══════════════════════════════════════

export interface QualityPoolEntry { quality: string; weight: number; }

export const IDLE_QUALITY_POOLS: { floorStart: number; floorEnd: number; pools: QualityPoolEntry[] }[] = [
  { floorStart: 2,  floorEnd: 30,  pools: [{ quality:"white", weight:100 }] },
  { floorStart: 31, floorEnd: 50,  pools: [{ quality:"white", weight:70 }, { quality:"green", weight:30 }] },
  { floorStart: 51, floorEnd: 75,  pools: [{ quality:"green",weight:80 }, { quality:"blue",  weight:20 }] },
  { floorStart: 76, floorEnd: 105, pools: [{ quality:"blue", weight:85 }, { quality:"purple",weight:15 }] },
  { floorStart: 106,floorEnd: 140, pools: [{ quality:"purple",weight:90 }, { quality:"orange",weight:10 }] },
  { floorStart: 141,floorEnd: 180, pools: [{ quality:"orange",weight:95 }, { quality:"red",   weight:5 }] },
];

export function getIdleQualityPool(floor: number): QualityPoolEntry[] {
  const p = IDLE_QUALITY_POOLS.find(p => floor >= p.floorStart && floor <= p.floorEnd);
  if (p) return p.pools;
  if (floor < 2) return [{ quality: "white", weight: 100 }];
  return IDLE_QUALITY_POOLS[IDLE_QUALITY_POOLS.length - 1].pools;
}

export function rollIdleQuality(floor: number): string {
  const pool = getIdleQualityPool(floor);
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of pool) { r -= e.weight; if (r <= 0) return e.quality; }
  return pool[0].quality;
}
