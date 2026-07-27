// ========================================================================
// BossStrategySliceController — V0723016-S1 策略节奏切片
//
// 右肩单甲、两轮局势循环。
// 核心理念：玩家在"立即清场/保留弹幕增值/高风险反射/放弃���口"之间做真实取舍。
//
// 状态机：
//   slice_intro → cycle_1_evolve → cycle_1_window → cycle_1_resolve
//   → cycle_2_evolve → cycle_2_window → cycle_2_resolve → slice_complete
//
// 核心弹状态机：
//   seed → charged（1枚供能弹被吸收）
//   charged → overloaded（再吸收1枚 或 charged超过3秒）
//   charged → reflected（被burst反射撞回右肩）
//   seed → cut（被直接斩）
// ========================================================================

import { STRATEGY_SLICE_CONFIG, type SliceCoreState, type SliceWindowType, type SliceWindowSource, type SliceDecision, type SlicePhase } from "../config/bossStrategySlice";
import type { Projectile, ProjectileKind } from "../types";
import { createProjectile } from "./projectileSystem";
import type { BladeMomentumState } from "./bladeMomentum";
import type { ReactiveSlashGeometry } from "./reactiveSlashGeometry";

// ---- 简化的 2D 向量 ----
interface Vec2 { x: number; y: number; }

// ---- 切片事件 ----
export interface SliceCollisionEvent {
  kind: "feeder_cut" | "feeder_absorbed" | "core_seed_cut" | "core_charged_cut"
      | "core_reflected" | "core_overloaded" | "dangerous_wrong_cut"
      | "armor_hit" | "armor_broken" | "empty_swing";
  projectileId?: string;
  description: string;
}

/** S1.5: 每轮唯一结果 */
export type SliceOutcome = "safe_clear" | "charged_reflect" | "overloaded";

/** Snapshot 供 Game.ts 和 HUD 读取 */
export interface SliceSnapshot {
  phase: SlicePhase;
  cycleIndex: number;
  coreState: SliceCoreState | null;
  coreCharge: number;
  feederRemaining: number;
  fieldPressure: number;
  carryOverDangerCount: number;
  windowType: SliceWindowType;
  windowSource: SliceWindowSource | null;
  windowTimer: number;
  lastDecision: SliceDecision | null;
  sliceElapsed: number;
  armorDurability: number;
  projectileCount: number;
  cycleCompleted: boolean;
  inputLocked: boolean;
  // S1.5: 每轮结果（从 cycleOutcomes 派生计数）
  cycleOutcomes: SliceOutcome[];
  cleanClears: number;
  chargedReflects: number;
  overloads: number;
  windowAttacks: number;
  windowSkips: number;
  dangerWrongCuts: number;
  // S1.6: 策略对比指标
  totalArmorDamage: number;
  remainingArmor: number;
  windowSmallCount: number;
  windowLargeCount: number;
  cycle1Decision: SliceDecision | null;
  cycle2Decision: SliceDecision | null;
}

export class BossStrategySliceController {
  // ---- 状态机 ----
  private _phase: SlicePhase = "slice_intro";
  private _cycleIndex = 0;  // 0=未开始, 1=第一轮, 2=第二轮
  private _phaseTimer = 0;
  private _sliceElapsed = 0;

  // ---- 核心弹 ----
  private _coreState: SliceCoreState | null = null;
  private _coreCharge = 0;          // 已吸收供能弹数 (0-2)
  private _coreProjectile: Projectile | null = null;
  private _coreChargedTimer = 0;    // charged 开始计时
  private _overloadedTimer = 0;     // overloaded 开始计时（独立于 phaseTimer）

  // ---- 供能弹 ----
  private _feeders: Projectile[] = [];
  private _feederRemaining = 0;     // 尚未处理（未斩/未吸收）的供能弹

