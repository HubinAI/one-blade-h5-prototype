// ========================================================================
// P4.4A.2 V0720030: BossController
// 状态: loading → intro → armor → armor_break_show → armor_complete_hold
// 护甲: 左肩/右肩/胸甲、三态命中(armor_hit/wrong_hit/miss)
// 单刀单甲: slashId级别解析锁
// ========================================================================
import type { BossId, BossPhaseState, Vec2 } from "../types";
import { DESIGN_WIDTH, DESIGN_HEIGHT } from "../config/constants";
import { distanceToSegment } from "../../utils/math";
import { AudioService } from "../services/AudioService";

const BOSS_CY = 195;
const INTRO_DURATION = 2.85;
const ARMOR_L = 0, ARMOR_R = 1, ARMOR_C = 2;
const CONSECUTIVE_ERROR_LIMIT = 2;

// 身体Hit Area（多个几何区域并集）
const BODY_PARTS = [
  { cx: 0, cy: -20, rx: 70, ry: 35 },
  { cx: 0, cy: 15, rx: 50, ry: 40 },
  { cx: 0, cy: -65, rx: 30, ry: 18 },
];

/** P4.4A.3: 雷核（弱点）共享几何 */
const CORE_GEOMETRY = {
  relX: 0, relY: 2,
  visualRadius: 12,
  hitRadiusX: 17, hitRadiusY: 18,
};

export type ArmorResolveResult =
  | { kind: "armor_hit"; targetId: number; hitPos: Vec2; armorCenter: Vec2; shardOrigin: Vec2; progress: number; maxProgress: number; completed: boolean; slashId: string }
  | { kind: "wrong_hit"; hitPos: Vec2; rePrompt: boolean; slashId: string }
  | { kind: "miss"; slashId: string };

type ArmorTarget = {
  id: number; name: string;
  relX: number; relY: number; radiusX: number; radiusY: number; // 椭圆判定
  active: boolean; broken: boolean;
  animTimer: number;
  hitSlashId: string;
};

type ResolveDebug = {
  slashId: string; segA: Vec2; segB: Vec2;
  activeArmorName: string; minDist: number; bodyHit: boolean; result: string;
};

export class BossController {
  private _phase: BossPhaseState = "loading";
  get phase(): BossPhaseState { return this._phase; }
  get isIntroActive(): boolean { return this._phase === "loading" || this._phase === "intro"; }
  get playerInvulnerable(): boolean { return this.isIntroActive; }
  get bossDamageable(): boolean { return false; }
  get bossModeActive(): boolean { return this._phase !== "exit"; }
  /** 护甲切换延迟期间锁定输入 */
  get armorSwitching(): boolean {
    return this._phase === "armor" && this._switchTimer > 0;
  }
  /** 避开TS类型缩窄 */
  private p(): BossPhaseState { return this._phase; }
  get inputLocked(): boolean {
    return this._phase === "loading" || this._phase === "intro" || this._phase === "armor_break_show" || this._phase === "armor_complete_hold" || this.armorSwitching || this.p() === "pursuit_intro" || this._phase === "core_break";
  }
  /** 完成Hold时冻结战斗资源 */
  get freezeCombatResources(): boolean {
    return this._phase === "armor_break_show" || this._phase === "armor_complete_hold" || this.p() === "pursuit_intro" || this._phase === "core_break";
  }
  /** 雷核是否暴露 */
  get coreExposed(): boolean {
    return ["armor_break_show", "armor_complete_hold", "pursuit_intro", "pursuit", "core_break", "execution"].includes(this._phase);
  }

  // ---- 调试 ----
  private lastResolveDebug: ResolveDebug | null = null;
  get debugSnapshot(): Record<string, string | number | boolean> {
    const arm = this.armorTargets[this.activeArmorIndex];
    return {
      "Game Mode": "boss", "Boss State": this._phase,
      "Visual Boss Pos": `(${DESIGN_WIDTH / 2}, ${this.renderY.toFixed(0)})`,
      "Boss Proxy Count": 0,
      "Boss HP": `${this._bossHP}/${this._bossMaxHP}`,
      "Active Armor": arm?.name ?? "无",
      "Armor Progress": `${this.armorProgress}/${this.maxArmor}`,
      "Input Locked": this.inputLocked,
      "Player Invuln": this.playerInvulnerable,
      "Sub Blade Locked": true,
      "Resolved Slash": this._resolvedSlashId || "无",
      "Slash Session": this._session.slashId || "无",
      "Final Result": this._session.finalResult || "-",
      "Freeze": this.freezeCombatResources,
      "Armor Switching": this.armorSwitching,
      "Core Exposed": this.coreExposed,
      "Pursuit": `${this._pursuitProgress}/${this.MAX_PURSUIT}`,
      ...(this.lastResolveDebug ? {
        "Last Slash ID": this.lastResolveDebug.slashId,
        "Last Seg": `(${this.lastResolveDebug.segA.x.toFixed(0)},${this.lastResolveDebug.segA.y.toFixed(0)})→(${this.lastResolveDebug.segB.x.toFixed(0)},${this.lastResolveDebug.segB.y.toFixed(0)})`,
        "Min Dist": this.lastResolveDebug.minDist.toFixed(1),
        "Body Hit": this.lastResolveDebug.bodyHit ? "是" : "否",
        "Last Result": this.lastResolveDebug.result,
      } : {})
    };
  }

