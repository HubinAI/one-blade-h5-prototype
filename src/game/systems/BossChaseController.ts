// ========================================================================
// Boss V1: BossChaseController — 追影连斩 状态机
// ========================================================================
import {
  CHASE_CONFIG, TELEPORT_POSITIONS, BARRAGE_TRAJECTORIES,
  type Vec2, type BossChaseState, type BossAction,
  type BossRuntimeState, type BarrageProjectile,
} from "../config/bossChase";
import { DESIGN_WIDTH } from "../config/constants";
import { BLADE_MOMENTUM_CONFIG } from "../config/bladeMomentum";

export interface BarrageHitEvent { kind: "barrage_hit"; id: string; position: Vec2; }
export interface CoreHitEvent { kind: "core_hit"; position: Vec2; isBerserk: boolean; }
export interface CoreHitConfirmedEvent { kind: "core_hit_confirmed"; slashId: number; momentumTier: string; hitPoint: Vec2; coreDamage: number; bossHpBefore: number; bossHpAfter: number; exposureWindowId: number; }
export interface ShellHitEvent { kind: "shell_hit"; position: Vec2; }
export interface ShellHitPendingEvent { kind: "shell_hit_pending"; position: Vec2; }
export interface BarrageMissEvent { kind: "barrage_miss"; position: Vec2; }
export interface PhaseTransitionEvent { kind: "phase_transition"; }
export interface VictoryEvent { kind: "victory"; }
export interface FailureEvent { kind: "failure"; }
export interface StateChangeEvent { kind: "state_change"; from: BossChaseState; to: BossChaseState; }

export type ChaseEvent =
  | BarrageHitEvent | CoreHitEvent | CoreHitConfirmedEvent | ShellHitEvent | ShellHitPendingEvent
  | BarrageMissEvent | PhaseTransitionEvent | VictoryEvent
  | FailureEvent | StateChangeEvent;

export interface ChaseSnapshot {
  state: BossChaseState;
  action: BossAction;
  elapsed: number;
  bossX: number; bossY: number;
  bossHp: number;
  bossMaxHp: number;
  coreExposed: boolean;
  invincible: boolean;
  teleportSeq: number;
  barrages: BarrageProjectile[];
  playerHp: number;
  playerMaxHp: number;
  energy: number;
  maxEnergy: number;
  showTitle: string;   // 四字播报文本（空=不显示）
  titleProgress: number; // 0-1
  showUI: boolean;
  introDropProgress: number; // 降落进度 0-1
  phase2Active: boolean;
  phase2Sub: string;
  coreHitInWindow: boolean;
  trans30Phase: number;  // 30%转场子阶段 (0=未开始, 1-5=进行中, 6=完成)  // 当前窗口是否已命中
  // FSM 诊断
  phase2CycleId: number;
  phase2CycleRunning: boolean;
  actionTimer: number;
  watchdogTimeoutCount: number;
  counterWindowId: number;
  defenseLineY: number;
  selectedAnchorId: string;
  recoveryTarget: { x: number; y: number };
}

export class BossChaseController {
  private st: BossRuntimeState;
  private barrages: BarrageProjectile[] = [];
  private _elapsed = 0;
  private _random: () => number;
  private _energy = CHASE_CONFIG.bladeEconomy.initial;
  private _maxEnergy = BLADE_MOMENTUM_CONFIG.baseMax; // V0730001: 统一使用公共配置
  private _playerHp = 100;
  private _lastTeleportIdx = -1;
  private _lastSideSeq = 0;
  private _teleportInSequence = 0;
  private _midBottomCount = 0; // 同侧计数
  private _titleText = "";
  private _titleProgress = 0;
  private _titleTotal = 0;
  private _showUI = false;
  private _introDropProg = 0;
  private _braveTimer = 0;
  private _demoIdx = 0;
  private _demoPositions: Vec2[] = [];
  private _barrageTrajectory: { waypoints: Vec2[]; spawnAt: number[] } | null = null;
  private _barrageT = 0;
  private _barrageLean = 0;
  private _barrageNextShot = 0;
  private _barrageShotSeq = 0;
  private _barrageCleanTimer = 3;
  private _barrageSpeedMod = 1.0;
  // slash 级伤害候选（外壳仍然延迟提交；核心改为即时确认）
  private _slashPendingShell = false;
  private _slashPendingShellDmg = 0;
  private _slashPendingShellEpoch = 0;
  private _slashBossDamageCommitted = false;  // 该 slash 已即时提交过核心伤害
  // bossDamageEpoch：递增时使未提交候选失效
  private _bossDamageEpoch = 0;
  // 进度看门狗（仅真实推进时更新）
  private _lastProgressAt = 0;
  private _lastActionTimer = 0;
  private _lastTeleportSeq = -1;
  private _lastActionName = "";
  private _lastBossX = 0;
  private _lastBossY = 0;
  private _lastBarrageCount = 0;
  private _lastCoreExposed = false;
  private _watchdogFired = false;
  private _watchdogActive = false;
  private _watchdogTimeoutCount = 0;
  // PHASE2 单循环防重
  private _phase2CycleId = 0;
  private _phase2CycleRunning = false;
  // 统一核心暴露窗口（PHASE1_TELEPORT / PHASE2_COUNTER）
  private _coreExposureWindowId = 0;
  private _coreExposureType: "PHASE1_TELEPORT" | "PHASE2_COUNTER" | "NONE" = "NONE";
  private _coreExposureOpenedAt = 0;
  private _coreHitConsumedForWindow = false;
  private _coreHitInWindow = false;  // 窗口内是否已命中（用于视觉切换）
  private _recoveryStartedAt = 0;
  private _recoveryFromX = 0;
  private _recoveryFromY = 0;
  private _recoveryTargetX = 0;  // 目标锚点 X
  private _recoveryTargetY = 0;  // 目标锚点 Y
  private _recoveryMoveDuration = 0.16;
  private _trans30Phase = 0;    // 30%转场子阶段 (0-5)
  // 锚点历史
  private _selectedAnchorId = "";
  private _recentAnchorIds: string[] = [];
  private _lastAssaultX = 0;
  private _lastAssaultY = 0;
  // PHASE2 子状态机
  private _phase2Sub: "BERSERK_ASSAULT" | "BERSERK_RECOVERY" | "BERSERK_COUNTER" | "BERSERK_REARM" | "NONE" = "NONE";
  private _phase2FlashIdx = 0;       // 当前压迫轮内的闪现序号
  private _phase2RoundBarrages = 0;  // 当前轮已生成弹幕数
  private _phase2CounterMinTimer = 0; // 反击窗口最少保持计时

