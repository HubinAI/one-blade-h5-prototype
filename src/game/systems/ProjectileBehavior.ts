/**
 * V0812018: 弹幕兵 ProjectileBehavior — 可复用模块
 * T1: SINGLE only
 * 未来: SPREAD3, SPREAD5, BURST
 */

import type { Enemy, EnemyProjectile } from "../types";
import { BATTLEFIELD_ZONES } from "../config/balance";

const TELEGRAPH_DURATION = 0.7;
const COOLDOWN = 3.0;
const PROJECTILE_SPEED = 100;
const PROJECTILE_RADIUS = 8;
const FIRE_ZONE_MIN_Y = 280;
const FIRE_ZONE_MAX_Y = 580;

let _projectileIdCounter = 0;

export function createProjectileId(): string {
  return `proj_${++_projectileIdCounter}_${Date.now()}`;
}

export function initProjectileBehavior(enemy: Enemy): void {
  enemy._shootState = 'idle';
  enemy._shootTimer = 1.5;
  enemy._shootCooldown = COOLDOWN;
}

export function updateProjectileBehavior(enemy: Enemy, dt: number, projectiles: EnemyProjectile[]): void {
  if (!enemy.alive) return;
  const state = enemy._shootState ?? 'idle';

  if (state === 'idle') {
    enemy._shootTimer = (enemy._shootTimer ?? 0) - dt;
    if ((enemy._shootTimer ?? 0) <= 0
      && enemy.y >= FIRE_ZONE_MIN_Y
      && enemy.y <= FIRE_ZONE_MAX_Y) {
      enemy._shootState = 'telegraph';
      enemy._shootTimer = TELEGRAPH_DURATION;
      enemy.visualState = 'charging_warning';
    }
    return;
  }

  if (state === 'telegraph') {
    enemy._shootTimer = (enemy._shootTimer ?? 0) - dt;
    if ((enemy._shootTimer ?? 0) <= 0) {
      enemy._shootState = 'firing';
      enemy.visualState = undefined;
      const proj: EnemyProjectile = {
        id: createProjectileId(),
        x: enemy.x, y: enemy.y + 10,
        vx: 0, vy: 1,
        speed: PROJECTILE_SPEED,
        radius: PROJECTILE_RADIUS,
        alive: true,
        damage: 1,
        sourceEnemyId: enemy.id,
      };
      projectiles.push(proj);
    }
    return;
  }

  if (state === 'firing') {
    enemy._shootState = 'cooldown';
    enemy._shootTimer = enemy._shootCooldown ?? COOLDOWN;
    return;
  }

  if (state === 'cooldown') {
    enemy._shootTimer = (enemy._shootTimer ?? 0) - dt;
    if ((enemy._shootTimer ?? 0) <= 0) {
      enemy._shootState = 'idle';
    }
    return;
  }
}

export function updateProjectiles(projectiles: EnemyProjectile[], dt: number): void {
  for (const p of projectiles) {
    if (!p.alive) continue;
    p.y += p.speed * dt * p.vy;
    p.x += p.speed * dt * p.vx;
    if (p.y >= BATTLEFIELD_ZONES.defenseLineY) p.alive = false;
    if (p.x < 0 || p.x > 400 || p.y > 800) p.alive = false;
  }
}

export function checkProjectileSlashHit(proj: EnemyProjectile, slashX: number, slashY: number, slashRadius: number): boolean {
  if (!proj.alive) return false;
  const dx = proj.x - slashX;
  const dy = proj.y - slashY;
  return Math.sqrt(dx * dx + dy * dy) < proj.radius + slashRadius;
}
