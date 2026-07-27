import type { Vec2 } from "../game/types";

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function distance(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceToSegment(point: Vec2, a: Vec2, b: Vec2) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const abLenSq = abx * abx + aby * aby;

  if (abLenSq === 0) {
    return distance(point, a);
  }

  const t = clamp((apx * abx + apy * aby) / abLenSq, 0, 1);
  const projection = { x: a.x + abx * t, y: a.y + aby * t };
  return distance(point, projection);
}

export function angleBetween(a: Vec2, b: Vec2, c: Vec2) {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (mag === 0) return 0;
  return Math.acos(clamp(dot / mag, -1, 1));
}

export function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function choose<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}
