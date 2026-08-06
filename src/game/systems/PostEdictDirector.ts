/**
 * 0807-11D 军令后心流重构 — PostEdictDirector
 *
 * 职责：
 * - 管理 P1→P2→P3 三个阶段、子潮、批次的半动态补怪
 * - 预设内容（总数/子潮顺序/阵型/每批人数）固定
 * - 动态内容仅限"何时进入下一批"
 * - 基于现有 postChestSequenceState 状态机 (waiting_spawn → fighting → complete)
 *
 * 预设规模（首轮实验）：
 *   P1: 36 敌人, HP 75,  速度 1.00, 同屏 [10,14], 硬上限 16
 *   P2: 48 敌人, HP 90,  速度 1.08, 同屏 [14,18], 硬上限 20
 *   P3: 60 敌人, HP 100, 速度 1.18, 同屏 [18,22], 硬上限 24
 *   总计 144 敌人
 */

import { BATTLEFIELD_ZONES, BATTLE_SAFE_X } from '../config/balance';

// ═══════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════

export type DirectorPhase = 'P1' | 'P2' | 'P3';

export interface DirectorEnemyBatch {
  /** 本批敌人数 */
  count: number;
  /** X 布局模式 */
  xLayout: 'wide' | 'left' | 'right' | 'center' | 'leftFront' | 'rightBack' | 'front' | 'twoColumns';
  /** X 范围覆盖 */
  xRange: [number, number];
  /** 本批内延迟（秒），用于模拟"前后"入场 */
  internalDelay: number;
  /** Y 入场起始偏移，用于区分前后层 */
  yOffset: number;
  /** 速度倍率额外加成（用于 P3 前锋） */
  speedBonus: number;
}

export interface DirectorSubWave {
  id: string;
  phase: DirectorPhase;
  batches: DirectorEnemyBatch[];
  totalCount: number;
}

export interface DirectorPhaseConfig {
  phase: DirectorPhase;
  totalEnemies: number;
  hp: number;
  speedMul: number;
  targetOnScreen: [number, number];
  hardCap: number;
  subWaves: DirectorSubWave[];
}

export interface DirectorDebugInfo {
  phase: string;
  subWave: string;
  generated: number;
  total: number;
  alive: number;
  aliveInZone: number;
  nextBatchState: string;
  phaseElapsed: number;
}

// ═══════════════════════════════════════
// 有效战斗区判定
// ═══════════════════════════════════════

export function isInCombatZone(y: number): boolean {
  return y >= BATTLEFIELD_ZONES.midfieldStartY && y <= BATTLEFIELD_ZONES.harvestEndY;
}

// ═══════════════════════════════════════
// X 布局工具
// ═══════════════════════════════════════

function generateXPositions(
  count: number,
  xLayout: DirectorEnemyBatch['xLayout'],
  xRange: [number, number]
): number[] {
  const [minX, maxX] = xRange;
  const range = maxX - minX;
  const result: number[] = [];

  switch (xLayout) {
    case 'wide':
      // 均匀分布在范围内
      for (let i = 0; i < count; i++) {
        result.push(minX + (range * (i + 0.5)) / count);
      }
      break;
    case 'left':
      for (let i = 0; i < count; i++) {
        result.push(minX + (range * 0.5 * (i + 0.5)) / count);
      }
      break;
    case 'right':
      for (let i = 0; i < count; i++) {
        result.push(minX + range * 0.5 + (range * 0.5 * (i + 0.5)) / count);
      }
      break;
    case 'center':
      for (let i = 0; i < count; i++) {
        result.push(minX + range * 0.25 + (range * 0.5 * (i + 0.5)) / count);
      }
      break;
    case 'leftFront':
      // 偏左但覆盖范围更宽
      for (let i = 0; i < count; i++) {
        result.push(minX + (range * 0.7 * (i + 0.5)) / count);
      }
      break;
    case 'rightBack':
      // 偏右
      for (let i = 0; i < count; i++) {
        result.push(minX + range * 0.3 + (range * 0.7 * (i + 0.5)) / count);
      }
      break;
    case 'front':
      // 靠前（偏左集中）
      for (let i = 0; i < count; i++) {
        result.push(minX + range * 0.15 + (range * 0.6 * (i + 0.5)) / count);
      }
      break;
    case 'twoColumns':
      // 双列错位
      for (let i = 0; i < count; i++) {
        if (i % 2 === 0) {
          result.push(minX + range * 0.2);
        } else {
          result.push(minX + range * 0.75);
        }
        // 小偏移防重叠
        if (i > 0) result[i] += (Math.random() - 0.5) * 16;
      }
      break;
  }

  return result;
}

