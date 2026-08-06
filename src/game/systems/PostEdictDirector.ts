/**
 * 0807-11D-1 导演节奏与难度断点首轮修正
 *
 * D = 125 (标准主刀伤害: entryAttack=100 × skillCoeff=1.00 × (1+bladeBonus=0.25))
 *
 * HP 断点：
 *   杂兵 = 100 (0.80D) → 一刀击杀
 *   韧兵 = 170 (1.36D) → 两刀击杀
 *   压阵 = 260 (2.08D) → 三刀击杀
 *
 * 总量：P1(48) + P2(64) + P3(80) = 192
 */

import { BATTLEFIELD_ZONES, BATTLE_SAFE_X } from '../config/balance';

// ═══════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════

export type DirectorPhase = 'P1' | 'P2' | 'P3';
export type HpTier = 'trash' | 'tough' | 'elite_wall';

/** 单个敌人生成指令 */
export interface SpawnItem {
  x: number;
  y: number;
  speedMul: number;
  hpTier: HpTier;
}

/** 导演返回的生成批次 */
export interface DirectorSpawnRequest {
  phase: DirectorPhase;
  items: SpawnItem[];
}

export interface DirectorDebugInfo {
  phase: string;
  beat: string;
  generated: number;
  total: number;
  aliveTrash: number;
  aliveTough: number;
  aliveWall: number;
  aliveTotal: number;
  approachingCount: number;
  combatReadyCount: number;
  pendingSpawnCount: number;
  notBeforeRemaining: number;
  nextState: string;
  phaseElapsed: number;
}

// ═══════════════════════════════════════
// 有效战斗区判定
// ═══════════════════════════════════════

export function isInCombatZone(y: number): boolean {
  return y >= BATTLEFIELD_ZONES.midfieldStartY && y <= BATTLEFIELD_ZONES.harvestEndY;
}

/** 敌人在接近区（已生成但未进入战斗区） */
export function isApproaching(y: number): boolean {
  return y >= -30 && y < BATTLEFIELD_ZONES.midfieldStartY;
}

// ═══════════════════════════════════════
// HP 档位配置
// ═══════════════════════════════════════

export const HP_TIERS: Record<HpTier, { hp: number; hpMul: number; scale: number; ringWidth: number }> = {
  trash:      { hp: 100, hpMul: 1.33, scale: 1.00, ringWidth: 1.0 },  // 杂兵 0.80D
  tough:      { hp: 170, hpMul: 2.27, scale: 1.06, ringWidth: 1.4 },  // 韧兵 1.36D
  elite_wall: { hp: 260, hpMul: 3.47, scale: 1.11, ringWidth: 2.0 },  // 压阵 2.08D
};

/** 主刀伤害 D */
export const STANDARD_SLASH_DAMAGE = 125;

// ═══════════════════════════════════════
// X 布局工具
// ═══════════════════════════════════════

const WIDE_X: [number, number] = [BATTLE_SAFE_X.normalMin, BATTLE_SAFE_X.normalMax];
const CENTER_X: [number, number] = [120, 280];

type XLayout = 'wide' | 'left' | 'right' | 'center' | 'leftFront' | 'rightBack' | 'twoColumns';

function generateX(count: number, layout: XLayout, xRange: [number, number]): number[] {
  const [minX, maxX] = xRange;
  const range = maxX - minX;
  const result: number[] = [];
  const jitter = () => (Math.random() - 0.5) * 14;

  switch (layout) {
    case 'wide':
      for (let i = 0; i < count; i++) result.push(minX + (range * (i + 0.5)) / count + jitter());
      break;
    case 'left':
      for (let i = 0; i < count; i++) result.push(minX + (range * 0.45 * (i + 0.5)) / count + jitter());
      break;
    case 'right':
      for (let i = 0; i < count; i++) result.push(minX + range * 0.55 + (range * 0.45 * (i + 0.5)) / count + jitter());
      break;
    case 'center':
      for (let i = 0; i < count; i++) result.push(minX + range * 0.25 + (range * 0.5 * (i + 0.5)) / count + jitter());
      break;
    case 'leftFront':
      for (let i = 0; i < count; i++) result.push(minX + (range * 0.65 * (i + 0.5)) / count + jitter());
      break;
    case 'rightBack':
      for (let i = 0; i < count; i++) result.push(minX + range * 0.35 + (range * 0.65 * (i + 0.5)) / count + jitter());
      break;
    case 'twoColumns':
      for (let i = 0; i < count; i++) {
        result.push(i % 2 === 0 ? minX + range * 0.22 : minX + range * 0.73);
        result[i] += jitter();
      }
      break;
  }
  return result;
}

