// ========================================================================
// P0: BossReactiveController — 5状态机核心控制器
// 状态流: armor_prepare → armor_threat → armor_opportunity
//        → armor_resolve → armor_recovery → (循环或bridgeToPursuit)
// ========================================================================
import type { BossPhaseState, Vec2, Projectile, ProjectileKind, ReactiveArmorTarget, PlayerHpState, BladeContinuousEffect } from "../types";
import { DESIGN_WIDTH, DESIGN_HEIGHT } from "../config/constants";
import { REACTIVE_BOSS_CONFIG } from "../config/bossReactiveFlow";
import { clamp } from "../../utils/math";
import { createProjectile, updateProjectiles, checkSlashHit, cleanInactiveProjectiles, cleanResolvedProjectiles, resetProjectileIdCounter } from "./projectileSystem";
import { capsuleHitsEllipse, geometryHitsArmor } from "./reactiveSlashGeometry";
import type { ReactiveSlashGeometry, CapsuleSource } from "./reactiveSlashGeometry";

const BOSS_CY = 220;
const BOSS_CX = DESIGN_WIDTH / 2;
const ARMOR_L = 0, ARMOR_R = 1, ARMOR_C = 2;

/** 身体碰撞区域（多椭圆并集） */
const BODY_PARTS = [
  { cx: 0, cy: -20, rx: 70, ry: 35 },
  { cx: 0, cy: 15, rx: 50, ry: 40 },
  { cx: 0, cy: -65, rx: 30, ry: 18 },
];

// ================================================================
// P4.4B-R5.6: 统一结算类型（session 级事件累积 + 单一结果）
// ================================================================

/** 完整碰撞事件（弹幕/护甲/身体统一） */
export interface ReactiveCollisionEvent {
  kind: "projectile_cut" | "projectile_reflect" | "projectile_dangerous" | "armor" | "body";
  hitPos: Vec2;
  collisionSource: CapsuleSource;
  /** 仅 projectile_* 时有值 */
  projectileId?: string;
  projectileKind?: ProjectileKind;
}

/** 收刀 session（跨 segment 累积） */
interface ReactiveSlashSession {
  slashId: string;
  events: ReactiveCollisionEvent[];
  bodyContact: boolean;
  lastBodyHitPos?: Vec2;
  hitProjectileIds: Set<string>;
  /** P1-B: 护甲提交后关闭碰撞写入，后续 segment 不再追加事件 */
  closedForCollision: boolean;
}

/** P4.4B-R5.7: 命中后立即提交的护甲结算快照（二级生命周期） */
interface PendingReactiveSlashResult {
  slashId: string;
  resolved: boolean;
  consumed: boolean;
  armorIndex: number;
  armorDamage: number;
  armorBroken: boolean;
  allArmorBroken: boolean;
  armorCollisionSource: CapsuleSource | null;
  armorHitPos: Vec2 | null;
  events: ReactiveCollisionEvent[];
  bodyContact: boolean;
  lastBodyHitPos?: Vec2;
}

/** P0-D: 单一结算结果 — Controller 一次性返回完整结算 */
export interface ReactiveSlashResolveResult {
  slashId: string;
  /** 最终能量（已 clamp [0,100]） */
  energyAfter: number;
  /** 结算前能量 */
  energyBefore: number;
  /** 挥刀基础消耗 */
  baseCost: number;
  /** 拆分明细 */
  projectileCutCount: number;
  projectileReflectCount: number;
  dangerousWrongCutCount: number;
  projectileCutReward: number;
  projectileReflectReward: number;
  dangerousWrongCutPenalty: number;
  armorReward: number;
  bodyWrongHitPenalty: number;
  emptySwingPenalty: number;
  /** 是否命中护甲 */
  armorHit: boolean;
  armorDurabilityDamage: number;
  armorBroken: boolean;
  allArmorBroken: boolean;
  bodyWrongHit: boolean;
  /** primaryResult + primarySource — Controller 直接计算，禁止 Game 二次推导 */
  primaryResult: string;
  secondaryResults: string[];
  primarySource: CapsuleSource | "-";
  /** 护甲命中世界坐标 */
  armorHitPos: Vec2 | null;
  /** 完整碰撞事件列表（跨 segment 累积） */
  events: ReactiveCollisionEvent[];
  unclampedAfter: number;
}

export class BossReactiveController {
  private _phase: BossPhaseState = "armor_prepare";
  get phase(): BossPhaseState { return this._phase; }

  // P4.4B-R5.6 P0-A: 扩展 inputLocked，prepare/resolve/recovery 禁止起刀。
  // 旧实现只在 resolve 锁定，导致玩家在 prepare/threat/recovery 起刀后无法命中护甲，
  // 但系统仍扣除 baseCost+emptySwingPenalty，形成负反馈死循环。
  get inputLocked(): boolean {
    return this._phase === "armor_prepare"
      || this._phase === "armor_resolve"
      || this._phase === "armor_recovery";
  }
  get freezeCombatResources(): boolean {
    return this._phase === "armor_resolve" || this._phase === "armor_recovery";
  }
  get bossModeActive(): boolean { return this._phase !== "exit"; }

  // ---- 计时器 ----
  private _elapsed = 0;
  private phaseTimer = 0;
  private threatSpawnTimer = 0;
  private threatDuration = 2.5;

  // ---- 护甲 ----
  private armorTargets: ReactiveArmorTarget[] = [];
  private activeArmorIndex = ARMOR_L;
  private armorProgress = 0;
  private readonly maxArmor = 3;

  // ---- 弹幕 ----
  private projectiles: Projectile[] = [];

  // ---- 玩家 ----
  private playerHp: PlayerHpState = {
    current: 100,
    max: 100,
    invincibleTimer: 0,
    flashTimer: 0,
  };

  // ---- 刀势连续效果 ----
  private bladeEffect: BladeContinuousEffect = {
    visualLength: 30,
    width: 3,
    brightness: 0.3,
    color: "#666666",
    glowColor: "rgba(102,102,102,0.25)",
  };

  // ---- 渲染 ----
  private renderY = BOSS_CY;
  private bossRenderScale = REACTIVE_BOSS_CONFIG.visual.bossScale;

