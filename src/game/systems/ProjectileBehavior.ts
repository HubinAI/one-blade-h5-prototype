/**
 * V0812024: 弹幕兵 — T1版 (弹幕可切)
 * idle → telegraph(0.75s) → fire → cooldown(2.8s)
 */
import type { Enemy, EnemyProjectile } from "../types";
import { BATTLEFIELD_ZONES } from "../config/balance";

const TELEGRAPH = 0.75, COOLDOWN = 2.8, PROJ_SPEED = 140, PROJ_RADIUS = 9;
const FIRE_ZONE_MIN = 280, FIRE_ZONE_MAX = 580;

let _pid = 0; function np() { return `proj_${++_pid}`; }

function hash(enemy: Enemy): number { let h=0; for(let i=0;i<enemy.id.length;i++) h=(h*31+enemy.id.charCodeAt(i))|0; return Math.abs(h); }

export function initProjectileBehavior(enemy: Enemy, variant?: string): void {
  enemy._shootState = 'idle';
  enemy._shootTimer = 1.5 + ((hash(enemy) % 1800) * 0.001 - 0.9); // ±0.9s 错峰
  enemy._shootCooldown = variant === 'FAST' ? 1.5 : COOLDOWN;
  (enemy as any)._shootVariant = variant ?? 'DEFAULT';
}

export function updateProjectileBehavior(enemy: Enemy, dt: number, projectiles: EnemyProjectile[]): boolean {
  if (!enemy.alive) return false;
  if (enemy.entryPhase?.active) return false;
  const s = enemy._shootState ?? 'idle';

  if (s === 'idle') {
    enemy._shootTimer = (enemy._shootTimer ?? 0) - dt;
    if ((enemy._shootTimer ?? 0) <= 0 && enemy.y >= FIRE_ZONE_MIN && enemy.y <= FIRE_ZONE_MAX) {
      enemy._shootState = 'telegraph'; enemy._shootTimer = TELEGRAPH; enemy.visualState = 'charging_warning';
    }
    return false;
  }
  if (s === 'telegraph') {
    enemy._shootTimer = (enemy._shootTimer ?? 0) - dt;
    if ((enemy._shootTimer ?? 0) <= 0) {
      enemy._shootState = 'firing'; enemy.visualState = undefined;
      const isSpread = (enemy as any)._shootVariant;
      let angles: number[] = [0];
      if (isSpread === 'SPREAD3') angles = [-0.314, 0, 0.314];
      else if (isSpread === 'SPREAD5') angles = [-0.471, -0.236, 0, 0.236, 0.471]; // ±27°=54°总展开
      for (const offset of angles) {
        projectiles.push({
          id: np(), x: enemy.x, y: enemy.y + 10,
          vx: Math.sin(offset), vy: Math.cos(offset),
          speed: PROJ_SPEED, radius: PROJ_RADIUS, alive: true, damage: 1,
          sourceEnemyId: enemy.id,
        });
      }
    }
    return true;
  }
  if (s === 'firing') { enemy._shootState = 'cooldown'; enemy._shootTimer = enemy._shootCooldown ?? COOLDOWN; return true; }
  if (s === 'cooldown') { enemy._shootTimer = (enemy._shootTimer ?? 0) - dt; if ((enemy._shootTimer ?? 0) <= 0) enemy._shootState = 'idle'; return false; }
  return false;
}

export function updateProjectiles(projectiles: EnemyProjectile[], dt: number, defY: number, onHit: (p: EnemyProjectile) => void): void {
  for (const p of projectiles) {
    if (!p.alive) continue;
    p.y += p.speed * dt * p.vy; p.x += p.speed * dt * p.vx;
    if (p.y >= defY) { onHit(p); p.alive = false; }
    if (p.x < 0 || p.x > 400 || p.y > 800) p.alive = false;
  }
}

export function checkProjectileSlashHit(proj: EnemyProjectile, sx: number, sy: number, sr: number): boolean {
  if (!proj.alive) return false;
  return Math.hypot(proj.x - sx, proj.y - sy) < proj.radius + sr;
}