// ═══════════════════════════════════════
// 导演节拍与微批次
// ═══════════════════════════════════════

interface MicroBatch {
  count: number;
  hpTiers: [HpTier, number][];  // [(tier, count), ...]
  xLayout: XLayout;
  xRange: [number, number];
  yOffset: number;
  internalDelay: number;
  speedBonus: number;
}

interface DirectorBeat {
  id: string;
  phase: DirectorPhase;
  notBeforeMs: number;
  totalCount: number;
  microBatches: MicroBatch[];
}

// ═══════════════════════════════════════
// P1/P2/P3 导演配置
// ═══════════════════════════════════════

const BEATS: DirectorBeat[] = [
  // ═══ P1: 4个节拍 48名 全部杂兵 ═══
  {
    id: 'P1-1', phase: 'P1', notBeforeMs: 0, totalCount: 12,
    microBatches: [
      { count: 6, hpTiers: [['trash', 6]], xLayout: 'wide', xRange: WIDE_X, yOffset: 0, internalDelay: 0, speedBonus: 0 },
      { count: 6, hpTiers: [['trash', 6]], xLayout: 'wide', xRange: WIDE_X, yOffset: 8, internalDelay: 0.30, speedBonus: 0 },
    ],
  },
  {
    id: 'P1-2', phase: 'P1', notBeforeMs: 1800, totalCount: 12,
    microBatches: [
      { count: 5, hpTiers: [['trash', 5]], xLayout: 'left', xRange: WIDE_X, yOffset: 0, internalDelay: 0, speedBonus: 0 },
      { count: 5, hpTiers: [['trash', 5]], xLayout: 'right', xRange: WIDE_X, yOffset: 6, internalDelay: 0.35, speedBonus: 0 },
      { count: 2, hpTiers: [['trash', 2]], xLayout: 'center', xRange: CENTER_X, yOffset: -10, internalDelay: 0.25, speedBonus: 0 },
    ],
  },
  {
    id: 'P1-3', phase: 'P1', notBeforeMs: 3600, totalCount: 12,
    microBatches: [
      { count: 5, hpTiers: [['trash', 5]], xLayout: 'wide', xRange: WIDE_X, yOffset: 0, internalDelay: 0, speedBonus: 0 },
      { count: 4, hpTiers: [['trash', 4]], xLayout: 'wide', xRange: WIDE_X, yOffset: -12, internalDelay: 0.28, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 3]], xLayout: 'center', xRange: CENTER_X, yOffset: -20, internalDelay: 0.22, speedBonus: 0 },
    ],
  },
  {
    id: 'P1-4', phase: 'P1', notBeforeMs: 5400, totalCount: 12,
    microBatches: [
      { count: 6, hpTiers: [['trash', 6]], xLayout: 'wide', xRange: WIDE_X, yOffset: 0, internalDelay: 0, speedBonus: 0 },
      { count: 6, hpTiers: [['trash', 6]], xLayout: 'twoColumns', xRange: WIDE_X, yOffset: -8, internalDelay: 0.20, speedBonus: 0 },
    ],
  },

  // ═══ P2: 5个节拍 64名 44杂兵+20韧兵 ═══
  {
    id: 'P2-1', phase: 'P2', notBeforeMs: 0, totalCount: 12,
    microBatches: [
      { count: 5, hpTiers: [['trash', 5]], xLayout: 'leftFront', xRange: WIDE_X, yOffset: 0, internalDelay: 0, speedBonus: 0 },
      { count: 5, hpTiers: [['trash', 5]], xLayout: 'rightBack', xRange: WIDE_X, yOffset: 10, internalDelay: 0.35, speedBonus: 0 },
      { count: 2, hpTiers: [['trash', 2]], xLayout: 'center', xRange: CENTER_X, yOffset: -5, internalDelay: 0.20, speedBonus: 0 },
    ],
  },
  {
    id: 'P2-2', phase: 'P2', notBeforeMs: 2200, totalCount: 12,
    microBatches: [
      { count: 5, hpTiers: [['trash', 5]], xLayout: 'center', xRange: WIDE_X, yOffset: 0, internalDelay: 0, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 3]], xLayout: 'center', xRange: WIDE_X, yOffset: -10, internalDelay: 0.30, speedBonus: 0 },
      { count: 2, hpTiers: [['trash', 1], ['tough', 1]], xLayout: 'twoColumns', xRange: WIDE_X, yOffset: -16, internalDelay: 0.25, speedBonus: 0 },
      { count: 2, hpTiers: [['trash', 1], ['tough', 1]], xLayout: 'center', xRange: CENTER_X, yOffset: 5, internalDelay: 0, speedBonus: 0 },
    ],
  },
  {
    id: 'P2-3', phase: 'P2', notBeforeMs: 4400, totalCount: 13,
    microBatches: [
      { count: 4, hpTiers: [['trash', 3], ['tough', 1]], xLayout: 'center', xRange: [140, 260], yOffset: 0, internalDelay: 0, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 1], ['tough', 2]], xLayout: 'left', xRange: WIDE_X, yOffset: 8, internalDelay: 0.30, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 1], ['tough', 2]], xLayout: 'right', xRange: WIDE_X, yOffset: 8, internalDelay: 0, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 1], ['tough', 2]], xLayout: 'wide', xRange: WIDE_X, yOffset: -14, internalDelay: 0.35, speedBonus: 0 },
    ],
  },
  {
    id: 'P2-4', phase: 'P2', notBeforeMs: 6600, totalCount: 13,
    microBatches: [
      { count: 4, hpTiers: [['trash', 2], ['tough', 2]], xLayout: 'wide', xRange: WIDE_X, yOffset: 0, internalDelay: 0, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 1], ['tough', 2]], xLayout: 'wide', xRange: WIDE_X, yOffset: -8, internalDelay: 0.32, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 1], ['tough', 2]], xLayout: 'wide', xRange: WIDE_X, yOffset: -16, internalDelay: 0.25, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 1], ['tough', 2]], xLayout: 'center', xRange: CENTER_X, yOffset: 5, internalDelay: 0.20, speedBonus: 0 },
    ],
  },
  {
    id: 'P2-5', phase: 'P2', notBeforeMs: 8800, totalCount: 14,
    microBatches: [
      { count: 5, hpTiers: [['trash', 2], ['tough', 3]], xLayout: 'wide', xRange: WIDE_X, yOffset: 0, internalDelay: 0, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 1], ['tough', 2]], xLayout: 'leftFront', xRange: WIDE_X, yOffset: -10, internalDelay: 0.28, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 1], ['tough', 2]], xLayout: 'rightBack', xRange: WIDE_X, yOffset: -10, internalDelay: 0, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 0], ['tough', 3]], xLayout: 'twoColumns', xRange: WIDE_X, yOffset: -20, internalDelay: 0.35, speedBonus: 0 },
    ],
  },

  // ═══ P3: 6个节拍 80名 28杂兵+44韧兵+8压阵 ═══
  {
    id: 'P3-1', phase: 'P3', notBeforeMs: 0, totalCount: 12,
    microBatches: [
      { count: 6, hpTiers: [['trash', 4], ['tough', 2]], xLayout: 'wide', xRange: WIDE_X, yOffset: 0, internalDelay: 0, speedBonus: 0 },
      { count: 6, hpTiers: [['trash', 3], ['tough', 3]], xLayout: 'wide', xRange: WIDE_X, yOffset: 10, internalDelay: 0.30, speedBonus: 0 },
    ],
  },
  {
    id: 'P3-2', phase: 'P3', notBeforeMs: 2200, totalCount: 13,
    microBatches: [
      { count: 5, hpTiers: [['trash', 3], ['tough', 2]], xLayout: 'leftFront', xRange: WIDE_X, yOffset: 0, internalDelay: 0, speedBonus: 0 },
      { count: 4, hpTiers: [['trash', 2], ['tough', 2]], xLayout: 'rightBack', xRange: WIDE_X, yOffset: -6, internalDelay: 0.30, speedBonus: 0 },
      { count: 4, hpTiers: [['trash', 1], ['tough', 3]], xLayout: 'center', xRange: CENTER_X, yOffset: -14, internalDelay: 0.25, speedBonus: 0 },
    ],
  },
  {
    id: 'P3-3', phase: 'P3', notBeforeMs: 4400, totalCount: 13,
    microBatches: [
      { count: 4, hpTiers: [['trash', 2], ['tough', 2]], xLayout: 'wide', xRange: WIDE_X, yOffset: 0, internalDelay: 0, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 1], ['tough', 2]], xLayout: 'center', xRange: WIDE_X, yOffset: -8, internalDelay: 0.25, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 1], ['tough', 2]], xLayout: 'center', xRange: WIDE_X, yOffset: -16, internalDelay: 0.20, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 1], ['tough', 1], ['elite_wall', 1]], xLayout: 'wide', xRange: WIDE_X, yOffset: 5, internalDelay: 0.28, speedBonus: 0 },
    ],
  },
  {
    id: 'P3-4', phase: 'P3', notBeforeMs: 6600, totalCount: 14,
    microBatches: [
      { count: 4, hpTiers: [['trash', 1], ['tough', 2], ['elite_wall', 1]], xLayout: 'wide', xRange: [100, 300], yOffset: 0, internalDelay: 0, speedBonus: 0.08 },
      { count: 3, hpTiers: [['trash', 1], ['tough', 1], ['elite_wall', 1]], xLayout: 'wide', xRange: WIDE_X, yOffset: -12, internalDelay: 0.28, speedBonus: 0 },
      { count: 4, hpTiers: [['trash', 1], ['tough', 3]], xLayout: 'wide', xRange: WIDE_X, yOffset: -22, internalDelay: 0.22, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 0], ['tough', 2], ['elite_wall', 1]], xLayout: 'twoColumns', xRange: WIDE_X, yOffset: 5, internalDelay: 0.30, speedBonus: 0 },
    ],
  },
  {
    id: 'P3-5', phase: 'P3', notBeforeMs: 8800, totalCount: 14,
    microBatches: [
      { count: 4, hpTiers: [['trash', 1], ['tough', 2], ['elite_wall', 1]], xLayout: 'center', xRange: CENTER_X, yOffset: 0, internalDelay: 0, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 0], ['tough', 2], ['elite_wall', 1]], xLayout: 'left', xRange: WIDE_X, yOffset: 10, internalDelay: 0.25, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 0], ['tough', 3]], xLayout: 'right', xRange: WIDE_X, yOffset: 10, internalDelay: 0, speedBonus: 0 },
      { count: 4, hpTiers: [['trash', 1], ['tough', 2], ['elite_wall', 1]], xLayout: 'wide', xRange: WIDE_X, yOffset: -16, internalDelay: 0.32, speedBonus: 0 },
    ],
  },
  {
    id: 'P3-6', phase: 'P3', notBeforeMs: 11000, totalCount: 14,
    microBatches: [
      { count: 4, hpTiers: [['trash', 1], ['tough', 2], ['elite_wall', 1]], xLayout: 'center', xRange: CENTER_X, yOffset: 0, internalDelay: 0, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 0], ['tough', 2], ['elite_wall', 1]], xLayout: 'left', xRange: WIDE_X, yOffset: 8, internalDelay: 0.25, speedBonus: 0 },
      { count: 3, hpTiers: [['trash', 0], ['tough', 3]], xLayout: 'right', xRange: WIDE_X, yOffset: 8, internalDelay: 0, speedBonus: 0 },
      { count: 4, hpTiers: [['trash', 0], ['tough', 3], ['elite_wall', 1]], xLayout: 'twoColumns', xRange: WIDE_X, yOffset: -14, internalDelay: 0.28, speedBonus: 0 },
    ],
  },
];

