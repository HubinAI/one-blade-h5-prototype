/**
 * V0812019: 游袭兵 MovementPattern — Entry互斥 + Movement独占 + 确定性seed
 * T1: DIAGONAL + ARC
 */
import type { Enemy } from "../types";
import { BATTLEFIELD_ZONES, BATTLE_SAFE_X } from "../config/balance";

export type MovePattern = 'diagonal' | 's_curve' | 'arc' | 'spiral';

/** 确定性: 用enemy id hash选择pattern和方向 */
function stableHash(enemy: Enemy): number {
  let h = 0; const s = enemy.id;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initMovementPattern(enemy: Enemy, pattern?: MovePattern): void {
  const h = stableHash(enemy);
  const patterns: MovePattern[] = pattern ? [pattern] : ['diagonal', 'arc'];
  enemy._movePattern = patterns[h % patterns.length];
  enemy._movePhase = (h % 1000) / 1000 * Math.PI * 2;
  enemy._moveDir = h % 2 === 0 ? 1 : -1;
}

/** Returns true if Behavior owns this frame's movement */
export function updateMovementPattern(enemy: Enemy, dt: number): boolean {
  if (!enemy.alive) return false;
  if (enemy.entryPhase?.active) return false;

  const pattern = enemy._movePattern ?? 'diagonal';
  const dir = enemy._moveDir ?? 1;
  const baseSpeed = enemy.speed;

  let vx = 0, vy = 0;

  if (pattern === 'diagonal') {
    vx = dir * baseSpeed * 0.6 * dt;
    vy = baseSpeed * dt; // 用speed替代自动Y移动
    enemy._movePhase = (enemy._movePhase ?? 0) + dt * 0.8;
    if (Math.sin(enemy._movePhase) > 0.85) enemy._moveDir = -(enemy._moveDir ?? 1);
  } else if (pattern === 'arc') {
    vy = baseSpeed * dt;
    enemy._movePhase = (enemy._movePhase ?? 0) + dt * 1.5;
    vx = dir * baseSpeed * 0.3 * dt + Math.sin(enemy._movePhase) * baseSpeed * 0.4 * dt;
  }

  enemy.x = Math.max(BATTLE_SAFE_X.normalMin + 8, Math.min(BATTLE_SAFE_X.normalMax - 8, enemy.x + vx));
  enemy.y = Math.min(BATTLEFIELD_ZONES.defenseLineY - 20, enemy.y + vy);
  return true; // Behavior独占移动, 禁止baseMove
}
