/**
 * V0812019: 弹幕兵 ProjectileBehavior — Entry互斥 + 弹幕伤害正确顺序
 * T1: SINGLE. State: idle → telegraph(0.7s) → fire → cooldown(3.0s)
 */
import type { Enemy, EnemyProjectile } from "../types";
import { BATTLEFIELD_ZONES } from "../config/balance";

const TELEGRAPH_DURATION = 0.7;
const COOLDOWN = 3.0;
const PROJECTILE_SPEED = 100;
const PROJECTILE_RADIUS = 8;
const FIRE_ZONE_MIN_Y = 280;
const FIRE_ZONE_MAX_Y = 580;

let _pid = 0;
function nextPid() { return `proj_${++_pid}`; }

export function initProjectileBehavior(enemy: Enemy): void {
  enemy._shootState = 'idle';
  enemy._shootTimer = 1.5;
  enemy._shootCooldown = COOLDOWN;
}

/** Returns true if Behavior owns (blocks) baseMove */
export function updateProjectileBehavior(enemy: Enemy, dt: number, projectiles: EnemyProjectile[]): boolean {
  if (!enemy.alive) return false;
  if (enemy.entryPhase?.active) return false;

  const state = enemy._shootState ?? 'idle';

  if (state === 'idle') {
    enemy._shootTimer = (enemy._shootTimer ?? 0) - dt;
    if ((enemy._shootTimer ?? 0) <= 0 && enemy.y >= FIRE_ZONE_MIN_Y && enemy.y <= FIRE_ZONE_MAX_Y) {
      enemy._shootState = 'telegraph';
      enemy._shootTimer = TELEGRAPH_DURATION;
      enemy.visualState = 'charging_warning';
    }
    return false; // idle → baseMove
  }

  if (state === 'telegraph') {
    enemy._shootTimer = (enemy._shootTimer ?? 0) - dt;
    if ((enemy._shootTimer ?? 0) <= 0) {
      enemy._shootState = 'firing';
      enemy.visualState = undefined;
      projectiles.push({
        id: nextPid(),
        x: enemy.x, y: enemy.y + 10,
        vx: 0, vy: 1,
        speed: PROJECTILE_SPEED,
        radius: PROJECTILE_RADIUS,
        alive: true,
        damage: 1,
        sourceEnemyId: enemy.id,
      });
    }
    return true; // telegraph停顿, 禁止baseMove
  }

  if (state === 'firing') {
    enemy._shootState = 'cooldown';
    enemy._shootTimer = enemy._shootCooldown ?? COOLDOWN;
    return true; // 短暂停
  }

  if (state === 'cooldown') {
    enemy._shootTimer = (enemy._shootTimer ?? 0) - dt;
    if ((enemy._shootTimer ?? 0) <= 0) enemy._shootState = 'idle';
    return false; // cooldown → baseMove
  }

  return false;
}

/** 弹幕更新: 移动→检查命中→标记 */
export function updateProjectiles(projectiles: EnemyProjectile[], dt: number, defenseLineY: number, onHitDefense: (p: EnemyProjectile) => void): void {
  for (const p of projectiles) {
    if (!p.alive) continue;
    p.y += p.speed * dt * p.vy;
    p.x += p.speed * dt * p.vx;
    // 防线命中: 先回调, 再标记
    if (p.y >= defenseLineY) {
      onHitDefense(p);
      p.alive = false;
    }
    if (p.x < 0 || p.x > 400 || p.y > 800) p.alive = false;
  }
}

export function checkProjectileSlashHit(proj: EnemyProjectile, sx: number, sy: number, sr: number): boolean {
  if (!proj.alive) return false;
  return Math.hypot(proj.x - sx, proj.y - sy) < proj.radius + sr;
}