// ═══════════════════════════════════════
// 阶段配置
// ═══════════════════════════════════════

interface PhaseConfig {
  phase: DirectorPhase;
  totalEnemies: number;
  speedMul: number;
  targetOnScreen: [number, number];
  hardCap: number;
  /** 接近区容量 */
  approachCap: number;
}

const PHASES: Record<DirectorPhase, PhaseConfig> = {
  P1: { phase: 'P1', totalEnemies: 48, speedMul: 1.00, targetOnScreen: [10, 14], hardCap: 16, approachCap: 12 },
  P2: { phase: 'P2', totalEnemies: 64, speedMul: 1.12, targetOnScreen: [14, 18], hardCap: 20, approachCap: 14 },
  P3: { phase: 'P3', totalEnemies: 80, speedMul: 1.25, targetOnScreen: [18, 22], hardCap: 24, approachCap: 16 },
};

// ═══════════════════════════════════════
// 半动态补怪常量
// ═══════════════════════════════════════

const BRIDGE_MIN_EMPTY_SEC = 0.25;
const BRIDGE_MAX_EMPTY_SEC = 0.35;
const BRIDGE_COUNT_MIN = 3;
const BRIDGE_COUNT_MAX = 4;
const PHASE_GAP_SEC = 0.30;
const FINAL_AFTERGLOW_SEC = 0.28;

