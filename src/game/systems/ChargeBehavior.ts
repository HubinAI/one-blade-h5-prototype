/**
 * V0812027: 冲锋兵 — variant版
 * DEFAULT: telegraph 0.85s, dash 380px/s, 横偏±70-110px, recovery 0.55s
 * FAST:    telegraph 0.55s, dash 530px/s, 横偏±90-140px, recovery 0.35s, cd 1.8s
 * DOUBLE:  telegraph 0.75s, dash 420px/s, 横偏±70-110px, recovery 0.45s, cd 1.5s (double dash)
 */
import type { Enemy } from "../types";
import { BATTLEFIELD_ZONES, BATTLE_SAFE_X } from "../config/balance";

const D = { tlg: 0.85, spd: 380, dx0: 70, dx1: 110, dy0: 90, dy1: 120, rec: 0.55, cd: 2.2 };
const F = { tlg: 0.55, spd: 530, dx0: 90, dx1: 140, dy0: 90, dy1: 120, rec: 0.35, cd: 1.8 };
const B = { tlg: 0.75, spd: 420, dx0: 70, dx1: 110, dy0: 90, dy1: 120, rec: 0.45, cd: 1.5 };

function cfg(enemy: Enemy) { return (enemy as any)._chargeCfg ?? D; }

function hash(enemy: Enemy): number { let h=0; for(let i=0;i<enemy.id.length;i++) h=(h*31+enemy.id.charCodeAt(i))|0; return Math.abs(h); }

export function initChargeBehavior(enemy: Enemy, variant?: string): void {
  (enemy as any)._chargeCfg = variant === 'FAST' ? F : (variant === 'DOUBLE' ? B : D);
  enemy._chargeState = 'idle';
  enemy._chargeTimer = 0.9 + (hash(enemy) % 800) * 0.0005;
}

export function updateChargeBehavior(enemy: Enemy, dt: number): boolean {
  if (!enemy.alive) return false;
  if (enemy.entryPhase?.active) return false;
  const c = cfg(enemy);
  const s = enemy._chargeState ?? 'idle';

  if (s === 'idle') {
    enemy._chargeTimer = (enemy._chargeTimer ?? 0) - dt;
    if ((enemy._chargeTimer ?? 0) <= 0 && enemy.y > BATTLEFIELD_ZONES.entryEndY && enemy.y < BATTLEFIELD_ZONES.defenseLineY - 70) {
      const dir = hash(enemy) % 2 === 0 ? 1 : -1;
      const dx = dir * (c.dx0 + (hash(enemy) % (c.dx1 - c.dx0)));
      const dy = c.dy0 + (hash(enemy) % (c.dy1 - c.dy0));
      enemy._chargeDashAngle = Math.atan2(dy, dx);
      enemy._chargeDashDist = Math.sqrt(dx * dx + dy * dy);
      enemy._chargeTargetX = enemy.x + dx;
      enemy._chargeTargetY = enemy.y + dy;
      enemy._chargeState = 'telegraph'; enemy._chargeTimer = c.tlg; enemy.visualState = 'charging_warning';
    }
    return false;
  }
  if (s === 'telegraph') {
    enemy._chargeTimer = (enemy._chargeTimer ?? 0) - dt;
    if ((enemy._chargeTimer ?? 0) <= 0) {
      enemy._chargeState = 'dashing'; enemy._chargeDashSpeed = c.spd; enemy._chargeTraveled = 0; enemy.visualState = undefined;
    }
    return true;
  }
  if (s === 'dashing') {
    const step = (enemy._chargeDashSpeed ?? c.spd) * dt;
    const ang = enemy._chargeDashAngle ?? 1.65;
    enemy.x += Math.cos(ang) * step; enemy.y += Math.sin(ang) * step;
    enemy.x = Math.max(BATTLE_SAFE_X.normalMin + 10, Math.min(BATTLE_SAFE_X.normalMax - 10, enemy.x));
    enemy.y = Math.min(BATTLEFIELD_ZONES.defenseLineY - 50, enemy.y);
    enemy._chargeTraveled = (enemy._chargeTraveled ?? 0) + step;
    if ((enemy._chargeTraveled ?? 0) >= (enemy._chargeDashDist ?? 120) || enemy.y >= BATTLEFIELD_ZONES.defenseLineY - 50) {
      enemy._chargeState = 'recovery'; enemy._chargeTimer = c.rec;
    }
    return true;
  }
  if (s === 'recovery') {
    enemy._chargeTimer = (enemy._chargeTimer ?? 0) - dt;
    if ((enemy._chargeTimer ?? 0) <= 0) { enemy._chargeState = 'idle'; enemy._chargeTimer = c.cd; enemy.visualState = undefined; }
    return true;
  }
  return false;
}