  // ---- debug 日志 ----
  private _log(ev: string, extra: Record<string, unknown> = {}): void {
    const usp = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    if (!usp || usp.get("debug") !== "1") return;
    const t = this._elapsed.toFixed(2);
    console.log(`[BossV1 ${t}s] ${ev}`, {
      hp: this.st.hp, hpRatio: (this.st.hp / this.st.maxHp).toFixed(2),
      state: this.st.state, action: this.st.action,
      invincible: this.st.invincible, coreExposed: this.st.coreExposed,
      phase2Triggered: this.st.phase2Triggered, phase2Active: this._phase2Active,
      activeBarrages: this.barrages.filter(p => p.active).length,
      actionTimer: this.st.actionTimer.toFixed(3),
      done: this._done,
      ...extra,
    });
  }
  private _lastBarrageX = 0;
  private _lastBarrageY = 0;
  private _events: ChaseEvent[] = [];
  private _phase2Active = false;
  private _done = false;
  private _bgIdSeq = 0;

  constructor() {
    this.st = this.initialState();
    let s = 42;
    this._random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  setSeed(n: number) {
    let s = n || 42;
    this._random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  get done(): boolean { return this._done; }
  get events(): ChaseEvent[] { const e = this._events; this._events = []; return e; }

  private initialState(): BossRuntimeState {
    return {
      state: "intro_drop", action: "idle_gap",
      x: 195, y: CHASE_CONFIG.intro.dropStartY,
      hp: 1000, maxHp: 1000, coreExposed: false,
      invincible: true, teleportSeq: 0, barrageWave: 0,
      actionTimer: CHASE_CONFIG.intro.dropDuration,
      firstTick: true, phase2Triggered: false, done: false,
    };
  }

  // ================================================================
  // 主更新
  // ================================================================

  update(dt: number, energy?: number, playerHp?: number): void {
    if (this._done) return;
    this._elapsed += dt;
    if (energy !== undefined) this._energy = energy;
    if (playerHp !== undefined) this._playerHp = playerHp;

    // 玩家死亡检测
    if (this._playerHp <= 0 && this.st.state !== "battle_failure") {
      this.transitionTo("battle_failure");
    }

    // 弹幕移动
    const spd = this._barrageSpeedMod;
    for (const p of this.barrages) {
      if (!p.active) continue;
      p.x += p.vx * dt * spd;
      p.y += p.vy * dt * spd;
      if (p.y > 850 || p.x < -40 || p.x > 430) p.active = false;
    }
    // 每 3s 清理一次非活跃弹幕，防止数组无限膨胀
    this._barrageCleanTimer -= dt;
    if (this._barrageCleanTimer <= 0) {
      this.barrages = this.barrages.filter(p => p.active);
      this._barrageCleanTimer = 3;
    }

    this.updateStateMachine(dt);
  }

  // ================================================================
  // 状态机
  // ================================================================

  private updateStateMachine(dt: number): void {
    this.st.actionTimer -= dt;

    switch (this.st.state) {
      case "intro_drop": this.updateIntroDrop(dt); break;
      case "intro_breathe": this.updateIntroBreathe(dt); break;
      case "intro_skill_demo": this.updateIntroDemo(dt); break;
      case "intro_stamp_title": this.updateStampTitle(dt); break;
      case "battle_ui_enter": this.updateUIEnter(); break;
      case "battle_phase_1": this.updatePhase1(dt); break;
      case "phase_transition_30": this.updateTransition(dt); break;
      case "battle_phase_2": this.updatePhase2(dt); break;
      case "battle_victory": break;
      case "battle_failure": break;
    }

    // 进度看门狗：检测是否有任何真实推进
    if (this._watchdogActive && !this._done &&
        (this.st.state === "battle_phase_1" || this.st.state === "battle_phase_2")) {
      const activeBarrages = this.barrages.filter(p => p.active).length;
      const bossMoved = Math.abs(this.st.x - this._lastBossX) > 3 || Math.abs(this.st.y - this._lastBossY) > 3;
      const progress =
        this.st.actionTimer < this._lastActionTimer - 0.001 ||   // timer 递减
        this.st.teleportSeq !== this._lastTeleportSeq ||          // 闪现序列变化
        this.st.action !== this._lastActionName ||                // 动作变化
        bossMoved ||                                               // Boss 移动
        activeBarrages > this._lastBarrageCount ||                // 新弹幕生成
        this.st.coreExposed !== this._lastCoreExposed;            // 核心状态变化

      if (progress) {
        this._lastProgressAt = this._elapsed;
        this._lastActionTimer = this.st.actionTimer;
        this._lastTeleportSeq = this.st.teleportSeq;
        this._lastActionName = this.st.action;
        this._lastBossX = this.st.x;
        this._lastBossY = this.st.y;
        this._lastBarrageCount = activeBarrages;
        this._lastCoreExposed = this.st.coreExposed;
      } else {
        const idle = this._elapsed - this._lastProgressAt;
        if (idle > 1.2 && !this._watchdogFired) {
          this._watchdogTimeoutCount++;
          this._log("WATCHDOG_TIMEOUT", {
            idle: idle.toFixed(2), state: this.st.state, action: this.st.action,
            actionTimer: this.st.actionTimer.toFixed(3), teleportSeq: this.st.teleportSeq,
          });
          this._watchdogFired = true;
          this.st.invincible = false;
          this.st.coreExposed = false;
          // 使旧 cycle 失效
          this._phase2CycleId++;
          this._phase2CycleRunning = false;
          if (this.st.state === "battle_phase_1") {
            this.st.action = "idle_gap";
            this.st.actionTimer = 0.15;
            this.pickNextAction();
          } else if (this.st.state === "battle_phase_2") {
            this._closeCoreExposure("watchdog");
            this._phase2Sub = "BERSERK_ASSAULT";
            this._phase2FlashIdx = 0;
            this._phase2RoundBarrages = 0;
            this._barrageNextShot = 0;
            this.st.invincible = false;
            this._startPhase2Cycle();
          }
        }
      }
    }
  }

  /** 启动单例 PHASE2 循环 */
  private _startPhase2Cycle(): void {
    this._phase2CycleId++;
    this._phase2CycleRunning = true;
    this._log("PHASE2_CYCLE_START", { cycleId: this._phase2CycleId });
  }

  /** 统一打开核心暴露窗口 */
  private _openCoreExposure(type: "PHASE1_TELEPORT" | "PHASE2_COUNTER"): void {
    this._coreExposureWindowId++;
    this._coreExposureType = type;
    this._coreExposureOpenedAt = this._elapsed;
    this._coreHitConsumedForWindow = false;
    this._coreHitInWindow = false;
    this.st.coreExposed = true;
    this.st.invincible = false;
  }

  /** 核心窗口内是否已消耗 */
  private _canHitCoreThisWindow(): boolean {
    return this.st.coreExposed && !this._coreHitConsumedForWindow;
  }

  /** 选择 PHASE2 COUNTER 锚点 */
  private _selectCounterAnchor(): void {
    const cfg = CHASE_CONFIG.phase2.counter;
    const anchors = cfg.anchors;
    // 首个窗口固定 center
    if (this._coreExposureWindowId === 0) {
      const a = anchors.find(x => x.id === cfg.firstAnchorId) || anchors[0];
      this._selectedAnchorId = a.id;
      this._recoveryTargetX = a.x; this._recoveryTargetY = a.y;
      this._recentAnchorIds = [a.id];
      return;
    }
    // 候选：排除最近 N 个、排除与弹幕过近的
    const closeThreshold = cfg.forbiddenBarrageDistance;
    const activePositions = this.barrages.filter(p => p.active).map(p => ({ x: p.x, y: p.y }));
    const candidates = anchors.filter(a => {
      if (this._recentAnchorIds.includes(a.id)) return false;
      // 检查弹幕距离
      for (const bp of activePositions) {
        if (Math.hypot(a.x - bp.x, a.y - bp.y) < closeThreshold) return false;
      }
      return true;
    });
    let chosen: typeof anchors[0];
    if (candidates.length === 0) {
      // 全部被排除 → 选最远的
      chosen = anchors[0];
      let bestDist = -Infinity;
      for (const a of anchors) {
        let minDist = Infinity;
        for (const bp of activePositions) {
          const d = Math.hypot(a.x - bp.x, a.y - bp.y);
          if (d < minDist) minDist = d;
        }
        if (minDist > bestDist) { bestDist = minDist; chosen = a; }
      }
    } else {
      // seed 权重选择（优先 80-180px 范围）
      const r = this._random();
      const weighted = candidates.map(a => {
        const dist = Math.hypot(a.x - this._lastAssaultX, a.y - this._lastAssaultY);
        const inRange = dist >= cfg.minTravelDistance && dist <= cfg.maxTravelDistance ? 3 : 1;
        const barragePenalty = activePositions.some(bp => Math.hypot(a.x - bp.x, a.y - bp.y) < cfg.minBarrageDistance) ? 0.3 : 1;
        return { a, w: inRange * barragePenalty * (1 + (this._coreExposureWindowId % 7) * 0.15) };
      });
      weighted.sort((x, y) => y.w - x.w);
      chosen = weighted[0].a;
    }
    this._selectedAnchorId = chosen.id;
    this._recoveryTargetX = chosen.x;
    this._recoveryTargetY = chosen.y;
    this._recentAnchorIds.push(chosen.id);
    // center cooldown: 每 3 窗最多一次
    if (chosen.id === "center" && this._recentAnchorIds.filter(id => id === "center").length >= 2) {
      // 如果最近 3 窗内已有 center，换掉
      const alt = candidates.find(a => a.id !== "center") || chosen;
      this._selectedAnchorId = alt.id;
      this._recoveryTargetX = alt.x; this._recoveryTargetY = alt.y;
    }
    // 保持最近 N 个
    if (this._recentAnchorIds.length > cfg.recentExclude) {
      this._recentAnchorIds = this._recentAnchorIds.slice(-cfg.recentExclude);
    }
    this._log("ANCHOR_SELECTED", { anchor: this._selectedAnchorId, targetX: this._recoveryTargetX, targetY: this._recoveryTargetY, recent: this._recentAnchorIds.join(",") });
  }

  /** 统一关闭核心暴露窗口 */
  private _closeCoreExposure(reason: string): void {
    if (this._coreExposureType === "NONE") return;
    this._log("CORE_EXPOSURE_CLOSE", { reason, windowId: this._coreExposureWindowId });
    this.st.coreExposed = false;
    this._coreExposureType = "NONE";
    this._coreHitInWindow = false;
    this._coreExposureOpenedAt = 0;
    this._incrementDamageEpoch("close_core");
  }

  /** 递增 damageEpoch，使未提交 shell 候选失效 */
  private _incrementDamageEpoch(reason: string): void {
    this._bossDamageEpoch++;
    this._log("DAMAGE_EPOCH", { reason, epoch: this._bossDamageEpoch });
  }

  /** 清除所有 pending 候选（lifecycle 事件调用） */
  clearPendingCandidates(reason: string): void {
    this._log("CLEAR_CANDIDATES", { reason, hadShell: this._slashPendingShell, hadCommitted: this._slashBossDamageCommitted });
    this._slashPendingShell = false;
    this._slashPendingShellDmg = 0;
    this._slashPendingShellEpoch = 0;
    // 注意：已即时提交的核心伤害不会被撤销
    this._incrementDamageEpoch(reason);
  }

  // ---- 开场：降落 ----
  private updateIntroDrop(_dt: number): void {
    const cfg = CHASE_CONFIG.intro;
    // 线性降落
    const total = cfg.dropDuration;
    const elapsed = total - Math.max(0, this.st.actionTimer);
    this._introDropProg = Math.min(1, elapsed / total);
    this.st.y = cfg.dropStartY + (cfg.dropEndY - cfg.dropStartY) * this._introDropProg;
    if (this.st.actionTimer <= -0.2) this.transitionTo("intro_breathe");
  }

  // ---- 开场：呼吸 ----
  private updateIntroBreathe(_dt: number): void {
    this._braveTimer += _dt;
    if (this.st.actionTimer <= 0) this.transitionTo("intro_skill_demo");
  }

  // ---- 开场：闪现演示 ----
  private updateIntroDemo(_dt: number): void {
    const cfg = CHASE_CONFIG.intro;
    if (this._demoIdx === 0) {
      // 生成演示位置
      for (let i = 0; i < cfg.demoFlashCount; i++) {
        this._demoPositions.push(this.getRandomTeleportPos());
      }
    }
    const idx = Math.floor((cfg.demoFlashCount - Math.max(0, this.st.actionTimer) / cfg.demoFlashInterval));
    if (idx > this._demoIdx && idx <= cfg.demoFlashCount) {
      this._demoIdx = idx;
      const pos = this._demoPositions[Math.min(idx - 1, this._demoPositions.length - 1)];
      if (pos) { this.st.x = pos.x; this.st.y = pos.y; }
    }
    if (this.st.actionTimer <= 0) this.transitionTo("intro_stamp_title");
  }

  // ---- 开场：四字播报 ----
  private updateStampTitle(_dt: number): void {
    const cfg = CHASE_CONFIG.stampTitle;
    const total = cfg.charInterval * cfg.text.length + cfg.finalHold;
    const elapsed = total - Math.max(0, this.st.actionTimer);
    this._titleText = cfg.text;
    this._titleProgress = Math.min(1, elapsed / (cfg.charInterval * cfg.text.length));
    this._titleTotal = cfg.text.length;
    if (this.st.actionTimer <= 0) this.transitionTo("battle_ui_enter");
  }

  // ---- UI进入 ----
  private updateUIEnter(): void {
    this._showUI = true;
    this.st.invincible = false;
    this.transitionTo("battle_phase_1");
  }

  // ---- 阶段1 ----
  private updatePhase1(dt: number): void {
    // 检测 30% 转场
    if (!this.st.phase2Triggered && this.st.hp <= CHASE_CONFIG.hpTransitionThreshold) {
      this.transitionTo("phase_transition_30");
      return;
    }

    switch (this.st.action) {
      case "idle_gap":
        // 选择下一个技能
        if (this.st.actionTimer <= 0) this.pickNextAction();
        break;

      case "teleport_windup":
        if (this.st.actionTimer <= 0) {
          this.st.action = "teleport_hidden";
          this.st.coreExposed = false;
          this.st.invincible = true;
          this.st.actionTimer = CHASE_CONFIG.teleport.previewDuration;
        }
        break;

      case "teleport_hidden":
        if (this.st.actionTimer <= 0) {
          // 闪现到新位置
          this.flashTeleport();
          this.st.action = "teleport_expose";
          this.st.actionTimer = CHASE_CONFIG.teleport.coreDuration;
        }
        break;

      case "teleport_expose":
        // 核心暴露 — 使用统一窗口管理
        if (this._coreExposureType !== "PHASE1_TELEPORT") {
          this._openCoreExposure("PHASE1_TELEPORT");
        }
        if (this.st.actionTimer <= 0) {
          this.st.action = "teleport_close";
          this._closeCoreExposure("teleport_end");
          this.st.actionTimer = CHASE_CONFIG.teleport.closeDuration;
        }
        break;

      case "teleport_close":
        if (this.st.actionTimer <= 0) {
          this.st.teleportSeq++;
          if (this.st.teleportSeq >= this.getTeleportCount()) {
            // 完成本轮闪现 → idle
            this.st.teleportSeq = 0;
            this.st.action = "idle_gap";
            this.st.actionTimer = 0.2;
          } else {
            this.st.action = "teleport_windup";
            this.st.actionTimer = CHASE_CONFIG.teleport.windupDuration;
          }
        }
        break;

      case "barrage_windup":
        this.st.invincible = true;
        this._barrageTrajectory = this.pickBarrageTrajectory();
        this._barrageNextShot = 0;
        this._barrageT = 0;
        this._barrageLean = 0;
        this.st.action = "barrage_move";
        this.st.actionTimer = CHASE_CONFIG.barrage.duration;
        break;

      case "barrage_move":
        this.updateBarrageMovement(dt);
        if (this.st.actionTimer <= 0) {
          this.st.action = "barrage_end";
          this.st.actionTimer = 0.2;
        }
        break;

      case "barrage_end":
        this.st.invincible = false;
        if (this.st.actionTimer <= 0) {
          this.st.action = "idle_gap";
          this.st.actionTimer = 0.25;
        }
        break;

      default: break;
    }

    // Phase 1 Boss HP 归零 → 胜利
    if (this.st.hp <= 0) this.transitionTo("battle_victory");
  }

  // ---- 30%阶段转场 ----
  private updateTransition(dt: number): void {
    const elapsed = 0.9 - this.st.actionTimer;  // 已过去的时间
    // 子阶段分发
    if (elapsed >= 0.00 && this._trans30Phase < 1) {
      this._trans30Phase = 1;
      this._events.push({ kind: "phase_transition" });  // BREATH_1 开始
      this._log("PHASE30_BREATH_1", { elapsed: elapsed.toFixed(2) });
    }
    if (elapsed >= 0.16 && this._trans30Phase < 2) {
      this._trans30Phase = 2;
      this._log("PHASE30_BREATH_2", { elapsed: elapsed.toFixed(2) });
    }
    if (elapsed >= 0.40 && this._trans30Phase < 3) {
      this._trans30Phase = 3;
      this._events.push({ kind: "phase_transition" });  // NODE_BREAK
      this._log("PHASE30_NODE_BREAK", { elapsed: elapsed.toFixed(2) });
    }
    if (elapsed >= 0.42 && this._trans30Phase < 4) {
      this._trans30Phase = 4;
      this._events.push({ kind: "phase_transition" });  // BACKGROUND_PULSE
      this._log("PHASE30_BACKGROUND_PULSE", { elapsed: elapsed.toFixed(2) });
    }
    if (elapsed >= 0.55 && this._trans30Phase < 5) {
      this._trans30Phase = 5;
      this._events.push({ kind: "phase_transition" });  // DEFENSE_ALERT
      this._log("PHASE30_DEFENSE_ALERT", { elapsed: elapsed.toFixed(2) });
    }
    // 转场结束 → 进入 PHASE2
    if (this.st.actionTimer <= 0) {
      this._trans30Phase = 6;
      this._log("PHASE30_TRANSITION_FINISHED", { elapsed: elapsed.toFixed(2) });
      this._phase2Active = true;
      this.st.teleportSeq = 0;
      this.st.invincible = false;
      this.barrages = [];
      this.transitionTo("battle_phase_2");
      this._log("PHASE2_ASSAULT_STARTED", { cycleId: this._phase2CycleId });
    }
  }

  // ---- 阶段2（压迫→失衡→反击→重装 四子状态循环） ----
  private updatePhase2(dt: number): void {
    const cfg = CHASE_CONFIG.phase2;
    if (this.st.hp <= 0) { this.transitionTo("battle_victory"); return; }

    switch (this._phase2Sub) {
      case "BERSERK_ASSAULT": {
        // 每轮 3 次闪现攻击
        if (this.st.actionTimer <= 0 && this._phase2FlashIdx < cfg.assault.flashes) {
          this._phase2FlashIdx++;
          this.st.actionTimer = cfg.assault.durationPer;
          this.flashTeleport();
          this.st.coreExposed = false;  // 压迫阶段核心不暴露
          this.st.invincible = true;
          this._log("PHASE2_ASSAULT_FLASH", { idx: this._phase2FlashIdx });
        }
        // 从 Boss 当前位置生成弹幕（控制节奏）
        if (this.st.actionTimer > 0.1 && this._phase2RoundBarrages < cfg.assault.barrageMaxRound) {
          const activeCount = this.barrages.filter(p => p.active).length;
          if (activeCount < cfg.maxActiveBarrages) {
            if (this._barrageNextShot <= 0) {
              const count = 1 + (activeCount < 4 ? 1 : 0); // 弹幕少时偶尔 2 枚
              for (let i = 0; i < count && this._phase2RoundBarrages < cfg.assault.barrageMaxRound; i++) {
                const angle = Math.PI / 2 + (this._random() - 0.5) * 0.4 + i * 0.2;
                const speed = CHASE_CONFIG.barrage.projectileSpeed * 1.1;
                this.barrages.push({
                  id: `b2_${this._bgIdSeq++}`,
                  x: this.st.x + (this._random() - 0.5) * 20,
                  y: this.st.y,
                  vx: Math.cos(angle) * speed * 0.4,
                  vy: Math.sin(angle) * speed,
                  radius: CHASE_CONFIG.barrage.projectileRadius,
                  active: true,
                });
                this._phase2RoundBarrages++;
              }
              this._barrageNextShot = cfg.assault.barrageInterval;
            } else { this._barrageNextShot -= dt; }
          }
        }
        // 弹幕移动
        this.updateBerserkBarrage(dt);
        // 3 次完成 → 选择锚点，进入 RECOVERY
        if (this.st.actionTimer <= 0 && this._phase2FlashIdx >= cfg.assault.flashes) {
          this._lastAssaultX = this.st.x;
          this._lastAssaultY = this.st.y;
          this._selectCounterAnchor();
          this._phase2Sub = "BERSERK_RECOVERY";
          this._recoveryStartedAt = this._elapsed;
          this._recoveryFromX = this.st.x;
          this._recoveryFromY = this.st.y;
          // 距离决定时长
          const dist = Math.hypot(this._recoveryTargetX - this.st.x, this._recoveryTargetY - this.st.y);
          this._recoveryMoveDuration = clamp(dist / cfg.counter.moveSpeedBase, cfg.counter.moveDurationMin, cfg.counter.moveDurationMax);
          this.st.actionTimer = this._recoveryMoveDuration;
          this.st.invincible = true;
          this.st.coreExposed = false;
          this._log("PHASE2_RECOVERY", { anchor: this._selectedAnchorId, from: { x: this.st.x.toFixed(0), y: this.st.y.toFixed(0) }, to: { x: this._recoveryTargetX, y: this._recoveryTargetY }, duration: this._recoveryMoveDuration.toFixed(3) });
        }
        break;
      }

      case "BERSERK_RECOVERY": {
        this.updateBerserkBarrage(dt);
        // 平滑移动到目标锚点
        const tx = this._recoveryTargetX, ty = this._recoveryTargetY;
        const t = Math.min(1, (this._elapsed - this._recoveryStartedAt) / this._recoveryMoveDuration);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        this.st.x = this._recoveryFromX + (tx - this._recoveryFromX) * ease;
        this.st.y = this._recoveryFromY + (ty - this._recoveryFromY) * ease;
        const inRecovery = this._elapsed - this._recoveryStartedAt;
        if (this.st.actionTimer <= 0) {
          const activeCount = this.barrages.filter(p => p.active).length;
          if (activeCount > cfg.counter.maxBarrages && inRecovery < cfg.recovery.maxDuration) {
            this.st.actionTimer = 0.05;
          } else {
            const isFirst = this._coreExposureWindowId === 0;
            this._openCoreExposure("PHASE2_COUNTER");
            this._phase2Sub = "BERSERK_COUNTER";
            this.st.actionTimer = isFirst ? cfg.counter.firstDuration : cfg.counter.duration;
            this._phase2CounterMinTimer = cfg.counter.minDuration;
            this._coreHitInWindow = false;
            this._log("PHASE2_COUNTER", { activeBarrages: activeCount, windowId: this._coreExposureWindowId, forced: activeCount > cfg.counter.maxBarrages, anchor: this._selectedAnchorId });
          }
        }
        break;
      }

      case "BERSERK_COUNTER": {
        // 不生成弹幕，减速现有弹幕
        this._barrageSpeedMod = cfg.counter.barrageSlowdown;  // 窗口内弹幕减速
        this.updateBerserkBarrage(dt);
        this._barrageSpeedMod = 1.0;
        this._phase2CounterMinTimer -= dt;
        if (this.st.actionTimer <= 0 && this._phase2CounterMinTimer <= 0) {
          this._closeCoreExposure("counter_end");
          this._phase2Sub = "BERSERK_REARM";
          this.st.actionTimer = cfg.rearm.duration;
          this.st.invincible = true;
          this._log("PHASE2_REARM", {});
        }
        break;
      }

      case "BERSERK_REARM": {
        this.updateBerserkBarrage(dt);
        if (this.st.actionTimer <= 0) {
          this._phase2Sub = "BERSERK_ASSAULT";
          this._phase2FlashIdx = 0;
          this._phase2RoundBarrages = 0;
          this._barrageNextShot = 0;
          this._startPhase2Cycle();
          this._log("PHASE2_ASSAULT_START", { cycleId: this._phase2CycleId });
        }
        break;
      }
    }
  }

  // ================================================================
  // 技能选择
  // ================================================================

  private _lastWasBarrage = false;
  private _barrageSkipCounter = 0;

  private pickNextAction(): void {
    // progress watchdog updated per-frame in updateStateMachine
    // 必须至少每2次中有1次闪现
    const forceTeleport = this._lastWasBarrage;
    const roll = this._random();
    if (forceTeleport || roll < 0.6) {
      // 闪现追逐
      this.st.action = "teleport_windup";
      this.st.actionTimer = CHASE_CONFIG.teleport.windupDuration;
      this.st.teleportSeq = 0;
      this._midBottomCount = 0; this._teleportInSequence = 0;
      this._lastWasBarrage = false;
    } else {
      // 弹幕释放
      this.st.action = "barrage_windup";
      this.st.actionTimer = 0.3;
      this._lastWasBarrage = true;
    }
  }

  // ================================================================
  // 闪现
  // ================================================================

  private getTeleportCount(): number {
    return CHASE_CONFIG.teleport.countMin +
      Math.floor(this._random() * (CHASE_CONFIG.teleport.countMax - CHASE_CONFIG.teleport.countMin + 1));
  }

  private flashTeleport(): void {
    const pos = this.getRandomTeleportPos();
    if (pos) { this.st.x = pos.x; this.st.y = pos.y; }
    this.st.coreExposed = true;
    this.st.invincible = false;
  }

  private getRandomTeleportPos(): Vec2 {
    const pool = TELEPORT_POSITIONS;
    let idx: number;
    // 避免连续同点
    do { idx = Math.floor(this._random() * pool.length); }
    while (idx === this._lastTeleportIdx && pool.length > 1);
    // 同侧约束
    const currentSide = pool[idx].x < 195 ? "left" : "right";
    if (currentSide === (this._lastTeleportIdx >= 0 && pool[this._lastTeleportIdx]?.x < 195 ? "left" : "right")) {
      this._lastSideSeq++;
    } else { this._lastSideSeq = 0; }
    if (this._lastSideSeq >= CHASE_CONFIG.teleport.constraint.maxSameSide && pool.length > 2) {
      // 强制换侧
      const opposite = pool.filter(p => (p.x < 195) === (currentSide !== "left"));
      if (opposite.length > 0) idx = pool.indexOf(opposite[Math.floor(this._random() * opposite.length)]);
    }
    this._lastTeleportIdx = idx;
    // 跟踪中下部计数
    if (pool[idx].y >= 300) this._midBottomCount++;
    this._teleportInSequence++;

    // 至少 40% 在中下部：当接近序列末尾时强制补偿
    const seq = this.st.teleportSeq + 1; // 当前序列中的位置
    const total = this.getTeleportCount();
    if (seq > total * 0.6 && this._midBottomCount < total * CHASE_CONFIG.teleport.constraint.midBottomRatio) {
      // 强制选中下部位置
      const midBottom = pool.filter(p => p.y >= 300);
      if (midBottom.length > 0) {
        const forcedIdx = pool.indexOf(midBottom[Math.floor(this._random() * midBottom.length)]);
        this._lastTeleportIdx = forcedIdx;
        this._midBottomCount++;
        return pool[forcedIdx];
      }
    }
    return pool[idx];
  }

  /** 将Boss位置钳制在安全区域内（基于新Boss尺寸 104×118） */
  private clampPosition(pos: Vec2): Vec2 {
    const halfW = 75, halfH = 82;  // 匹配新 Boss 尺寸 + 安全边距
    return {
      x: Math.max(halfW, Math.min(DESIGN_WIDTH - halfW, pos.x)),
      y: Math.max(halfH + 30, Math.min(650, pos.y)),
    };
  }

  // ================================================================
  // 弹幕
  // ================================================================

  private pickBarrageTrajectory() {
    return BARRAGE_TRAJECTORIES[Math.floor(this._random() * BARRAGE_TRAJECTORIES.length)];
  }

  /** Catmull-Rom 样条插值 */
  private catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t_: number): Vec2 {
    const t2 = t_ * t_, t3 = t2 * t_;
    return {
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t_ + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t_ + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    };
  }

  private updateBarrageMovement(dt: number): void {
    const traj = this._barrageTrajectory;
    if (!traj || traj.waypoints.length < 2) return;

    const wps = traj.waypoints;
    const totalSegs = wps.length - 1;
    const segDuration = CHASE_CONFIG.barrage.duration / totalSegs;

    // 推进进度
    this._barrageT += dt / CHASE_CONFIG.barrage.duration;
    if (this._barrageT >= 1) this._barrageT = 0.999;

    // 确定当前段
    const rawSeg = Math.floor(this._barrageT * totalSegs);
    const seg = Math.min(rawSeg, totalSegs - 1);
    const segT = (this._barrageT * totalSegs - seg);

    // Catmull-Rom 需要4个控制点
    const p0 = wps[Math.max(0, seg - 1)];
    const p1 = wps[seg];
    const p2 = wps[Math.min(wps.length - 1, seg + 1)];
    const p3 = wps[Math.min(wps.length - 1, seg + 2)];

    // 段内缓动（起步加速/转向前减速/中段稳定）
    const easedT = easeInOutQuad(segT);
    const result = this.catmullRom(p0, p1, p2, p3, easedT);

    // 叠加轻微悬浮噪声
    const noiseX = Math.sin(this._elapsed * 2.3 + seg) * 4;
    const noiseY = Math.cos(this._elapsed * 2.7 + seg) * 3;

    const prevX = this.st.x, prevY = this.st.y;
    this.st.x = result.x + noiseX;
    this.st.y = result.y + noiseY;

    // 轻微倾斜朝向运动方向
    const dx = this.st.x - prevX, dy = this.st.y - prevY;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      this._barrageLean = Math.atan2(dy, dx) * 0.15;
    } else {
      this._barrageLean *= 0.9;
    }

    // 生成弹幕（移动中持续发射，替代波次）
    const elapsed = CHASE_CONFIG.barrage.duration - this.st.actionTimer;
    const shotInterval = CHASE_CONFIG.barrage.shotInterval;
    if (this._barrageNextShot <= 0) {
      // 检查活跃弹幕数上限
      const activeCount = this.barrages.filter(p => p.active).length;
      if (activeCount >= CHASE_CONFIG.barrage.maxActiveBarrages) {
        this._barrageNextShot = 0.05; // 短暂延迟
      } else {
        // 每N次发射允许2枚交错
        this._barrageShotSeq++;
        const burst = this._barrageShotSeq % CHASE_CONFIG.barrage.perShotBurstEvery === 0;
        const count = burst ? CHASE_CONFIG.barrage.perShotBurstCount : 1;
        const baseAngle = Math.PI / 2 + (this._random() - 0.5) * 0.5;
        for (let i = 0; i < count; i++) {
          const da = burst ? (i - 0.5) * 0.25 : 0;
          const angle = baseAngle + da;
          const speed = CHASE_CONFIG.barrage.projectileSpeed * (0.9 + this._random() * 0.2);
          // 最小间距检查
          const sx = this.st.x + (this._random() - 0.5) * 36 + da * 20;
          let tooClose = false;
          for (const p of this.barrages) {
            if (p.active && Math.hypot(p.x - sx, p.y - this.st.y) < CHASE_CONFIG.barrage.minSpawnSpacing) {
              tooClose = true; break;
            }
          }
          if (tooClose) continue; // 延迟到下一轮
          this.barrages.push({
            id: `bp_${this._bgIdSeq++}`,
            x: sx, y: this.st.y,
            vx: Math.cos(angle) * speed * 0.5,
            vy: Math.sin(angle) * speed,
            radius: CHASE_CONFIG.barrage.projectileRadius,
            active: true,
          });
        }
        this._lastBarrageX = this.st.x; this._lastBarrageY = this.st.y;
        this._barrageNextShot = CHASE_CONFIG.barrage.shotInterval * (0.9 + this._random() * 0.2);
      }
    } else {
      this._barrageNextShot -= dt;
    }
  }