// ═══════════════════════════════════════
// P1/P2/P3 导演配置（首轮实验固定参数）
// ═══════════════════════════════════════

const WIDE_X: [number, number] = [BATTLE_SAFE_X.normalMin, BATTLE_SAFE_X.normalMax];
const CENTER_X: [number, number] = [120, 280];

const POST_EDICT_PHASES: DirectorPhaseConfig[] = [
  // ═══ P1: 能力倾泻 (36 敌人, HP 75, 速度 1.00) ═══
  {
    phase: 'P1',
    totalEnemies: 36,
    hp: 75,
    speedMul: 1.00,
    targetOnScreen: [10, 14],
    hardCap: 16,
    subWaves: [
      // P1-1: 宽面铺场 12 名
      {
        id: 'P1-1',
        phase: 'P1',
        totalCount: 12,
        batches: [
          { count: 7, xLayout: 'wide', xRange: WIDE_X, internalDelay: 0, yOffset: 0, speedBonus: 0 },
          { count: 5, xLayout: 'wide', xRange: WIDE_X, internalDelay: 0.12, yOffset: 12, speedBonus: 0 },
        ],
      },
      // P1-2: 两侧接力 12 名
      {
        id: 'P1-2',
        phase: 'P1',
        totalCount: 12,
        batches: [
          { count: 6, xLayout: 'left', xRange: WIDE_X, internalDelay: 0, yOffset: 0, speedBonus: 0 },
          { count: 6, xLayout: 'right', xRange: WIDE_X, internalDelay: 0.15, yOffset: 10, speedBonus: 0 },
        ],
      },
      // P1-3: 前后接力 12 名 (前7 + 0.25s后5)
      {
        id: 'P1-3',
        phase: 'P1',
        totalCount: 12,
        batches: [
          { count: 7, xLayout: 'wide', xRange: WIDE_X, internalDelay: 0, yOffset: 0, speedBonus: 0 },
          { count: 5, xLayout: 'wide', xRange: WIDE_X, internalDelay: 0.25, yOffset: -15, speedBonus: 0 },
        ],
      },
    ],
  },

  // ═══ P2: 能力理解与复用 (48 敌人, HP 90, 速度 1.08) ═══
  {
    phase: 'P2',
    totalEnemies: 48,
    hp: 90,
    speedMul: 1.08,
    targetOnScreen: [14, 18],
    hardCap: 20,
    subWaves: [
      // P2-1: 错位双团 12 名 (左前6 + 右后6)
      {
        id: 'P2-1',
        phase: 'P2',
        totalCount: 12,
        batches: [
          { count: 6, xLayout: 'leftFront', xRange: WIDE_X, internalDelay: 0, yOffset: 0, speedBonus: 0 },
          { count: 6, xLayout: 'rightBack', xRange: WIDE_X, internalDelay: 0.08, yOffset: 20, speedBonus: 0 },
        ],
      },
      // P2-2: 同区域接力 12 名 (7 + 5)
      {
        id: 'P2-2',
        phase: 'P2',
        totalCount: 12,
        batches: [
          { count: 7, xLayout: 'center', xRange: WIDE_X, internalDelay: 0, yOffset: 0, speedBonus: 0 },
          { count: 5, xLayout: 'center', xRange: WIDE_X, internalDelay: 0.20, yOffset: -12, speedBonus: 0 },
        ],
      },
      // P2-3: 中央扩张 12 名 (中央6 → 左右各3)
      {
        id: 'P2-3',
        phase: 'P2',
        totalCount: 12,
        batches: [
          { count: 6, xLayout: 'center', xRange: [140, 260], internalDelay: 0, yOffset: 0, speedBonus: 0 },
          { count: 3, xLayout: 'left', xRange: WIDE_X, internalDelay: 0.18, yOffset: 10, speedBonus: 0 },
          { count: 3, xLayout: 'right', xRange: WIDE_X, internalDelay: 0, yOffset: 10, speedBonus: 0 },
        ],
      },
      // P2-4: 前后持续补员 12 名 (5+4+3, 间隔逐步缩短)
      {
        id: 'P2-4',
        phase: 'P2',
        totalCount: 12,
        batches: [
          { count: 5, xLayout: 'wide', xRange: WIDE_X, internalDelay: 0, yOffset: 0, speedBonus: 0 },
          { count: 4, xLayout: 'wide', xRange: WIDE_X, internalDelay: 0.35, yOffset: -10, speedBonus: 0 },
          { count: 3, xLayout: 'wide', xRange: WIDE_X, internalDelay: 0.22, yOffset: -20, speedBonus: 0 },
        ],
      },
    ],
  },

  // ═══ P3: 压场高潮 (60 敌人, HP 100, 速度 1.18) ═══
  {
    phase: 'P3',
    totalEnemies: 60,
    hp: 100,
    speedMul: 1.18,
    targetOnScreen: [18, 22],
    hardCap: 24,
    subWaves: [
      // P3-1: 密集铺场 12 名
      {
        id: 'P3-1',
        phase: 'P3',
        totalCount: 12,
        batches: [
          { count: 8, xLayout: 'wide', xRange: WIDE_X, internalDelay: 0, yOffset: 0, speedBonus: 0 },
          { count: 4, xLayout: 'wide', xRange: WIDE_X, internalDelay: 0.10, yOffset: 15, speedBonus: 0 },
        ],
      },
      // P3-2: 双向错位交汇 12 名
      {
        id: 'P3-2',
        phase: 'P3',
        totalCount: 12,
        batches: [
          { count: 6, xLayout: 'leftFront', xRange: WIDE_X, internalDelay: 0, yOffset: 0, speedBonus: 0 },
          { count: 6, xLayout: 'rightBack', xRange: WIDE_X, internalDelay: 0.12, yOffset: -8, speedBonus: 0 },
        ],
      },
      // P3-3: 三段续入 12 名 (6+3+3)
      {
        id: 'P3-3',
        phase: 'P3',
        totalCount: 12,
        batches: [
          { count: 6, xLayout: 'wide', xRange: WIDE_X, internalDelay: 0, yOffset: 0, speedBonus: 0 },
          { count: 3, xLayout: 'center', xRange: WIDE_X, internalDelay: 0.18, yOffset: -12, speedBonus: 0 },
          { count: 3, xLayout: 'center', xRange: WIDE_X, internalDelay: 0.15, yOffset: -24, speedBonus: 0 },
        ],
      },
      // P3-4: 压线前锋+后方大群 12 名 (4前锋 + 8后方)
      {
        id: 'P3-4',
        phase: 'P3',
        totalCount: 12,
        batches: [
          { count: 4, xLayout: 'wide', xRange: [100, 300], internalDelay: 0, yOffset: 0, speedBonus: 0.08 },
          { count: 8, xLayout: 'wide', xRange: WIDE_X, internalDelay: 0.20, yOffset: -20, speedBonus: 0 },
        ],
      },
      // P3-5: 高潮收束 12 名 (中央6 + 两侧各2 + 后排2)
      {
        id: 'P3-5',
        phase: 'P3',
        totalCount: 12,
        batches: [
          { count: 6, xLayout: 'center', xRange: CENTER_X, internalDelay: 0, yOffset: 0, speedBonus: 0 },
          { count: 2, xLayout: 'left', xRange: WIDE_X, internalDelay: 0.10, yOffset: 15, speedBonus: 0 },
          { count: 2, xLayout: 'right', xRange: WIDE_X, internalDelay: 0, yOffset: 15, speedBonus: 0 },
          { count: 2, xLayout: 'center', xRange: CENTER_X, internalDelay: 0.20, yOffset: -18, speedBonus: 0 },
        ],
      },
    ],
  },
];