  // ---- 危险弹 ----
  private _dangerProjectiles: Projectile[] = [];
  private _carryOverDangerCount = 0; // 从上一轮继承的额外危险弹

  // ---- 窗口 ----
  private _windowType: SliceWindowType = "none";
  private _windowSource: SliceWindowSource | null = null;
  private _windowTimer = 0;
  private _windowOpened = false;

  // ---- 决策记录 ----
  private _lastDecision: SliceDecision | null = null;
  private _cycle1Decision: SliceDecision | null = null;
  private _cycle2Decision: SliceDecision | null = null;

  // ---- 统计 ----
  private _cleanClears = 0;
  private _chargedReflects = 0;
  private _overloads = 0;
  private _windowAttacks = 0;
  private _windowSkips = 0;
  private _dangerWrongCuts = 0;

  // S1.5: 每轮唯一结果（确保 n个cycle = n个outcome）
  private _cycleOutcomes: SliceOutcome[] = [];

  // S1.6: 策略对比验收指标
  private _totalArmorDamage = 0;
  private _windowSmallCount = 0;
  private _windowLargeCount = 0;

  // ---- 护甲 ----
  private _armorDurability = 100;

  // ---- 输入锁 ----
  private _inputLocked = true;

  // ---- 本次窗口内命中护甲标记 ----
  private _windowArmorHit = false;

  // ---- 简单伪随机（seed） ----
  private _seed = 1;
  private _random(): number {
    this._seed = (this._seed * 16807) % 2147483647;
    return (this._seed - 1) / 2147483646;
  }

  // ---- 存取器 ----
  get phase(): SlicePhase { return this._phase; }
  get cycleIndex(): number { return this._cycleIndex; }
  get coreState(): SliceCoreState | null { return this._coreState; }
  get feederRemaining(): number { return this._feederRemaining; }
  get carryOverDangerCount(): number { return this._carryOverDangerCount; }
  get windowType(): SliceWindowType { return this._windowType; }
  get windowSource(): SliceWindowSource | null { return this._windowSource; }
  get inputLocked(): boolean { return this._inputLocked; }
  get sliceElapsed(): number { return this._sliceElapsed; }
  get cleanClears(): number { return this._cleanClears; }
  get chargedReflects(): number { return this._chargedReflects; }
  get overloads(): number { return this._overloads; }
  get coreCharge(): number { return this._coreCharge; }
  get armorDurability(): number { return this._armorDurability; }

  setSeed(n: number): void { this._seed = n; }

  // ================================================================
  // 主更新
  // ================================================================

  update(dt: number): void {
    this._sliceElapsed += dt;
    this._phaseTimer += dt;

    // 更新弹幕位置
    this.updateProjectiles(dt);

    // 检查供能弹是否到达吸收区
    this.checkFeederAbsorption();

    // 检查核心弹 charged→overloaded 超时
    if (this._coreState === "charged" && this._coreProjectile) {
      this._coreChargedTimer += dt;
      if (this._coreChargedTimer >= STRATEGY_SLICE_CONFIG.coreProjectile.chargedDuration) {
        this.transitionCoreToOverloaded("timeout");
      }
    }

    // 过载计时
    if (this._coreState === "overloaded") {
      this._overloadedTimer += dt;
    }

    // 检查 overloaded 核心弹是否到达玩家
    this.checkOverloadedReached();

    switch (this._phase) {
      case "slice_intro": this.updateSliceIntro(); break;
      case "cycle_evolve": this.updateCycleEvolve(); break;
      case "cycle_window": this.updateCycleWindow(); break;
      case "cycle_resolve": this.updateCycleResolve(); break;
      // slice_complete: nothing to do
    }

    // 超时保护
    if (this._sliceElapsed >= STRATEGY_SLICE_CONFIG.maxSliceDuration && this._phase !== "slice_complete") {
      this._phase = "slice_complete";
      this._inputLocked = true;
    }
  }

  // ---- 阶段逻辑 ----

