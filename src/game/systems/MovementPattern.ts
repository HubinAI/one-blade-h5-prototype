/**
 * V0812018: 游袭兵 MovementPattern — 可复用模块
 * T1: DIAGONAL + ARC
 * 未来: S_CURVE, SPIRAL
 */

import type { Enemy } from "../types";
import { BATTLEFIELD_ZONES, BATTLE_SAFE_X } from "../config/balance";

export type MovePattern = 'diagonal' | 's_curve' | 'arc' | 'spiral';

/** 为敌人分配运动模式, 偏好左右侧入场 */
export function initMovementPattern(enemy: Enemy, pattern?: MovePattern): void {
  const patterns: MovePattern[] = pattern ? [pattern] : ['diagonal', 'arc'];
  enemy._movePattern = patterns[Math.floor(enemy.id.charCodeAt(0) % patterns.length)];
  enemy._moveOriginX = enemy.x;
  enemy._moveOriginY = enemy.y;
  enemy._movePhase = Math.random() * Math.PI * 2;
  // 横向方向: 左半=+1, 右半=-1
  enemy._moveDir = enemy.x < 145 ? 1 : -1;
}

export function updateMovementPattern(enemy: Enemy, dt: number): void {
  if (!enemy.alive) return;
  const pattern = enemy._movePattern ?? 'diagonal';
  const dir = enemy._moveDir ?? 1;
  const baseSpeed = enemy.speed;

  // 基础向下移动
  let vx = 0, vy = baseSpeed * dt;

  if (pattern === 'diagonal') {
    // 斜向下: 横向±baseSpeed*0.6
    vx = dir * baseSpeed * 0.6 * dt;
    // 周期性反转向
    enemy._movePhase = (enemy._movePhase ?? 0) + dt * 0.8;
    if (Math.sin(enemy._movePhase) > 0.9) enemy._moveDir = -(enemy._moveDir ?? 1);
  } else if (pattern === 'arc') {
    // 弧线: sin摆动 + 整体横向偏移
    enemy._movePhase = (enemy._movePhase ?? 0) + dt * 1.5;
    vx = dir * baseSpeed * 0.5 * dt + Math.sin(enemy._movePhase) * baseSpeed * 0.3 * dt;
  }

  // Clamp到合法区域
  enemy.x = Math.max(BATTLE_SAFE_X.normalMin + 8, Math.min(BATTLE_SAFE_X.normalMax - 8, enemy.x + vx));
  enemy.y = Math.min(BATTLEFIELD_ZONES.defenseLineY - 20, enemy.y + vy);
}

/** 渲染回调用: 运动轨迹残影 */
export function getMoveTrailAlpha(enemy: Enemy): number {
  if (!enemy.alive) return 0;
  const p = enemy._movePattern;
  if (p === 'diagonal' || p === 'arc') return 0.12;
  return 0;
}