  private updateBerserkBarrage(_dt: number): void { /* 弹幕已在主 update 循环移动 */ }

  // ================================================================
  // 状态转移
  // ================================================================

  private transitionTo(to: BossChaseState): void {
    const from = this.st.state;
    this._log("TRANSITION", { from, to });
    this.st.state = to;
    this._events.push({ kind: "state_change", from, to });
    // PHASE2 离开时使旧 cycle 失效
    if (from === "battle_phase_2" && to !== "battle_phase_2") {
      this._phase2CycleRunning = false;
      this._phase2CycleId++;
    }
    // 进入战斗后启用看门狗并初始化时间戳
    if (to === "battle_phase_1" || to === "battle_phase_2") {
      this._watchdogActive = true;
      this._watchdogFired = false;
      this._lastProgressAt = this._elapsed;
      this._lastActionTimer = this.st.actionTimer;
      this._lastTeleportSeq = this.st.teleportSeq;
      this._lastActionName = this.st.action;
      this._lastBossX = this.st.x;
      this._lastBossY = this.st.y;
      this._lastBarrageCount = this.barrages.filter(p => p.active).length;
      this._lastCoreExposed = this.st.coreExposed;
      if (to === "battle_phase_2") { /* cycle 由 updatePhase2 idle_gap 启动 */ }
    }

    switch (to) {
      case "intro_breathe":
        this.st.actionTimer = CHASE_CONFIG.intro.breatheDuration;
        this._braveTimer = 0;
        break;
      case "intro_skill_demo":
        this.st.actionTimer = CHASE_CONFIG.intro.demoFlashCount * CHASE_CONFIG.intro.demoFlashInterval;
        this._demoIdx = 0;
        break;
      case "intro_stamp_title":
        this.st.actionTimer = CHASE_CONFIG.stampTitle.charInterval * CHASE_CONFIG.stampTitle.text.length +
          CHASE_CONFIG.stampTitle.finalHold;
        this.st.x = 195; this.st.y = CHASE_CONFIG.intro.dropEndY;
        break;
      case "battle_ui_enter":
        this._events.push({ kind: "state_change", from: "battle_ui_enter", to: "battle_phase_1" });
        break;
      case "battle_phase_1":
        this.st.action = "idle_gap";
        this.st.actionTimer = 0.2;
        this._phase2Sub = "NONE";
        break;
      case "phase_transition_30":
        this._closeCoreExposure("transition_30");
        this.st.actionTimer = 0.9;  // 固定 0.9s 转场
        this.st.x = 195; this.st.y = 300;
        this.st.invincible = true;
        this.st.coreExposed = false;
        this.barrages = [];
        this._phase2Sub = "NONE";  // 转场期间无 PHASE2 子状态
        this._phase2CycleRunning = false;
        this._phase2CycleId++;
        this._trans30Phase = 0;  // 转场子阶段序号
        this._events.push({ kind: "phase_transition" });
        this._log("PHASE30_TRANSITION_STARTED", { hp: this.st.hp, timer: 0.9 });
        break;
      case "battle_phase_2":
        this._phase2Active = true;
        this._phase2Sub = "BERSERK_ASSAULT";
        this._phase2FlashIdx = 0;
        this._phase2RoundBarrages = 0;
        this._barrageNextShot = 0;
        this.st.invincible = true;
        this.st.coreExposed = false;
        this._incrementDamageEpoch("enter_phase2");
        this._log("PHASE2_ASSAULT_START", { cycleId: this._phase2CycleId });
        this.st.actionTimer = 0.3;
        break;
      case "battle_victory":
        this._closeCoreExposure("victory");
        this._done = true;
        this.barrages = [];
        this._events.push({ kind: "victory" });
        break;
      case "battle_failure":
        this._closeCoreExposure("failure");
        this._done = true;
        this.barrages = [];
        this._events.push({ kind: "failure" });
        break;
    }
  }