// ═══════════════════════════════════════
// 导演类
// ═══════════════════════════════════════

export class PostEdictDirector {
  readonly beats = BEATS;
  readonly phases = PHASES;

  private _active = false;
  private _allComplete = false;

  // 当前进度
  private _beatIndex = 0;         // 全局节拍索引 (0-14)
  private _microBatchIndex = 0;   // 当前节拍内的微批次索引
  private _phaseGenerated = 0;    // 当前阶段已生成总数
  private _phaseBridgeCount = 0;  // 当前阶段桥接补员数
  private _phaseBeatBridgeUsed: Set<number> = new Set(); // 已桥接的节拍索引

  // 计时
  private _phaseElapsed = 0;
  private _phaseStartMs = 0;
  private _emptyTime = 0;
  private _phaseGapTimer = 0;
  private _finalAfterglowTimer = 0;

  // 当前节拍缓存
  private _currentBeatBridgeDone = false; // 当前节拍是否已桥接过
  private _currentBeatBridged = 0;        // 当前节拍已桥接数量（从预算中扣）

  private _nextState = 'READY';
  private _lastReason = '';

  // ═══ 公开方法 ═══

  reset(): void {
    this._active = false;
    this._allComplete = false;
    this._beatIndex = 0;
    this._microBatchIndex = 0;
    this._phaseGenerated = 0;
    this._phaseBridgeCount = 0;
    this._phaseBeatBridgeUsed.clear();
    this._phaseElapsed = 0;
    this._phaseStartMs = 0;
    this._emptyTime = 0;
    this._phaseGapTimer = 0;
    this._finalAfterglowTimer = 0;
    this._currentBeatBridgeDone = false;
    this._currentBeatBridged = 0;
    this._partialBatchDeduction = 0;
    this._nextState = 'READY';
    this._lastReason = '';
  }