// ═══════════════════════════════════════
// 半动态补怪规则常量
// ═══════════════════════════════════════

const SUBWAVE_OVERLAP_THRESHOLD = 0.40; // 当前子潮剩余约 35-45% 时可接入下一子潮

/** 阶段间隔 (P1→P2, P2→P3) 0.2~0.4s */
const PHASE_GAP_SEC = 0.30;

/** P3 收束后 → 精英清场余韵 0.2~0.35s */
const FINAL_AFTERGLOW_SEC = 0.28;

// ═══════════════════════════════════════
// 导演类
// ═══════════════════════════════════════

export class PostEdictDirector {
  // 阶段配置
  readonly phases = POST_EDICT_PHASES;

  // 运行状态
  private _active = false;
  private _phaseIndex = 0;       // 0=P1, 1=P2, 2=P3
  private _subWaveIndex = 0;     // 当前阶段内的子潮索引
  private _batchIndex = 0;       // 当前子潮内的批次索引
  private _phaseGenerated = 0;   // 当前阶段已生成数
  private _phaseSpawned = 0;     // 当前阶段已入队数 (用于 wait_cap)
  private _phaseElapsed = 0;     // 当前阶段经过时间
  private _nextBatchState: 'READY' | 'WAIT_CAP' | 'SPAWNED' = 'READY';

  // 阶段衔接计时器
  private _phaseGapTimer = 0;
  private _finalAfterglowTimer = 0;
  private _allComplete = false;

