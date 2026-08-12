/**
 * V0812025: 游袭兵 — 完全重做 (强制横向游袭)
 * DIAGONAL: 横跨65-80%屏宽, 0.9-1.25s, 纵移80-140px
 * ARC: sin弧线, 横跨65-80%屏宽, arcHeight 180-260px, 1.05-1.40s
 * 禁止baseMove叠加, MovementPattern完全接管位置
 */
import type { Enemy } from "../types";
import { BATTLEFIELD_ZONES, BATTLE_SAFE_X } from "../config/balance";

export type MovePattern = 'diagonal' | 'arc' | 's_curve' | 'spiral';

function hash(enemy: Enemy): number { let h=0; for(let i=0;i<enemy.id.length;i++) h=(h*31+enemy.id.charCodeAt(i))|0; return Math.abs(h); }

const BW = BATTLE_SAFE_X.normalMax - BATTLE_SAFE_X.normalMin; // 战场有效宽度

export function initMovementPattern(enemy: Enemy, variant?: string): void {
  const h = hash(enemy);
  if (variant === 'SPIRAL') {
    enemy._movePattern = 'spiral';
  } else if (variant === 'S_CURVE') {
    enemy._movePattern = h % 2 === 0 ? 'diagonal' : 'arc';
  }
  enemy._moveDir = enemy.x < (BATTLE_SAFE_X.normalMin + BW/2) ? 1 : -1;
  (enemy as any)._moveVariant = variant ?? 'DEFAULT';
  _nextMove(enemy, h);
}

function _nextMove(enemy: Enemy, seed?: number): void {
  const h = seed ?? hash(enemy);
  const dir = enemy._moveDir ?? 1;
  const durBase = enemy._movePattern === 'diagonal' ? 0.9 : (enemy._movePattern === 's_curve' ? 1.3 : (enemy._movePattern === 'spiral' ? 1.7 : 1.05));
  const durVar = enemy._movePattern === 'diagonal' ? 0.35 : (enemy._movePattern === 's_curve' ? 0.40 : (enemy._movePattern === 'spiral' ? 0.40 : 0.35));
  enemy._moveDur = durBase + (h % 100) * durVar * 0.01;
  enemy._moveStartX = enemy.x;
  enemy._moveStartY = enemy.y;

  if (enemy._movePattern === 'spiral') {
    // SPIRAL: 围绕下移中心旋转1.1-1.4圈, radius 140→70px, 中心推进120-160px
    enemy._moveTargetY = enemy.y + 120 + (h % 40);
    enemy._moveArcHeight = 1.1 + (h % 30) * 0.01; // 圈数 1.1-1.4
    enemy._moveStartX = enemy.x; // 旋转中心X保持不变
  } else if (enemy._movePattern === 's_curve') {
    const span = BW * (0.70 + (h % 15) * 0.01);
    enemy._moveTargetX = BATTLE_SAFE_X.normalMin + (dir > 0 ? span + BW*0.08 : BW*0.92 - span);
    enemy._moveTargetY = enemy.y + 100 + (h % 50);
    enemy._moveArcHeight = 90 + (h % 30);
  } else if (enemy._movePattern === 'diagonal') {
    // DIAGONAL: 横跨65-80%屏宽
    const span = BW * (0.65 + (h % 15) * 0.01);
    enemy._moveTargetX = BATTLE_SAFE_X.normalMin + (dir > 0 ? span + BW*0.10 : BW*0.90 - span);
    enemy._moveTargetY = enemy.y + 80 + (h % 60);
  } else {
    // ARC: sin弧线, 横跨65-80%, arcHeight 180-260px
    const span = BW * (0.65 + (h % 15) * 0.01);
    enemy._moveTargetX = BATTLE_SAFE_X.normalMin + (dir > 0 ? span + BW*0.10 : BW*0.90 - span);
    enemy._moveTargetY = enemy.y + 80 + (h % 50);
    enemy._moveArcHeight = 180 + (h % 80); // V0812025: arcHeight variation
  }
  enemy._movePhase = 0; // 新段相位重置
}

export function updateMovementPattern(enemy: Enemy, dt: number): boolean {
  if (!enemy.alive) return false;
  if (enemy.entryPhase?.active) return false;

  const dur = enemy._moveDur ?? 1.1;
  enemy._movePhase = (enemy._movePhase ?? 0) + dt;
  let t = Math.min(enemy._movePhase / dur, 1.0);
  t = t * t * (3 - 2 * t); // smoothstep

  const sx = enemy._moveStartX ?? enemy.x, sy = enemy._moveStartY ?? enemy.y;
  const tx = enemy._moveTargetX ?? enemy.x, ty = enemy._moveTargetY ?? enemy.y;

  // 线性横向插值 → 保持匀速
  if (enemy._movePattern !== 'spiral') {
    enemy.x = sx + (tx - sx) * t;
  }

  if (enemy._movePattern === 'spiral') {
    // SPIRAL: 旋转中心匀速下降, 半径从140收缩到70, 圈数1.1-1.4
    const rotations = enemy._moveArcHeight ?? 1.25;
    const angle = Math.PI * 2 * rotations * t;
    const r = 140 * (1 - t) + 70 * t; // 140→70
    const cx = enemy._moveStartX ?? enemy.x;
    const cy = sy + ((enemy._moveTargetY ?? sy + 120) - sy) * t;
    enemy.x = cx + Math.cos(angle) * r;
    enemy.y = cy + Math.sin(angle) * r;
  } else if (enemy._movePattern === 'diagonal') {
    enemy.y = sy + (ty - sy) * t;
  } else if (enemy._movePattern === 's_curve') {
    // S_CURVE: 横向sin(2π×2×t)形成两个完整转向弯
    const baseY = sy + (ty - sy) * t;
    enemy.y = baseY - (enemy._moveArcHeight ?? 100) * Math.sin(Math.PI * 4 * t);
  } else {
    // ARC: sin弧, 上升后下降
    const baseY = sy + (ty - sy) * t;
    enemy.y = baseY - (enemy._moveArcHeight ?? 200) * Math.sin(Math.PI * t);
  }

  // Clamp
  enemy.x = Math.max(BATTLE_SAFE_X.normalMin, Math.min(BATTLE_SAFE_X.normalMax, enemy.x));
  enemy.y = Math.min(BATTLEFIELD_ZONES.defenseLineY - 20, enemy.y);

  if (t >= 1.0) {
    // 完成一段: 翻转方向, 继续下一段
    enemy._moveDir = -(enemy._moveDir ?? 1);
    _nextMove(enemy, (hash(enemy) + Math.floor(enemy._moveDir * 100)) % 100000);
  }

  return true; // 完全接管移动, 禁止baseMove
}