  readonly bossId: BossId;

  private introElapsed = 0;
  private _introSkipped = false;
  private renderY = -120;
  private shakeTimer = 0;
  private bossRenderScale = 0.6;
  private hudSlideY = -80;
  private guardianAlpha = 0;
  private bossNameAlpha = 0;
  private objectiveAlpha = 0;
  private objectiveText = "切发亮护甲";
  private vignetteIntensity = 0;
  private particles: { x: number; y: number; life: number; size: number; color: string }[] = [];

  private armorProgress = 0;
  private readonly maxArmor = 3;
  private activeArmorIndex = ARMOR_L;
  private armorTargets: ArmorTarget[] = [];
  private consecutiveErrors = 0;
  /** 错误提示冷却（内部累计时间替代Date.now） */
  private lastErrorRePromptElapsed = -99;
  /** 整刀解析锁 */
  private _resolvedSlashId = "";
  /** 整刀Body Contact候选（wrong_hit收刀结算）— 已由_session替代 */
  // private _bodyContactSlashId = ""; // 已清理
  /** 整刀Session追踪 */
  private _session: { slashId: string; bodyContact: boolean; firstBodyHitPos?: Vec2; lastBodyHitPos?: Vec2; finalResult?: string } = { slashId: "", bodyContact: false };
  /** 冲击触发标记（防shakeTimer重复） */
  private _impactTriggered = false;
  /** 目标提示计时器 */
  private _objectiveTimer = 0;
  /** 内部累计时间（替代Date.now） */
  private _elapsed = 0;
  /** 护甲切换延迟 */
  private _switchTimer = 0;
  private readonly SWITCH_DELAY = 0.45;
  /** Hold计时（P4.4A.3转pursuit_intro） */
  private holdTimer = 0;
  /** 追击介绍计时 */
  private pursuitIntroTimer = 0;
  /** 追击进度0/3 */
  private _pursuitProgress = 0;
  private readonly MAX_PURSUIT = 3;
  /** core_break计时 */
  private coreBreakTimer = 0;
  /** 屏幕震动（供Game读取） */
  screenShake: number = 0;
  /** 闪屏（供Game读取） */
  flash: number = 0;
  /** 追击能量增幅标记 */
  pursuitEnergyBoosted = false;

  // 完成状态
  private breakShowTimer = 0;
  private readonly BREAK_SHOW_DURATION = 1.2;

  private _bossHP = 16;
  private _bossMaxHP = 16;

  constructor(bossId: BossId) {
    this.bossId = bossId;
    const cfg = { maxHp: 16 };
    this._bossMaxHP = cfg.maxHp;
    this._bossHP = cfg.maxHp;
    this.initArmorTargets();
  }

  private initArmorTargets(): void {
    this.armorTargets = [
      { id: ARMOR_L, name: "左肩", relX: -50, relY: -30, radiusX: 34, radiusY: 26, active: false, broken: false, animTimer: 0, hitSlashId: "" },
      { id: ARMOR_R, name: "右肩", relX: 50, relY: -30, radiusX: 34, radiusY: 26, active: false, broken: false, animTimer: 0, hitSlashId: "" },
      { id: ARMOR_C, name: "胸甲", relX: 0, relY: 6, radiusX: 28, radiusY: 30, active: false, broken: false, animTimer: 0, hitSlashId: "" },
    ];
  }

  /** 椭圆-线段相交检测 */
  private segmentHitEllipse(segA: Vec2, segB: Vec2, cx: number, cy: number, rx: number, ry: number): boolean {
    // 将线段和椭圆中心平移并缩放为圆形
    const scaleX = 1 / Math.max(1, rx);
    const scaleY = 1 / Math.max(1, ry);
    const a: Vec2 = { x: (segA.x - cx) * scaleX, y: (segA.y - cy) * scaleY };
    const b: Vec2 = { x: (segB.x - cx) * scaleX, y: (segB.y - cy) * scaleY };
    const origin: Vec2 = { x: 0, y: 0 };
    return distanceToSegment(origin, a, b) <= 1;
  }

  /** 椭圆-点距离（归一化后） — 当前未使用，保留以备调试 */
  // private pointToEllipseDist(px, py, cx, cy, rx, ry) { ... }

