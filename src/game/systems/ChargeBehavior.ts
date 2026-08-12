/**
 * V0812019: 冲锋兵 ChargeBehavior — Entry互斥 + Movement独占 + 确定性seed
 * T1: single dash. State: idle → telegraph(0.6s) → dashing → recovery(0.3s) → idle
 */
import type { Enemy } from "../types";
import { BATTLEFIELD_ZONES, BATTLE_SAFE_X } from "../config/balance";

const TELEGRAPH_DURATION = 0.6;
const DASH_SPEED = 180;
const DASH_DISTANCE = 120;
const RECOVERY_DURATION = 0.3;
const COOLDOWN = 2.5;

/** 确定性: 用enemy id hash决定角度偏移 */
function stableAngle(enemy: Enemy): number {
  let h = 0; const s = enemy.id;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 1.60 + (Math.abs(h) % 20) * 0.005; // ~1.60~1.70 rad
}

export function initChargeBehavior(enemy: Enemy): void {
  enemy._chargeState = 'idle';
  enemy._chargeTimer = 1.0;
}

/** Returns true if Behavior owns this frame's movement */
export function updateChargeBehavior(enemy: Enemy, dt: number): boolean {
  if (!enemy.alive) return false;
  if (enemy.entryPhase?.active) return false; // Entry未完成, 不启动Behavior

  const state = enemy._chargeState ?? 'idle';

  if (state === 'idle') {
    enemy._chargeTimer = (enemy._chargeTimer ?? 0) - dt;
    if ((enemy._chargeTimer ?? 0) <= 0 && enemy.y > BATTLEFIELD_ZONES.entryEndY && enemy.y < BATTLEFIELD_ZONES.defenseLineY - 70) {
      enemy._chargeState = 'telegraph';
      enemy._chargeTimer = TELEGRAPH_DURATION;
      enemy.visualState = 'charging_warning';
      enemy._chargeDashAngle = stableAngle(enemy);
    }
    return false; // idle → baseMove handles movement
  }

  if (state === 'telegraph') {
    enemy._chargeTimer = (enemy._chargeTimer ?? 0) - dt;
    if ((enemy._chargeTimer ?? 0) <= 0) {
      enemy._chargeState = 'dashing';
      enemy._chargeDashSpeed = DASH_SPEED;
      enemy._chargeTraveled = 0;
      enemy.visualState = undefined;
    }
    return true; // Behavior owns movement
  }

  if (state === 'dashing') {
    const angle = enemy._chargeDashAngle ?? stableAngle(enemy);
    const step = (enemy._chargeDashSpeed ?? DASH_SPEED) * dt;
    enemy.x += Math.cos(angle) * step;
    enemy.y += Math.sin(angle) * step;
    // Clamp
    enemy.x = Math.max(BATTLE_SAFE_X.normalMin + 10, Math.min(BATTLE_SAFE_X.normalMax - 10, enemy.x));
    enemy.y = Math.min(BATTLEFIELD_ZONES.defenseLineY - 50, enemy.y);
    enemy._chargeTraveled = (enemy._chargeTraveled ?? 0) + step;
    if ((enemy._chargeTraveled ?? 0) >= DASH_DISTANCE || enemy.y >= BATTLEFIELD_ZONES.defenseLineY - 50) {
      enemy._chargeState = 'recovery';
      enemy._chargeTimer = RECOVERY_DURATION;
    }
    return true; // Behavior独占dash移动
  }

  if (state === 'recovery') {
    enemy._chargeTimer = (enemy._chargeTimer ?? 0) - dt;
    if ((enemy._chargeTimer ?? 0) <= 0) {
      enemy._chargeState = 'idle';
      enemy._chargeTimer = COOLDOWN;
      enemy.visualState = undefined;
    }
    return true; // recovery短停, 不移动
  }

  return false;
}

export function isChargeActive(enemy: Enemy): boolean {
  return enemy._chargeState === 'telegraph' || enemy._chargeState === 'dashing';
}
