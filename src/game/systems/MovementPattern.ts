/**
 * V0812023: 游袭兵 — 过正版 (强识别)
 * DIAGONAL: 横1.8×sp, 纵1.0×sp, 明显的横向斜切
 * ARC: 横sin振幅1.2×sp, 纵0.8×sp, 清晰大弧线
 */
import type { Enemy } from "../types";
import { BATTLEFIELD_ZONES, BATTLE_SAFE_X } from "../config/balance";

export type MovePattern = 'diagonal' | 'arc';

function hash(enemy: Enemy): number { let h=0; for(let i=0;i<enemy.id.length;i++) h=(h*31+enemy.id.charCodeAt(i))|0; return Math.abs(h); }

export function initMovementPattern(enemy: Enemy): void {
  const h = hash(enemy);
  enemy._movePattern = h % 2 === 0 ? 'diagonal' : 'arc';
  enemy._movePhase = 0;
  enemy._moveDir = enemy.x < 145 ? 1 : -1;
}

export function updateMovementPattern(enemy: Enemy, dt: number): boolean {
  if (!enemy.alive) return false;
  if (enemy.entryPhase?.active) return false;
  const pat = enemy._movePattern ?? 'diagonal';
  const dir = enemy._moveDir ?? 1;
  const sp = enemy.speed;

  if (pat === 'diagonal') {
    const vx = dir * sp * 1.8 * dt;    // 横1.8×sp — 显著横切
    const vy = sp * 1.0 * dt;          // 纵正常
    enemy.x = Math.max(BATTLE_SAFE_X.normalMin + 8, Math.min(BATTLE_SAFE_X.normalMax - 8, enemy.x + vx));
    enemy.y = Math.min(BATTLEFIELD_ZONES.defenseLineY - 20, enemy.y + vy);
    enemy._movePhase = (enemy._movePhase ?? 0) + dt;
    if (enemy.x >= BATTLE_SAFE_X.normalMax - 15 || enemy.x <= BATTLE_SAFE_X.normalMin + 15 || (enemy._movePhase ?? 0) > 1.2) {
      enemy._moveDir = -(enemy._moveDir ?? 1); enemy._movePhase = 0;
    }
  } else {
    // ARC: 大弧线 — sin振幅达1.2×sp
    enemy._movePhase = (enemy._movePhase ?? 0) + dt * 2.8;
    const vx = dir * sp * 0.3 * dt + Math.sin(enemy._movePhase) * sp * 1.2 * dt;
    const vy = sp * 0.8 * dt;
    enemy.x = Math.max(BATTLE_SAFE_X.normalMin + 8, Math.min(BATTLE_SAFE_X.normalMax - 8, enemy.x + vx));
    enemy.y = Math.min(BATTLEFIELD_ZONES.defenseLineY - 20, enemy.y + vy);
  }
  return true;
}
