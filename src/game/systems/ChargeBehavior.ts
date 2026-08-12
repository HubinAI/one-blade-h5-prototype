/**
 * V0812022: 冲锋兵 T1 斜向冲锋 — 可读身体语言
 * idle → telegraph(0.75s, 显示真实dash路径) → dashing → recovery(0.45s)
 */
import type { Enemy } from "../types";
import { BATTLEFIELD_ZONES, BATTLE_SAFE_X } from "../config/balance";

const TELEGRAPH = 0.75, DASH_SPEED = 200, RECOVERY = 0.45, COOLDOWN = 2.5;

function hash(enemy: Enemy): number { let h=0; for(let i=0; i<enemy.id.length; i++) h=(h*31+enemy.id.charCodeAt(i))|0; return Math.abs(h); }

export function initChargeBehavior(enemy: Enemy): void {
  enemy._chargeState = 'idle';
  enemy._chargeTimer = 1.0 + (hash(enemy) % 1000) * 0.0006; // ±0.3s 错峰
}

export function updateChargeBehavior(enemy: Enemy, dt: number): boolean {
  if (!enemy.alive) return false;
  if (enemy.entryPhase?.active) return false;
  const s = enemy._chargeState ?? 'idle';

  if (s === 'idle') {
    enemy._chargeTimer = (enemy._chargeTimer ?? 0) - dt;
    if ((enemy._chargeTimer ?? 0) <= 0 && enemy.y > BATTLEFIELD_ZONES.entryEndY && enemy.y < BATTLEFIELD_ZONES.defenseLineY - 70) {
      // 斜向目标: 下90-120px, 横±50-90px
      const dir = hash(enemy) % 2 === 0 ? 1 : -1;
      const dx = dir * (50 + (hash(enemy) % 40)), dy = 90 + (hash(enemy) % 30);
      enemy._chargeDashAngle = Math.atan2(dy, dx);
      enemy._chargeDashDist = Math.sqrt(dx * dx + dy * dy);
      enemy._chargeState = 'telegraph';
      enemy._chargeTimer = TELEGRAPH;
      enemy.visualState = 'charging_warning';
      // 记录目标坐标(供telegraph线)
      enemy._chargeTargetX = enemy.x + dx;
      enemy._chargeTargetY = enemy.y + dy;
    }
    return false;
  }

  if (s === 'telegraph') {
    enemy._chargeTimer = (enemy._chargeTimer ?? 0) - dt;
    if ((enemy._chargeTimer ?? 0) <= 0) {
      enemy._chargeState = 'dashing'; enemy._chargeDashSpeed = DASH_SPEED; enemy._chargeTraveled = 0; enemy.visualState = undefined;
    }
    return true;
  }

  if (s === 'dashing') {
    const step = (enemy._chargeDashSpeed ?? DASH_SPEED) * dt;
    const angle = enemy._chargeDashAngle ?? 1.65;
    enemy.x += Math.cos(angle) * step; enemy.y += Math.sin(angle) * step;
    enemy.x = Math.max(BATTLE_SAFE_X.normalMin + 10, Math.min(BATTLE_SAFE_X.normalMax - 10, enemy.x));
    enemy.y = Math.min(BATTLEFIELD_ZONES.defenseLineY - 50, enemy.y);
    enemy._chargeTraveled = (enemy._chargeTraveled ?? 0) + step;
    if ((enemy._chargeTraveled ?? 0) >= (enemy._chargeDashDist ?? 120) || enemy.y >= BATTLEFIELD_ZONES.defenseLineY - 50) {
      enemy._chargeState = 'recovery'; enemy._chargeTimer = RECOVERY;
    }
    return true;
  }

  if (s === 'recovery') {
    enemy._chargeTimer = (enemy._chargeTimer ?? 0) - dt;
    if ((enemy._chargeTimer ?? 0) <= 0) { enemy._chargeState = 'idle'; enemy._chargeTimer = COOLDOWN; enemy.visualState = undefined; }
    return true;
  }
  return false;
}
