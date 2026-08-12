/**
 * V0812024: 游袭兵 — 轨迹重做版
 * DIAGONAL: destination-based, 单次1.2-1.6s, 横移≥55%屏宽
 * ARC: Bezier弧线, 横移≥45%屏宽, 弧顶偏差≥80px
 */
import type { Enemy } from "../types";
import { BATTLEFIELD_ZONES, BATTLE_SAFE_X } from "../config/balance";

export type MovePattern = 'diagonal' | 'arc';

function hash(enemy: Enemy): number { let h=0; for(let i=0;i<enemy.id.length;i++) h=(h*31+enemy.id.charCodeAt(i))|0; return Math.abs(h); }

const SCREEN_W = BATTLE_SAFE_X.normalMax - BATTLE_SAFE_X.normalMin;

export function initMovementPattern(enemy: Enemy): void {
  const h = hash(enemy);
  enemy._movePattern = h % 2 === 0 ? 'diagonal' : 'arc';
  enemy._movePhase = (h % 1000) * 0.0005; // 0-0.5s 错峰起始
  enemy._moveDir = enemy.x < (BATTLE_SAFE_X.normalMin + BATTLE_SAFE_X.normalMax)/2 ? 1 : -1;
  // 初始目标
  _setTarget(enemy);
}

function _setTarget(enemy: Enemy): void {
  const dir = enemy._moveDir ?? 1;
  const pat = enemy._movePattern ?? 'diagonal';
  if (pat === 'diagonal') {
    // 目标: 对侧, 横移55-70%屏宽
    const dx = dir * SCREEN_W * (0.55 + (hash(enemy) % 15) * 0.01);
    const dy = 100 + (hash(enemy) % 60);
    enemy._moveTargetX = enemy.x + dx;
    enemy._moveTargetY = enemy.y + dy;
    enemy._moveDur = 1.2 + (hash(enemy) % 400) * 0.001; // 1.2-1.6s
  } else {
    // ARC: 弧线从侧翼切向中心
    enemy._movePhase = 0;
    enemy._moveDur = 1.6 + (hash(enemy) % 600) * 0.001; // 1.6-2.2s
    enemy._moveArcStartX = enemy.x;
    enemy._moveArcStartY = enemy.y;
    enemy._moveArcMidX = (BATTLE_SAFE_X.normalMin + BATTLE_SAFE_X.normalMax) / 2 + (40 - (hash(enemy)%80));
    enemy._moveArcMidY = enemy.y + 60;
    enemy._moveArcEndX = BATTLE_SAFE_X.normalMin + SCREEN_W * (dir > 0 ? 0.75 : 0.25);
    enemy._moveArcEndY = enemy.y + 120;
  }
  enemy._movePhase = 0;
}

export function updateMovementPattern(enemy: Enemy, dt: number): boolean {
  if (!enemy.alive) return false;
  if (enemy.entryPhase?.active) return false;

  const pat = enemy._movePattern ?? 'diagonal';
  const dur = enemy._moveDur ?? 1.5;
  enemy._movePhase = (enemy._movePhase ?? 0) + dt;

  if (pat === 'diagonal') {
    const t = Math.min(enemy._movePhase / dur, 1.0);
    const tx = enemy._moveTargetX ?? enemy.x, ty = enemy._moveTargetY ?? enemy.y;
    enemy.x = enemy.x + (tx - enemy.x) * Math.min(dt / (dur * (1.0 - t + 0.01)), 1.0);
    enemy.y = enemy.y + (ty - enemy.y) * Math.min(dt / (dur * (1.0 - t + 0.01)), 1.0);
    if (t >= 1.0) {
      // 完成一次斜穿: 翻转方向, 从当前位置重新设目标
      enemy._moveDir = -(enemy._moveDir ?? 1);
      _setTarget(enemy);
    }
  } else {
    // ARC: quadratic Bezier
    const t = Math.min(enemy._movePhase / dur, 1.0);
    const u = 1 - t;
    const sx = enemy._moveArcStartX ?? enemy.x, sy = enemy._moveArcStartY ?? enemy.y;
    const mx = enemy._moveArcMidX ?? enemy.x, my = enemy._moveArcMidY ?? enemy.y;
    const ex = enemy._moveArcEndX ?? enemy.x, ey = enemy._moveArcEndY ?? enemy.y;
    enemy.x = u*u*sx + 2*u*t*mx + t*t*ex;
    enemy.y = u*u*sy + 2*u*t*my + t*t*ey;
    if (t >= 1.0) {
      enemy._moveDir = -(enemy._moveDir ?? 1);
      _setTarget(enemy);
    }
  }

  // Clamp safety
  enemy.x = Math.max(BATTLE_SAFE_X.normalMin, Math.min(BATTLE_SAFE_X.normalMax, enemy.x));
  enemy.y = Math.min(BATTLEFIELD_ZONES.defenseLineY - 20, enemy.y);
  return true;
}
