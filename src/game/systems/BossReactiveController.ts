// ========================================================================
// P0: BossReactiveController — 5状态机核心控制器
// 状态流: armor_prepare → armor_threat → armor_opportunity
//        → armor_resolve → armor_recovery → (循环或bridgeToPursuit)
// ========================================================================
import type { BossPhaseState, Vec2, Projectile, ProjectileKind, ReactiveArmorTarget, PlayerHpState, BladeContinuousEffect } from "../types";
import { DESIGN_WIDTH, DESIGN_HEIGHT } from "../config/constants";
import { REACTIVE_BOSS_CONFIG } from "../config/bossReactiveFlow";
import { distanceToSegment, clamp, randomRange } from "../../utils/math";
import { createProjectile, updateProjectiles, checkSlashHit, cleanInactiveProjectiles, cleanResolvedProjectiles, resetProjectileIdCounter } from "./projectileSystem";
import { capsuleHitsEllipse } from "./reactiveSlashGeometry";

const BOSS_CY = 220;
const BOSS_CX = DESIGN_WIDTH / 2;
const ARMOR_L = 0, ARMOR_R = 1, ARMOR_C = 2;

/** 身体碰撞区域（多椭圆并集） */
const BODY_PARTS = [
  { cx: 0, cy: -20, rx: 70, ry: 35 },
  { cx: 0, cy: 15, rx: 50, ry: 40 },
  { cx: 0, cy: -65, rx: 30, ry: 18 },
];

export class BossReactiveController {
  private _phase: BossPhaseState = "armor_prepare";
  get phase(): BossPhaseState { return this._phase; }
  get inputLocked(): boolean {
    // 只有 resolve 阶段短暂锁定（0.12s命中停顿），其余全部允许挥刀
    return this._phase === "armor_resolve";
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
  private bossRenderScale = 1.15;

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
  private _session: { slashId: string; bodyContact: boolean; lastBodyHitPos?: Vec2 } = { slashId: "", bodyContact: false };
  /** 当前挥刀的刀势能量（由外部设置） */
  currentSlashEnergy: number = 0;

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
    this._session = { slashId: "", bodyContact: false };
    this._bridgeTriggered = false;
    this.shakeTimer = 0;
    this.flash = 0;
    this.screenShake = 0;
    this.particles = [];
    this.renderY = BOSS_CY;
    this.bossRenderScale = 1;
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
    // 不生成新弹幕，等待玩家挥刀
    // P4.4B-R4 P1-B: 机会窗口输入容错——opportunity 结束后额外 0.12s 宽限。
    // 禁止"黄圈还亮着但阶段已不可命中"。玩家在窗口内起刀则允许在宽限内完成结算。
    const gracePeriod = 0.12;
    if (this.phaseTimer >= REACTIVE_BOSS_CONFIG.phaseTimers.opportunityDuration + gracePeriod) {
      // 超时（含宽限）未命中→进入recovery
      this.transitionToRecovery();
    }
  }

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

  private transitionToOpportunity(): void {
    this._phase = "armor_opportunity";
    this.phaseTimer = 0;
    // 护甲高亮发光
    this.getCurrentArmor().animTimer = 0.3;
  }

  private transitionToRecovery(): void {
    this._phase = "armor_recovery";
    this.phaseTimer = 0;
    this._resolvedSlashId = "";
    this._session = { slashId: "", bodyContact: false };
    // P4.4B-R2 P0-B: 只清理已 resolved 弹幕（被斩断/反射/命中玩家/过期），
    // 未解决弹幕继续飞行，直到玩家处理或命中防线。修复"recovery 切阶段清屏导致弹幕永远到不了玩家线"。
    cleanResolvedProjectiles(this.projectiles);
  }

  private transitionToResolve(): void {
    this._phase = "armor_resolve";
    this.phaseTimer = 0;
  }