  // ================================================================
  // 交互：命中检测
  // ================================================================

  /** 单刀去重：每刀开始时由 Game.ts 调用 */
  resetSlashDedup(): void {
    this._slashPendingShell = false;
    this._slashPendingShellDmg = 0;
    this._slashPendingShellEpoch = 0;
    this._slashBossDamageCommitted = false;
  }

  /** slash 结束时由 Game.ts 调用，统一提交伤害 */
  finalizeSlashDamage(): { hitCore: boolean; hitShell: boolean; finalDmg: number } {
    let finalDmg = 0;
    let hitCore = false, hitShell = false;
    // 核心命中已即时提交 → 跳过
    if (this._slashBossDamageCommitted) {
      hitCore = true;
    } else if (this._slashPendingShell && !this.st.invincible && this._slashPendingShellEpoch === this._bossDamageEpoch) {
      finalDmg = this._slashPendingShellDmg;
      hitShell = true;
    }
    if (finalDmg > 0) {
      const beforeHp = this.st.hp;
      this.st.hp = Math.max(0, this.st.hp - finalDmg);
      this._log("DAMAGE_FINAL_SHELL", { finalDmg, beforeHp, afterHp: this.st.hp });
      if (this.st.hp <= 0 && !this._done) this.transitionTo("battle_victory");
    }
    this.resetSlashDedup();
    return { hitCore, hitShell, finalDmg };
  }

