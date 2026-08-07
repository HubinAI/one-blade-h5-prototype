/**
 * 0807-11D-2 导演不变量收口与纵向通解修正
 *
 * D=125, HP: trash=100(0.80D), tough=170(1.36D), wall=260(2.08D)
 * 总量 164: trash=84, tough=68, wall=12 (P1=36, P2=56, P3=72)
 * P1=64(5beats,all trash) P2=56(5beats,32+24) P3=72(6beats,16+44+12)
 */

import { BATTLEFIELD_ZONES, BATTLE_SAFE_X } from '../config/balance';
import { randomRange } from '../../utils/math';

const P3_ENTRY_Y_MIN = BATTLEFIELD_ZONES.midfieldStartY + 35; // 385
const P3_ENTRY_Y_MAX = BATTLEFIELD_ZONES.harvestEndY - 70;     // 630

// ═══════════════════ 类型 ═══════════════════

export type DirectorPhase = 'P1' | 'P2' | 'P3';
export type HpTier = 'trash' | 'tough' | 'elite_wall';
export type FormationId = string;

export interface SpawnItem {
  x: number; y: number;
  speedMul: number;
  hpTier: HpTier; hpOverride: number;
  formationId: FormationId;
  entryTargetX: number; entryEndYOverride: number;
  directorPhase: DirectorPhase;
  directorBeatId: string; directorMicroBatchId: string;
  /** 0807-11D-3: 影化锚点 */
  anchorId: string; anchorX: number; anchorY: number;
  skipShadow: boolean;
  /** 0807-11D-4A: 放置模式 */
  placementMode?: 'clustered' | 'special';
  /** 0807-11D-6B: P3原地凝实 */
  spawnInPlace?: boolean;
  /** 0807-11D-6D: 敌人类型 (默认infantry) */
  enemyKind?: string;
}

export interface DirectorSpawnRequest {
  phase: DirectorPhase;
  items: SpawnItem[];
  /** 桥接微批次：标记该微批次已被消费，到期不得重复生成 */
  consumedMicroBatchId?: string;
  /** 0807-11D-6C-1: 脉冲延迟(ms) */
  pulseDelayMs?: number;
}

export interface DirectorDebugInfo {
  phase: string; beat: string;
  generated: number; total: number;
  aliveTrash: number; aliveTough: number; aliveWall: number;
  beatSpawned: number; beatApproaching: number; beatCombatReady: number; beatAlive: number;
  approachingCount: number; combatReadyCount: number; pendingCount: number;
  notBeforeRemaining: number; microDelayRemaining: number;
  nextState: string; formationId: string;
  phaseElapsed: number;
}

// ═══════════════════ 区域判定 ═══════════════════

export function isInCombatZone(y: number): boolean {
  return y >= BATTLEFIELD_ZONES.midfieldStartY && y <= BATTLEFIELD_ZONES.harvestEndY;
}
export function isApproaching(y: number): boolean {
  return y >= -30 && y < BATTLEFIELD_ZONES.midfieldStartY;
}

/** 0807-11D-3: 统一不可战斗判定 */
export function isEnemyCombatTargetable(enemy: { _directorEntryState?: string; alive?: boolean; _fuseState?: string }): boolean {
  if (!enemy.alive) return false;
  if ((enemy as any)._fuseState === 'arming') return false; // 0807-11D-6F-5
  const s = enemy._directorEntryState;
  if (!s) return true;
  return s === 'active';
}

/** 0807-11D-3A: ease-out quad */
export function easeOutQuad(t: number): number {
  const p = Math.max(0, Math.min(1, t));
  return 1 - (1 - p) * (1 - p);
}

/** 0807-11D-3D: 惯性衰减曲线 p = 1.5t - 0.5t³ */
export function inertiaEase(t: number): number {
  const p = Math.max(0, Math.min(1, t));
  return 1.5 * p - 0.5 * p * p * p;
}

/** 影化状态判定（不可战斗） */
export function isShadowState(enemy: { _directorEntryState?: string }): boolean {
  const s = enemy._directorEntryState;
  return s === 'shadow_move' || s === 'materializing';
}

// ═══════════════════ 集结锚点配置 ═══════════════════

export interface AnchorConfig {
  id: string;
  x: number;
  y: number;
}

/** 集结锚点Y: midfieldStartY 上方约 30px */
const ANCHOR_Y = BATTLEFIELD_ZONES.midfieldStartY - 30;

export const ANCHORS: Record<string, AnchorConfig> = {
  center:       { id: 'center',       x: BATTLE_SAFE_X.normalMin + (BATTLE_SAFE_X.normalMax - BATTLE_SAFE_X.normalMin) / 2, y: ANCHOR_Y },
  left_center:  { id: 'left_center',  x: BATTLE_SAFE_X.normalMin + 60,  y: ANCHOR_Y },
  right_center: { id: 'right_center', x: BATTLE_SAFE_X.normalMax - 60,  y: ANCHOR_Y },
};

/** 每个formation的锚点映射 */
export const FORMATION_ANCHORS: Record<string, string> = {
  front_wide:       'center',
  back_wide:        'center',
  left_high_diag:   'left_center',
  right_low_diag:   'left_center',
  right_high_diag:  'right_center',
  left_low_diag:    'right_center',
  left_front:       'left_center',
  right_back:       'right_center',
  center_expand:    'center',
  left_expand:      'center',
  right_expand:     'center',
  left_slant_back:  'left_center',
  right_slant_back: 'right_center',
  front_tough:      'center',
  scattered_walls:  'center',
};

// ═══════════════════ 0807-11D-3E: 阵型错列偏移 ═══════════════════

type FormationCategory = 'broad' | 'slant' | 'dual';

const FORMATION_CATEGORY: Record<string, FormationCategory> = {
  front_wide: 'broad', back_wide: 'broad', center_expand: 'broad',
  left_expand: 'broad', right_expand: 'broad',
  left_high_diag: 'slant', left_low_diag: 'slant', right_high_diag: 'slant', right_low_diag: 'slant',
  left_slant_back: 'slant', right_slant_back: 'slant',
  left_front: 'dual', right_back: 'dual', front_tough: 'dual', scattered_walls: 'dual',
};