  private updateSliceIntro(): void {
    this._inputLocked = true;
    if (this._phaseTimer >= STRATEGY_SLICE_CONFIG.phaseTimers.sliceIntro) {
      this.startCycle(1);
    }
  }

  private updateCycleEvolve(): void {
    this._inputLocked = false;

    // overloaded：不在这里 enter resolve，等核心弹飞到玩家线
    if (this._coreState === "overloaded") return;

    // charged 被反射 → 大破绽 → resolve
    if (this._coreState === "reflected") {
      this.enterResolve();
      return;
    }

    // 安全清场：所有供能弹被斩 + seed 从未变成 charged（无吸收）→ 小破绽
    if (this._feederRemaining === 0 && this._coreState === "seed" && this._coreCharge === 0 && !this._windowOpened) {
      this.commitCycleOutcome("safe_clear");
      this.openWindow("small", "clean_clear");
      return;
    }
  }

  private updateCycleWindow(): void {
    this._inputLocked = false;
    this._windowTimer += 1 / 60; // 粗略计时，精确由 phaseTimer 控制

    const maxWindow = this._windowType === "small"
      ? STRATEGY_SLICE_CONFIG.phaseTimers.windowSmall
      : STRATEGY_SLICE_CONFIG.phaseTimers.windowLarge;

    if (this._phaseTimer >= maxWindow) {
      this.closeWindow();
    }
  }

  private updateCycleResolve(): void {
    this._inputLocked = true;
    if (this._phaseTimer >= STRATEGY_SLICE_CONFIG.phaseTimers.resolveTransition) {
      // V0723016-S1.3: 两轮必须完整发生，护甲破裂不提前结束切片
      if (this._cycleIndex >= 2) {
        this._phase = "slice_complete";
        return;
      }
      this.startCycle(this._cycleIndex + 1);
    }
  }

  // ================================================================
  // 弹幕管理
  // ================================================================

  private startCycle(index: number): void {
    this._cycleIndex = index;
    this._phase = "cycle_evolve";
    this._phaseTimer = 0;
    this._windowType = "none";
    this._windowSource = null;
    this._windowOpened = false;
    this._windowArmorHit = false;
    this._lastDecision = null;
    this._inputLocked = false;

    // 清空上一轮弹幕
    this._feeders = [];
    this._dangerProjectiles = [];
    this._coreProjectile = null;
    this._coreState = null;
    this._coreCharge = 0;
    this._coreChargedTimer = 0;
    this._overloadedTimer = 0;

    // 生成供能弹
    this._feederRemaining = 0;
    const { cx, cy, radius: ar } = STRATEGY_SLICE_CONFIG.absorbZone;
    const sr = STRATEGY_SLICE_CONFIG.feeder.spawnRadius;
    const speed = STRATEGY_SLICE_CONFIG.feeder.speed;

    for (let i = 0; i < STRATEGY_SLICE_CONFIG.feeder.count; i++) {
      const angleOffset = (i === 0 ? -1 : 1) * (0.6 + this._random() * 0.4); // S1.6: 加宽角度避免一刀双斩
      const spawnAngle = -Math.PI / 2 + angleOffset; // 上方偏左右
      const sx = cx + Math.cos(spawnAngle) * sr;
      const sy = cy + Math.sin(spawnAngle) * sr;
      const dx = cx - sx;
      const dy = cy - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const p = createProjectile("normal", sx, sy, (dx / dist) * speed, (dy / dist) * speed);
      this._feeders.push(p);
      this._feederRemaining++;
    }

    // 生成核心状态（V0723016-S1.4: seed 无弹幕对象，附着Boss不可交互）
    this._coreProjectile = null;
    this._coreState = "seed";
    this._coreCharge = 0;

    // 生成危险弹
    const totalDanger = STRATEGY_SLICE_CONFIG.danger.basePerCycle + this._carryOverDangerCount;
    const dr = STRATEGY_SLICE_CONFIG.danger.spawnRadius;
    const ds = STRATEGY_SLICE_CONFIG.danger.speed;
    for (let i = 0; i < totalDanger; i++) {
      const da = this._random() * Math.PI * 2;
      const dx2 = cx + Math.cos(da) * dr;
      const dy2 = cy + Math.sin(da) * dr;
      const moveAngle = this._random() * Math.PI * 2;
      const p = createProjectile("dangerous", dx2, dy2, Math.cos(moveAngle) * ds, Math.sin(moveAngle) * ds);
      this._dangerProjectiles.push(p);
    }

    // 重置 carryOver（本轮已消费）
    this._carryOverDangerCount = 0;
  }