  /** 检查刀路是否命中 Boss 核心（伤害按刀势档位） */
  resolveSlash(a: Vec2, b: Vec2): { hitCore: boolean; hitShell: boolean; hitBarrages: string[]; } {
    const hitBarrages: string[] = [];
    let hitCore = false, hitShell = false;

    // 弹幕命中
    for (const p of this.barrages) {
      if (!p.active) continue;
      if (pointInSegment(a, b, { x: p.x, y: p.y }, p.radius)) {
        p.active = false;
        hitBarrages.push(p.id);
        this._events.push({ kind: "barrage_hit", id: p.id, position: { x: p.x, y: p.y } });
      }
    }

    // Boss 命中 → 核心即时确认，外壳延迟提交
    if (this.st.state.startsWith("battle_") || this.st.state === "battle_ui_enter") {
      const bossRadius = 75;
      if (pointInSegment(a, b, { x: this.st.x, y: this.st.y }, bossRadius)) {
        const coreWindowValid = this._canHitCoreThisWindow() && !this._slashBossDamageCommitted;
        if (coreWindowValid) {
          // ---- 核心命中：即时确认（不等 slash 结束） ----
          this._coreHitConsumedForWindow = true;
          this._coreHitInWindow = true;
          this._slashBossDamageCommitted = true;
          hitCore = true;
          // 清除已收集的外壳候选
          this._slashPendingShell = false;
          this._slashPendingShellDmg = 0;
          const tier = this.getCurrentMomentumTier();
          const dmgCfg = CHASE_CONFIG.damage.core;
          const dmg = tier === "high" ? dmgCfg.high : tier === "mid" ? dmgCfg.mid : dmgCfg.low;
          // 30% 锁血
          if (!this.st.phase2Triggered && this.st.hp > CHASE_CONFIG.hpTransitionThreshold &&
              this.st.hp - dmg <= CHASE_CONFIG.hpTransitionThreshold) {
            this.st.hp = CHASE_CONFIG.hpTransitionThreshold;
            this.st.invincible = true;
            this.st.coreExposed = false;
            this.st.phase2Triggered = true;
            this._log("DAMAGE_LOCK_TRANSITION", { lockedHp: this.st.hp });
            this.transitionTo("phase_transition_30");
          } else {
            const beforeHp = this.st.hp;
            this.st.hp = Math.max(0, this.st.hp - dmg);
            this._events.push({
              kind: "core_hit_confirmed",
              slashId: 0, momentumTier: tier,
              hitPoint: { x: this.st.x, y: this.st.y },
              coreDamage: dmg, bossHpBefore: beforeHp, bossHpAfter: this.st.hp,
              exposureWindowId: this._coreExposureWindowId,
            });
            this._log("CORE_HIT_CONFIRMED", { dmg, beforeHp, afterHp: this.st.hp, tier });
          }
          if (this.st.hp <= 0 && !this._done) this.transitionTo("battle_victory");
        } else if (!this._slashPendingShell && !this._slashBossDamageCommitted && !this.st.invincible) {
          // 外壳命中：收集候选，slash 结束时统一提交
          this._slashPendingShell = true;
          hitShell = true;
          this._slashPendingShellEpoch = this._bossDamageEpoch;
          const dmgCfg = CHASE_CONFIG.damage.shell;
          this._slashPendingShellDmg = dmgCfg.min + Math.floor(this._random() * (dmgCfg.max - dmgCfg.min + 1));
          this._events.push({ kind: "shell_hit_pending", position: { x: this.st.x, y: this.st.y } });
        }
      }
    }

    return { hitCore, hitShell, hitBarrages };
  }

