// ========================================================================
// Projectile System — 弹幕系统工具函数
// ========================================================================
import type { Projectile, ProjectileKind, Vec2 } from "../types";
import { REACTIVE_BOSS_CONFIG } from "../config/bossReactiveFlow";
import { distanceToSegment } from "../../utils/math";

let _projectileIdCounter = 0;

export function resetProjectileIdCounter(): void {
  _projectileIdCounter = 0;
}

function nextProjectileId(): string {
  _projectileIdCounter++;
  return `proj_${_projectileIdCounter}`;
}

/**
 * 创建一个弹幕对象
 */
export function createProjectile(
  kind: ProjectileKind,
  x: number,
  y: number,
  vx: number,
  vy: number,
  reflected: boolean = false
): Projectile {
  const cfg = REACTIVE_BOSS_CONFIG.projectiles[kind];
  return {
    id: nextProjectileId(),
    kind,
    x,
    y,
    vx,
    vy,
    radius: cfg.radius,
    active: true,
    spawnTime: 0,
    maxLife: cfg.maxLife,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: "rotationSpeed" in cfg ? (cfg as any).rotationSpeed : 0,
    color: cfg.color,
    glowColor: cfg.glowColor,
    reflected,
    resolved: false,
  };
}

/**
 * 更新所有弹幕（位置、生命周期、旋转）
 */
export function updateProjectiles(projectiles: Projectile[], dt: number): void {
  for (const p of projectiles) {
    if (!p.active) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.spawnTime += dt;
    p.rotation += p.rotationSpeed * dt;
    // 超时或超出屏幕 → 失活 + 标记为过期
    if (p.spawnTime >= p.maxLife || p.y > 900 || p.y < -100 || p.x < -100 || p.x > 490) {
      p.active = false;
      if (p.spawnTime >= p.maxLife && !p.resolved) {
        p.resolved = true;
        p.resolution = "expired";
      }
    }
  }
}

/**
 * 检测刀线段与弹幕的碰撞
 * @returns 命中弹幕的索引数组
 */
export function checkSlashHit(
  projectiles: Projectile[],
  segA: Vec2,
  segB: Vec2,
  bladeReach: number
): number[] {
  const hits: number[] = [];
  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (!p.active) continue;
    const dist = distanceToSegment({ x: p.x, y: p.y }, segA, segB);
    if (dist <= p.radius + bladeReach) {
      hits.push(i);
    }
  }
  return hits;
}

/**
 * 检测弹幕是否命中玩家（防御线位置）
 * @returns 命中玩家的弹幕列表
 */
export function checkPlayerHit(
  projectiles: Projectile[],
  playerY: number
): Projectile[] {
  const hits: Projectile[] = [];
  for (const p of projectiles) {
    if (!p.active) continue;
    // 弹幕到达玩家Y位置即视为命中
    if (p.y >= playerY - p.radius) {
      hits.push(p);
    }
  }
  return hits;
}

/**
 * 生成一波弹幕（扇形或直线）
 */
export function spawnProjectileWave(
  projectiles: Projectile[],
  kind: ProjectileKind,
  originX: number,
  originY: number,
  count: number,
  spreadAngle: number,
  baseSpeed: number,
  direction: number = Math.PI / 2 // 默认向下
): void {
  const cfg = REACTIVE_BOSS_CONFIG.projectiles[kind];
  const speed = baseSpeed || cfg.speed;
  const startAngle = direction - spreadAngle / 2;
  for (let i = 0; i < count; i++) {
    const angle = count <= 1
      ? direction
      : startAngle + (spreadAngle * i) / (count - 1);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const p = createProjectile(kind, originX, originY, vx, vy);
    projectiles.push(p);
  }
}

/**
 * 清理所有失活弹幕
 */
export function cleanInactiveProjectiles(projectiles: Projectile[]): void {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    if (!projectiles[i].active) {
      projectiles.splice(i, 1);
    }
  }
}

/**
 * 失活所有弹幕
 */
export function deactivateAllProjectiles(projectiles: Projectile[]): void {
  for (const p of projectiles) {
    p.active = false;
  }
}