  private finishRecovery(): void {
    // 检查是否还有未破碎的护甲
    const remaining = this.armorTargets.filter(a => !a.broken);
    if (remaining.length === 0) {
      // 全部击破 → 桥接
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
    const bx = BOSS_CX + armor.relX;
    const by = this.renderY + armor.relY;

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

  /** P4.4B-R3 P0-D: 当前激活护甲的世界坐标 + 半径（供 E2E 程序化命中使用，避免硬编码）。
   *  P4.4B-R4 P0-B: 坐标和半径乘以 bossRenderScale，与视觉绘制一致。 */
  getActiveArmorWorldPos(): { cx: number; cy: number; rx: number; ry: number } | null {
    const armor = this.armorTargets[this.activeArmorIndex];
    if (!armor || armor.broken) return null;
    return {
      cx: BOSS_CX + armor.relX * this.bossRenderScale,
      cy: this.renderY + armor.relY * this.bossRenderScale,
      rx: armor.radiusX * this.bossRenderScale,
      ry: armor.radiusY * this.bossRenderScale,
    };
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

  /** 椭圆-线段相交检测 */
  private segmentHitEllipse(segA: Vec2, segB: Vec2, cx: number, cy: number, rx: number, ry: number): boolean {
    const scaleX = 1 / Math.max(1, rx);
    const scaleY = 1 / Math.max(1, ry);
    const a: Vec2 = { x: (segA.x - cx) * scaleX, y: (segA.y - cy) * scaleY };
    const b: Vec2 = { x: (segB.x - cx) * scaleX, y: (segB.y - cy) * scaleY };
    const origin: Vec2 = { x: 0, y: 0 };
    return distanceToSegment(origin, a, b) <= 1;
  }

  /**
   * 解析弹幕命中 + 护甲命中
   * @returns 弹幕命中结果列表
   */
  resolveSegment(segA: Vec2, segB: Vec2, slashId: string, bladeReach: number): Array<{ projectileIndex: number; hitPos: Vec2 }> {
    if (this._phase !== "armor_threat" && this._phase !== "armor_opportunity") return [];
    if (this._resolvedSlashId === slashId) return [];

    // 初始化Session
    if (this._session.slashId !== slashId) {
      this._session = { slashId, bodyContact: false };
    }

    const hits: Array<{ projectileIndex: number; hitPos: Vec2 }> = [];

    // 1. 检测弹幕碰撞
    const projHits = checkSlashHit(this.projectiles, segA, segB, bladeReach);
    for (const idx of projHits) {
      const p = this.projectiles[idx];
      if (!p.active) continue;
      hits.push({ projectileIndex: idx, hitPos: { x: (segA.x + segB.x) / 2, y: (segA.y + segB.y) / 2 } });
    }

    // 2. 在opportunity阶段检测护甲命中
    if (this._phase === "armor_opportunity") {
      const armor = this.getCurrentArmor();
      if (armor && !armor.broken) {
        // P4.4B-R4 P0-B: 护甲坐标和半径乘以 bossRenderScale，与 drawBoss 中的 translate+scale 视觉一致。
        // 修复审计 §3.2 "护甲碰撞没有应用相同缩放"——视觉护甲中心与碰撞中心错位 7.5px。
        const cx = BOSS_CX + armor.relX * this.bossRenderScale;
        const cy = this.renderY + armor.relY * this.bossRenderScale;
        const rx = armor.radiusX * this.bossRenderScale;
        const ry = armor.radiusY * this.bossRenderScale;
        // P4.4B-R4 P0-A: 护甲判定使用 capsuleHitsEllipse（支持刀身宽度半径）。
        // bladeReach 现在代表有效碰撞半径（刀身宽度/2 + 移动端容差）。
        // 修复审计 §2 "可见刀体和护甲碰撞使用了两套几何"——让刀尖/刀身也参与碰撞。
        if (capsuleHitsEllipse(segA, segB, bladeReach, { x: cx, y: cy }, rx, ry)) {
          // 护甲命中 → 进入resolve
          this._resolvedSlashId = slashId;
          this.transitionToResolve();
        }
      }

      // 检测身体碰撞（wrong_hit候选）— 同样乘 bossRenderScale
      if (!this._resolvedSlashId) {
        const bodyHit = BODY_PARTS.some(p =>
          capsuleHitsEllipse(
            segA, segB, bladeReach,
            { x: BOSS_CX + p.cx * this.bossRenderScale, y: this.renderY + p.cy * this.bossRenderScale },
            p.rx * this.bossRenderScale, p.ry * this.bossRenderScale,
          )
        );
        if (bodyHit && !this._session.bodyContact) {
          this._session.bodyContact = true;
          this._session.lastBodyHitPos = segB;
        }
      }
    }

    return hits;
  }

  /** 收刀结算 */
  finishSlash(slashId: string): {
    armorHit: boolean;
    armorDurabilityDamage: number;
    armorBroken: boolean;
    allArmorBroken: boolean;
    projectileResults: Array<{ projectileIndex: number; kind: ProjectileKind; reflected: boolean; energyReward: number }>;
    wrongHit: boolean;
  } {
    const result = {
      armorHit: false,
      armorDurabilityDamage: 0,
      armorBroken: false,
      allArmorBroken: false,
      projectileResults: [] as Array<{ projectileIndex: number; kind: ProjectileKind; reflected: boolean; energyReward: number }>,
      wrongHit: false,
    };

    // P0-D: 弹幕命中已在 checkReactiveProjectileHits 中标记，不再在此处结算
    // 清理失活弹幕
    cleanInactiveProjectiles(this.projectiles);

    // 处理护甲命中
    if (this._resolvedSlashId === slashId) {
      const armor = this.getCurrentArmor();
      if (armor && !armor.broken) {
        // 计算护甲伤害
        let damage = 0;
        const energy = this.currentSlashEnergy;
        if (energy >= 70) {
          damage = armor.durability; // 一刀碎
        } else if (energy >= 30) {
          damage = armor.durability * 0.55; // 55%
        } else {
          damage = armor.durability * 0.25; // 25%
        }
        damage = Math.max(1, Math.ceil(damage));
        armor.durability = Math.max(0, armor.durability - damage);
        armor.crackProgress = 1 - armor.durability / armor.maxDurability;
        armor.animTimer = 0.4;
        result.armorHit = true;
        result.armorDurabilityDamage = damage;

        if (armor.durability <= 0) {
          armor.broken = true;
          armor.active = false;
          this.armorProgress++;
          result.armorBroken = true;

          // 检查是否全部击破
          if (this.armorProgress >= this.maxArmor) {
            result.allArmorBroken = true;
          }
        }

        // 已经进入resolve状态，无需额外操作
      }
    }

    // 检查wrong_hit
    if (this._session.slashId === slashId && this._session.bodyContact && !this._resolvedSlashId) {
      result.wrongHit = true;
      this._resolvedSlashId = slashId;
    }

    // 清理session
    if (this._session.slashId === slashId) {
      this._session = { slashId: "", bodyContact: false };
    }

    return result;
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

  /** 获取弹幕列表副本（供外部只读访问） */
  getProjectiles(): Projectile[] {
    return this.projectiles;
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