  start(): void {
    this.reset();
    this._active = true;
    this._nextState = 'READY';
    this._lastReason = 'start';
  }

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

  /** 由 Game.ts 在阶段切换时同步，用于 notBefore 计时 */
  setPhaseStartMs(ms: number): void {
    this._phaseStartMs = ms;
  }

  canSpawnElite(): boolean {
    return this._allComplete && this._finalAfterglowTimer >= FINAL_AFTERGLOW_SEC;
  }

  /**
   * 每帧 tick
   *
   * @param dt 帧间隔(秒)
   * @param aliveInZone 有效战斗区存活数
   * @param aliveTotal 全部存活数（含接近区）
   * @param approachingCount 接近区存活数（已生成但未入战斗区）
   * @param subSpawnQueueLength 待生成队列长度
   * @param elapsedMs 游戏时间(毫秒)
   */
  tick(
    dt: number,
    aliveInZone: number,
    aliveTotal: number,
    approachingCount: number,
    subSpawnQueueLength: number,
    elapsedMs: number,
  ): DirectorSpawnRequest[] {
    if (!this._active) return [];

    this._phaseElapsed += dt;

    // 全部完成 → 处理余韵
    if (this._allComplete) {
      this._finalAfterglowTimer += dt;
      return [];
    }

    // 所有节拍完成 → 等全部清场 + afterglow
    if (this._beatIndex >= this.beats.length) {
      this._finalAfterglowTimer += dt;
      if (this._finalAfterglowTimer >= FINAL_AFTERGLOW_SEC) {
        this._active = false;
        this._allComplete = true;
        this._lastReason = 'all_beats_done';
      }
      return [];
    }

    const beat = this.beats[this._beatIndex];
    const phase = this.phases[beat.phase];
    const phaseElapsedMs = elapsedMs - this._phaseStartMs;

    // 检查阶段完成 → 进入阶段间隙
    if (this._phaseGenerated >= phase.totalEnemies) {
      if (aliveTotal === 0 && subSpawnQueueLength === 0) {
        this._phaseGapTimer += dt;
        if (this._phaseGapTimer >= PHASE_GAP_SEC) {
          this._advanceToNextPhase();
          this._lastReason = `phase_${phase.phase}_cleared`;
        }
      }
      return [];
    }

    // 当前节拍全部微批次已入队，检查是否推进到下一节拍
    if (this._microBatchIndex >= beat.microBatches.length) {
      return this._tryAdvanceBeat(
        dt, beat, phase, phaseElapsedMs, aliveInZone, aliveTotal,
        approachingCount, subSpawnQueueLength, elapsedMs,
      );
    }

    // 检查 notBefore
    if (elapsedMs - this._phaseStartMs < beat.notBeforeMs) {
      this._nextState = 'WAIT_TIME';
      return this._tryBridge(dt, beat, phase, aliveInZone, aliveTotal, approachingCount, subSpawnQueueLength);
    }

    // 检查同屏硬上限（含接近区）
    const totalOccupancy = aliveTotal + subSpawnQueueLength;
    if (totalOccupancy >= phase.hardCap) {
      this._nextState = 'WAIT_CAP';
      return [];
    }

    // 检查接近区容量
    if (approachingCount + subSpawnQueueLength >= phase.approachCap) {
      this._nextState = 'WAIT_APPROACH';
      return [];
    }

    // 可以生成下一微批次
    this._nextState = 'SPAWN';
    const mb = beat.microBatches[this._microBatchIndex];
    this._microBatchIndex += 1;
    const items = this._generateMicroBatchItems(mb, phase, 0);
    this._phaseGenerated += items.length;
    this._lastReason = `spawn_${beat.id}_mb${this._microBatchIndex - 1}`;

    if (this._microBatchIndex >= beat.microBatches.length) {
      this._nextState = 'READY'; // 等待下一节拍推进条件
    }

    return [{ phase: beat.phase, items }];
  }

