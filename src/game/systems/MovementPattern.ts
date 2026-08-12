/**
 * V0812022: 游袭兵 T1 完整轨迹 — 可读身体语言
 * DIAGONAL: 斜穿 (横90-130px, 纵100-150px)
 * ARC: 绕弧 (连续弧线切向另一侧)
 */
import type { Enemy } from "../types";
import { BATTLEFIELD_ZONES, BATTLE_SAFE_X } from "../config/balance";

export type MovePattern = 'diagonal' | 'arc';

function hash(enemy: Enemy): number { let h=0; for(let i=0; i<enemy.id.length; i++) h=(h*31+enemy.id.charCodeAt(i))|0; return Math.abs(h); }

export function initMovementPattern(enemy: Enemy): void {
  const h = hash(enemy);
  enemy._movePattern = h % 2 === 0 ? 'diagonal' : 'arc';
  enemy._movePhase = 0;
  enemy._moveDir = enemy.x < 145 ? 1 : -1; // 左侧→右, 右侧→左
}

export function updateMovementPattern(enemy: Enemy, dt: number): boolean {
  if (!enemy.alive) return false;
  if (enemy.entryPhase?.active) return false;
  const pat = enemy._movePattern ?? 'diagonal';
  const dir = enemy._moveDir ?? 1;
  const sp = enemy.speed;
  const dtF = dt;

  if (pat === 'diagonal') {
    // 完整斜穿: 横1.0×sp + 纵0.7×sp
    const vx = dir * sp * 1.0 * dtF;
    const vy = sp * 0.7 * dtF;
    enemy.x = Math.max(BATTLE_SAFE_X.normalMin + 8, Math.min(BATTLE_SAFE_X.normalMax - 8, enemy.x + vx));
    enemy.y = Math.min(BATTLEFIELD_ZONES.defenseLineY - 20, enemy.y + vy);
    enemy._movePhase = (enemy._movePhase ?? 0) + dtF;
    // 到达边界或累计≈1.5s后翻转方向
    if (enemy.x >= BATTLE_SAFE_X.normalMax - 15 || enemy.x <= BATTLE_SAFE_X.normalMin + 15 || (enemy._movePhase ?? 0) > 1.5) {
      enemy._moveDir = -(enemy._moveDir ?? 1); enemy._movePhase = 0;
    }
  } else {
    // ARC: sin弧线 + 整体横向偏移
    enemy._movePhase = (enemy._movePhase ?? 0) + dtF * 2.2;
    const vx = dir * sp * 0.3 * dtF + Math.sin(enemy._movePhase) * sp * 0.55 * dtF;
    const vy = sp * 0.6 * dtF;
    enemy.x = Math.max(BATTLE_SAFE_X.normalMin + 8, Math.min(BATTLE_SAFE_X.normalMax - 8, enemy.x + vx));
    enemy.y = Math.min(BATTLEFIELD_ZONES.defenseLineY - 20, enemy.y + vy);
  }
  return true; // 独占移动
}