  // ==============================================================
  // 生命周期
  // ==============================================================
  enterLoading(): void {
    this._phase = "loading";
    this.introElapsed = 0; this._introSkipped = false;
    this.renderY = -120; this.bossRenderScale = 0.6;
    this.vignetteIntensity = 0; this.guardianAlpha = 0;
    this.bossNameAlpha = 0; this.objectiveAlpha = 0;
    this.hudSlideY = -80; this.shakeTimer = 0;
    this.armorProgress = 0; this.consecutiveErrors = 0;
    this.activeArmorIndex = ARMOR_L;
    this._bossHP = this._bossMaxHP; this.particles = [];
    this._resolvedSlashId = ""; this.lastResolveDebug = null;
    this._session = { slashId: "", bodyContact: false, firstBodyHitPos: undefined, lastBodyHitPos: undefined, finalResult: undefined };
    this._impactTriggered = false; this._objectiveTimer = 0; this._switchTimer = 0; this._elapsed = 0;
    this.holdTimer = 0; this.pursuitIntroTimer = 0;
    this.lastErrorRePromptElapsed = -99;
    this.initArmorTargets();
    this.armorTargets[ARMOR_L].active = true;
  }

  skipIntro(): void {
    if (this._phase !== "loading" && this._phase !== "intro") return;
    this._introSkipped = true; this.introElapsed = INTRO_DURATION;
    this.renderY = BOSS_CY; this.bossRenderScale = 1;
    this.vignetteIntensity = 0.15; this.guardianAlpha = 1;
    this.bossNameAlpha = 1; this.objectiveAlpha = 1;
    this.hudSlideY = 0; this.transitionToArmor();
  }

  // ==============================================================
  // update
  // ==============================================================
  update(dt: number): void {
    this._elapsed += dt;
    this.particles = this.particles.filter(p => { p.life -= dt; return p.life > 0; });
    // P4.4A.2: 全局衰减护甲动画计时器（保证所有阶段都能更新）
    for (const t of this.armorTargets) { t.animTimer = Math.max(0, t.animTimer - dt); }
    // 统一衰减shakeTimer
    this.shakeTimer = Math.max(0, this.shakeTimer - dt * 3);

    if (this._phase === "loading") { this._phase = "intro"; return; }
    if (this._phase === "intro") {
      this.introElapsed += dt; this.updateIntroTimeline(); this.spawnParticles(); return;
    }
    if (this._phase === "armor") { this.updateArmorPhase(dt); return; }
    if (this._phase === "armor_break_show") {
      this.breakShowTimer += dt;
      if (this.breakShowTimer >= this.BREAK_SHOW_DURATION) {
        this._phase = "armor_complete_hold";
      }
      return;
    }
    if (this._phase === "armor_complete_hold") {
      this.holdTimer += dt;
      if (this.holdTimer >= 0.35) {
        (this._phase as BossPhaseState) = "pursuit_intro";
        this.pursuitIntroTimer = 0;
        this.objectiveText = "趁弱点显现时追击";
        this.objectiveAlpha = 1;
        this._objectiveTimer = 0;
        this._pursuitProgress = 0;
      }
      return;
    }
    if (this.p() === "pursuit_intro") {
      this.pursuitIntroTimer += dt;
      if (this.pursuitIntroTimer >= 0.9) {
        this._phase = "pursuit";
        // 追击开始：重置提示计时器让提示在pursuit显示0.8秒
        this._objectiveTimer = 0;
      }
      return;
    }
    if (this._phase === "pursuit") {
      this._objectiveTimer += dt;
      this.screenShake = Math.max(0, this.screenShake - dt * 2.7);
      this.flash = Math.max(0, this.flash - dt * 2.2);
      if (this._objectiveTimer < 0.8) {
        this.objectiveAlpha = Math.max(0, 1 - (this._objectiveTimer - 0.5) / 0.3);
      }
      return;
    }
    if (this._phase === "core_break") {
      this.coreBreakTimer += dt;
      // 输入锁定 + 刀势冻结由inputLocked/freezeCombatResources负责
      // 收刀清理在Game handlePointerUp通过inputLocked已处理
      if (this.coreBreakTimer > 8) {
        // 超时保护，防永久锁定
      }
      return;
    }
  }

