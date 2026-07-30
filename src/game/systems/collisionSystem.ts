import type { SlashPoint, Vec2 } from "../types";
import { angleBetween, distance, distanceToSegment } from "../../utils/math";
import { BALANCE } from "../config/balance";

export function isSharpTurn(prev: SlashPoint, last: SlashPoint, next: Vec2) {
  if (distance(prev, last) < 6 || distance(last, next) < 6) return false;
  return angleBetween(prev, last, next) < Math.PI - (BALANCE.slash.sharpTurnAngle * Math.PI) / 180;
}

export function segmentHitCircle(a: Vec2, b: Vec2, center: Vec2, radius: number) {
  return distanceToSegment(center, a, b) <= radius;
}