  private updateProjectiles(_dt: number): void {
    // 弹幕位置由 Game.ts 的通用更新处理，这里只管理列表
    // 但我们需要更新核心弹的 charged 超时（已在主update中处理）
  }

  /** 获取所有活跃弹幕（供 Game.ts 渲染/碰撞检测） */
  getProjectiles(): Projectile[] {
    const result: Projectile[] = [];
    for (const f of this._feeders) { if (f.active) result.push(f); }
    for (const d of this._dangerProjectiles) { if (d.active) result.push(d); }
    if (this._coreProjectile?.active) result.push(this._coreProjectile);
    return result;
  }

  /** 获取供能弹列表（供 HUD 绘制吸收轨迹） */
  getFeeders(): Projectile[] {
    return this._feeders.filter(f => f.active);
  }

  /** 获取核心弹（S1.4: seed 无弹幕对象，仅 charged/overloaded/reflected 返回） */
  getCoreProjectile(): Projectile | null {
    if (!this._coreProjectile?.active) return null;
    return this._coreProjectile;
  }

  // ================================================================
  // 吸收检测
  // ================================================================

  private checkFeederAbsorption(): void {
    const { cx, cy } = STRATEGY_SLICE_CONFIG.absorbZone;
    const absorbDist = STRATEGY_SLICE_CONFIG.feeder.absorbDistance;

    for (const f of this._feeders) {
      if (!f.active) continue;
      const dx = f.x - cx;
      const dy = f.y - cy;
      if (Math.sqrt(dx * dx + dy * dy) <= absorbDist) {
        f.active = false;
        f.resolved = true;
        f.resolution = "expired";
        this._feederRemaining--;
        this._coreCharge++;
        this.onFeederAbsorbed();
      }
    }
  }

  private onFeederAbsorbed(): void {
    if (this._coreState === "seed" && this._coreCharge >= 1) {
      // S1.4: 吸收第1枚 → 创建 charged 可交互核心弹（seed 阶段无可交互对象）
      const cp = STRATEGY_SLICE_CONFIG.coreProjectile.spawnPos;
      this._coreProjectile = createProjectile("reflective", cp.x, cp.y, 0, 0);
      this._coreState = "charged";
      this._coreChargedTimer = 0;
    } else if (this._coreState === "charged" && this._coreCharge >= 2) {
      // 第2枚被吸收 → overloaded
      this.transitionCoreToOverloaded("overcharge");
    }
  }

  private transitionCoreToOverloaded(reason: "timeout" | "overcharge"): void {
    if (this._coreState !== "charged") return;
    this._coreState = "overloaded";
    this.commitCycleOutcome("overloaded");
    this._overloadedTimer = 0; // 重置过载计时

    // overloaded 核心弹冲向玩家
    if (this._coreProjectile) {
      const playerY = 690;
      const dx = 0;
      const dy = playerY - this._coreProjectile.y;
      const dist = Math.max(1, Math.abs(dy));
      const speed = STRATEGY_SLICE_CONFIG.coreProjectile.overloadedSpeed;
      this._coreProjectile.vx = (dx / dist) * speed;
      this._coreProjectile.vy = (dy / dist) * speed;
    }

    // 下一轮增加危险弹
    this._carryOverDangerCount += STRATEGY_SLICE_CONFIG.overloadPenalty.extraDangerCount;

    if (reason === "overcharge") {
      this._lastDecision = "skip_window";
    }

    // V0723016-S1: overloaded 不开窗，但不立即 resolve——给 0.6s 让玩家看到过载反馈
    // resolve 由 updateCycleEvolve 在下一次检查时触发（feederRemaining 会自然归零）
  }