  // ==============================================================
  // 核心: resolveArmorSegment（原子化三态判定）
  // ==============================================================
  resolveArmorSegment(segA: Vec2, segB: Vec2, slashId: string): ArmorResolveResult | null {
    if (this._phase !== "armor") return null;
    if (this._resolvedSlashId === slashId) return null;
    if (this._switchTimer > 0) return null; // 护甲切换延迟
    // 初始化Session
    if (this._session.slashId !== slashId) {
      this._session = { slashId, bodyContact: false, firstBodyHitPos: undefined, lastBodyHitPos: undefined, finalResult: undefined };
    }
    const active = this.armorTargets[this.activeArmorIndex];
    if (!active || active.broken) return null;
    const cx = DESIGN_WIDTH / 2;
    const cy = this.renderY;
    const tcX = cx + active.relX;
    const tcY = cy + active.relY;

    // 第1级: 命中护甲 → 立即锁定
    if (this.segmentHitEllipse(segA, segB, tcX, tcY, active.radiusX, active.radiusY)) {
      active.hitSlashId = slashId;
      active.broken = true; active.active = false;
      active.animTimer = 0.6;
      this.armorProgress++; this.consecutiveErrors = 0;
      this._resolvedSlashId = slashId;
      this._session.finalResult = "armor_hit";
      const completed = this.armorProgress >= this.maxArmor;
      if (completed) { this._phase = "armor_break_show"; this.breakShowTimer = 0; }
      else { this._switchTimer = this.SWITCH_DELAY; this.activeArmorIndex = (this.activeArmorIndex + 1) % this.maxArmor; }
      this.lastResolveDebug = { slashId, segA, segB, activeArmorName: active.name, minDist: 0, bodyHit: true, result: "armor_hit" };
      return { kind: "armor_hit", targetId: active.id, hitPos: segB, armorCenter: { x: tcX, y: tcY }, shardOrigin: { x: tcX, y: tcY }, progress: this.armorProgress, maxProgress: this.maxArmor, completed, slashId };
    }

    // 第2级(候选): 是否接触Boss身体（多椭圆并集+线段判定，不立即结算）
    const bodyHit = BODY_PARTS.some(p => this.segmentHitEllipse(segA, segB, cx + p.cx, cy + p.cy, p.rx, p.ry));
    if (bodyHit && !this._session.bodyContact) {
      this._session.bodyContact = true;
      this._session.firstBodyHitPos = this._session.firstBodyHitPos ?? segB;
      this._session.lastBodyHitPos = segB;
      this.lastResolveDebug = { slashId, segA, segB, activeArmorName: active.name, minDist: 0, bodyHit: true, result: "body_contact" };
      return { kind: "miss", slashId }; // 候选，不锁定
    }

    // 第3级: 完全挥空
    this.lastResolveDebug = { slashId, segA, segB, activeArmorName: active.name, minDist: 999, bodyHit: false, result: "miss" };
    return { kind: "miss", slashId };
  }

  /** 收刀结算——处理body_contact→wrong_hit */
  finishSlash(slashId: string): ArmorResolveResult | null {
    if (this._resolvedSlashId === slashId) return null; // 已armor_hit
    if (this._session.bodyContact && this._session.slashId === slashId) {
      this._resolvedSlashId = slashId;
      this.consecutiveErrors++;
      const rePrompt = this.consecutiveErrors >= CONSECUTIVE_ERROR_LIMIT && (this._elapsed - this.lastErrorRePromptElapsed > 3);
      if (rePrompt) { this.lastErrorRePromptElapsed = this._elapsed; this.objectiveAlpha = 1; this._objectiveTimer = 0; }
      this._session.finalResult = "wrong_hit";
      this.lastResolveDebug = { slashId, segA: this._session.firstBodyHitPos ?? { x: 0, y: 0 }, segB: this._session.lastBodyHitPos ?? { x: 0, y: 0 }, activeArmorName: this.armorTargets[this.activeArmorIndex]?.name ?? "-", minDist: 0, bodyHit: true, result: "wrong_hit" };
      return { kind: "wrong_hit", hitPos: this._session.lastBodyHitPos ?? { x: 0, y: 0 }, rePrompt, slashId };
    }
    this._session.finalResult = "miss";
    return null;
  }

  // ==============================================================
  // render（兼容旧调用）
  // ==============================================================
  render(ctx: any): void {
    this.renderWorld(ctx);
    this.renderOverlay(ctx);
  }

  /** P4.4A.2: 世界层（在刀光下方） */
  renderWorld(ctx: any): void {
    if (this._phase === "exit") return;
    this.drawVignette(ctx);
    this.drawTopMist(ctx);
    this.drawBoss(ctx);
    this.drawParticles(ctx);
  }

  /** P4.4A.2: 覆盖层（在刀光/命中文字上方） */
  renderOverlay(ctx: any): void {
    if (this._phase === "exit") return;
    this.drawTexts(ctx);
    if (this._phase === "armor" && this.objectiveAlpha > 0.01) this.drawObjective(ctx);
    if (this._phase === "armor_break_show") this.drawArmorBreakShow(ctx);
    if (this.p() === "pursuit_intro" && this.objectiveAlpha > 0.01) this.drawObjective(ctx);
    if (this._phase === "pursuit" && this.objectiveAlpha > 0.01) this.drawObjective(ctx);
    if (this._phase !== "loading" && this._phase !== "intro") this.drawBossHud(ctx);
  }

  /** 获取Boss身体世界坐标（用于wrong_hit参考） */
  getBodyWorldPos(): { parts: { cx: number; cy: number; rx: number; ry: number }[] } {
    const cx = DESIGN_WIDTH / 2;
    const cy = this.renderY;
    return { parts: BODY_PARTS.map(p => ({ cx: cx + p.cx, cy: cy + p.cy, rx: p.rx * this.bossRenderScale, ry: p.ry * this.bossRenderScale })) };
  }