/** 确定性哈希: beatId+mbIdx → 数值 */
function formationSeed(beatId: string, mbIdx: number): number {
  let h = 0;
  for (let i = 0; i < beatId.length; i++) h = (h * 31 + beatId.charCodeAt(i)) | 0;
  return ((h * 17 + mbIdx) | 0) >>> 0;
}

// ═══ 0807-11D-4A: 确定性PRNG (Mulberry32) ═══
function mulberry32(a: number): () => number {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ═══ 4A 阵位构建 ═══
export interface PlacementResult { x: number; y: number; }

/** 统一的微批次阵位生成 */
export function buildMicroBatchPlacements(
  mb: MicroBatch, phase: string, beatId: string, mbIdx: number, placementSeed: number,
): PlacementResult[] {
  const mode = mb.placementMode || inferPlacementMode(beatId, mbIdx);
  const seed = ((placementSeed * 31 + hashStr(beatId) * 7 + mbIdx) | 0) >>> 0;
  const rng = mulberry32(seed);
  const rand = (min: number, max: number) => min + rng() * (max - min);

  if (mode === 'clustered') {
    return buildClustered(mb, phase, rng, rand);
  }
  return buildSpecial(mb, rng, rand);
}

function hashStr(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

function inferPlacementMode(beatId: string, mbIdx: number): 'clustered' | 'special' {
  // 80% clustered, 20% special (beatId+mbIdx→确定性)
  const h = (hashStr(beatId) * 13 + mbIdx) & 0xff;
  return h < 204 ? 'clustered' : 'special';
}

/** 咬定至安全区 */
function clampToSafeX(x: number): number {
  return Math.max(BATTLE_SAFE_X.normalMin + 8, Math.min(BATTLE_SAFE_X.normalMax - 8, x));
}

/** 根据 formation + spawnOrder 生成确定性偏移 */
export function getFormationOffset(
  formationId: string, beatId: string, mbIdx: number, spawnOrder: number, count: number,
): { dx: number; dy: number } {
  const cat = FORMATION_CATEGORY[formationId] || 'broad';
  const seed = formationSeed(beatId, mbIdx);
  // 确定性伪随机: seed→[0,1)
  const prng = (i: number) => { const s = ((seed + i * 2654435761) | 0) >>> 0; return (s % 10000) / 10000; };

  if (cat === 'broad') {
    // 横幕: 2-3 纵深层, Y跨度 ~28-36px
    const layerPattern = spawnOrder < 2 ? -14 : spawnOrder < 5 ? 0 : 14;
    const layerJitter = Math.floor(prng(spawnOrder) * 6) - 3; // ±3px
    const dy = layerPattern + layerJitter;
    const dx = Math.floor(prng(spawnOrder + 100) * 14) - 7; // ±7px
    return { dx, dy };
  }

  if (cat === 'slant') {
    // 斜幕: 保持主方向, 轻微错落
    const dy = Math.floor(prng(spawnOrder) * 16) - 8; // ±8px
    const dx = Math.floor(prng(spawnOrder + 100) * 12) - 6; // ±6px
    return { dx, dy };
  }

  // dual: 前后双层/左右双团 — 组内错列
  const groupIdx = Math.floor(spawnOrder / 3);
  const groupDy = (groupIdx % 2 === 0) ? -8 : 8;
  const withinDy = Math.floor(prng(spawnOrder) * 6) - 3;
  const dy = groupDy + withinDy;
  const dx = Math.floor(prng(spawnOrder + 100) * 16) - 8; // ±8px
  return { dx, dy };
}

// 入场时长常量 (秒) — 0807-11D-3F: 按距离统一速度
export const SHADOW_MOVE_DURATION = 0.85;   // 默认 (回退)
export const SHADOW_SPEED_REF = 500;        // px/s 参考速度
export const SHADOW_MOVE_DURATION_MIN = 0.90;
export const SHADOW_MOVE_DURATION_MAX = 1.10;
export const MATERIALIZE_DURATION = 0.15;   // 凝实
/** 确定性错峰 (ms) — 按 spawnOrder 循环 */
export const SHADOW_STAGGER_MS = [0, 40, 80];

// ═══════════════════ HP 配置 ═══════════════════

export const HP_TIERS: Record<HpTier, { hp: number; hpMul: number; scale: number; ringWidth: number }> = {
  trash:      { hp: 100, hpMul: 1.33, scale: 1.00, ringWidth: 1.0 },
  tough:      { hp: 170, hpMul: 2.27, scale: 1.06, ringWidth: 1.4 },
  elite_wall: { hp: 260, hpMul: 3.47, scale: 1.11, ringWidth: 2.0 },
};
export const STANDARD_SLASH_DAMAGE = 125;

/** 由 HP 反推 hpTier (仅用于敌人受伤前) */
export function hpToTier(hp: number): HpTier {
  if (hp >= 220) return 'elite_wall';
  if (hp >= 136) return 'tough';
  return 'trash';
}

// ═══════════════════ 队形常量 ═══════════════════

/** 站位高度 */
const BACK_ROW   = { min: 350, max: 390 };
const MID_ROW    = { min: 420, max: 460 };
const FRONT_ROW  = { min: 500, max: 540 };

/** X 锚点 */
const X_WIDE   = [BATTLE_SAFE_X.normalMin, BATTLE_SAFE_X.normalMax] as [number, number];
const X_LEFT   = [BATTLE_SAFE_X.normalMin, 200] as [number, number];
const X_RIGHT  = [200, BATTLE_SAFE_X.normalMax] as [number, number];
const X_CENTER = [130, 270] as [number, number];

function rowEndY(row: 'back' | 'mid' | 'front', jitter = true): number {
  const r = row === 'back' ? BACK_ROW : row === 'mid' ? MID_ROW : FRONT_ROW;
  return jitter ? r.min + Math.random() * (r.max - r.min) : (r.min + r.max) / 2;
}

// ═══ 0807-11D-4A: 聚团与特殊阵位 ═══

function clampedX(x: number): number { return Math.max(BATTLE_SAFE_X.normalMin + 6, Math.min(BATTLE_SAFE_X.normalMax - 6, Math.round(x))); }

function phaseYConfig(phase: string, rng: () => number) {
  const top = BATTLEFIELD_ZONES.midfieldStartY + 16;
  const bottom = BATTLEFIELD_ZONES.harvestEndY - 24;
  const totalH = bottom - top;
  if (phase === 'P1') return { top, bottom, range: totalH * 0.35, centerY: top + totalH * 0.25 };
  if (phase === 'P2') return { top, bottom, range: totalH * 0.50, centerY: top + totalH * 0.35 };
  return { top, bottom, range: totalH * 0.70, centerY: top + totalH * 0.40,
    farWeight: 0.25, midWeight: 0.40, nearWeight: 0.35 };
}

function buildClustered(mb: MicroBatch, phase: string, rng: () => number, rand: (a: number, b: number) => number): PlacementResult[] {
  const count = mb.count;
  const yConf = phaseYConfig(phase, rng);
  const clusterCount = count <= 6 ? 2 : count <= 10 ? 3 : 4;
  const MIN_DIST = 36;  // 聚团内最小中心距
  const MAX_RETRY = 10;
  const CENTER_MIN_DIST = 60;
  const MAX_ATTEMPTS = 20;
  // 生成聚团中心
  const clusterCenters: { cx: number; cy: number }[] = [];
  for (let ci = 0; ci < clusterCount; ci++) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const cx = rand(mb.xRange[0] + 16, mb.xRange[1] - 16);
      const cy = rand(yConf.top, yConf.top + yConf.range);
      let ok = true;
      for (const c of clusterCenters) { if (Math.hypot(cx - c.cx, cy - c.cy) < CENTER_MIN_DIST) { ok = false; break; } }
      if (ok) { clusterCenters.push({ cx, cy }); break; }
    }
    if (clusterCenters.length <= ci) {
      clusterCenters.push({ cx: rand(mb.xRange[0] + 24, mb.xRange[1] - 24), cy: yConf.top + 50 + ci * (yConf.range - 50) / clusterCount });
    }
  }
  // 分配敌人：每个位置检查最小间距
  const results: PlacementResult[] = [];
  const perCluster = Math.floor(count / clusterCount);
  const extra = count % clusterCount;
  for (let ci = 0; ci < clusterCount; ci++) {
    const n = perCluster + (ci < extra ? 1 : 0);
    const c = clusterCenters[ci];
    for (let j = 0; j < n; j++) {
      let placed = false;
      for (let retry = 0; retry < MAX_RETRY; retry++) {
        const dx = rand(-16, 16);
        const dy = rand(-22, 22);
        const x = clampedX(c.cx + dx);
        const y = Math.max(yConf.top, Math.min(yConf.top + yConf.range, Math.round(c.cy + dy)));
        // 检查与本批次已放置敌人的间距
        let tooClose = false;
        for (const p of results) { if (Math.hypot(x - p.x, y - p.y) < MIN_DIST) { tooClose = true; break; } }
        if (!tooClose) { results.push({ x, y }); placed = true; break; }
      }
      if (!placed) {
        // 安全回退: 环形偏移
        const angle = (j / n) * Math.PI * 2;
        const x = clampedX(c.cx + Math.cos(angle) * MIN_DIST);
        const y = Math.max(yConf.top, Math.min(yConf.top + yConf.range, Math.round(c.cy + Math.sin(angle) * MIN_DIST)));
        results.push({ x, y });
      }
    }
  }
  return results;
}