  private checkOverloadedReached(): void {
    // overloaded 核心弹到达玩家线 → 结束本轮
    if (this._coreState === "overloaded" && this._coreProjectile?.active) {
      if (this._coreProjectile.y >= 680) {
        this._coreProjectile.active = false;
        if (this._phase === "cycle_evolve") {
          this.enterResolve();
        }
      }
    }
    // overloaded 超时兜底（过载后3秒强制resolve，防止核心弹飞出屏幕外）
    if (this._coreState === "overloaded" && this._overloadedTimer > 3.0 && this._phase === "cycle_evolve") {
      this.enterResolve();
    }
  }

  /** S1.4: 充能核心被直接斩后，补充2枚供能弹继续本轮 */
  private respawnFeeders(): void {
    const { cx, cy } = STRATEGY_SLICE_CONFIG.absorbZone;
    const sr = STRATEGY_SLICE_CONFIG.feeder.spawnRadius;
    const speed = STRATEGY_SLICE_CONFIG.feeder.speed;

    for (let i = 0; i < 2; i++) {
      const angleOffset = (i === 0 ? -1 : 1) * (0.7 + this._random() * 0.5);
      const spawnAngle = -Math.PI / 2 + angleOffset;
      const sx = cx + Math.cos(spawnAngle) * sr;
      const sy = cy + Math.sin(spawnAngle) * sr;
      const dx = cx - sx;
      const dy = cy - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const p = createProjectile("normal", sx, sy, (dx / dist) * speed, (dy / dist) * speed);
      this._feeders.push(p);
      this._feederRemaining++;
    }
  }

  // ================================================================
  // 碰撞处理（由 Game.ts 的 resolveGeometry 调用）
  // ================================================================

  /**
   * 处理弹幕命中事件。
   * 返回碰撞事件列表，供 Game.ts 使用。
   */
  resolveProjectileHit(projectile: Projectile, momentum: BladeMomentumState): SliceCollisionEvent[] {
    const events: SliceCollisionEvent[] = [];

    if (!projectile.active || projectile.resolved) return events;

    // 识别弹幕类型
    const isFeeder = this._feeders.includes(projectile);
    const isCore = projectile === this._coreProjectile;
    const isDanger = this._dangerProjectiles.includes(projectile);

    if (isFeeder) {
      // 供能弹被斩
      projectile.active = false;
      projectile.resolved = true;
      this._feederRemaining--;
      events.push({ kind: "feeder_cut", projectileId: projectile.id, description: "供能弹被斩" });
    } else if (isCore) {
      // 核心弹被处理
      return this.resolveCoreHit(momentum);
    } else if (isDanger) {
      // 危险弹被误砍
      projectile.active = false;
      projectile.resolved = true;
      this._dangerWrongCuts++;
      events.push({ kind: "dangerous_wrong_cut", projectileId: projectile.id, description: "危险弹误砍" });
    }

    return events;
  }