  /** 获取护甲目标世界坐标 */
  getArmorTargetWorldPos(id: number): { cx: number; cy: number; rx: number; ry: number } | null {
    const t = this.armorTargets[id];
    if (!t) return null;
    return { cx: DESIGN_WIDTH / 2 + t.relX, cy: this.renderY + t.relY, rx: t.radiusX, ry: t.radiusY };
  }

  /** P4.4A.3: 雷核（弱点）世界坐标 */
  getCoreWorldPos(): { cx: number; cy: number; rx: number; ry: number } {
    return { cx: DESIGN_WIDTH / 2 + CORE_GEOMETRY.relX, cy: this.renderY + CORE_GEOMETRY.relY, rx: CORE_GEOMETRY.hitRadiusX, ry: CORE_GEOMETRY.hitRadiusY };
  }

  /** P4.4A.3: 追击判定（返回独立PursuitResolveResult） */
  resolvePursuitSegment(segA: Vec2, segB: Vec2, slashId: string): import("../types").PursuitResolveResult | null {
    if (this._phase !== "pursuit") return null;
    if (this._resolvedSlashId === slashId) return null;
    const core = this.getCoreWorldPos();
    if (this.segmentHitEllipse(segA, segB, core.cx, core.cy, core.rx, core.ry)) {
      this._resolvedSlashId = slashId;
      this._pursuitProgress++;
      this.screenShake = Math.max(this.screenShake, 0.2);
      this.flash = Math.max(this.flash, 0.2);
      this.lastResolveDebug = { slashId, segA, segB, activeArmorName: "core", minDist: 0, bodyHit: true, result: "pursuit_hit" };
      const completed = this._pursuitProgress >= this.MAX_PURSUIT;
      if (completed) { this._phase = "core_break"; this.coreBreakTimer = 0; }
      return { kind: "pursuit_hit", hitPos: segB, coreCenter: { x: core.cx, y: core.cy }, progress: this._pursuitProgress, maxProgress: this.MAX_PURSUIT, completed, slashId };
    }
    const bodyHit = BODY_PARTS.some(p => this.segmentHitEllipse(segA, segB, DESIGN_WIDTH / 2 + p.cx, this.renderY + p.cy, p.rx, p.ry));
    if (bodyHit) {
      this.lastResolveDebug = { slashId, segA, segB, activeArmorName: "body", minDist: 0, bodyHit: true, result: "body_contact" };
      return { kind: "pursuit_body_hit", hitPos: segB, slashId };
    }
    this.lastResolveDebug = { slashId, segA, segB, activeArmorName: "-", minDist: 999, bodyHit: false, result: "miss" };
    return { kind: "pursuit_miss", slashId };
  }

  // ==============================================================
  // 内部
  // ==============================================================
  private updateArmorPhase(dt: number): void {
    // 护甲切换延迟：倒计时结束后激活下一块
    if (this._switchTimer > 0) {
      this._switchTimer = Math.max(0, this._switchTimer - dt);
      if (this._switchTimer <= 0) {
        this.armorTargets[this.activeArmorIndex].active = true;
        AudioService.armorSwitch();
      }
    }
    // objectiveAlpha计时器
    if (this._objectiveTimer < 1.5) {
      this._objectiveTimer += dt;
      this.objectiveAlpha = Math.min(1, this._objectiveTimer / 0.2);
    } else if (this._objectiveTimer < 1.8) {
      this._objectiveTimer += dt;
      this.objectiveAlpha = Math.max(0, 1 - (this._objectiveTimer - 1.5) / 0.3);
    }
    this.hudSlideY = Math.min(0, this.hudSlideY + dt * 60);
  }

  private updateIntroTimeline(): void {
    if (this.introElapsed >= 0.45 && this.introElapsed <= 1.25) {
      const t = (this.introElapsed - 0.45) / 0.8;
      this.renderY = -100 + (BOSS_CY + 100) * (1 - Math.pow(1 - t, 3));
      this.bossRenderScale = 0.75 + 0.25 * (1 - Math.pow(1 - t, 3));
    } else if (this.introElapsed > 1.25) { this.renderY = BOSS_CY; this.bossRenderScale = 1; }
    // P4.4A.2: 一次性冲击触发，不每帧重置
    this.shakeTimer = Math.max(0, this.shakeTimer - 0.033);
      if (!this._impactTriggered && this.introElapsed >= 1.25) {
        this._impactTriggered = true;
        this.shakeTimer = 0.25;
        AudioService.bossImpact();
      }
    if (this.introElapsed >= 0.10) this.vignetteIntensity = 0.15;
    if (this.introElapsed >= 0.30) this.vignetteIntensity = 0.35;
    if (this.introElapsed >= 1.45) this.guardianAlpha = Math.min(1, (this.introElapsed - 1.45) / 0.15);
    if (this.introElapsed >= 1.75) this.bossNameAlpha = Math.min(1, (this.introElapsed - 1.75) / 0.15);
    if (this.introElapsed >= 2.10) this.hudSlideY = Math.min(0, this.renderY * 5);
    if (this.introElapsed >= 2.40) this.objectiveAlpha = Math.min(1, (this.introElapsed - 2.40) / 0.15);
    if (this.introElapsed >= INTRO_DURATION) this.transitionToArmor();
  }