  // Debug mode — controls phase text visibility
  private _debugMode = false;
  get debugMode(): boolean { return this._debugMode; }
  set debugMode(v: boolean) { this._debugMode = v; }
  private shakeTimer = 0;
  private flash = 0;
  private screenShake = 0;
  private particles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; color: string; alpha: number }[] = [];

  // ---- 外部桥接 ----
  private _bridgeTriggered = false;

  // ---- 内部状态 ----
  private _resolvedSlashId = "";
  // P4.4B-R5.7: pendingSlashResult 二级生命周期
  private _pendingSlashResult: PendingReactiveSlashResult | null = null;
  // P4.4B-R5.2 P0-3: session 级别弹幕去重集合，同一弹幕跨多个 segment 只命中一次。
  // 旧实现每次 resolveGeometry 调用新建本地 hitProjectileSet，同一刀多次调用会重复命中。
  private _session: ReactiveSlashSession = { slashId: "", events: [], bodyContact: false, hitProjectileIds: new Set(), closedForCollision: false };
  /** 当前挥刀的刀势能量（由外部设置） */
  currentSlashEnergy: number = 0;

  /** P4.4B-R5.2 P0-6: 机会窗口按 slashId 宽限。 */
  private _graceSlashId: string | null = null;

  /** P4.4B-R5.4 P0-3: 护甲/身体命中的真实碰撞来源（供 Debug 遥测） */
  private _lastArmorCollisionSource: CapsuleSource | null = null;
  private _lastBodyCollisionSource: CapsuleSource | null = null;
  private _lastArmorHitPos: Vec2 | null = null;

  constructor() {
    this.initArmorTargets();
  }

  private initArmorTargets(): void {
    this.armorTargets = [
      {
        id: ARMOR_L, name: "左肩", relX: -50, relY: -30,
        radiusX: 34, radiusY: 26, active: true, broken: false,
        durability: REACTIVE_BOSS_CONFIG.armor.durabilityPerPiece,
        maxDurability: REACTIVE_BOSS_CONFIG.armor.durabilityPerPiece,
        crackProgress: 0, animTimer: 0,
        projectileKind: "normal", bossAction: "sweep",
      },
      {
        id: ARMOR_R, name: "右肩", relX: 50, relY: -30,
        radiusX: 34, radiusY: 26, active: true, broken: false,
        durability: REACTIVE_BOSS_CONFIG.armor.durabilityPerPiece,
        maxDurability: REACTIVE_BOSS_CONFIG.armor.durabilityPerPiece,
        crackProgress: 0, animTimer: 0,
        projectileKind: "reflective", bossAction: "reflect",
      },
      {
        id: ARMOR_C, name: "胸甲", relX: 0, relY: 6,
        radiusX: 28, radiusY: 30, active: true, broken: false,
        durability: REACTIVE_BOSS_CONFIG.armor.durabilityPerPiece,
        maxDurability: REACTIVE_BOSS_CONFIG.armor.durabilityPerPiece,
        crackProgress: 0, animTimer: 0,
        projectileKind: "dangerous", bossAction: "mixed",
      },
    ];
  }

  /** 重置所有状态 */
  reset(): void {
    this.clearOpportunityGrace(); // P0-2: reset 时清理
    this._phase = "armor_prepare";
    this._elapsed = 0;
    this.phaseTimer = 0;
    this.threatSpawnTimer = 0;
    this.threatDuration = 2.5;
    this.armorProgress = 0;
    this.activeArmorIndex = ARMOR_L;
    this.projectiles = [];
    this.playerHp = {
      current: 100,
      max: 100,
      invincibleTimer: 0,
      flashTimer: 0,
    };
    this._resolvedSlashId = "";
    this._session = { slashId: "", events: [], bodyContact: false, hitProjectileIds: new Set(), closedForCollision: false };
    this._pendingSlashResult = null; // P4.4B-R5.7: 清理 pending
    this._lastArmorCollisionSource = null; // P4.4B-R5.7: 清理碰撞来源
    this._lastBodyCollisionSource = null;
    this._lastArmorHitPos = null;
    this._bridgeTriggered = false;
    this.shakeTimer = 0;
    this.flash = 0;
    this.screenShake = 0;
    this.particles = [];
    this.renderY = BOSS_CY;
    this.bossRenderScale = REACTIVE_BOSS_CONFIG.visual.bossScale;
    resetProjectileIdCounter();
    this.initArmorTargets();
  }

  // ================================================================
  // 主更新循环
  // ================================================================
  update(dt: number): void {
    this._elapsed += dt;
    this.phaseTimer += dt;
    this.playerHp.invincibleTimer = Math.max(0, this.playerHp.invincibleTimer - dt);
    this.playerHp.flashTimer = Math.max(0, this.playerHp.flashTimer - dt);
    this.shakeTimer = Math.max(0, this.shakeTimer - dt * 3);
    this.screenShake = Math.max(0, this.screenShake - dt * 2.7);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    // 护甲动画计时器衰减
    for (const t of this.armorTargets) {
      t.animTimer = Math.max(0, t.animTimer - dt);
    }

    switch (this._phase) {
      case "armor_prepare":
        this.updateArmorPrepare(dt);
        break;
      case "armor_threat":
        this.updateArmorThreat(dt);
        break;
      case "armor_opportunity":
        this.updateArmorOpportunity(dt);
        break;
      case "armor_resolve":
        this.updateArmorResolve(dt);
        break;
      case "armor_recovery":
        this.updateArmorRecovery(dt);
        break;
    }

    // 更新弹幕
    updateProjectiles(this.projectiles, dt);
    // 更新粒子
    this.updateParticles(dt);
  }

  // ================================================================
  // 状态机各阶段更新
  // ================================================================

  private updateArmorPrepare(dt: number): void {
    if (this.phaseTimer >= REACTIVE_BOSS_CONFIG.phaseTimers.armorPrepare) {
      this.transitionToThreat();
    }
  }

  private updateArmorThreat(dt: number): void {
    // 按间隔生成弹幕
    this.threatSpawnTimer += dt;
    // P4.4B-R3 P0-B: 间隔配置化（0.85+random*0.2），验证期减少单段弹幕数量。
    const { intervalBase, intervalJitter } = REACTIVE_BOSS_CONFIG.threatSpawn;
    const spawnInterval = intervalBase + Math.random() * intervalJitter;
    if (this.threatSpawnTimer >= spawnInterval) {
      this.threatSpawnTimer = 0;
      this.spawnProjectileForCurrentArmor();
    }

    if (this.phaseTimer >= this.threatDuration) {
      this.transitionToOpportunity();
    }
  }

  private updateArmorOpportunity(dt: number): void {
    // P4.4B-R5.3 P0-2: 机会窗口按 slashId 宽限。
    // 正式窗口 1.5s 结束后，如果有 graceSlashId（窗口内起刀的 slashId），延长 0.12s 宽限。
    // 没有起刀时窗口按原 1.5s 结束，立即 recovery。
    const baseEnd = REACTIVE_BOSS_CONFIG.phaseTimers.opportunityDuration;
    const graceEnd = this._graceSlashId ? baseEnd + 0.12 : baseEnd;
    if (this.phaseTimer >= graceEnd) {
      this.clearOpportunityGrace();
      this.transitionToRecovery();
    }
  }

  /** P4.4B-R5.2 P0-6: 注册 Reactive 挥刀起始（Game 在 startSlash 时调用）。
   *  只有在 phase === armor_opportunity 且计时未超过正式窗口时起刀，才记录 graceSlashId。
   *  窗口结束后，仅该 slashId 可继续 0.12s 完成。 */
  registerReactiveSlashStart(slashId: string): void {
    if (this._phase === "armor_opportunity"
      && this.phaseTimer < REACTIVE_BOSS_CONFIG.phaseTimers.opportunityDuration) {
      this._graceSlashId = slashId;
    }
  }

  /** P4.4B-R5.2 P0-2: 获取 graceSlashId（供 Debug 遥测显示） */
  getGraceSlashId(): string | null { return this._graceSlashId; }

  /** P4.4B-R5.4 P0-3: 获取最近一次护甲命中的碰撞来源 */
  getLastArmorCollisionSource(): CapsuleSource | null { return this._lastArmorCollisionSource; }
  /** P4.4B-R5.4 P0-3: 获取最近一次身体命中的碰撞来源 */
  getLastBodyCollisionSource(): CapsuleSource | null { return this._lastBodyCollisionSource; }
  /** P4.4B-R5.4 P0-3: 获取最近一次护甲命中的世界坐标 */
  getLastArmorHitPos(): Vec2 | null { return this._lastArmorHitPos; }

  private updateArmorRecovery(dt: number): void {
    if (this.phaseTimer >= REACTIVE_BOSS_CONFIG.phaseTimers.recoveryDuration) {
      this.finishRecovery();
    }
  }

  private updateArmorResolve(_dt: number): void {
    if (this.phaseTimer >= REACTIVE_BOSS_CONFIG.phaseTimers.resolveDuration) {
      this.transitionToRecovery();
    }
  }

  // ================================================================
  // 状态转换
  // ================================================================

  private transitionToThreat(): void {
    this._phase = "armor_threat";
    this.phaseTimer = 0;
    this.threatSpawnTimer = 0;
    // 随机持续时间 2.0~3.0
    const [min, max] = REACTIVE_BOSS_CONFIG.phaseTimers.threatDuration;
    this.threatDuration = min + Math.random() * (max - min);
    // Boss动作
    this.performBossAction(this.getCurrentArmor());
  }

  /** P4.4B-R5.2 P0-2: 清理机会窗口宽限（必须在所有状态转换点调用） */
  private clearOpportunityGrace(): void {
    this._graceSlashId = null;
  }

  /** P4.4B-R5.3 P0-2: 判断当前 slashId 是否可在机会窗口内命中护甲。
   *  正式窗口（≤1.5s）内任何刀可命中；
   *  宽限期（1.5~1.62s）内仅 graceSlashId 对应的旧刀可命中；
   *  窗口结束后新起刀不得命中。 */
  private canResolveArmorForSlash(slashId: string): boolean {
    if (this._phase !== "armor_opportunity") return false;
    const baseEnd = REACTIVE_BOSS_CONFIG.phaseTimers.opportunityDuration;
    const graceEnd = baseEnd + 0.12;
    if (this.phaseTimer <= baseEnd) return true; // 正式窗口内
    return this.phaseTimer <= graceEnd && this._graceSlashId === slashId; // 宽限期内仅旧刀
  }

  private transitionToOpportunity(): void {
    // P4.4B-R5.3 P0-2: 先清空旧 graceSlashId，等待本窗口的新刀注册
    this.clearOpportunityGrace();
    this._phase = "armor_opportunity";
    this.phaseTimer = 0;
    // 护甲高亮发光
    this.getCurrentArmor().animTimer = 0.3;
  }

  private transitionToRecovery(): void {
    this.clearOpportunityGrace(); // P0-2: 超时后清理
    this._phase = "armor_recovery";
    this.phaseTimer = 0;
    this._resolvedSlashId = "";
    // P4.4B-R5.7: 不再清空 _session 和 _pendingSlashResult，保留到 finishSlash 消费
    cleanResolvedProjectiles(this.projectiles);
  }

  private transitionToResolve(): void {
    this.clearOpportunityGrace(); // P0-2: 命中后清理
    this._phase = "armor_resolve";
    this.phaseTimer = 0;
  }

  private finishRecovery(): void {
    this.clearOpportunityGrace(); // P0-2: 切换护甲时清理
    const remaining = this.armorTargets.filter(a => !a.broken);
    if (remaining.length === 0) {
      this._phase = "exit";
      this._bridgeTriggered = true;
      return;
    }
    // 找下一个未破碎的护甲
    const nextIdx = this.armorTargets.findIndex(a => !a.broken);
    if (nextIdx >= 0) {
      // P4.4B-R3 P0-B: 切换到新护甲时恢复 player HP（不超过 max），
      // 让测试者即使前一段漏弹也能继续验证后续阶段。
      const heal = REACTIVE_BOSS_CONFIG.playerHp.armorTransitionHeal ?? 0;
      if (heal > 0 && this.playerHp.current < this.playerHp.max) {
        const before = this.playerHp.current;
        this.playerHp.current = Math.min(this.playerHp.max, before + heal);
        // 治疗闪烁用 flashTimer 的反相（不闪红），用一个独立标记或直接走 flashTimer 但语义不同。
        // 简单做法：复用 flashTimer 触发一个轻微高光（HP 条已有 flashTimer 分支），值取负数区分。
        // 但 flashTimer 在 update 中只衰减不读符号，故用一个小正数让条白色脉冲一下作为视觉反馈。
        // 这里不强制闪烁，避免和受击红光混淆。仅在 stats 层面回血。
      }
      this.activeArmorIndex = nextIdx;
      this._phase = "armor_prepare";
      this.phaseTimer = 0;
    } else {
      this._phase = "exit";
      this._bridgeTriggered = true;
    }
  }

  // ================================================================
  // 弹幕生成
  // ================================================================

  private spawnProjectileForCurrentArmor(): void {
    const armor = this.getCurrentArmor();
    // P4.4B-R5.1 P1-3: 使用统一世界变换接口获取弹幕出生点
    const origin = this.getProjectileSpawnOrigin();
    const bx = origin.x;
    const by = origin.y;

    if (armor.projectileKind === "normal") {
      // 普通弹幕：直线向下
      const p = createProjectile("normal", bx, by, 0, REACTIVE_BOSS_CONFIG.projectiles.normal.speed);
      this.projectiles.push(p);
    } else if (armor.projectileKind === "reflective") {
      // 强化弹幕：略微左右偏移
      const angleSpread = 0.3;
      const angle = Math.PI / 2 + (Math.random() - 0.5) * angleSpread;
      const speed = REACTIVE_BOSS_CONFIG.projectiles.reflective.speed;
      const p = createProjectile(
        "reflective",
        bx, by,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed
      );
      this.projectiles.push(p);
    } else if (armor.projectileKind === "dangerous") {
      // 混合模式：发射普通弹幕 + 危险雷球
      // 普通弹幕x1
      const p1 = createProjectile("normal", bx - 20, by, 0, REACTIVE_BOSS_CONFIG.projectiles.normal.speed);
      this.projectiles.push(p1);
      // 危险雷球x1
      const p2 = createProjectile("dangerous", bx + 20, by, 0, REACTIVE_BOSS_CONFIG.projectiles.dangerous.speed);
      this.projectiles.push(p2);
    }
  }

  private performBossAction(armor: ReactiveArmorTarget): void {
    // Boss动作动画（视觉表现）
    if (armor.bossAction === "sweep") {
      this.shakeTimer = 0.15;
    } else if (armor.bossAction === "reflect") {
      this.shakeTimer = 0.1;
    } else if (armor.bossAction === "mixed") {
      this.shakeTimer = 0.2;
    }
  }

  private getCurrentArmor(): ReactiveArmorTarget {
    return this.armorTargets[this.activeArmorIndex];
  }

  /** P4.4B-R3 P0-D: 当前激活护甲索引（供 E2E reactiveSnapshot 读） */
  getActiveArmorIndex(): number { return this.activeArmorIndex; }

  /** P0-5: 测试专用 — 确定性注入弹幕（跳过随机生成）
   * @internal - 仅 Vitest 测试使用，V0723017 前从生产包移除 */
  spawnProjectileForTest(kind: ProjectileKind, x: number, y: number, vx?: number, vy?: number): Projectile {
    const cfgKey = kind === "dangerous" ? "normal" : kind;
    const speed = REACTIVE_BOSS_CONFIG.projectiles[cfgKey]?.speed ?? REACTIVE_BOSS_CONFIG.projectiles.normal.speed;
    const p = createProjectile(kind, x, y, vx ?? 0, vy ?? speed);
    this.projectiles.push(p);
    return p;
  }

  // ================================================================
  // P4.4B-R5.1 P1-3: 统一 Boss 世界变换接口
  // 审计 §12 指出：多处重复手写 BOSS_CX + relX * bossRenderScale。
  // 渲染、碰撞、Debug、弹幕出生和 E2E 全部调用这些接口，删除重复公式。
  // ================================================================

  /** Boss 世界变换参数 */
  getBossWorldTransform(): { center: Vec2; scale: number } {
    return { center: { x: BOSS_CX, y: this.renderY }, scale: this.bossRenderScale };
  }

  /** 局部坐标 → 世界坐标 */
  localToBossWorld(local: Vec2): Vec2 {
    return {
      x: BOSS_CX + local.x * this.bossRenderScale,
      y: this.renderY + local.y * this.bossRenderScale,
    };
  }

  /** 指定护甲的世界几何（中心 + 半径，乘 bossRenderScale） */
  getArmorWorldGeometry(index: number): { center: Vec2; rx: number; ry: number } | null {
    const armor = this.armorTargets[index];
    if (!armor || armor.broken) return null;
    return {
      center: this.localToBossWorld({ x: armor.relX, y: armor.relY }),
      rx: armor.radiusX * this.bossRenderScale,
      ry: armor.radiusY * this.bossRenderScale,
    };
  }

  /** 弹幕出生原点（当前护甲世界中心） */
  getProjectileSpawnOrigin(): Vec2 {
    const armor = this.getCurrentArmor();
    return this.localToBossWorld({ x: armor.relX, y: armor.relY });
  }

  /** P4.4B-R3 P0-D: 当前激活护甲的世界坐标 + 半径（供 E2E 程序化命中使用）。
   *  P4.4B-R5.1 P1-3: 内部调 getArmorWorldGeometry 统一接口。 */
  getActiveArmorWorldPos(): { cx: number; cy: number; rx: number; ry: number } | null {
    const g = this.getArmorWorldGeometry(this.activeArmorIndex);
    if (!g) return null;
    return { cx: g.center.x, cy: g.center.y, rx: g.rx, ry: g.ry };
  }

  /** P1-3: 身体部位世界几何（返回所有身体椭圆的世界坐标） */
  getBodyWorldGeometry(): Array<{ center: Vec2; rx: number; ry: number }> {
    return BODY_PARTS.map(p => ({
      center: this.localToBossWorld({ x: p.cx, y: p.cy }),
      rx: p.rx * this.bossRenderScale,
      ry: p.ry * this.bossRenderScale,
    }));
  }

  /** P4.4B-R3 P0-D: 设置程序化命中的刀势能量（E2E 用，避免依赖外部 Game 注入） */
  setProgrammaticSlashEnergy(energy: number): void {
    this.currentSlashEnergy = energy;
  }

  /** P4.4B-R3 P0-D: 当前护甲耐久数组（供 E2E reactiveSnapshot 读，深拷贝防外部篡改） */
  getArmorDurability(): number[] {
    return this.armorTargets.map(a => Math.max(0, Math.round(a.durability)));
  }

  /** P4.4B-R3 P0-D: 弹幕数量（供 E2E reactiveSnapshot 读） */
  getProjectileCount(): number {
    return this.projectiles.filter(p => p.active && !p.resolved).length;
  }

  // ================================================================
  // 挥刀判定
  // ================================================================

  /**
   * P4.4B-R5 P0-C: 接收完整 ReactiveSlashGeometry，真正遍历三胶囊做护甲/弹幕/身体判定。
   * 审计 §6 指出：R4 把 geometry 压缩成 baseA→tipB 一条线传给 resolveSegment，
   * 只对这一个胶囊做护甲检测。Debug 画三胶囊但实际碰撞只用一条，误导验证。
   *
   * 本方法遍历 geometry.capsules 的全部3个胶囊：
   * - 手指轨迹(baseA→baseB)
   * - 可见刀身(baseB→tipB)
   * - 刀尖扫掠区(tipA→tipB)
   * 只要任意胶囊命中护甲/弹幕/身体，即视为命中。
   */
  /**
   * P4.4B-R5.6 P0-C: 完整三胶囊碰撞 + session 级事件累积。
   * 每次 segment 调用将新事件追加到 session，不会互相覆盖。
   * @returns 本 segment 的新增事件（供 Game 做同帧粒子反馈）
   */
  resolveGeometry(geometry: ReactiveSlashGeometry): ReactiveCollisionEvent[] {
    if (this._phase !== "armor_threat" && this._phase !== "armor_opportunity") return [];
    if (this._resolvedSlashId === geometry.slashId) return [];

    // P1-B: 护甲已提交后，同一 slash 后续 segment 不再写入事件
    if (
      this._session.slashId === geometry.slashId &&
      this._session.closedForCollision
    ) return [];

    // 初始化 Session
    if (this._session.slashId !== geometry.slashId) {
      this._session = { slashId: geometry.slashId, events: [], bodyContact: false, hitProjectileIds: new Set(), closedForCollision: false };
    }

    const newEvents: ReactiveCollisionEvent[] = [];
    const slashEnergy = geometry.lockedEnergy;

    // 1. 弹幕判定
    for (const cap of geometry.capsules) {
      const projHits = checkSlashHit(this.projectiles, cap.a, cap.b, cap.radius);
      for (const idx of projHits) {
        const p = this.projectiles[idx];
        if (!p || !p.active || p.hitBySlashId === geometry.slashId) continue;
        if (this._session.hitProjectileIds.has(p.id)) continue;
        // P4.4B-R5.7: 跳过已反射的弹幕
        if (p.reflected) continue;
        this._session.hitProjectileIds.add(p.id);
        p.hitBySlashId = geometry.slashId;

        const hitPos = { x: p.x, y: p.y }; // P4.4B-R5.7: 使用弹幕中心坐标

        if (p.kind === "normal") {
          // P4.4B-R5.6 P1-3: cut = 立即停止
          p.resolution = "cut";
          p.resolved = true;
          p.active = false;
          const ev: ReactiveCollisionEvent = { kind: "projectile_cut", projectileId: p.id, projectileKind: "normal", collisionSource: cap.source, hitPos };
          newEvents.push(ev);
          this._session.events.push(ev);
        } else if (p.kind === "reflective") {
          if (slashEnergy >= 70) {
            // reflect: 反向继续，不设 resolved（避免被清理），不伤害玩家
            p.resolution = "reflect";
            p.reflected = true;
            p.vx = -p.vx;
            p.vy = -p.vy;
            const ev: ReactiveCollisionEvent = { kind: "projectile_reflect", projectileId: p.id, projectileKind: "reflective", collisionSource: cap.source, hitPos };
            newEvents.push(ev);
            this._session.events.push(ev);
          } else {
            p.resolution = "cut";
            p.resolved = true;
            p.active = false;
            const ev: ReactiveCollisionEvent = { kind: "projectile_cut", projectileId: p.id, projectileKind: "reflective", collisionSource: cap.source, hitPos };
            newEvents.push(ev);
            this._session.events.push(ev);
          }
        } else if (p.kind === "dangerous") {
          p.resolution = "wrong_cut";
          p.resolved = true;
          p.active = false;
          this.takeDamage(REACTIVE_BOSS_CONFIG.playerHp.mistakenCutDamage);
          const ev: ReactiveCollisionEvent = { kind: "projectile_dangerous", projectileId: p.id, projectileKind: "dangerous", collisionSource: cap.source, hitPos };
          newEvents.push(ev);
          this._session.events.push(ev);
        }
      }
    }

    // 2. 护甲命中检测 — P4.4B-R5.7: 首次碰撞立即提交伤害
    if (this.canResolveArmorForSlash(geometry.slashId)) {
      const armor = this.getCurrentArmor();
      if (armor && !armor.broken) {
        const armorGeom = this.getArmorWorldGeometry(this.activeArmorIndex);
        if (armorGeom && geometryHitsArmor(geometry, armorGeom.center, armorGeom.rx, armorGeom.ry)) {
          const hitCap = geometry.capsules.find(cap =>
            capsuleHitsEllipse(cap.a, cap.b, cap.radius, armorGeom.center, armorGeom.rx, armorGeom.ry)
          );
          const source = hitCap?.source ?? null;
          const hitPos = this.computeArmorContactPoint(hitCap, armorGeom.center, armorGeom.rx, armorGeom.ry);
          this._lastArmorCollisionSource = source;
          this._lastArmorHitPos = hitPos;
          // P4.4B-R5.7: 立即提交伤害，写入 pendingSlashResult
          this.commitArmorDamage(slashEnergy, this.activeArmorIndex, source, hitPos);
          this._resolvedSlashId = geometry.slashId;
          this.transitionToResolve();
        }
      }

      // 3. 身体碰撞 — P1-3: 使用 getBodyWorldGeometry 统一世界变换
      if (!this._resolvedSlashId) {
        const bodyParts = this.getBodyWorldGeometry();
        for (const cap of geometry.capsules) {
          const bodyHit = bodyParts.some(bp =>
            capsuleHitsEllipse(cap.a, cap.b, cap.radius, bp.center, bp.rx, bp.ry)
          );
          if (bodyHit && !this._session.bodyContact) {
            this._session.bodyContact = true;
            this._session.lastBodyHitPos = cap.b;
            this._lastBodyCollisionSource = cap.source;
            break;
          }
        }
      }
    }

    return newEvents;
  }

  /**
   * P4.4B-R5 P0-A: 计算护甲固定绝对值伤害。
   * 审计 §2/§3 指出：旧公式 armor.durability*0.25/0.55 按剩余耐久百分比递减，
   * 导致"越打伤害越低"，左肩需 12-14 次低刀势命中，形成负反馈死循环。
   *
   * 新规则（固定绝对值，不超过剩余耐久）：
   * - 高刀势(≥70)：直接破甲（剩余耐久全扣）
   * - 中刀势(30-69)：固定 55 点
   * - 低刀势(<30)：固定 25 点
   *
   * 验收：低4刀(100→75→50→25→0)、中2刀(100→45→0)、高1刀(100→0)。
   */
  private calculateArmorDamage(energy: number, armor: ReactiveArmorTarget): number {
    const cfg = REACTIVE_BOSS_CONFIG.armor;
    if (energy >= 70) {
      return armor.durability; // 高刀势直接破甲
    }
    if (energy >= 30) {
      return Math.min(armor.durability, cfg.midEnergyDamage); // 固定55
    }
    return Math.min(armor.durability, cfg.lowEnergyCrack); // 固定25
  }

  /**
   * P4.4B-R5.7: 计算护甲与胶囊的接触点（护甲椭圆边界方向上的最近点）
   */
  private computeArmorContactPoint(
    hitCap: { a: Vec2; b: Vec2; radius: number } | undefined,
    center: Vec2,
    rx: number,
    ry: number,
  ): Vec2 {
    if (!hitCap) return { x: center.x, y: center.y };
    // 取胶囊中点作为参考方向
    const midX = (hitCap.a.x + hitCap.b.x) / 2;
    const midY = (hitCap.a.y + hitCap.b.y) / 2;
    const dx = midX - center.x;
    const dy = midY - center.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) return { x: center.x, y: center.y };
    // 归一化方向，沿椭圆边界投影
    const angle = Math.atan2(dy, dx);
    const px = center.x + rx * Math.cos(angle);
    const py = center.y + ry * Math.sin(angle);
    return { x: px, y: py };
  }

  /**
   * P4.4B-R5.7: 首次护甲碰撞时立即提交伤害。
   * 扣减耐久、设置 broken/allArmorBroken、写入 _pendingSlashResult。
   */
  private commitArmorDamage(
    energy: number,
    armorIndex: number,
    source: CapsuleSource | null,
    hitPos: Vec2 | null,
  ): PendingReactiveSlashResult {
    const armor = this.armorTargets[armorIndex];
    const damage = this.calculateArmorDamage(energy, armor);
    armor.durability = Math.max(0, armor.durability - damage);
    armor.crackProgress = 1 - armor.durability / armor.maxDurability;
    armor.animTimer = 0.4;

    let armorBroken = false;
    let allArmorBroken = false;
    if (armor.durability <= 0) {
      armor.broken = true;
      armor.active = false;
      this.armorProgress++;
      armorBroken = true;
      if (this.armorProgress >= this.maxArmor) allArmorBroken = true;
    }

    const pending: PendingReactiveSlashResult = {
      slashId: this._session.slashId,
      resolved: true,
      consumed: false,
      armorIndex,
      armorDamage: damage,
      armorBroken,
      allArmorBroken,
      armorCollisionSource: source,
      armorHitPos: hitPos ? { ...hitPos } : null,
      events: [...this._session.events],
      bodyContact: this._session.bodyContact,
      lastBodyHitPos: this._session.lastBodyHitPos,
    };
    this._pendingSlashResult = pending;

    // P1-B: 护甲提交后立即关闭本 slash 的后续碰撞写入
    this._session.closedForCollision = true;

    // 护甲事件加到 session
    const armorEv: ReactiveCollisionEvent = {
      kind: "armor",
      hitPos: hitPos ?? { x: BOSS_CX, y: this.renderY },
      collisionSource: source ?? "visibleBlade",
    };
    this._session.events.push(armorEv);

    return pending;
  }

  /**
   * P4.4B-R5.7 P0-D/P0-E/P0-F: 收刀结算 — Controller 完全驱动结果。
   * 优先消费 _pendingSlashResult（二级生命周期），不再调用 getCurrentArmor() 二次结算。
   *
   * @param slashId 挥刀 ID
   * @param energyBefore 结算前 Game.energy 值
   * @param pathLen 本次挥刀路径长度（用于计算 long-slash cost）
   */
  finishSlash(slashId: string, energyBefore: number, pathLen: number): ReactiveSlashResolveResult {
    // P4.4B-R5.6 P0-B: 使用 reactiveSlash 单一配置
    const rcfg = REACTIVE_BOSS_CONFIG.reactiveSlash;
    const rawCost = rcfg.baseCost + Math.floor(pathLen / 100) * rcfg.costPer100Px;
    const baseCost = Math.min(rawCost, rcfg.maxCost);

    // ---- 从 session.events 统计（不扫描 projectiles） ----
    const events = this._session.slashId === slashId ? [...this._session.events] : [];
    let projectileCutCount = 0;
    let projectileReflectCount = 0;
    let dangerousWrongCutCount = 0;
    for (const e of events) {
      if (e.kind === "projectile_cut") projectileCutCount++;
      else if (e.kind === "projectile_reflect") projectileReflectCount++;
      else if (e.kind === "projectile_dangerous") dangerousWrongCutCount++;
    }

    // ---- 护甲命中结算（从 _pendingSlashResult 消费） ----
    let armorHit = false;
    let armorDurabilityDamage = 0;
    let armorBroken = false;
    let allArmorBroken = false;
    let armorReward = 0;
    const cfg = REACTIVE_BOSS_CONFIG.bladeEnergy;
    let armorCollisionSource: CapsuleSource | null = null;
    let armorHitPos: Vec2 | null = null;

    if (this._pendingSlashResult && this._pendingSlashResult.slashId === slashId && !this._pendingSlashResult.consumed) {
      const pending = this._pendingSlashResult;
      armorHit = true;
      armorDurabilityDamage = pending.armorDamage;
      armorBroken = pending.armorBroken;
      allArmorBroken = pending.allArmorBroken;
      armorCollisionSource = pending.armorCollisionSource;
      armorHitPos = pending.armorHitPos ? { ...pending.armorHitPos } : null;
      armorReward = pending.armorBroken ? cfg.armorBreakReward : cfg.armorCrackReward;
      pending.consumed = true;

      // P0-3: 不再 push armorEv 到 events（已在 commitArmorDamage 时加入 _session.events，
      // events 从 _session.events 拷贝已包含唯一 armor event，此处 push 会导致重复）
    }

    // ---- 身体误击 ----
    let bodyWrongHit = false;
    let bodyWrongHitPenalty = 0;
    const bodyCollisionSource = this._lastBodyCollisionSource;
    const hasArmorResolve = this._pendingSlashResult?.slashId === slashId;
    if (this._session.slashId === slashId && this._session.bodyContact && !hasArmorResolve) {
      bodyWrongHit = true;
      bodyWrongHitPenalty = cfg.wrongHitPenalty;
      events.push({
        kind: "body",
        hitPos: this._session.lastBodyHitPos ?? { x: BOSS_CX, y: this.renderY },
        collisionSource: bodyCollisionSource ?? "visibleBlade",
      });
    }

    // ---- 空挥惩罚（仅 opportunity 阶段） ----
    const isFullMiss = !armorHit && !bodyWrongHit && projectileCutCount === 0 && projectileReflectCount === 0 && dangerousWrongCutCount === 0;
    const emptySwingPenalty = isFullMiss ? rcfg.emptySwingPenalty : 0;

    // ---- 能量结算 ----
    const projectileCutReward = projectileCutCount * cfg.normalBulletReward;
    const projectileReflectReward = projectileReflectCount * cfg.reflectReward;
    const dangerousWrongCutPenaltyTotal = dangerousWrongCutCount * cfg.wrongHitPenalty;

    const unclampedEnergy = energyBefore
      - baseCost
      + projectileCutReward
      + projectileReflectReward
      + armorReward
      - dangerousWrongCutPenaltyTotal
      - bodyWrongHitPenalty
      - emptySwingPenalty;
    const energyAfter = clamp(unclampedEnergy, 0, cfg.max);

    // ---- primaryResult（P4.4B-R5.7: 优先级调整） ----
    // 优先级: armor_broken > armor_hit > dangerous_wrong_cut > body_wrong_hit > projectile_reflect > projectile_cut > empty_swing
    let primaryResult: string;
    let primarySource: CapsuleSource | "-";
    if (armorBroken) {
      primaryResult = "armor_broken";
      primarySource = armorCollisionSource ?? "-";
    } else if (armorHit) {
      primaryResult = "armor_hit";
      primarySource = armorCollisionSource ?? "-";
    } else if (dangerousWrongCutCount > 0) {
      primaryResult = "dangerous_wrong_cut";
      const dangEv = events.find(e => e.kind === "projectile_dangerous");
      primarySource = dangEv?.collisionSource ?? "-";
    } else if (bodyWrongHit) {
      primaryResult = "body_wrong_hit";
      primarySource = bodyCollisionSource ?? "-";
    } else if (projectileReflectCount > 0) {
      primaryResult = "projectile_reflect";
      const refEv = events.find(e => e.kind === "projectile_reflect");
      primarySource = refEv?.collisionSource ?? "-";
    } else if (projectileCutCount > 0) {
      primaryResult = "projectile_cut";
      const cutEv = events.find(e => e.kind === "projectile_cut");
      primarySource = cutEv?.collisionSource ?? "-";
    } else {
      primaryResult = "empty_swing";
      primarySource = "-";
    }

    // ---- secondaryResults（按事件顺序，排除 primaryResult） ----
    const secondaryResults: string[] = [];
    const primaryKindMap: Record<string, string> = {
      armor_broken: "armor",
      armor_hit: "armor",
      dangerous_wrong_cut: "projectile_dangerous",
      body_wrong_hit: "body",
      projectile_reflect: "projectile_reflect",
      projectile_cut: "projectile_cut",
      empty_swing: "",
    };
    const primaryEventKind = primaryKindMap[primaryResult] ?? "";
    for (const e of events) {
      const ek = e.kind;
      if (ek === primaryEventKind) continue;
      if (ek === "armor" && (primaryResult === "armor_broken" || primaryResult === "armor_hit")) continue;
      if (ek === "projectile_dangerous" && !secondaryResults.includes("dangerous_wrong_cut")) {
        secondaryResults.push("dangerous_wrong_cut");
      } else if (ek === "body" && !secondaryResults.includes("body_wrong_hit")) {
        secondaryResults.push("body_wrong_hit");
      } else if (ek === "projectile_reflect" && !secondaryResults.includes("projectile_reflect")) {
        secondaryResults.push("projectile_reflect");
      } else if (ek === "projectile_cut" && !secondaryResults.includes("projectile_cut")) {
        secondaryResults.push("projectile_cut");
      } else if (ek === "armor" && !secondaryResults.includes("armor_hit")) {
        secondaryResults.push("armor_hit");
      }
    }

    // ---- 清理（在结果构建完成之后） ----
    if (this._session.slashId === slashId) {
      this._session = { slashId: "", events: [], bodyContact: false, hitProjectileIds: new Set(), closedForCollision: false };
    }
    if (this._pendingSlashResult && this._pendingSlashResult.slashId === slashId) {
      this._pendingSlashResult = null;
    }
    // P4.4B-R5.5 P0-4: grace 清理
    if (this._graceSlashId === slashId) {
      this.clearOpportunityGrace();
    }
    // P4.4B-R5.6 P0-F: 清理失活弹幕移到结果构建之后
    cleanInactiveProjectiles(this.projectiles);

    return {
      slashId,
      energyAfter,
      energyBefore,
      baseCost,
      projectileCutCount,
      projectileReflectCount,
      dangerousWrongCutCount,
      projectileCutReward,
      projectileReflectReward,
      dangerousWrongCutPenalty: dangerousWrongCutPenaltyTotal,
      armorReward,
      bodyWrongHitPenalty,
      emptySwingPenalty,
      armorHit,
      armorDurabilityDamage,
      armorBroken,
      allArmorBroken,
      bodyWrongHit,
      primaryResult,
      secondaryResults,
      primarySource,
      armorHitPos,
      events,
      unclampedAfter: unclampedEnergy,
    };
  }

  // ================================================================
  // 刀势连续效果计算
  // ================================================================

  /** 根据当前刀势能量计算连续效果 */
  getBladeEffect(energy: number): BladeContinuousEffect {
    const ratio = clamp(energy / 100, 0, 1);
    const cfg = REACTIVE_BOSS_CONFIG.bladeEffect;
    const length = cfg.minLength + (cfg.maxLength - cfg.minLength) * ratio;
    const width = cfg.minWidth + (cfg.maxWidth - cfg.minWidth) * ratio;
    const brightness = cfg.minBrightness + (cfg.maxBrightness - cfg.minBrightness) * ratio;

    let color: string;
    let glowColor: string;
    if (energy < 30) {
      color = cfg.lowEnergyColor;
      glowColor = "rgba(102,102,102,0.25)";
    } else if (energy < 70) {
      color = cfg.midEnergyColor;
      glowColor = "rgba(91,192,255,0.6)";
    } else {
      color = cfg.highEnergyColor;
      glowColor = "rgba(255,244,160,0.85)";
    }

    return { visualLength: length, width, brightness, color, glowColor };
  }

  /** 更新连续效果（外部调用） */
  updateBladeEffect(energy: number): void {
    this.bladeEffect = this.getBladeEffect(energy);
  }

  get currentBladeEffect(): BladeContinuousEffect {
    return this.bladeEffect;
  }

  // ================================================================
  // 玩家HP系统
  // ================================================================

  getPlayerHp(): PlayerHpState {
    return { ...this.playerHp };
  }

  /**
   * 玩家受到伤害
   * @returns 实际造成的伤害
   */
  takeDamage(amount: number): number {
    if (this.playerHp.invincibleTimer > 0) return 0;
    const actual = Math.min(amount, this.playerHp.current);
    this.playerHp.current -= actual;
    this.playerHp.invincibleTimer = REACTIVE_BOSS_CONFIG.playerHp.invincibleDuration;
    this.playerHp.flashTimer = 0.3;
    this.screenShake = Math.max(this.screenShake, 0.2);
    this.flash = Math.max(this.flash, 0.15);
    return actual;
  }

  get isPlayerDead(): boolean {
    return this.playerHp.current <= 0;
  }

  // ================================================================
  // 桥接方法
  // ================================================================

  get bridgeTriggered(): boolean {
    return this._bridgeTriggered;
  }

  /** P4.4B-R5.7: 获取弹幕列表深拷贝快照（外部只读访问，禁止篡改内部引用） */
  getProjectiles(): Projectile[] {
    return this.projectiles.map(p => ({ ...p }));
  }

  /** P4.4B-R5.6 P1-3: 标记弹幕被玩家防线命中（立即停止） */
  markProjectilePlayerHit(projectileId: string): ProjectileKind | null {
    const p = this.projectiles.find(p => p.id === projectileId);
    if (!p || !p.active || p.resolved || p.reflected) return null;
    p.resolved = true;
    p.active = false;
    p.resolution = "player_hit";
    return p.kind;
  }
  getArmorBrokenFlags(): boolean[] {
    return this.armorTargets.map(a => a.broken);
  }

  /** P4.4B-R3 P0-D: Reactive 模式状态快照（供 E2E 桥按 gameMode 路由读取）。
   *  字段命名沿用旧 BossController.getState 契约（phase/armorProgress/inputLocked 等），
   *  并补充 reactive 特有字段（playerHp/projectileCount/activeArmorIndex/armorDurability）。
   *  注意：此快照对外是只读快照，不可被外部修改。 */
  getReactiveSnapshot(): {
    phase: BossPhaseState;
    armorProgress: string;
    pursuitProgress: string;
    armorBroken: boolean[];
    armorDurability: number[];
    activeArmorIndex: number;
    inputLocked: boolean;
    bridgeTriggered: boolean;
    projectileCount: number;
    energy: number;
    playerHp: { current: number; max: number };
    currentBladeEffect: BladeContinuousEffect;
  } {
    const armorDone = this.armorProgress;
    return {
      phase: this._phase,
      // 与旧 BossController.debugSnapshot["Armor Progress"] 一致：用 "n/3" 字符串
      armorProgress: `${armorDone}/${this.maxArmor}`,
      // reactive 阶段没有 pursuit，统一返回 "0/3" 占位
      pursuitProgress: "0/3",
      armorBroken: this.getArmorBrokenFlags(),
      armorDurability: this.getArmorDurability(),
      activeArmorIndex: this.activeArmorIndex,
      inputLocked: this.inputLocked,
      bridgeTriggered: this._bridgeTriggered,
      projectileCount: this.getProjectileCount(),
      // 注意：energy 由 Game 持有（reactive 模式用 this.energy 同步），
      // 这里返回 currentSlashEnergy 作为上一刀的能量快照，避免误用实时 energy。
      // E2E 桥在 getState 中会单独读 game.energy 作为实时值。
      energy: this.currentSlashEnergy,
      playerHp: {
        current: this.playerHp.current,
        max: this.playerHp.max,
      },
      currentBladeEffect: { ...this.bladeEffect },
    };
  }

  // ================================================================
  // 粒子系统
  // ================================================================

  private spawnParticles(x: number, y: number, count: number, color: string, speed: number = 80): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = speed * (0.5 + Math.random() * 0.5);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 30,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 0.5 + Math.random() * 0.5,
        size: 2 + Math.random() * 4,
        color,
        alpha: 1,
      });
    }
  }

  private updateParticles(dt: number): void {
    this.particles = this.particles.filter(p => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 80 * dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
      return p.life > 0;
    });
  }

  // ================================================================
  // 渲染
  // ================================================================

  renderWorld(ctx: any): void {
    if (this._phase === "exit") return;
    this.drawVignette(ctx);
    this.drawBoss(ctx);
    this.drawProjectiles(ctx);
    this.drawParticlesList(ctx);
  }

  renderOverlay(ctx: any): void {
    if (this._phase === "exit") return;
    if (this._debugMode) this.drawPhaseIndicator(ctx);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 232, 146, ${this.flash * 0.18})`;
      ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    }
  }

  private drawVignette(ctx: any): void {
    const grd = ctx.createRadialGradient(DESIGN_WIDTH / 2, BOSS_CY - 20, 50, DESIGN_WIDTH / 2, BOSS_CY - 20, 320);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(0.5, "rgba(24, 8, 36, 0.05)");
    grd.addColorStop(1, "rgba(0,0,0,0.15)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  }

  private drawBoss(ctx: any): void {
    const shakeX = this.shakeTimer > 0 ? (Math.random() - 0.5) * 4 : 0;
    const shakeY = this.shakeTimer > 0 ? (Math.random() - 0.5) * 3 : 0;
    ctx.save();
    ctx.translate(BOSS_CX + shakeX, this.renderY + shakeY);
    ctx.scale(this.bossRenderScale, this.bossRenderScale);

    // Boss剪影
    ctx.save();
    ctx.shadowColor = "rgba(108, 52, 131, 0.3)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#1a0a26";
    this.drawSilhouette(ctx);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "rgba(108, 52, 131, 0.35)";
    ctx.lineWidth = 2;
    this.drawSilhouette(ctx);
    ctx.stroke();
    ctx.restore();

    // 头盔
    ctx.save();
    ctx.fillStyle = "#0d0515";
    ctx.beginPath();
    ctx.roundRect(-12, -56, 24, 12, 4);
    ctx.fill();
    ctx.fillStyle = "#6c3483";
    ctx.beginPath();
    ctx.moveTo(-5, -70);
    ctx.lineTo(0, -88);
    ctx.lineTo(5, -70);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 护甲
    this.drawArmorPiece(ctx, this.armorTargets[ARMOR_L], -50, -30, 30, 22);
    this.drawArmorPiece(ctx, this.armorTargets[ARMOR_R], 50, -30, 30, 22);
    this.drawChestPiece(ctx, this.armorTargets[ARMOR_C]);

    ctx.restore();
  }

  private drawSilhouette(ctx: any): void {
    ctx.beginPath();
    ctx.moveTo(-14, -86); ctx.lineTo(-4, -70); ctx.lineTo(-18, -58); ctx.lineTo(-22, -44);
    ctx.lineTo(-62, -42); ctx.lineTo(-68, -32); ctx.lineTo(-58, -28);
    ctx.lineTo(-44, -16); ctx.lineTo(-40, 16); ctx.lineTo(-32, 18);
    ctx.lineTo(-32, 22); ctx.lineTo(-28, 40);
    ctx.lineTo(-24, 62); ctx.lineTo(-14, 64);
    ctx.lineTo(-8, 48); ctx.lineTo(8, 48);
    ctx.lineTo(14, 64); ctx.lineTo(24, 62);
    ctx.lineTo(28, 40); ctx.lineTo(32, 22);
    ctx.lineTo(32, 18); ctx.lineTo(40, 16); ctx.lineTo(44, -16);
    ctx.lineTo(58, -28); ctx.lineTo(68, -32); ctx.lineTo(62, -42);
    ctx.lineTo(22, -44); ctx.lineTo(18, -58);
    ctx.lineTo(4, -70); ctx.lineTo(14, -86);
    ctx.closePath();
  }

  private drawArmorPiece(ctx: any, target: ReactiveArmorTarget, x: number, y: number, w: number, h: number): void {
    const isActive = target.active && !target.broken;
    const isBroken = target.broken;
    const isOpportunity = this._phase === "armor_opportunity" && target === this.getCurrentArmor() && !target.broken;
    let scale = 1, alpha = 1;
    if (isBroken && target.animTimer > 0) {
      const t = target.animTimer / 0.4;
      scale = 0.3 + 0.7 * t;
      alpha = 0.1 + 0.9 * t;
    } else if (isBroken) {
      scale = 0.15;
      alpha = 0.08;
    }
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = isBroken ? "#0d0515" : (isActive ? "#3d1a50" : "#150a20");
    ctx.strokeStyle = isBroken ? "#3d1a4a" : (isOpportunity ? "#f0e130" : (isActive ? "#8e44ad" : "#3d1a4a"));
    ctx.lineWidth = isOpportunity ? 3 : (isActive ? 2 : 1.5);
    if (isOpportunity) {
      ctx.shadowColor = "#f0e130";
      ctx.shadowBlur = 20;
    } else if (isActive) {
      ctx.shadowColor = "#8e44ad";
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  private drawChestPiece(ctx: any, target: ReactiveArmorTarget): void {
    const isActive = target.active && !target.broken;
    const isBroken = target.broken;
    const isOpportunity = this._phase === "armor_opportunity" && target === this.getCurrentArmor() && !target.broken;
    let scale = 1, alpha = 1;
    if (isBroken && target.animTimer > 0) {
      const t = target.animTimer / 0.4;
      scale = 0.3 + 0.7 * t;
      alpha = 0.1 + 0.9 * t;
    } else if (isBroken) {
      scale = 0.15;
      alpha = 0.08;
    }
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(0, 0);
    ctx.scale(scale, scale);
    ctx.fillStyle = isBroken ? "#0d0515" : (isActive ? "#3d1a50" : "#150a20");
    ctx.strokeStyle = isBroken ? "#3d1a4a" : (isOpportunity ? "#f0e130" : (isActive ? "#8e44ad" : "#3d1a4a"));
    ctx.lineWidth = isOpportunity ? 3 : (isActive ? 2 : 1.5);
    if (isOpportunity) {
      ctx.shadowColor = "#f0e130";
      ctx.shadowBlur = 20;
    } else if (isActive) {
      ctx.shadowColor = "#8e44ad";
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(20, 2);
    ctx.lineTo(0, 22);
    ctx.lineTo(-20, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  private drawProjectiles(ctx: any): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      ctx.save();

      if (p.kind === "normal") {
        // 普通弹幕：圆形+发光
        ctx.shadowColor = p.glowColor;
        ctx.shadowBlur = 12;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        // 内圈高光
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.beginPath();
        ctx.arc(p.x - 2, p.y - 2, p.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "reflective") {
        // 强化弹幕：旋转外环+核心
        ctx.shadowColor = p.glowColor;
        ctx.shadowBlur = 15;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        // 旋转外环
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
        // 旋转小环
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius + 8, 0, Math.PI * 1.5);
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === "dangerous") {
        // 危险雷球：尖刺多边形+红黑渐变
        ctx.shadowColor = p.glowColor;
        ctx.shadowBlur = 18;
        const spikes = 6;
        const outerR = p.radius;
        const innerR = p.radius * 0.6;
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const angle = (Math.PI * 2 * i) / (spikes * 2) - Math.PI / 2;
          const sx = p.x + Math.cos(angle) * r;
          const sy = p.y + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        // 红黑渐变
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, outerR);
        grd.addColorStop(0, "#ff4444");
        grd.addColorStop(0.5, "#c0392b");
        grd.addColorStop(1, "#2c0a0a");
        ctx.fillStyle = grd;
        ctx.fill();
        ctx.strokeStyle = "#ff2222";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.shadowBlur = 0;
        // 中心亮点
        ctx.fillStyle = "rgba(255,100,100,0.5)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private drawParticlesList(ctx: any): void {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawPhaseIndicator(ctx: any): void {
    const phaseLabels: Record<string, string> = {
      armor_prepare: "护甲准备",
      armor_threat: "弹幕威胁",
      armor_opportunity: "破绽显现",
      armor_resolve: "破甲判定",
      armor_recovery: "护甲恢复",
    };
    const label = phaseLabels[this._phase];
    if (!label) return;
    const alpha = this._phase === "armor_opportunity"
      ? 0.7 + Math.sin(this._elapsed * 6) * 0.3
      : 0.6;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#f0e130";
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#f0e130";
    ctx.shadowBlur = 8;
    ctx.fillText(label, DESIGN_WIDTH / 2, 108);
    ctx.restore();

    // 护甲进度
    const remaining = this.armorTargets.filter(a => !a.broken).length;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#d7bde2";
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowBlur = 0;
    ctx.fillText(`护甲 ${this.armorProgress}/${this.maxArmor}`, DESIGN_WIDTH / 2, 128);
    ctx.restore();
  }
}