  private resolveCoreHit(momentum: BladeMomentumState): SliceCollisionEvent[] {
    const events: SliceCollisionEvent[] = [];
    if (!this._coreProjectile) return events;

    if (this._coreState === "seed") {
      // S1.4: seed 不可斩，刀直接穿过
      events.push({ kind: "core_seed_cut", projectileId: this._coreProjectile?.id ?? "", description: "核心未激活" });
      return events;

    } else if (this._coreState === "charged") {
      // charged：先判断是否可以反射（burst刀势），否则直接斩
      if (momentum.ratio >= 0.7) {
        // 反射 → 核心弹反向飞向 Boss 右肩 → 大破绽
        this._coreProjectile.vx = 0;
        this._coreProjectile.vy = -120;
        this._coreProjectile.reflected = true;
        this._coreState = "reflected";
        events.push({ kind: "core_reflected", projectileId: this._coreProjectile.id, description: "核心反射" });
      } else {
        // 直接斩 → 消除过载风险，不给窗口，补给新供能弹继续本轮
        this._coreProjectile.active = false;
        this._coreProjectile.resolved = true;
        this._coreState = "cut";
        events.push({ kind: "core_charged_cut", projectileId: this._coreProjectile.id, description: "充能核心被斩" });

        // S1.4: 不结束循环，补充2枚新供能弹
        this.respawnFeeders();
      }
    }

    return events;
  }