function buildSpecial(mb: MicroBatch, rng: () => number, rand: (a: number, b: number) => number): PlacementResult[] {
  const count = mb.count;
  const cat = FORMATION_CATEGORY[mb.formationId] || 'broad';
  const xSpan = mb.xRange[1] - mb.xRange[0];
  const results: PlacementResult[] = [];

  if (cat === 'broad') {
    // 横排/宽幕: 2-3浅层
    for (let i = 0; i < count; i++) {
      const baseX = mb.xRange[0] + xSpan * (i + 0.5) / count;
      const layerDY = i < 2 ? -12 : i < Math.ceil(count * 0.6) ? 0 : 12;
      const y = (mb.row === 'back' ? (BACK_ROW.min + BACK_ROW.max) / 2 : mb.row === 'mid' ? (MID_ROW.min + MID_ROW.max) / 2 : (FRONT_ROW.min + FRONT_ROW.max) / 2) + layerDY;
      const dx = rand(-6, 6);
      const dy = rand(-4, 4);
      results.push({ x: clampedX(baseX + dx), y: Math.round(y + dy) });
    }
  } else if (cat === 'slant') {
    // 斜幕: 保持左高右低或右高左低
    const isRightHigh = mb.formationId.includes('right');
    const yBase = (mb.row === 'back' ? (BACK_ROW.min + BACK_ROW.max) / 2 : mb.row === 'mid' ? (MID_ROW.min + MID_ROW.max) / 2 : (FRONT_ROW.min + FRONT_ROW.max) / 2);
    const ySpan = 36; // 总Y倾斜
    for (let i = 0; i < count; i++) {
      const baseX = mb.xRange[0] + xSpan * (i + 0.5) / count;
      const slantY = yBase + (isRightHigh ? -1 : 1) * (i / (count - 1 || 1) - 0.5) * ySpan;
      const dx = rand(-5, 5);
      const dy = rand(-4, 4);
      results.push({ x: clampedX(baseX + dx), y: Math.round(slantY + dy) });
    }
  } else {
    // dual: 前后双层/左右双团
    const mid = Math.floor(count / 2);
    const yBack = (BACK_ROW.min + BACK_ROW.max) / 2;
    const yFront = (FRONT_ROW.min + FRONT_ROW.max) / 2;
    for (let i = 0; i < count; i++) {
      const isBackGroup = i < mid;
      const groupXCenter = mb.xRange[0] + xSpan * (isBackGroup ? 0.25 : 0.75);
      const localI = isBackGroup ? i : i - mid;
      const localN = isBackGroup ? mid : count - mid;
      const baseX = groupXCenter + (localI - (localN - 1) / 2) * (xSpan * 0.3 / Math.max(1, localN - 1));
      const y = isBackGroup ? yBack : yFront;
      const dx = rand(-6, 6);
      const dy = rand(-5, 5);
      results.push({ x: clampedX(baseX + dx), y: Math.round(y + dy) });
    }
  }
  return results;
}

// ═══════════════════ 微批次配置 ═══════════════════