  // ═══ 内部方法 ═══

  /** 检查推进到下一节拍的条件 */
  private _tryAdvanceBeat(
    dt: number,
    beat: DirectorBeat,
    phase: PhaseConfig,
    phaseElapsedMs: number,
    aliveInZone: number,
    aliveTotal: number,
    approachingCount: number,
    subSpawnQueueLength: number,
    elapsedMs: number,
  ): DirectorSpawnRequest[] {
    const nextBeatIndex = this._beatIndex + 1;
    if (nextBeatIndex >= this.beats.length) return [];

    const nextBeat = this.beats[nextBeatIndex];
    if (nextBeat.phase !== beat.phase) {
      // 跨阶段，不允许推进（需等清场）
      return [];
    }

    // 条件1: 已到 notBefore
    if (elapsedMs - this._phaseStartMs < nextBeat.notBeforeMs) {
      this._nextState = 'WAIT_TIME';
      return this._tryBridge(dt, beat, phase, aliveInZone, aliveTotal, approachingCount, subSpawnQueueLength);
    }

    // 条件2: 上一节拍至少有 50% 进入战斗区 或 存活量降至 50% 以下
    // aliveInZone 包含所有存活敌人（含前拍残留），需 clamp 防止 >1.0 绕过门控
    const beatEnteredRatio = beat.totalCount > 0 ? Math.min(1, aliveInZone / beat.totalCount) : 0;
    const beatAliveRatio = beat.totalCount > 0 ? Math.min(1, aliveTotal / beat.totalCount) : 0;
    if (beatEnteredRatio < 0.50 && beatAliveRatio > 0.50) {
      this._nextState = 'WAIT_APPROACH';
      return this._tryBridge(dt, beat, phase, aliveInZone, aliveTotal, approachingCount, subSpawnQueueLength);
    }

    // 条件3: 不突破硬上限
    const totalOccupancy = aliveTotal + subSpawnQueueLength;
    if (totalOccupancy >= phase.hardCap) {
      this._nextState = 'WAIT_CAP';
      return [];
    }

    // 条件4: 没有待生成的批次（queue 不为空）
    if (subSpawnQueueLength > 0) {
      this._nextState = 'WAIT_CAP';
      return [];
    }

    // 可以推进
    this._advanceToNextBeat(nextBeatIndex);
    this._lastReason = `adv_${beat.id}→${nextBeat.id}`;
    return this._spawnFirstMicroBatch(nextBeat, phase);
  }