  // Debug
  private _lastReason = '';

  // ═══ 公开方法 ═══

  /** 初始化/重置导演 */
  reset(): void {
    this._active = false;
    this._phaseIndex = 0;
    this._subWaveIndex = 0;
    this._batchIndex = 0;
    this._phaseGenerated = 0;
    this._phaseSpawned = 0;
    this._phaseElapsed = 0;
    this._nextBatchState = 'READY';
    this._phaseGapTimer = 0;
    this._finalAfterglowTimer = 0;
    this._allComplete = false;
    this._lastReason = '';
  }

  /** 启动导演 */
  start(): void {
    this.reset();
    this._active = true;
    this._nextBatchState = 'READY';
    this._lastReason = 'start';
  }

  get active(): boolean { return this._active; }
  get allComplete(): boolean { return this._allComplete; }
  get currentPhase(): DirectorPhase | null {
    if (!this._active || this._phaseIndex >= this.phases.length) return null;
    return this.phases[this._phaseIndex].phase;
  }
  get currentSubWaveId(): string {
    if (this._phaseIndex >= this.phases.length) return '-';
    const phase = this.phases[this._phaseIndex];
    if (this._subWaveIndex >= phase.subWaves.length) return '-';
    return phase.subWaves[this._subWaveIndex].id;
  }

  /**
   * 每帧 tick，返回需要生成的批次列表。
   * 调用方需要：
   * - aliveInZone: 有效战斗区内存活敌人数
   * - aliveTotal:  场上存活敌人数（含任何位置）
   * - subSpawnQueueLength: 当前待生成队列长度
   */
  tick(
    dt: number,
    aliveInZone: number,
    aliveTotal: number,
    subSpawnQueueLength: number,
    elapsed: number,
  ): { batches: Array<{ x: number; y: number; speedMul: number }>; phase: DirectorPhase; hp: number }[] {
    if (!this._active) return [];

    this._phaseElapsed += dt;

    // 如果全部完成，处理余韵
    if (this._allComplete) {
      this._finalAfterglowTimer += dt;
      return [];
    }

    // 当前阶段完成 → 阶段衔接
    if (this._phaseIndex >= this.phases.length) {
      // 所有阶段完成
      if (this._finalAfterglowTimer > 0) {
        // 正在等余韵
        if (this._finalAfterglowTimer >= FINAL_AFTERGLOW_SEC) {
          this._active = false;
          this._allComplete = true;
          this._lastReason = 'all_phases_done';
        }
      }
      return [];
    }

    const phase = this.phases[this._phaseIndex];

    // 检查阶段是否全部生成完毕
    if (this._phaseGenerated >= phase.totalEnemies) {
      // 阶段内所有敌人已生成完毕
      if (aliveTotal === 0 && subSpawnQueueLength === 0) {
        // 清场，进入阶段衔接
        this._phaseGapTimer += dt;
        if (this._phaseGapTimer >= PHASE_GAP_SEC) {
          this._advancePhase();
          this._lastReason = `phase_${phase.phase}_cleared`;
        }
      }
      return [];
    }

    // 当前子潮完成 → 判断是否进入下一子潮
    const currentSubWave = phase.subWaves[this._subWaveIndex];
    if (!currentSubWave) {
      // 所有子潮都已入队但可能还有队列中的
      return [];
    }

    if (this._batchIndex >= currentSubWave.batches.length) {
      // 当前子潮所有批次已入队，判断是否接下一子潮
      return this._tryAdvanceSubWave(aliveInZone, aliveTotal, subSpawnQueueLength);
    }

    // 判断是否生成当前批次
    const hardCap = phase.hardCap;
    const pendingCount = subSpawnQueueLength;

    if (aliveTotal + pendingCount >= hardCap) {
      this._nextBatchState = 'WAIT_CAP';
      this._lastReason = 'cap_reached';
      return [];
    }

    // 可以生成
    this._nextBatchState = 'SPAWNED';
    const batch = currentSubWave.batches[this._batchIndex];
    const results = this._generateBatchPositions(batch, phase);

    this._phaseGenerated += batch.count;
    this._phaseSpawned += batch.count;
    this._batchIndex += 1;

    // 当前子潮所有批次入队后，标记状态
    if (this._batchIndex >= currentSubWave.batches.length) {
      this._nextBatchState = 'READY';
    }

    this._lastReason = `spawn_${currentSubWave.id}_b${this._batchIndex - 1}`;

    return [{ batches: results, phase: phase.phase, hp: phase.hp }];
  }

