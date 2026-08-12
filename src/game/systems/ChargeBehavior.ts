/**
 * V0812018: 冲锋兵 ChargeBehavior — 可复用模块
 * T1: single dash only
 * Flow: idle → telegraph(0.6s) → dashing → recovery(0.3s) → idle
 */

import type { Enemy } from "../types";
import { BATTLEFIELD_ZONES, BATTLE_SAFE_X } from "../config/balance";

const TELEGRAPH_DURATION = 0.6;
const DASH_SPEED = 180;   // px/s
const DASH_DISTANCE = 120; // px
const RECOVERY_DURATION = 0.3;
const COOLDOWN = 2.5;

/** 合法冲锋区域: 不越防线, 不越安全区 */
function clampDashTarget(x: number, y: number, angle: number, dist: number): { tx: number; ty: number } {
  const tx = x + Math.cos(angle) * dist;
  const ty = y + Math.sin(angle) * dist;
  return {
    tx: Math.max(BATTLE_SAFE_X.normalMin + 10, Math.min(BATTLE_SAFE_X.normalMax - 10, tx)),
    ty: Math.min(BATTLEFIELD_ZONES.defenseLineY - 50, Math.max(BATTLEFIELD_ZONES.entryEndY + 30, ty)),
  };
}

export function initChargeBehavior(enemy: Enemy): void {
  enemy._chargeState = 'idle';
  enemy._chargeTimer = 1.0; // 初始冷却
  enemy._chargeDashAngle = 0;
  enemy._chargeDashSpeed = 0;
  enemy._chargeDashDist = 0;
  enemy._chargeTraveled = 0;
}

export function updateChargeBehavior(enemy: Enemy, dt: number): void {
  if (!enemy.alive) return;
  const state = enemy._chargeState ?? 'idle';

  if (state === 'idle') {
    enemy._chargeTimer = (enemy._chargeTimer ?? 0) - dt * enemy.speed / 42;
    if ((enemy._chargeTimer ?? 0) <= 0 && enemy.y > BATTLEFIELD_ZONES.entryEndY && enemy.y < BATTLEFIELD_ZONES.defenseLineY - 70) {
      enemy._chargeState = 'telegraph';
      enemy._chargeTimer = TELEGRAPH_DURATION;
      enemy.visualState = 'charging_warning';
      // 锁定方向: 朝左下方(玩家方向偏左)或朝左下/右下交替
      const angle = ((enemy.id.charCodeAt(0) % 3) - 1) * 0.18 + 1.65; // ~95°±10°
      enemy._chargeDashAngle = angle;
      enemy._chargeDashDist = DASH_DISTANCE;
    }
    return;
  }

  if (state === 'telegraph') {
    enemy._chargeTimer = (enemy._chargeTimer ?? 0) - dt;
    if ((enemy._chargeTimer ?? 0) <= 0) {
      enemy._chargeState = 'dashing';
      enemy._chargeDashSpeed = DASH_SPEED;
      enemy._chargeTraveled = 0;
      enemy.visualState = undefined;
    }
    return;
  }

  if (state === 'dashing') {
    const spd = enemy._chargeDashSpeed ?? DASH_SPEED;
    const angle = enemy._chargeDashAngle ?? 1.65;
    const dist = enemy._chargeDashDist ?? DASH_DISTANCE;
    const step = spd * dt;
    const dx = Math.cos(angle) * step;
    const dy = Math.sin(angle) * step;

    enemy.x += dx;
    enemy.y += dy;
    enemy._chargeTraveled = (enemy._chargeTraveled ?? 0) + step;

    // 边界Clamp
    const { tx, ty } = clampDashTarget(enemy.x, enemy.y, angle, 0);
    enemy.x = Math.max(BATTLE_SAFE_X.normalMin + 10, Math.min(BATTLE_SAFE_X.normalMax - 10, enemy.x));
    enemy.y = Math.min(BATTLEFIELD_ZONES.defenseLineY - 50, enemy.y);

    if ((enemy._chargeTraveled ?? 0) >= dist || enemy.y >= BATTLEFIELD_ZONES.defenseLineY - 50) {
      enemy._chargeState = 'recovery';
      enemy._chargeTimer = RECOVERY_DURATION;
    }
    return;
  }

  if (state === 'recovery') {
    enemy._chargeTimer = (enemy._chargeTimer ?? 0) - dt;
    if ((enemy._chargeTimer ?? 0) <= 0) {
      enemy._chargeState = 'idle';
      enemy._chargeTimer = COOLDOWN;
    }
    return;
  }
}

export function isChargeActive(enemy: Enemy): boolean {
  return (enemy._chargeState === 'telegraph' || enemy._chargeState === 'dashing');
}