  /** 桥接补员 */
  private _tryBridge(
    dt: number,
    beat: DirectorBeat,
    phase: PhaseConfig,
    aliveInZone: number,
    aliveTotal: number,
    approachingCount: number,
    subSpawnQueueLength: number,
  ): DirectorSpawnRequest[] {
    // 仅当战斗区人数低于目标下限时考虑桥接
    if (aliveInZone >= phase.targetOnScreen[0]) return [];

    // 累积空屏时间
    this._emptyTime += dt;

    if (this._emptyTime < BRIDGE_MIN_EMPTY_SEC) return [];
    if (this._emptyTime > BRIDGE_MAX_EMPTY_SEC) this._emptyTime = BRIDGE_MAX_EMPTY_SEC;

    // 当前节拍已桥接过 → 跳过
    if (this._currentBeatBridgeDone) return [];
    // 阶段内该节拍已桥接过 → 跳过
    if (this._phaseBeatBridgeUsed.has(this._beatIndex)) return [];

    // 硬上限检查
    const totalOccupancy = aliveTotal + subSpawnQueueLength;
    if (totalOccupancy + BRIDGE_COUNT_MIN >= phase.hardCap) return [];

    // 执行桥接：从下一完整节拍预算中提前释放 3~4 名
    this._emptyTime = 0;
    this._currentBeatBridgeDone = true;
    this._phaseBeatBridgeUsed.add(this._beatIndex);

    const bridgeCount = BRIDGE_COUNT_MIN + Math.floor(Math.random() * (BRIDGE_COUNT_MAX - BRIDGE_COUNT_MIN + 1));
    // 以阶段剩余预算为上限, 而非单节拍
    const actualCount = Math.min(bridgeCount, phase.totalEnemies - this._phaseGenerated);

    if (actualCount <= 0) return [];

    this._currentBeatBridged = actualCount;
    this._phaseGenerated += actualCount;
    this._phaseBridgeCount += actualCount;
    this._nextState = 'BRIDGE';
    this._lastReason = `bridge_${beat.id}_${actualCount}`;

    // 桥接只生成杂兵
    const xs = generateX(actualCount, 'wide', WIDE_X);
    const items: SpawnItem[] = xs.map(x => ({
      x: Math.round(x),
      y: -20 + (Math.random() - 0.5) * 10,
      speedMul: phase.speedMul,
      hpTier: 'trash' as HpTier,
    }));

    return [{ phase: beat.phase, items }];
  }

  /** 推进到下一节拍，考虑桥接扣除 */
  private _advanceToNextBeat(nextBeatIndex: number): void {
    this._beatIndex = nextBeatIndex;
    this._emptyTime = 0; // 重置空屏计时，节拍间不延续
    const bridged = this._currentBeatBridged;
    if (bridged > 0) {
      const nextBeat = this.beats[nextBeatIndex];
      let remaining = bridged;
      let skipIdx = 0;
      // 跳过完整的微批次（budget 扣除）
      while (remaining > 0 && skipIdx < nextBeat.microBatches.length) {
        const mb = nextBeat.microBatches[skipIdx];
        const mbCount = mb.hpTiers.reduce((s, [, c]) => s + c, 0);
        if (remaining >= mbCount) {
          remaining -= mbCount;
          skipIdx++;
        } else {
          break; // 不足一个完整微批次，从该批次内扣
        }
      }
      // 记录还需要从当前微批次扣除的数量（剩余不足一个完整批次）
      this._partialBatchDeduction = remaining;
      this._microBatchIndex = skipIdx;
      // 不重复减 _phaseGenerated：桥接时已加回，此处只跳过微批次防止重复计入
    } else {
      this._microBatchIndex = 0;
      this._partialBatchDeduction = 0;
    }
    this._currentBeatBridgeDone = false;
    this._currentBeatBridged = 0;
  }

  /** 桥接扣除后还需要从当前微批次扣的数量 */
  private _partialBatchDeduction = 0;