interface MicroBatch {
  count: number;
  tiers: [HpTier, number][];
  formationId: FormationId;
  xRange: [number, number];
  row: 'back' | 'mid' | 'front';
  internalDelay: number;
  speedBonus: number;
  /** 0807-11D-4A: 放置模式 */
  placementMode?: 'clustered' | 'special';
  /** 0807-11D-6C: 快速点刷 */
  rapidPulse?: true;
  /** 0807-11D-6D: 分裂兵数量(从tough中替换) */
  splitters?: number;
  /** 0807-11D-6F: 火药兵数量(从tough中替换) */
  powders?: number;
}

interface DirectorBeat {
  id: string;
  phase: DirectorPhase;
  notBeforeMs: number;
  microBatches: MicroBatch[];
}

// ═══════════════════ P1 P2 P3 节拍配置 ═══════════════════

const BEATS: DirectorBeat[] = [
  // ═══ P1: 3节拍 36全杂兵（0807-11D-6A）═══
  {
    id: 'P1-1', phase: 'P1', notBeforeMs: 0,
    microBatches: [
      { count: 6, tiers: [['trash',6]], formationId: 'front_wide',  xRange: X_WIDE,  row: 'front', internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',6]], formationId: 'front_wide',  xRange: X_WIDE,  row: 'front', internalDelay: 0.30, speedBonus: 0 },
    ],
  },
  {
    id: 'P1-2', phase: 'P1', notBeforeMs: 1600,
    microBatches: [
      { count: 6, tiers: [['trash',6]], formationId: 'left_front',  xRange: X_LEFT,  row: 'mid',   internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',6]], formationId: 'right_back',  xRange: X_RIGHT, row: 'mid',   internalDelay: 0.32, speedBonus: 0 },
    ],
  },
  {
    id: 'P1-3', phase: 'P1', notBeforeMs: 3200,
    microBatches: [
      { count: 6, tiers: [['trash',6]], formationId: 'back_wide',   xRange: X_WIDE,  row: 'back',  internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',6]], formationId: 'front_wide',  xRange: X_WIDE,  row: 'front', internalDelay: 0.30, speedBonus: 0 },
    ],
  },

  // ═══ P2: 5节拍 56 (32杂+24韧) ═══
  {
    id: 'P2-1', phase: 'P2', notBeforeMs: 0,
    microBatches: [
      { count: 6, tiers: [['trash',6]],           formationId: 'left_front',     xRange: X_LEFT,  row: 'front', internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',6]],           formationId: 'right_back',     xRange: X_RIGHT, row: 'back',  internalDelay: 0.35, speedBonus: 0 },
    ],
  },
  {
    id: 'P2-2', phase: 'P2', notBeforeMs: 2400,
    microBatches: [
      { count: 5, tiers: [['trash',4],['tough',1]], formationId: 'left_high_diag', xRange: X_LEFT,  row: 'front', internalDelay: 0,    speedBonus: 0, powders: 1 },
      { count: 4, tiers: [['trash',3],['tough',1]], formationId: 'right_low_diag', xRange: X_RIGHT, row: 'back',  internalDelay: 0.30, speedBonus: 0 },
    ],
  },
  {
    id: 'P2-3', phase: 'P2', notBeforeMs: 4800,
    microBatches: [
      { count: 5, tiers: [['trash',3],['tough',2]], formationId: 'right_high_diag', xRange: X_RIGHT, row: 'front', internalDelay: 0,    speedBonus: 0, powders: 1 },
      { count: 4, tiers: [['trash',2],['tough',2]], formationId: 'left_low_diag',   xRange: X_LEFT,  row: 'back',  internalDelay: 0.32, speedBonus: 0 },
    ],
  },
  {
    id: 'P2-4', phase: 'P2', notBeforeMs: 7200,
    microBatches: [
      { count: 6, tiers: [['trash',4],['tough',2]], formationId: 'center_expand',  xRange: X_CENTER, row: 'mid',   internalDelay: 0,    speedBonus: 0 },
      { count: 4, tiers: [['trash',2],['tough',2]], formationId: 'left_expand',    xRange: X_LEFT,   row: 'mid',   internalDelay: 0.28, speedBonus: 0 },
      { count: 4, tiers: [['trash',2],['tough',2]], formationId: 'right_expand',   xRange: X_RIGHT,  row: 'mid',   internalDelay: 0,    speedBonus: 0 },
    ],
  },
  {
    id: 'P2-5', phase: 'P2', notBeforeMs: 9600,
    microBatches: [
      { count: 6, tiers: [['trash',0],['tough',6]], formationId: 'front_wide',  xRange: X_WIDE, row: 'front', internalDelay: 0,    speedBonus: 0, powders: 1 },
      { count: 6, tiers: [['trash',0],['tough',6]], formationId: 'back_wide',   xRange: X_WIDE, row: 'back',  internalDelay: 0.30, speedBonus: 0 },
    ],
  },

  // ═══ P3: 6节拍 72 (16杂+44韧+12压阵) ═══
  {
    id: 'P3-1', phase: 'P3', notBeforeMs: 0,
    microBatches: [
      { count: 6, tiers: [['trash',3],['tough',3]],           formationId: 'front_wide',   xRange: X_WIDE,  row: 'front', internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',3],['tough',3]],           formationId: 'back_wide',    xRange: X_WIDE,  row: 'back',  internalDelay: 0.30, speedBonus: 0, rapidPulse: true },
    ],
  },
  {
    id: 'P3-2', phase: 'P3', notBeforeMs: 2400,
    microBatches: [
      { count: 6, tiers: [['trash',2],['tough',4]],           formationId: 'left_front',   xRange: X_LEFT,  row: 'front', internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',1],['tough',5]],           formationId: 'right_back',   xRange: X_RIGHT, row: 'back',  internalDelay: 0.32, speedBonus: 0, rapidPulse: true },
    ],
  },
  {
    id: 'P3-3', phase: 'P3', notBeforeMs: 4800,
    microBatches: [
      { count: 6, tiers: [['trash',1],['tough',5]],           formationId: 'right_front',  xRange: X_RIGHT, row: 'front', internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',1],['tough',4],['elite_wall',1]], formationId: 'left_back', xRange: X_LEFT, row: 'back', internalDelay: 0.30, speedBonus: 0, rapidPulse: true, splitters: 1 },
    ],
  },
  {
    id: 'P3-4', phase: 'P3', notBeforeMs: 7200,
    microBatches: [
      { count: 6, tiers: [['trash',1],['tough',3],['elite_wall',2]], formationId: 'left_slant_back', xRange: X_LEFT,  row: 'back', internalDelay: 0, speedBonus: 0 },
      { count: 6, tiers: [['trash',0],['tough',4],['elite_wall',2]], formationId: 'front_tough',     xRange: X_WIDE,  row: 'front', internalDelay: 0.28, speedBonus: 0.06, rapidPulse: true },
    ],
  },
  {
    id: 'P3-5', phase: 'P3', notBeforeMs: 9600,
    microBatches: [
      { count: 6, tiers: [['trash',1],['tough',3],['elite_wall',2]], formationId: 'right_slant_back', xRange: X_RIGHT, row: 'back',  internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',0],['tough',4],['elite_wall',2]], formationId: 'scattered_walls',  xRange: X_WIDE,  row: 'mid',   internalDelay: 0.30, speedBonus: 0, rapidPulse: true, splitters: 1 },
    ],
  },
  {
    id: 'P3-6', phase: 'P3', notBeforeMs: 12000,
    microBatches: [
      { count: 6, tiers: [['trash',2],['tough',3],['elite_wall',1]], formationId: 'front_wide',   xRange: X_WIDE, row: 'front', internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',1],['tough',3],['elite_wall',2]], formationId: 'back_wide',    xRange: X_WIDE, row: 'back',  internalDelay: 0.28, speedBonus: 0, rapidPulse: true },
    ],
  },
];

// ═══════════════════ 阶段配置 ═══════════════════

interface PhaseConfig {
  phase: DirectorPhase;
  totalEnemies: number;
  speedMul: number;
  targetOnScreen: [number, number];
  hardCap: number;
  approachCap: number;
}

const PHASES: Record<DirectorPhase, PhaseConfig> = {
  P1: { phase:'P1', totalEnemies:36, speedMul:1.00, targetOnScreen:[10,14], hardCap:16, approachCap:12 },
  P2: { phase:'P2', totalEnemies:56, speedMul:1.12, targetOnScreen:[14,18], hardCap:20, approachCap:14 },
  P3: { phase:'P3', totalEnemies:72, speedMul:1.25, targetOnScreen:[18,22], hardCap:24, approachCap:16 },
};

// ═══════════════════ 常量 ═══════════════════

const PHASE_GAP_SEC = 0.30;
const FINAL_AFTERGLOW_SEC = 0.28;
const BRIDGE_EARLY_SEC = 0.25;  // 桥接: 提前25~350ms释放
const BRIDGE_EARLY_JITTER = 0.10;

// ═══════════════════ 导演类 ═══════════════════

export class PostEdictDirector {
  readonly beats = BEATS;
  readonly phases = PHASES;

  private _active = false;
  private _allComplete = false;

  private _beatIndex = 0;
  private _microBatchIndex = 0;
  private _phaseGenerated = 0;
  private _phaseBridgeCount = 0;

  // 计时
  private _phaseElapsed = 0;
  private _phaseStartMs = 0;
  private _lastMbTime = 0;        // 上一微批次生成时间(ms)
  private _phaseGapTimer = 0;
  private _finalAfterglowTimer = 0;
  private _lastBurstAssistMs = 0; // 0807-11D-5A: 最近辅助刷新时间
  // 桥接
  private _bridgeMicroBatchId: string | null = null;  // 被桥接消费的微批次 ID
  private _bridgeBeatIdx = -1;

  /** 0807-11D-4A: 阵位种子 (局内唯一, start时生成) */
  private _placementSeed = 0;

  private _nextState = 'READY';
  private _lastReason = '';
  private _currentFormationId = '';
  // ═══ 公开方法 ═══

  reset(): void {
    this._active = false; this._allComplete = false;
    this._beatIndex = 0; this._microBatchIndex = 0;
    this._phaseGenerated = 0; this._phaseBridgeCount = 0;
    this._phaseElapsed = 0; this._phaseStartMs = 0; this._lastMbTime = 0;
    this._lastBurstAssistMs = 0; // 0807-11D-5A-Final
    this._phaseGapTimer = 0; this._finalAfterglowTimer = 0;
    this._bridgeMicroBatchId = null; this._bridgeBeatIdx = -1;
    this._nextState = 'READY'; this._lastReason = ''; this._currentFormationId = '';
  }

  start(seed?: number): void {
    this.reset();
    this._placementSeed = seed ?? (Math.floor(Date.now() / 1000) % 100000) ^ (Math.floor(Math.random() * 65536));
    this._active = true;
    this._lastReason = 'start';
  }

  get placementSeed(): number { return this._placementSeed; }

  get active(): boolean { return this._active; }
  get allComplete(): boolean { return this._allComplete; }
  get isRunning(): boolean { return this._active && !this._allComplete; }

  get currentPhase(): DirectorPhase | null {
    if (!this._active || this._beatIndex >= this.beats.length) return null;
    return this.beats[this._beatIndex].phase;
  }
  get currentBeatId(): string {
    if (!this._active || this._beatIndex >= this.beats.length) return '-';
    return this.beats[this._beatIndex].id;
  }
  setPhaseStartMs(ms: number): void { this._phaseStartMs = ms; }

  canSpawnElite(): boolean { return this._allComplete && this._finalAfterglowTimer >= FINAL_AFTERGLOW_SEC; }

  /**
   * 每帧 tick
   */
  tick(
    dt: number,
    aliveInZone: number, aliveTotal: number,
    approachingCount: number, subSpawnQueueLength: number,
    elapsedMs: number,
    // Per-beat 统计
    beatSpawned: number, beatApproaching: number, beatCombatReady: number, beatAlive: number,
    /** 0807-11D-5A: 满势辅助刷新 */
    burstAssist = false, combatReadyCount = 0,
  ): DirectorSpawnRequest[] {
    if (!this._active) { this._lastReason = 'inactive'; return []; }

    this._phaseElapsed += dt;

    if (this._allComplete) { this._finalAfterglowTimer += dt; return []; }

    // 所有节拍完成 → afterglow
    if (this._beatIndex >= this.beats.length) {
      this._finalAfterglowTimer += dt;
      if (this._finalAfterglowTimer >= FINAL_AFTERGLOW_SEC) {
        this._active = false; this._allComplete = true; this._lastReason = 'all_beats_done';
      }
      return [];
    }

    const beat = this.beats[this._beatIndex];
    const phase = this.phases[beat.phase];

    // 阶段完成
    if (this._phaseGenerated >= phase.totalEnemies) {
      if (aliveTotal === 0 && subSpawnQueueLength === 0) {
        this._phaseGapTimer += dt;
        if (this._phaseGapTimer >= PHASE_GAP_SEC) {
          this._advanceToNextPhase(); this._lastReason = `phase_${phase.phase}_cleared`;
        }
      }
      return [];
    }

    // 当前节拍完成 → 尝试推进
    if (this._microBatchIndex >= beat.microBatches.length) {
      return this._tryAdvanceBeat(
        dt, beat, phase, elapsedMs,
        aliveInZone, aliveTotal, approachingCount, subSpawnQueueLength,
        beatSpawned, beatApproaching, beatCombatReady, beatAlive,
      );
    }

    // 0807-11D-5A: burst辅助提前释放微批次
    if (burstAssist && this._microBatchIndex < beat.microBatches.length) {
      const burstFloor = beat.phase === 'P1' ? 6 : beat.phase === 'P2' ? 8 : 10;
      if (combatReadyCount < burstFloor && (elapsedMs - this._lastBurstAssistMs) >= 450) {
        const assistMb = beat.microBatches[this._microBatchIndex];
        if (aliveTotal + subSpawnQueueLength + assistMb.count <= phase.hardCap) {
          this._lastBurstAssistMs = elapsedMs;
          this._lastReason = `burst_assist_${beat.id}_mb${this._microBatchIndex}`;
          return this._spawnMicroBatch(beat, phase, elapsedMs);
        }
      }
    }

    // notBefore
    const phaseElapsedMs = elapsedMs - this._phaseStartMs;
    if (phaseElapsedMs < beat.notBeforeMs) {
      this._nextState = 'WAIT_TIME';
      return this._tryBridge(beat, phase, elapsedMs, aliveInZone, aliveTotal, approachingCount, subSpawnQueueLength);
    }

    // internalDelay: 微批次间距
    const mb = beat.microBatches[this._microBatchIndex];
    if (this._microBatchIndex > 0) {
      const mbElapsed = elapsedMs - this._lastMbTime;
      if (mbElapsed < mb.internalDelay * 1000) { this._nextState = 'WAIT_INTERNAL'; return []; }
    }

    // 硬上限
    if (aliveTotal + subSpawnQueueLength >= phase.hardCap) { this._nextState = 'WAIT_CAP'; return []; }
    // 接近区容量
    if (approachingCount + subSpawnQueueLength >= phase.approachCap) { this._nextState = 'WAIT_APPROACH'; return []; }

    // 生成微批次
    return this._spawnMicroBatch(beat, phase, elapsedMs);
  }

  // ═══ 内部方法 ═══

  /** 0807-11D-6C: rapidPulse拆分 */
  private _spawnRapidPulseBatch(mb: MicroBatch, beat: DirectorBeat, phase: PhaseConfig, elapsedMs: number): DirectorSpawnRequest[] {
    const mbId = `${beat.id}_mb${this._microBatchIndex}`;
    this._microBatchIndex += 1; this._lastMbTime = elapsedMs; this._nextState = 'SPAWN';
    // 按1~3拆成脉冲
    const pulses: number[] = [];
    let remaining = mb.count;
    while (remaining > 0) {
      const n = Math.min(1 + Math.floor(Math.random() * 3), remaining);
      pulses.push(n); remaining -= n;
    }
    // 构建tier池, 分裂兵替换tough
    const tierPool: HpTier[] = [];
    let splitterPool = mb.splitters ?? 0;
    for (const [tier, n] of mb.tiers) {
      for (let i = 0; i < n; i++) {
        if (tier === 'tough' && splitterPool > 0) { splitterPool--; tierPool.push('splitter' as any); }
        else tierPool.push(tier);
      }
    }
    for (let i = tierPool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tierPool[i], tierPool[j]] = [tierPool[j], tierPool[i]]; }
    let poolIdx = 0;
    let pulseDelayAccum = 0;
    const results: DirectorSpawnRequest[] = [];
    for (const pc of pulses) {
      const items: SpawnItem[] = [];
      for (let k = 0; k < pc; k++) {
        const tier = tierPool[poolIdx++ % tierPool.length];
        const x = mb.xRange[0] + Math.random() * (mb.xRange[1] - mb.xRange[0]);
        const y = P3_ENTRY_Y_MIN + Math.random() * (P3_ENTRY_Y_MAX - P3_ENTRY_Y_MIN);
        const enemyKind = (tier as string) === 'splitter' ? 'splitter' : 'infantry';
        items.push({
          x: Math.round(x + (Math.random() - 0.5) * 6), y: y - 20,
          speedMul: phase.speedMul + mb.speedBonus,
          hpTier: (tier as string) === 'splitter' ? ('tough' as HpTier) : tier,
          hpOverride: (tier as string) === 'splitter' ? HP_TIERS.tough.hp : HP_TIERS[tier].hp,
          formationId: mb.formationId,
          entryTargetX: Math.round(x), entryEndYOverride: Math.round(y),
          directorPhase: beat.phase, directorBeatId: mbId, directorMicroBatchId: `${mbId}_p${Math.round(pulseDelayAccum)}`,
          anchorId: mbId, anchorX: x, anchorY: y,
          skipShadow: false, spawnInPlace: true, enemyKind,
        });
      }
      this._phaseGenerated += items.length;
      const delayMs = pulseDelayAccum > 0 ? pulseDelayAccum : 0;
      results.push({ phase: beat.phase, items, pulseDelayMs: delayMs > 0 ? delayMs : undefined });
      pulseDelayAccum += (0.18 + Math.random() * 0.10) * 1000;
    }
    this._lastReason = `rapidPulse_${mbId}_${pulses.length}pulses`;
    return results;
  }

  private _spawnMicroBatch(beat: DirectorBeat, phase: PhaseConfig, elapsedMs: number): DirectorSpawnRequest[] {
    // 检查是否被桥接消费
    const mbId = `${beat.id}_mb${this._microBatchIndex}`;
    if (this._bridgeMicroBatchId === mbId) {
      this._bridgeMicroBatchId = null; this._microBatchIndex += 1; this._nextState = 'READY'; return [];
    }
    const mb = beat.microBatches[this._microBatchIndex];
    // 0807-11D-6C: rapidPulse — 拆成连续脉冲请求
    if (mb.rapidPulse) {
      return this._spawnRapidPulseBatch(mb, beat, phase, elapsedMs);
    }
    const mbIdx = this._microBatchIndex; // 递增前锁定，与_makeItems对齐
    this._microBatchIndex += 1;
    this._lastMbTime = elapsedMs;
    this._nextState = 'SPAWN';
    this._currentFormationId = mb.formationId;

    // P1-1 强制 special
    const isP11 = beat.phase === 'P1' && beat.id === 'P1-1';
    const mode = isP11 ? 'special' : (mb.placementMode || inferPlacementMode(beat.id, mbIdx));
    const effectiveMb = isP11 ? { ...mb, placementMode: 'special' as const } : mb;

    const placements = buildMicroBatchPlacements(effectiveMb, beat.phase, beat.id, mbIdx, this._placementSeed);
    const items: SpawnItem[] = [];
    const anchorId = FORMATION_ANCHORS[mb.formationId] || 'center';
    const anchor = ANCHORS[anchorId];
    const skipShadow = isP11;
    let idx = 0;
    let powdersRemaining = mb.powders ?? 0;

    for (const [tier, cnt] of mb.tiers) {
      if (cnt <= 0) continue;
      for (let i = 0; i < cnt; i++) {
        const p = placements[idx];
        // 0807-11D-6F: 火药兵替换tough
        const isPowder = tier === 'tough' && powdersRemaining > 0;
        if (isPowder) powdersRemaining--;
        const enemyKind = isPowder ? 'powder' : 'infantry';
        const itemSpawnInPlace = beat.phase === 'P3' || isPowder;
        items.push({
          x: Math.round(p.x + (Math.random() - 0.5) * 6),
          y: -20 + (mb.row === 'back' ? 0 : mb.row === 'mid' ? -5 : -10),
          speedMul: phase.speedMul + mb.speedBonus,
          hpTier: tier, hpOverride: HP_TIERS[tier].hp,
          formationId: mb.formationId,
          entryTargetX: p.x,
          entryEndYOverride: p.y,
          directorPhase: beat.phase,
          directorBeatId: beat.id,
          directorMicroBatchId: mbId,
          anchorId, anchorX: anchor.x, anchorY: anchor.y,
          skipShadow, placementMode: mode,
          spawnInPlace: itemSpawnInPlace, enemyKind,
        });
        idx++;
      }
    }

    this._phaseGenerated += items.length;
    this._lastReason = `spawn_${mbId}`;

    if (this._microBatchIndex >= beat.microBatches.length) this._nextState = 'READY';
    return [{ phase: beat.phase, items }];
  }

  private _calcXPositions(count: number, range: [number, number]): number[] {
    const [min, max] = range;
    const span = max - min;
    const result: number[] = [];
    for (let i = 0; i < count; i++) result.push(min + span * (i + 0.5) / count);
    return result;
  }

  /** 桥接：提前 0.25~0.35s 释放下一微批次，保留原始档位/队形 */
  private _tryBridge(
    beat: DirectorBeat, phase: PhaseConfig, elapsedMs: number,
    aliveInZone: number, aliveTotal: number, approachingCount: number, subSpawnQueueLength: number,
  ): DirectorSpawnRequest[] {
    if (aliveInZone >= phase.targetOnScreen[0]) return [];

    // 检查是否有可提前的微批次
    const nextIdx = this._microBatchIndex;
    if (nextIdx >= beat.microBatches.length) return []; // 当前节拍无更多微批次

    const mbId = `${beat.id}_mb${nextIdx}`;
    if (this._bridgeMicroBatchId === mbId) return []; // 已被桥接消费

    const mb = beat.microBatches[nextIdx];
    const earliestTime = mb.internalDelay > 0 ? 0 : 0; // 桥接提前量
    const bridgeTime = BRIDGE_EARLY_SEC + Math.random() * BRIDGE_EARLY_JITTER;
    const phaseElapsedMs = elapsedMs - this._phaseStartMs;

    // 距 notBefore 还有足够时间才桥接
    if (phaseElapsedMs + bridgeTime * 1000 > beat.notBeforeMs) return [];

    // 硬上限检查
    if (aliveTotal + subSpawnQueueLength + mb.count >= phase.hardCap) return [];

    // 执行桥接: 提前消费该微批次
    this._bridgeMicroBatchId = mbId;
    this._bridgeBeatIdx = this._beatIndex;
    const bridgeMbIdx = this._microBatchIndex;
    this._microBatchIndex += 1;
    this._lastMbTime = elapsedMs;
    this._phaseGenerated += mb.count;
    this._phaseBridgeCount += mb.count;
    this._nextState = 'BRIDGE';
    this._currentFormationId = mb.formationId;
    this._lastReason = `bridge_${mbId}`;

    const items = this._makeItems(mb, beat, phase, bridgeMbIdx);
    if (this._microBatchIndex >= beat.microBatches.length) this._nextState = 'READY';
    return [{ phase: beat.phase, items, consumedMicroBatchId: mbId }];
  }

  private _makeItems(mb: MicroBatch, beat: DirectorBeat, phase: PhaseConfig, mbIdx: number): SpawnItem[] {
    const items: SpawnItem[] = [];
    const anchorId = FORMATION_ANCHORS[mb.formationId] || 'center';
    const anchor = ANCHORS[anchorId];
    const isP11 = beat.phase === 'P1' && beat.id === 'P1-1';
    const mode = isP11 ? 'special' : (mb.placementMode || inferPlacementMode(beat.id, mbIdx));
    const effectiveMb = isP11 ? { ...mb, placementMode: 'special' as const } : mb;

    const placements = buildMicroBatchPlacements(effectiveMb, beat.phase, beat.id, mbIdx, this._placementSeed);
    let idx = 0;

    for (const [tier, cnt] of mb.tiers) {
      if (cnt <= 0) continue;
      for (let j = 0; j < cnt; j++) {
        const p = placements[idx];
        items.push({
          x: Math.round(p.x + (Math.random() - 0.5) * 6),
          y: -20 + (mb.row === 'back' ? 0 : mb.row === 'mid' ? -5 : -10),
          speedMul: phase.speedMul + mb.speedBonus,
          hpTier: tier, hpOverride: HP_TIERS[tier].hp,
          formationId: mb.formationId,
          entryTargetX: p.x,
          entryEndYOverride: p.y,
          directorPhase: beat.phase,
          directorBeatId: beat.id,
          directorMicroBatchId: `${beat.id}_mb${this._microBatchIndex - 1}`,
          anchorId, anchorX: anchor.x, anchorY: anchor.y,
          skipShadow: isP11, placementMode: mode,
          spawnInPlace: beat.phase === 'P3',
        });
        idx++;
      }
    }
    return items;
  }

  // ═══ 节拍推进 ═══

  private _tryAdvanceBeat(
    dt: number, beat: DirectorBeat, phase: PhaseConfig, elapsedMs: number,
    aliveInZone: number, aliveTotal: number, approachingCount: number, subSpawnQueueLength: number,
    beatSpawned: number, beatApproaching: number, beatCombatReady: number, beatAlive: number,
  ): DirectorSpawnRequest[] {
    const nextIdx = this._beatIndex + 1;
    if (nextIdx >= this.beats.length) return [];
    const nextBeat = this.beats[nextIdx];
    if (nextBeat.phase !== beat.phase) return []; // 跨阶段: 等清场

    const phaseElapsedMs = elapsedMs - this._phaseStartMs;
    if (phaseElapsedMs < nextBeat.notBeforeMs) {
      this._nextState = 'WAIT_TIME';
      return this._tryBridge(beat, phase, elapsedMs, aliveInZone, aliveTotal, approachingCount, subSpawnQueueLength);
    }

    // 条件: 当前节拍 ≥50% 进入战斗区 或 存活≤50%
    const combatRatio = beatSpawned > 0 ? beatCombatReady / beatSpawned : 0;
    const aliveRatio  = beatSpawned > 0 ? beatAlive / beatSpawned : 0;
    if (combatRatio < 0.50 && aliveRatio > 0.50) {
      this._nextState = 'WAIT_APPROACH';
      return this._tryBridge(beat, phase, elapsedMs, aliveInZone, aliveTotal, approachingCount, subSpawnQueueLength);
    }

    // 硬上限
    if (aliveTotal + subSpawnQueueLength >= phase.hardCap) { this._nextState = 'WAIT_CAP'; return []; }
    if (subSpawnQueueLength > 0) { this._nextState = 'WAIT_CAP'; return []; }

    // 推进
    this._advanceToNextBeat(nextIdx);
    this._lastReason = `adv_${beat.id}→${nextBeat.id}`;
    return this._spawnMicroBatch(nextBeat, phase, elapsedMs);
  }

  private _advanceToNextBeat(nextIdx: number): void {
    this._beatIndex = nextIdx;
    this._microBatchIndex = 0;
    this._lastMbTime = 0;
    // 清理桥接标记（如果关联的节拍在之前的节拍）
    if (this._bridgeBeatIdx < nextIdx) {
      this._bridgeMicroBatchId = null;
      this._bridgeBeatIdx = -1;
    }
    this._currentFormationId = '';
  }

  private _advanceToNextPhase(): void {
    const currentPhase = this._beatIndex < this.beats.length ? this.beats[this._beatIndex].phase : null;
    let next = this._beatIndex;
    while (next < this.beats.length && this.beats[next].phase === currentPhase) next++;
    this._beatIndex = next;
    this._microBatchIndex = 0;
    this._phaseGenerated = 0;
    this._phaseBridgeCount = 0;
    this._bridgeMicroBatchId = null;
    this._bridgeBeatIdx = -1;
    this._lastMbTime = 0;
    this._phaseElapsed = 0;
    this._phaseStartMs = 0;
    this._phaseGapTimer = 0;
    this._currentFormationId = '';
    this._nextState = 'READY';
  }

  // ═══ Debug ═══

  getDebugInfo(
    aliveTrash: number, aliveTough: number, aliveWall: number,
    aliveTotal: number, approachingCount: number, combatReadyCount: number, pendingCount: number,
    elapsedMs: number,
    beatSpawned = 0, beatApproaching = 0, beatCombatReady = 0, beatAlive = 0,
  ): DirectorDebugInfo {
    if (!this._active) {
      return { phase:'-', beat:'-', generated:0, total:0, aliveTrash:0, aliveTough:0, aliveWall:0,
        beatSpawned:0, beatApproaching:0, beatCombatReady:0, beatAlive:0,
        approachingCount:0, combatReadyCount:0, pendingCount:0,
        notBeforeRemaining:0, microDelayRemaining:0, nextState:'-', formationId:'', phaseElapsed:0 };
    }
    const beat = this._beatIndex < this.beats.length ? this.beats[this._beatIndex] : null;
    const phase = beat ? this.phases[beat.phase] : null;
    const phaseElapsedMs = elapsedMs - this._phaseStartMs;
    const nbRemain = beat ? Math.max(0, beat.notBeforeMs - phaseElapsedMs) : 0;
    const mbElapsed = this._lastMbTime > 0 ? elapsedMs - this._lastMbTime : 0;
    const mb = beat && this._microBatchIndex < beat.microBatches.length ? beat.microBatches[this._microBatchIndex] : null;
    const mdRemain = mb ? Math.max(0, mb.internalDelay * 1000 - mbElapsed) : 0;

    return {
      phase: phase?.phase ?? '-', beat: this.currentBeatId,
      generated: this._phaseGenerated, total: phase?.totalEnemies ?? 0,
      aliveTrash, aliveTough, aliveWall,
      beatSpawned, beatApproaching, beatCombatReady, beatAlive,
      approachingCount, combatReadyCount, pendingCount,
      notBeforeRemaining: Math.round(nbRemain),
      microDelayRemaining: Math.round(mdRemain),
      nextState: this._nextState,
      formationId: this._currentFormationId,
      phaseElapsed: Math.round(this._phaseElapsed * 100) / 100,
    };
  }
}

export const postEdictDirector = new PostEdictDirector();
export { BEATS, PHASES };