  private getCurrentMomentumTier(): import("../config/bossChase").MomentumTier {
    if (this._energy < CHASE_CONFIG.momentumTiers.lowMax) return "low";
    if (this._energy < CHASE_CONFIG.momentumTiers.midMax) return "mid";
    return "high";
  }

  // ================================================================
  // 弹幕漏检（防线上需要被检查）
  // ================================================================

  checkBarrageMisses(defenseY: number): BarrageMissEvent[] {
    const events: BarrageMissEvent[] = [];
    for (const p of this.barrages) {
      if (!p.active) continue;
      if (p.y >= defenseY) {
        p.active = false;
        events.push({ kind: "barrage_miss", position: { x: p.x, y: p.y } });
        this._events.push({ kind: "barrage_miss", position: { x: p.x, y: p.y } });
      }
    }
    return events;
  }

  // ================================================================
  // 快照
  // ================================================================

  get snapshot(): ChaseSnapshot {
    return {
      state: this.st.state,
      action: this.st.action,
      elapsed: this._elapsed,
      bossX: this.st.x, bossY: this.st.y,
      bossHp: this.st.hp, bossMaxHp: this.st.maxHp,
      coreExposed: this.st.coreExposed,
      invincible: this.st.invincible,
      teleportSeq: this.st.teleportSeq,
      barrages: this.barrages.filter(p => p.active),
      playerHp: this._playerHp, playerMaxHp: CHASE_CONFIG.playerMaxHp,
      energy: this._energy, maxEnergy: this._maxEnergy,
      showTitle: this._titleText,
      titleProgress: this._titleProgress,
      showUI: this._showUI,
      introDropProgress: this._introDropProg,
      phase2Active: this._phase2Active,
      phase2Sub: this._phase2Sub,
      coreHitInWindow: this._coreHitInWindow,
      trans30Phase: this._trans30Phase,
      phase2CycleId: this._phase2CycleId,
      phase2CycleRunning: this._phase2CycleRunning,
      actionTimer: this.st.actionTimer,
      watchdogTimeoutCount: this._watchdogTimeoutCount,
      counterWindowId: this._coreExposureWindowId,
      defenseLineY: CHASE_CONFIG.playerDefenseLineY,
      selectedAnchorId: this._selectedAnchorId,
      recoveryTarget: { x: this._recoveryTargetX, y: this._recoveryTargetY },
    };
  }
}

// ---- 工具函数 ----
// ---- 样条辅助 ----
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
function pointInSegment(a: Vec2, b: Vec2, p: Vec2, r: number): boolean {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y) <= r;
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * abx, cy = a.y + t * aby;
  return Math.hypot(p.x - cx, p.y - cy) <= r;
}