  /** 推进到下一阶段 */
  private _advanceToNextPhase(): void {
    // 找到下一个不同 phase 的节拍
    const currentPhase = this._beatIndex < this.beats.length ? this.beats[this._beatIndex].phase : null;
    let next = this._beatIndex;
    while (next < this.beats.length && this.beats[next].phase === currentPhase) {
      next++;
    }
    this._beatIndex = next;
    this._microBatchIndex = 0;
    this._currentBeatBridgeDone = false;
    this._currentBeatBridged = 0;
    this._partialBatchDeduction = 0;
    this._phaseGenerated = 0;
    this._phaseBridgeCount = 0;
    this._phaseBeatBridgeUsed.clear();
    this._phaseElapsed = 0;
    this._phaseStartMs = 0; // 下一帧由 Game.ts 设置
    this._phaseGapTimer = 0;
    this._emptyTime = 0;
    this._nextState = 'READY';
  }

  /** 生成节拍的第一个微批次（含桥接部分扣除） */
  private _spawnFirstMicroBatch(beat: DirectorBeat, phase: PhaseConfig): DirectorSpawnRequest[] {
    const startIdx = this._microBatchIndex;
    if (startIdx >= beat.microBatches.length) return [];
    const mb = beat.microBatches[startIdx];
    this._microBatchIndex = startIdx + 1;

    // 桥接部分扣除：减少该微批次实际生成数
    let partialSkip = 0;
    if (this._partialBatchDeduction > 0) {
      partialSkip = this._partialBatchDeduction;
      this._partialBatchDeduction = 0;
    }

    const items = this._generateMicroBatchItems(mb, phase, partialSkip);
    this._phaseGenerated += items.length;
    this._nextState = 'SPAWN';
    return [{ phase: beat.phase, items }];
  }

  /** 生成微批次敌人 */
  private _generateMicroBatchItems(mb: MicroBatch, phase: PhaseConfig, skipCount: number): SpawnItem[] {
    const items: SpawnItem[] = [];
    for (const [tier, cnt] of mb.hpTiers) {
      if (cnt <= 0) continue;
      const actualCount = Math.max(0, cnt - skipCount);
      skipCount = Math.max(0, skipCount - cnt);
      if (actualCount <= 0) continue;
      const xs = generateX(actualCount, mb.xLayout, mb.xRange);
      for (let i = 0; i < actualCount; i++) {
        items.push({
          x: Math.round(xs[i]),
          y: -20 + mb.yOffset + (Math.random() - 0.5) * 8,
          speedMul: phase.speedMul + mb.speedBonus,
          hpTier: tier,
        });
      }
    }
    return items;
  }

  // ═══ Debug ═══

  getDebugInfo(
    aliveTrash: number,
    aliveTough: number,
    aliveWall: number,
    aliveTotal: number,
    approachingCount: number,
    combatReadyCount: number,
    pendingSpawnCount: number,
    elapsedMs: number,
  ): DirectorDebugInfo {
    if (!this._active) {
      return {
        phase: '-', beat: '-', generated: 0, total: 0,
        aliveTrash: 0, aliveTough: 0, aliveWall: 0, aliveTotal: 0,
        approachingCount: 0, combatReadyCount: 0, pendingSpawnCount: 0,
        notBeforeRemaining: 0, nextState: '-', phaseElapsed: 0,
      };
    }

    const beat = this._beatIndex < this.beats.length ? this.beats[this._beatIndex] : null;
    const phase = beat ? this.phases[beat.phase] : null;
    const phaseElapsedMs = elapsedMs - this._phaseStartMs;
    const notBeforeRemaining = beat ? Math.max(0, beat.notBeforeMs - phaseElapsedMs) : 0;

    return {
      phase: phase?.phase ?? '-',
      beat: this.currentBeatId,
      generated: this._phaseGenerated,
      total: phase?.totalEnemies ?? 0,
      aliveTrash, aliveTough, aliveWall, aliveTotal,
      approachingCount, combatReadyCount, pendingSpawnCount,
      notBeforeRemaining: Math.round(notBeforeRemaining),
      nextState: this._nextState,
      phaseElapsed: Math.round(this._phaseElapsed * 100) / 100,
    };
  }
}

export const postEdictDirector = new PostEdictDirector();
export { BEATS, PHASES };