  private transitionToArmor(): void {
    this._phase = "armor"; this.renderY = BOSS_CY;
    this.bossRenderScale = 1; this.vignetteIntensity = 0.15;
    this.hudSlideY = -60; this.objectiveAlpha = 1; this._objectiveTimer = 0;
    this.armorTargets[ARMOR_L].active = true; this.activeArmorIndex = ARMOR_L;
  }

  private spawnParticles(): void {
    if (this.introElapsed < 2.0 && Math.random() > 0.1) {
      this.particles.push({
        x: DESIGN_WIDTH / 2 + (Math.random() - 0.5) * 200, y: this.renderY - 60 + (Math.random() - 0.5) * 160,
        life: 0.3 + Math.random() * 0.6, size: 1.5 + Math.random() * 3,
        color: Math.random() > 0.5 ? "#f0e130" : "#8e44ad",
      });
    }
  }

  // ==============================================================
  // 渲染方法
  // ==============================================================
  private drawVignette(ctx: any): void {
    if (this.vignetteIntensity <= 0) return;
    const c = Math.min(this.vignetteIntensity, 0.5);
    const grd = ctx.createRadialGradient(DESIGN_WIDTH / 2, BOSS_CY - 20, 50, DESIGN_WIDTH / 2, BOSS_CY - 20, 320);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(0.5, `rgba(24, 8, 36, ${c * 0.3})`);
    grd.addColorStop(1, `rgba(0,0,0,${c})`);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  }