  /** 检查核心弹反射后是否撞回右肩 */
  checkReflectHitShoulder(): boolean {
    if (this._coreState !== "reflected" || !this._coreProjectile?.active) return false;

    const ap = STRATEGY_SLICE_CONFIG.armor.shoulderPos;
    const dx = this._coreProjectile.x - ap.cx;
    const dy = this._coreProjectile.y - ap.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= Math.max(ap.rx, ap.ry) + 10) {
      this._coreProjectile.active = false;
      this._coreProjectile.resolved = true;
      this.commitCycleOutcome("charged_reflect");
      this.openWindow("large", "charged_reflect");
      // 充能反射后下一轮增加危险弹
      this._carryOverDangerCount += 1;
      return true;
    }
    return false;
  }

  // ================================================================
  // 护甲命中（由 Game.ts 在 resolveGeometry 中调用）
  // ================================================================

  /** 返回护甲世界坐标（供碰撞检测和HUD） */
  getArmorWorldPos(): { cx: number; cy: number; rx: number; ry: number } {
    return { ...STRATEGY_SLICE_CONFIG.armor.shoulderPos };
  }

  /**
   * 护甲被碰撞命中。
   * 返回伤害值。仅在窗口开启时有效。
   */
  resolveArmorHit(momentum: BladeMomentumState): number {
    if (this._phase !== "cycle_window" || this._windowType === "none") return 0;
    // S1.7: 同一窗口只允许一次伤害结算（防止多capsule重复命中）
    if (this._windowArmorHit) return 0;

    const ratio = momentum.ratio;
    let damage = 0;

    if (ratio >= 0.7) {
      damage = STRATEGY_SLICE_CONFIG.armor.highDamage;
    } else if (ratio >= 0.3) {
      damage = STRATEGY_SLICE_CONFIG.armor.midDamage;
    } else {
      damage = STRATEGY_SLICE_CONFIG.armor.lowDamage;
    }

    // S1.5: 小破绽伤害上限25
    if (this._windowType === "small") {
      damage = Math.min(damage, 25);
    }

    this._armorDurability = Math.max(0, this._armorDurability - damage);
    this._totalArmorDamage += damage;
    this._windowArmorHit = true;

    return damage;
  }

  // ================================================================
  // 窗口管理
  // ================================================================

  private openWindow(type: SliceWindowType, source: SliceWindowSource): void {
    if (this._windowOpened) return;
    this._windowOpened = true;
    this._windowType = type;
    this._windowSource = source;
    this._windowTimer = 0;
    this._phase = "cycle_window";
    this._phaseTimer = 0;
    this._windowArmorHit = false;
    this._inputLocked = false;

    // S1.6: 窗口类型计数
    if (type === "small") this._windowSmallCount++;
    else if (type === "large") this._windowLargeCount++;

    // S1.5: 结果统计由 commitCycleOutcome 统一管理，不在此累加
  }

  /** S1.5: 提交本轮唯一结果（确保每cycle一个结果） */
  private commitCycleOutcome(outcome: SliceOutcome): void {
    if (this._cycleOutcomes.length >= this._cycleIndex) return; // 本轮已提交
    this._cycleOutcomes.push(outcome);
    if (outcome === "safe_clear") this._cleanClears++;
    else if (outcome === "charged_reflect") this._chargedReflects++;
    else if (outcome === "overloaded") this._overloads++;
  }

  private closeWindow(): void {
    // 窗口结束时记录玩家选择
    if (this._windowArmorHit) {
      this._lastDecision = "attack_armor";
      this._windowAttacks++;
    } else {
      this._lastDecision = "skip_window";
      this._windowSkips++;
    }

    // 存储本轮决策
    if (this._cycleIndex === 1) {
      this._cycle1Decision = this._lastDecision;
    } else if (this._cycleIndex === 2) {
      this._cycle2Decision = this._lastDecision;
    }

    this._windowType = "none";
    this.enterResolve();
  }

  private enterResolve(): void {
    this._phase = "cycle_resolve";
    this._phaseTimer = 0;
    this._inputLocked = true;
  }

  // ================================================================
  // 空挥处理
  // ================================================================

  resolveEmptySwing(): SliceCollisionEvent[] {
    return [{ kind: "empty_swing", description: "空挥" }];
  }

  // ================================================================
  // Snapshot（供 E2E / HUD / Debug）
  // ================================================================

  getSnapshot(): SliceSnapshot {
    return {
      phase: this._phase,
      cycleIndex: this._cycleIndex,
      coreState: this._coreState,
      coreCharge: this._coreCharge,
      feederRemaining: this._feederRemaining,
      fieldPressure: this._dangerProjectiles.filter(d => d.active).length + (this._coreState === "charged" ? 1 : 0),
      carryOverDangerCount: this._carryOverDangerCount,
      windowType: this._windowType,
      windowSource: this._windowSource,
      windowTimer: this._windowTimer,
      lastDecision: this._lastDecision,
      sliceElapsed: this._sliceElapsed,
      armorDurability: this._armorDurability,
      projectileCount: this._feeders.filter(f => f.active).length
        + this._dangerProjectiles.filter(d => d.active).length
        + (this._coreProjectile?.active ? 1 : 0),
      cycleCompleted: this._phase === "slice_complete",
      inputLocked: this._inputLocked,
      cycleOutcomes: [...this._cycleOutcomes],
      cleanClears: this._cleanClears,
      chargedReflects: this._chargedReflects,
      overloads: this._overloads,
      windowAttacks: this._windowAttacks,
      windowSkips: this._windowSkips,
      dangerWrongCuts: this._dangerWrongCuts,
      totalArmorDamage: this._totalArmorDamage,
      remainingArmor: this._armorDurability,
      windowSmallCount: this._windowSmallCount,
      windowLargeCount: this._windowLargeCount,
      cycle1Decision: this._cycle1Decision,
      cycle2Decision: this._cycle2Decision,
    };
  }

  // ================================================================
  // 计时器推进（供 Game.ts 调用）
  // ================================================================

  advanceTimer(dt: number): void {
    this._sliceElapsed += dt;
  }

  /** 弹幕位置更新（供 Game.ts 在通用弹幕更新中调用） */
  updateProjectilePositions(dt: number): void {
    for (const f of this._feeders) {
      if (!f.active) continue;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
    for (const d of this._dangerProjectiles) {
      if (!d.active) continue;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      // 边界反弹
      if (d.x < 20 || d.x > 370) d.vx = -d.vx;
      if (d.y < 80 || d.y > 800) d.vy = -d.vy;
    }
    if (this._coreProjectile?.active) {
      this._coreProjectile.x += this._coreProjectile.vx * dt;
      this._coreProjectile.y += this._coreProjectile.vy * dt;
    }
  }
}