  /** 检查是否可以触发精英 (all phases complete + afterglow) */
  canSpawnElite(): boolean {
    return this._allComplete && this._finalAfterglowTimer >= FINAL_AFTERGLOW_SEC;
  }

  /** 检查导演是否正在运行（用于替代 old edictPostWavesQueued 的判断） */
  get isRunning(): boolean {
    return this._active && !this._allComplete;
  }

  /** Debug 信息 */
  getDebugInfo(aliveInZone: number, aliveTotal: number): DirectorDebugInfo {
    if (!this._active) {
      return {
        phase: '-', subWave: '-', generated: 0, total: 0,
        alive: aliveTotal, aliveInZone, nextBatchState: '-', phaseElapsed: 0,
      };
    }
    const phase = this._phaseIndex < this.phases.length ? this.phases[this._phaseIndex] : null;
    return {
      phase: phase?.phase ?? '-',
      subWave: this.currentSubWaveId,
      generated: this._phaseGenerated,
      total: phase?.totalEnemies ?? 0,
      alive: aliveTotal,
      aliveInZone,
      nextBatchState: this._nextBatchState,
      phaseElapsed: Math.round(this._phaseElapsed * 100) / 100,
    };
  }

  // ═══ 内部方法 ═══

  /** 推进到下一阶段 */
  private _advancePhase(): void {
    this._phaseIndex += 1;
    this._subWaveIndex = 0;
    this._batchIndex = 0;
    this._phaseGenerated = 0;
    this._phaseSpawned = 0;
    this._phaseElapsed = 0;
    this._phaseGapTimer = 0;
    this._nextBatchState = 'READY';

    if (this._phaseIndex >= this.phases.length) {
      // 所有阶段完成，开始余韵计时
      this._finalAfterglowTimer = 0;
      this._lastReason = 'all_phases_generated';
    }
  }

  /** 尝试推进到下一子潮 */
  private _tryAdvanceSubWave(
    aliveInZone: number,
    aliveTotal: number,
    subSpawnQueueLength: number,
  ): Array<{ batches: Array<{ x: number; y: number; speedMul: number }>; phase: DirectorPhase; hp: number }> {
    const phase = this.phases[this._phaseIndex];
    const nextSubWaveIndex = this._subWaveIndex + 1;

    if (nextSubWaveIndex >= phase.subWaves.length) {
      // 当前阶段无更多子潮
      return [];
    }

    const currentSubWave = phase.subWaves[this._subWaveIndex];
    const remainingRatio = currentSubWave
      ? (currentSubWave.totalCount - this._phaseSpawned + this._batchIndex) / currentSubWave.totalCount
      : 1;

    // 条件1: 有效战斗区人数低于目标下限
    const lowPressure = aliveInZone < phase.targetOnScreen[0];

    // 条件2: 当前子潮剩余约 35-45%，且同屏未达硬上限
    const canOverlap = remainingRatio <= SUBWAVE_OVERLAP_THRESHOLD + 0.05;
    const notAtCap = (aliveTotal + subSpawnQueueLength) < phase.hardCap;

    if ((lowPressure || canOverlap) && notAtCap) {
      this._subWaveIndex = nextSubWaveIndex;
      this._batchIndex = 0;
      this._nextBatchState = 'READY';
      this._lastReason = `adv_${currentSubWave?.id ?? '?'}→${phase.subWaves[nextSubWaveIndex].id}`;

      // 立即生成新子潮第一批
      const newSubWave = phase.subWaves[nextSubWaveIndex];
      const batch = newSubWave.batches[0];
      const results = this._generateBatchPositions(batch, phase);
      this._phaseGenerated += batch.count;
      this._phaseSpawned += batch.count;
      this._batchIndex = 1;
      return [{ batches: results, phase: phase.phase, hp: phase.hp }];
    }

    return [];
  }

  /** 根据批次配置生成敌人坐标 */
  private _generateBatchPositions(
    batch: DirectorEnemyBatch,
    phase: DirectorPhaseConfig,
  ): Array<{ x: number; y: number; speedMul: number }> {
    const xs = generateXPositions(batch.count, batch.xLayout, batch.xRange);
    const baseY = -20; // 屏幕上方生成
    const speedMul = phase.speedMul + batch.speedBonus;

    return xs.map((x, i) => {
      // 同一批内的小偏移
      const yJitter = (Math.random() - 0.5) * 8;
      return {
        x: Math.round(x),
        y: baseY + batch.yOffset + yJitter + i * batch.internalDelay * 15,
        speedMul,
      };
    });
  }
}

/** 导出导演实例（单例） */
export const postEdictDirector = new PostEdictDirector();

/** 导出配置供测试使用 */
export { POST_EDICT_PHASES };
