/**
 * 0807-11D-2 导演不变量收口与纵向通解修正
 *
 * D=125, HP: trash=100(0.80D), tough=170(1.36D), wall=260(2.08D)
 * 总量 192: trash=112, tough=68, wall=12
 * P1=64(5beats,all trash) P2=56(5beats,32+24) P3=72(6beats,16+44+12)
 */

import { BATTLEFIELD_ZONES, BATTLE_SAFE_X } from '../config/balance';
import { randomRange } from '../../utils/math';

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
}

export interface DirectorSpawnRequest {
  phase: DirectorPhase;
  items: SpawnItem[];
  /** 桥接微批次：标记该微批次已被消费，到期不得重复生成 */
  consumedMicroBatchId?: string;
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
export function isEnemyCombatTargetable(enemy: { _directorEntryState?: string; alive?: boolean }): boolean {
  if (!enemy.alive) return false;
  const s = enemy._directorEntryState;
  if (!s) return true;
  return s === 'active';
}

/** 0807-11D-3A: ease-out quad */
export function easeOutQuad(t: number): number {
  const p = Math.max(0, Math.min(1, t));
  return 1 - (1 - p) * (1 - p);
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

// 入场时长常量 (秒) — 0807-11D-3C: 虚影直接落位
export const SHADOW_MOVE_DURATION = 0.55;   // spawn→最终阵位
export const MATERIALIZE_DURATION = 0.15;   // 凝实

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

// ═══════════════════ 微批次配置 ═══════════════════

interface MicroBatch {
  count: number;
  tiers: [HpTier, number][];
  formationId: FormationId;
  xRange: [number, number];
  row: 'back' | 'mid' | 'front';
  internalDelay: number;
  speedBonus: number;
}

interface DirectorBeat {
  id: string;
  phase: DirectorPhase;
  notBeforeMs: number;
  microBatches: MicroBatch[];
}

// ═══════════════════ P1 P2 P3 节拍配置 ═══════════════════

const BEATS: DirectorBeat[] = [
  // ═══ P1: 5节拍 64全杂兵 ═══
  {
    id: 'P1-1', phase: 'P1', notBeforeMs: 0,
    microBatches: [
      { count: 6, tiers: [['trash',6]], formationId: 'front_wide',  xRange: X_WIDE,  row: 'front', internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',6]], formationId: 'front_wide',  xRange: X_WIDE,  row: 'front', internalDelay: 0.30, speedBonus: 0 },
    ],
  },
  {
    id: 'P1-2', phase: 'P1', notBeforeMs: 1800,
    microBatches: [
      { count: 7, tiers: [['trash',7]], formationId: 'back_wide',   xRange: X_WIDE,  row: 'back',  internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',6]], formationId: 'back_wide',   xRange: X_WIDE,  row: 'back',  internalDelay: 0.32, speedBonus: 0 },
    ],
  },
  {
    id: 'P1-3', phase: 'P1', notBeforeMs: 3600,
    microBatches: [
      { count: 6, tiers: [['trash',6]], formationId: 'left_high_diag',  xRange: X_LEFT,  row: 'front', internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',6]], formationId: 'right_low_diag',  xRange: X_RIGHT, row: 'back',  internalDelay: 0.35, speedBonus: 0 },
    ],
  },
  {
    id: 'P1-4', phase: 'P1', notBeforeMs: 5400,
    microBatches: [
      { count: 6, tiers: [['trash',6]], formationId: 'right_high_diag', xRange: X_RIGHT, row: 'front', internalDelay: 0,    speedBonus: 0 },
      { count: 7, tiers: [['trash',7]], formationId: 'left_low_diag',   xRange: X_LEFT,  row: 'back',  internalDelay: 0.32, speedBonus: 0 },
    ],
  },
  {
    id: 'P1-5', phase: 'P1', notBeforeMs: 7200,
    microBatches: [
      { count: 7, tiers: [['trash',7]], formationId: 'front_wide',     xRange: X_WIDE, row: 'front', internalDelay: 0,    speedBonus: 0 },
      { count: 7, tiers: [['trash',7]], formationId: 'back_wide',      xRange: X_WIDE, row: 'back',  internalDelay: 0.28, speedBonus: 0 },
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
      { count: 5, tiers: [['trash',4],['tough',1]], formationId: 'left_high_diag', xRange: X_LEFT,  row: 'front', internalDelay: 0,    speedBonus: 0 },
      { count: 4, tiers: [['trash',3],['tough',1]], formationId: 'right_low_diag', xRange: X_RIGHT, row: 'back',  internalDelay: 0.30, speedBonus: 0 },
    ],
  },
  {
    id: 'P2-3', phase: 'P2', notBeforeMs: 4800,
    microBatches: [
      { count: 5, tiers: [['trash',3],['tough',2]], formationId: 'right_high_diag', xRange: X_RIGHT, row: 'front', internalDelay: 0,    speedBonus: 0 },
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
      { count: 6, tiers: [['trash',0],['tough',6]], formationId: 'front_wide',  xRange: X_WIDE, row: 'front', internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',0],['tough',6]], formationId: 'back_wide',   xRange: X_WIDE, row: 'back',  internalDelay: 0.30, speedBonus: 0 },
    ],
  },

  // ═══ P3: 6节拍 72 (16杂+44韧+12压阵) ═══
  {
    id: 'P3-1', phase: 'P3', notBeforeMs: 0,
    microBatches: [
      { count: 6, tiers: [['trash',3],['tough',3]],           formationId: 'front_wide',   xRange: X_WIDE,  row: 'front', internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',3],['tough',3]],           formationId: 'back_wide',    xRange: X_WIDE,  row: 'back',  internalDelay: 0.30, speedBonus: 0 },
    ],
  },
  {
    id: 'P3-2', phase: 'P3', notBeforeMs: 2400,
    microBatches: [
      { count: 6, tiers: [['trash',2],['tough',4]],           formationId: 'left_front',   xRange: X_LEFT,  row: 'front', internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',1],['tough',5]],           formationId: 'right_back',   xRange: X_RIGHT, row: 'back',  internalDelay: 0.32, speedBonus: 0 },
    ],
  },
  {
    id: 'P3-3', phase: 'P3', notBeforeMs: 4800,
    microBatches: [
      { count: 6, tiers: [['trash',1],['tough',5]],           formationId: 'right_front',  xRange: X_RIGHT, row: 'front', internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',1],['tough',4],['elite_wall',1]], formationId: 'left_back', xRange: X_LEFT, row: 'back', internalDelay: 0.30, speedBonus: 0 },
    ],
  },
  {
    id: 'P3-4', phase: 'P3', notBeforeMs: 7200,
    microBatches: [
      { count: 6, tiers: [['trash',1],['tough',3],['elite_wall',2]], formationId: 'left_slant_back', xRange: X_LEFT,  row: 'back', internalDelay: 0, speedBonus: 0 },
      { count: 6, tiers: [['trash',0],['tough',4],['elite_wall',2]], formationId: 'front_tough',     xRange: X_WIDE,  row: 'front', internalDelay: 0.28, speedBonus: 0.06 },
    ],
  },
  {
    id: 'P3-5', phase: 'P3', notBeforeMs: 9600,
    microBatches: [
      { count: 6, tiers: [['trash',1],['tough',3],['elite_wall',2]], formationId: 'right_slant_back', xRange: X_RIGHT, row: 'back',  internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',0],['tough',4],['elite_wall',2]], formationId: 'scattered_walls',  xRange: X_WIDE,  row: 'mid',   internalDelay: 0.30, speedBonus: 0 },
    ],
  },
  {
    id: 'P3-6', phase: 'P3', notBeforeMs: 12000,
    microBatches: [
      { count: 6, tiers: [['trash',2],['tough',3],['elite_wall',1]], formationId: 'front_wide',   xRange: X_WIDE, row: 'front', internalDelay: 0,    speedBonus: 0 },
      { count: 6, tiers: [['trash',1],['tough',3],['elite_wall',2]], formationId: 'back_wide',    xRange: X_WIDE, row: 'back',  internalDelay: 0.28, speedBonus: 0 },
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
  P1: { phase:'P1', totalEnemies:64, speedMul:1.00, targetOnScreen:[10,14], hardCap:16, approachCap:12 },
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

  // 桥接
  private _bridgeMicroBatchId: string | null = null;  // 被桥接消费的微批次 ID
  private _bridgeBeatIdx = -1;

  private _nextState = 'READY';
  private _lastReason = '';
  private _currentFormationId = '';

  // ═══ 公开方法 ═══

  reset(): void {
    this._active = false; this._allComplete = false;
    this._beatIndex = 0; this._microBatchIndex = 0;
    this._phaseGenerated = 0; this._phaseBridgeCount = 0;
    this._phaseElapsed = 0; this._phaseStartMs = 0; this._lastMbTime = 0;
    this._phaseGapTimer = 0; this._finalAfterglowTimer = 0;
    this._bridgeMicroBatchId = null; this._bridgeBeatIdx = -1;
    this._nextState = 'READY'; this._lastReason = ''; this._currentFormationId = '';
  }

  start(): void { this.reset(); this._active = true; this._lastReason = 'start'; }

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
  ): DirectorSpawnRequest[] {
    if (!this._active) return [];

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

  private _spawnMicroBatch(beat: DirectorBeat, phase: PhaseConfig, elapsedMs: number): DirectorSpawnRequest[] {
    // 检查是否被桥接消费
    const mbId = `${beat.id}_mb${this._microBatchIndex}`;
    if (this._bridgeMicroBatchId === mbId) {
      this._bridgeMicroBatchId = null; // 已消费，不重复生成
      this._microBatchIndex += 1;
      this._nextState = 'READY';
      return [];
    }

    const mb = beat.microBatches[this._microBatchIndex];
    this._microBatchIndex += 1;
    this._lastMbTime = elapsedMs;
    this._nextState = 'SPAWN';
    this._currentFormationId = mb.formationId;

    const items: SpawnItem[] = [];
    const rowEnd = rowEndY(mb.row);
    const jitter = () => (Math.random() - 0.5) * 12;
    const anchorId = FORMATION_ANCHORS[mb.formationId] || 'center';
    const anchor = ANCHORS[anchorId];
    const skipShadow = beat.phase === 'P1' && beat.id === 'P1-1';

    for (const [tier, cnt] of mb.tiers) {
      if (cnt <= 0) continue;
      const xPositions = this._calcXPositions(cnt, mb.xRange);
      for (let i = 0; i < cnt; i++) {
        items.push({
          x: Math.round(xPositions[i] + jitter()),
          y: -20 + (mb.row === 'back' ? 0 : mb.row === 'mid' ? -5 : -10),
          speedMul: phase.speedMul + mb.speedBonus,
          hpTier: tier,
          hpOverride: HP_TIERS[tier].hp,
          formationId: mb.formationId,
          entryTargetX: xPositions[i],
          entryEndYOverride: rowEnd + jitter(),
          directorPhase: beat.phase,
          directorBeatId: beat.id,
          directorMicroBatchId: mbId,
          anchorId, anchorX: anchor.x, anchorY: anchor.y,
          skipShadow,
        });
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
    this._microBatchIndex += 1;
    this._lastMbTime = elapsedMs;
    this._phaseGenerated += mb.count;
    this._phaseBridgeCount += mb.count;
    this._nextState = 'BRIDGE';
    this._currentFormationId = mb.formationId;
    this._lastReason = `bridge_${mbId}`;

    const items = this._makeItems(mb, beat, phase);
    if (this._microBatchIndex >= beat.microBatches.length) this._nextState = 'READY';
    return [{ phase: beat.phase, items, consumedMicroBatchId: mbId }];
  }

  private _makeItems(mb: MicroBatch, beat: DirectorBeat, phase: PhaseConfig): SpawnItem[] {
    const items: SpawnItem[] = [];
    const rowEnd = rowEndY(mb.row);
    const jitter = () => (Math.random() - 0.5) * 12;
    const anchorId = FORMATION_ANCHORS[mb.formationId] || 'center';
    const anchor = ANCHORS[anchorId];
    const skipShadow = beat.phase === 'P1' && beat.id === 'P1-1';
    const xPositions = this._calcXPositions(mb.count, mb.xRange);
    let i = 0;

    for (const [tier, cnt] of mb.tiers) {
      if (cnt <= 0) continue;
      for (let j = 0; j < cnt; j++) {
        items.push({
          x: Math.round(xPositions[i] + jitter()),
          y: -20 + (mb.row === 'back' ? 0 : mb.row === 'mid' ? -5 : -10),
          speedMul: phase.speedMul + mb.speedBonus,
          hpTier: tier,
          hpOverride: HP_TIERS[tier].hp,
          formationId: mb.formationId,
          entryTargetX: xPositions[i],
          entryEndYOverride: rowEnd + jitter(),
          directorPhase: beat.phase,
          directorBeatId: beat.id,
          directorMicroBatchId: `${beat.id}_mb${this._microBatchIndex - 1}`,
          anchorId, anchorX: anchor.x, anchorY: anchor.y,
          skipShadow,
        });
        i++;
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