  private drawTopMist(ctx: any): void {
    if (this.vignetteIntensity <= 0) return;
    const grad = ctx.createLinearGradient(0, 0, 0, 120);
    grad.addColorStop(0, `rgba(12, 4, 20, ${Math.min(this.vignetteIntensity * 1.5, 1)})`);
    grad.addColorStop(1, "rgba(12, 4, 20, 0)");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, DESIGN_WIDTH, 120);
  }

  private drawParticles(ctx: any): void {
    for (const p of this.particles) {
      ctx.save(); ctx.globalAlpha = Math.min(1, p.life * 3) * 0.6;
      ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // ================================================================
  // Boss 武将剪影
  // ================================================================
  private drawBoss(ctx: any): void {
    const shakeX = this.shakeTimer > 0 ? (Math.random() - 0.5) * 4 : 0;
    const shakeY = this.shakeTimer > 0 ? (Math.random() - 0.5) * 3 : 0;
    // P4.4A.2: 不使用setTransform(1)，保留DPR和上层transform
    ctx.save();
    ctx.translate(DESIGN_WIDTH / 2 + shakeX, this.renderY + shakeY);
    ctx.scale(this.bossRenderScale, this.bossRenderScale);
    ctx.save();
    ctx.shadowColor = "rgba(108, 52, 131, 0.3)"; ctx.shadowBlur = 18;
    ctx.fillStyle = "#1a0a26"; this.drawSilhouette(ctx); ctx.fill();
    ctx.shadowBlur = 0; ctx.restore();
    ctx.save();
    ctx.strokeStyle = "rgba(108, 52, 131, 0.35)"; ctx.lineWidth = 2;
    this.drawSilhouette(ctx); ctx.stroke(); ctx.restore();
    // 头盔
    ctx.save(); ctx.fillStyle = "#0d0515";
    ctx.beginPath(); ctx.roundRect(-12, -56, 24, 12, 4); ctx.fill();
    ctx.fillStyle = "#6c3483";
    ctx.beginPath(); ctx.moveTo(-5, -70); ctx.lineTo(0, -88); ctx.lineTo(5, -70); ctx.closePath(); ctx.fill();
    ctx.restore();
    // 肩甲（激活态发光）
    this.drawArmorPiece(ctx, this.armorTargets[ARMOR_L], -50, -30, 30, 22);
    this.drawArmorPiece(ctx, this.armorTargets[ARMOR_R], 50, -30, 30, 22);
    // 胸甲
    this.drawChestPiece(ctx, this.armorTargets[ARMOR_C]);
    // 雷核（根据阶段动态亮度）
    this.drawCore(ctx);
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

  private drawArmorPiece(ctx: any, target: ArmorTarget, x: number, y: number, w: number, h: number): void {
    const isActive = this._phase === "armor" && target.active && !target.broken;
    const isBroken = target.broken;
    const flash = isActive && this.consecutiveErrors >= CONSECUTIVE_ERROR_LIMIT;
    // 破碎态：根据animTimer缩小+淡出
    let scale = 1, alpha = 1;
    if (isBroken && target.animTimer > 0) {
      const t = target.animTimer / 0.6;
      scale = 0.3 + 0.7 * t;
      alpha = 0.1 + 0.9 * t;
    } else if (isBroken) {
      scale = 0.15; alpha = 0.08; // 破碎后几乎消失
    }
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = isBroken ? "#0d0515" : (isActive ? "#3d1a50" : "#150a20");
    ctx.strokeStyle = isActive ? (flash ? "#ff6a33" : "#f0e130") : "#3d1a4a";
    ctx.lineWidth = isActive ? 3 : 1.5;
    if (isActive) { ctx.shadowColor = flash ? "#ff6a33" : "#f0e130"; ctx.shadowBlur = flash ? 20 : 12; }
    ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (isBroken && target.animTimer > 0) {
      ctx.strokeStyle = `rgba(240, 225, 48, ${target.animTimer / 0.6 * 0.6})`; ctx.lineWidth = 2; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(0, 0); ctx.lineTo(6, 6); ctx.stroke();
    }
    ctx.restore();
  }

  private drawChestPiece(ctx: any, target: ArmorTarget): void {
    const isActive = this._phase === "armor" && target.active && !target.broken;
    const isBroken = target.broken;
    let scale = 1, alpha = 1;
    if (isBroken && target.animTimer > 0) {
      const t = target.animTimer / 0.6;
      scale = 0.3 + 0.7 * t;
      alpha = 0.1 + 0.9 * t;
    } else if (isBroken) {
      scale = 0.15; alpha = 0.08;
    }
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(0, 0);
    ctx.scale(scale, scale);
    ctx.fillStyle = isBroken ? "#0d0515" : (isActive ? "#3d1a50" : "#150a20");
    ctx.strokeStyle = isActive ? "#f0e130" : "#3d1a4a";
    ctx.lineWidth = isActive ? 3 : 1.5;
    if (isActive) { ctx.shadowColor = "#f0e130"; ctx.shadowBlur = 12; }
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(20, 2); ctx.lineTo(0, 22); ctx.lineTo(-20, 2);
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    if (isBroken && target.animTimer > 0) {
      ctx.strokeStyle = `rgba(240, 225, 48, ${target.animTimer / 0.6 * 0.5})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(0, 6); ctx.lineTo(10, -4); ctx.stroke();
    }
    ctx.restore();
  }

  /** 雷核（动态亮度） */
  private drawCore(ctx: any): void {
    const exposed = this.coreExposed;
    let coreAlpha: number;
    let coreColor0: string;
    let coreColor1: string;
    let drawR = CORE_GEOMETRY.visualRadius;
    if (this._phase === "armor") {
      coreAlpha = 0.35; coreColor0 = "#6c3483"; coreColor1 = "#3d1a50";
    } else if (this._phase === "armor_break_show") {
      const p = Math.min(this.breakShowTimer / 0.4, 1);
      coreAlpha = 0.3 + 0.7 * p; coreColor0 = "#8e44ad"; coreColor1 = "#f0e130";
    } else if (this._phase === "armor_complete_hold") {
      coreAlpha = 0.75 + Math.sin(this._elapsed * 3) * 0.15; coreColor0 = "#a855f7"; coreColor1 = "#f0e130";
    } else if (this._phase === "pursuit_intro" || this._phase === "pursuit") {
      coreAlpha = 0.8 + Math.sin(this._elapsed * 4) * 0.15; coreColor0 = "#a855f7"; coreColor1 = "#f0e130";
      drawR = CORE_GEOMETRY.visualRadius * 1.5;
    } else if (this._phase === "core_break") {
      coreAlpha = 0.6 + Math.sin(this.coreBreakTimer * 10) * 0.3; coreColor0 = "#f0e130"; coreColor1 = "#ffffff";
      drawR = CORE_GEOMETRY.visualRadius * 1.8;
    } else {
      coreAlpha = 0.35; coreColor0 = "#6c3483"; coreColor1 = "#3d1a50";
    }
    ctx.save();
    ctx.globalAlpha = coreAlpha;
    const pulse = exposed ? 1 + Math.sin(this._elapsed * 6) * 0.15 : 0.9 + Math.sin(this._elapsed * 4) * 0.1;
    const finalR = drawR * pulse;
    const grd = ctx.createRadialGradient(0, 2, 0, 0, 2, finalR);
    grd.addColorStop(0, coreColor0); grd.addColorStop(1, coreColor1);
    ctx.fillStyle = grd;
    ctx.shadowColor = exposed ? "#a855f7" : "#6c3483";
    ctx.shadowBlur = exposed ? 16 : 6;
    ctx.beginPath(); ctx.arc(0, 2, finalR, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ================================================================
  // 文字 & HUD
  // ================================================================
  private drawTexts(ctx: any): void {
    if (this._phase !== "intro") return;
    if (this.guardianAlpha > 0.01) {
      ctx.save(); ctx.globalAlpha = this.guardianAlpha;
      ctx.fillStyle = "#d7bde2"; ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(107, 52, 131, 0.5)"; ctx.shadowBlur = 8;
      ctx.fillText("境界镇守者", DESIGN_WIDTH / 2, 258); ctx.restore();
    }
    if (this.bossNameAlpha > 0.01) {
      ctx.save(); ctx.globalAlpha = this.bossNameAlpha;
      ctx.fillStyle = "#f0e130"; ctx.font = '700 30px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "#f0e130"; ctx.shadowBlur = 16;
      ctx.fillText("玄甲雷将", DESIGN_WIDTH / 2, 302); ctx.restore();
    }
  }

  private drawObjective(ctx: any): void {
    if (this.objectiveAlpha <= 0.01) return;
    ctx.save(); ctx.globalAlpha = this.objectiveAlpha;
    ctx.fillStyle = this.consecutiveErrors >= CONSECUTIVE_ERROR_LIMIT ? "#ff6a33" : "#f0e130";
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
    ctx.fillText(this.objectiveText, DESIGN_WIDTH / 2, 108); ctx.restore();
  }

  private drawArmorBreakShow(ctx: any): void {
    const p = Math.min(this.breakShowTimer / 0.8, 1);
    const fadeOut = Math.max(0, 1 - (this.breakShowTimer - 0.8) / 0.4);
    ctx.save();
    ctx.globalAlpha = Math.min(p * 2, fadeOut);
    ctx.fillStyle = "#f0e130"; ctx.font = '700 28px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "#f0e130"; ctx.shadowBlur = 20;
    ctx.fillText("护甲破碎", DESIGN_WIDTH / 2, 240);
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = "#d7bde2"; ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
    ctx.fillText("弱点已暴露", DESIGN_WIDTH / 2, 285);
    ctx.restore();
  }

  private drawBossHud(ctx: any): void {
    const hudTop = Math.max(8, this.hudSlideY);
    const hudW = DESIGN_WIDTH - 12;
    const hudX = 6;
    const hpRatio = this._bossHP / Math.max(1, this._bossMaxHP);
    ctx.save();
    ctx.globalAlpha = 0.90;
    ctx.fillStyle = "rgba(24, 10, 34, 0.90)";
    ctx.shadowColor = "rgba(108, 52, 131, 0.2)"; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.roundRect(hudX, hudTop, hudW, 66, 6); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(108, 52, 131, 0.25)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(hudX, hudTop, hudW, 66, 6); ctx.stroke();
    // 名称
    ctx.globalAlpha = 1; ctx.fillStyle = "#f0e130";
    ctx.font = '700 15px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.shadowColor = "#f0e130"; ctx.shadowBlur = 4;
    ctx.fillText("玄甲雷将", DESIGN_WIDTH / 2, hudTop + 5); ctx.shadowBlur = 0;
    // 血条
    const barTop = hudTop + 24, barLeft = 14, barW = DESIGN_WIDTH - 28, barH = 9;
    ctx.fillStyle = "rgba(40, 18, 18, 0.85)";
    ctx.beginPath(); ctx.roundRect(barLeft, barTop, barW, barH, 4); ctx.fill();
    ctx.fillStyle = "#6c3483"; ctx.shadowColor = "#6c3483"; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.roundRect(barLeft, barTop, barW * hpRatio, barH, 4); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(240, 225, 48, 0.2)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(barLeft, barTop, barW, barH, 4); ctx.stroke();
    // 阶段+进度
    const labelY = barTop + barH + 4;
    ctx.fillStyle = "#d7bde2"; ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    let phaseLabel = "阶段 1 · 破甲";
    if (this._phase === "armor_break_show" || this._phase === "armor_complete_hold") phaseLabel = "破甲完成";
    if (this.p() === "pursuit_intro" || this._phase === "pursuit") phaseLabel = "阶段 2 · 追击";
    if (this._phase === "core_break") phaseLabel = "雷核击破";
    ctx.fillText(phaseLabel, barLeft, labelY);
    ctx.fillStyle = "#a569bd"; ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "right";
    let progText: string;
    if (this._phase === "core_break") {
      progText = "终结机会";
    } else if (this._phase === "armor_break_show" || this._phase === "armor_complete_hold") {
      progText = "弱点暴露";
    } else if (this._phase === "pursuit_intro" || this._phase === "pursuit") {
      progText = `追击 ${this._pursuitProgress}/${this.MAX_PURSUIT}`;
    } else {
      progText = `护甲 ${this.armorProgress}/${this.maxArmor}`;
    }
    ctx.fillText(progText, DESIGN_WIDTH - 14, labelY);
    ctx.restore();
  }

  // ================================================================
  // 外部方法
  // ================================================================
  get bossHP(): number { return this._bossHP; }
  get bossMaxHP(): number { return this._bossMaxHP; }
  onBossHit(damage: number, isArmorTarget: boolean): boolean { return false; }
  onBossKilled(): void { this._phase = "exit"; }
  resetForRetry(): void { this.enterLoading(); }
}
