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
