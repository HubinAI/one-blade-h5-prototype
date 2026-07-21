// ========================================================================
// P4.4A.2 V0720030: BossController
// 状态: loading → intro → armor → armor_break_show → armor_complete_hold
// 护甲: 左肩/右肩/胸甲、三态命中(armor_hit/wrong_hit/miss)
// 单刀单甲: slashId级别解析锁
// ========================================================================
import type { BossId, BossPhaseState, Vec2 } from "../types";
import { DESIGN_WIDTH, DESIGN_HEIGHT } from "../config/constants";
import { distanceToSegment } from "../../utils/math";

const BOSS_CY = 195;
const INTRO_DURATION = 2.85;
const ARMOR_L = 0, ARMOR_R = 1, ARMOR_C = 2;
const CONSECUTIVE_ERROR_LIMIT = 2;

// 身体Hit Area（椭圆）
const BODY_CX = 0, BODY_CY = -5;
const BODY_RX = 50, BODY_RY = 55;

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
  get inputLocked(): boolean {
    return this._phase === "loading" || this._phase === "intro" || this._phase === "armor_break_show" || this._phase === "armor_complete_hold";
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
  private vignetteIntensity = 0;
  private particles: { x: number; y: number; life: number; size: number; color: string }[] = [];

  private armorProgress = 0;
  private readonly maxArmor = 3;
  private activeArmorIndex = ARMOR_L;
  private armorTargets: ArmorTarget[] = [];
  private consecutiveErrors = 0;
  private lastErrorRePromptAt = 0;
  /** 整刀解析锁 */
  private _resolvedSlashId = "";
  /** 整刀Body Contact候选（wrong_hit收刀结算） */
  private _bodyContactSlashId = "";
  /** 冲击触发标记（防shakeTimer重复） */
  private _impactTriggered = false;
  /** 目标提示计时器 */
  private _objectiveTimer = 0;

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

  /** 椭圆-点距离（归一化后） */
  private pointToEllipseDist(px: number, py: number, cx: number, cy: number, rx: number, ry: number): number {
    return Math.sqrt(Math.pow((px - cx) / Math.max(1, rx), 2) + Math.pow((py - cy) / Math.max(1, ry), 2));
  }

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
    this._resolvedSlashId = ""; this._bodyContactSlashId = ""; this.lastResolveDebug = null;
    this._impactTriggered = false; this._objectiveTimer = 0;
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
    this.particles = this.particles.filter(p => { p.life -= dt; return p.life > 0; });
    // P4.4A.2: 统一衰减shakeTimer
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
      // 保持，不进入胜利
      return;
    }
  }

  // ==============================================================
  // 核心: resolveArmorSegment（原子化三态判定）
  // ==============================================================
  resolveArmorSegment(segA: Vec2, segB: Vec2, slashId: string): ArmorResolveResult | null {
    if (this._phase !== "armor") return null;
    if (this._resolvedSlashId === slashId) return null; // 整刀已锁定
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
      this._bodyContactSlashId = ""; // 清除body候选
      const completed = this.armorProgress >= this.maxArmor;
      if (completed) { this._phase = "armor_break_show"; this.breakShowTimer = 0; }
      else { this.activeArmorIndex = (this.activeArmorIndex + 1) % this.maxArmor; this.armorTargets[this.activeArmorIndex].active = true; }
      this.lastResolveDebug = { slashId, segA, segB, activeArmorName: active.name, minDist: 0, bodyHit: true, result: "armor_hit" };
      return { kind: "armor_hit", targetId: active.id, hitPos: segB, armorCenter: { x: tcX, y: tcY }, shardOrigin: { x: tcX, y: tcY }, progress: this.armorProgress, maxProgress: this.maxArmor, completed, slashId };
    }

    // 第2级(候选): 是否接触Boss身体（使用整条线段判定，不立即结算）
    if (this._bodyContactSlashId !== slashId && this.segmentHitEllipse(segA, segB, cx, cy + BODY_CY, BODY_RX, BODY_RY)) {
      this._bodyContactSlashId = slashId;
      this.lastResolveDebug = { slashId, segA, segB, activeArmorName: active.name, minDist: 0, bodyHit: true, result: "body_contact" };
      return { kind: "miss", slashId }; // 返回miss而不是wrong_hit
    }

    // 第3级: 完全挥空
    this.lastResolveDebug = { slashId, segA, segB, activeArmorName: active.name, minDist: 999, bodyHit: false, result: "miss" };
    return { kind: "miss", slashId };
  }

  /** 收刀结算——处理body_contact→wrong_hit */
  finishSlash(slashId: string): void {
    if (this._resolvedSlashId === slashId) return; // 已armor_hit
    if (this._bodyContactSlashId === slashId) {
      // body_contact → wrong_hit（只计一次）
      this._resolvedSlashId = slashId;
      this.consecutiveErrors++;
      const rePrompt = this.consecutiveErrors >= CONSECUTIVE_ERROR_LIMIT && (Date.now() - this.lastErrorRePromptAt > 3000);
      if (rePrompt) { this.lastErrorRePromptAt = Date.now(); this.objectiveAlpha = 1; this._objectiveTimer = 0; }
    }
    // 无body_contact → miss（不锁，允许后续尝试）
  }

  // ==============================================================
  // render
  // ==============================================================
  render(ctx: any): void {
    if (this._phase === "exit") return;
    this.drawVignette(ctx);
    this.drawTopMist(ctx);
    this.drawBoss(ctx);
    this.drawParticles(ctx);
    this.drawTexts(ctx);
    if (this._phase === "armor" && this.objectiveAlpha > 0.01) this.drawObjective(ctx);
    if (this._phase === "armor_break_show") this.drawArmorBreakShow(ctx);
    if (this._phase !== "loading" && this._phase !== "intro") this.drawBossHud(ctx);
  }

  /** 获取Boss身体世界坐标（用于wrong_hit参考） */
  getBodyWorldPos(): { cx: number; cy: number; rx: number; ry: number } {
    return { cx: DESIGN_WIDTH / 2, cy: this.renderY + BODY_CY, rx: BODY_RX * this.bossRenderScale, ry: BODY_RY * this.bossRenderScale };
  }

  /** 获取护甲目标世界坐标 */
  getArmorTargetWorldPos(id: number): { cx: number; cy: number; rx: number; ry: number } | null {
    const t = this.armorTargets[id];
    if (!t) return null;
    return { cx: DESIGN_WIDTH / 2 + t.relX, cy: this.renderY + t.relY, rx: t.radiusX, ry: t.radiusY };
  }

  // ==============================================================
  // 内部
  // ==============================================================
  private updateArmorPhase(dt: number): void {
    for (const t of this.armorTargets) { if (t.animTimer > 0) t.animTimer = Math.max(0, t.animTimer - dt); }
    // P4.4A.2: objectiveAlpha 1.5s首次显示→0.3s淡出
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
    ctx.save();
    ctx.fillStyle = isBroken ? "#0d0515" : (isActive ? "#3d1a50" : "#150a20");
    ctx.strokeStyle = isActive ? (flash ? "#ff6a33" : "#f0e130") : "#3d1a4a";
    ctx.lineWidth = isActive ? 3 : 1.5;
    if (isActive) { ctx.shadowColor = flash ? "#ff6a33" : "#f0e130"; ctx.shadowBlur = flash ? 20 : 12; }
    ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (isBroken && target.animTimer > 0) {
      ctx.strokeStyle = "rgba(240, 225, 48, 0.5)"; ctx.lineWidth = 2; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.moveTo(x - 8, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + 6, y + 6); ctx.stroke();
    }
    ctx.restore();
  }

  private drawChestPiece(ctx: any, target: ArmorTarget): void {
    const isActive = this._phase === "armor" && target.active && !target.broken;
    const isBroken = target.broken;
    ctx.save();
    ctx.fillStyle = isBroken ? "#0d0515" : (isActive ? "#3d1a50" : "#150a20");
    ctx.strokeStyle = isActive ? "#f0e130" : "#3d1a4a";
    ctx.lineWidth = isActive ? 3 : 1.5;
    if (isActive) { ctx.shadowColor = "#f0e130"; ctx.shadowBlur = 12; }
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(20, 2); ctx.lineTo(0, 22); ctx.lineTo(-20, 2);
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    if (isBroken && target.animTimer > 0) {
      ctx.strokeStyle = "rgba(240, 225, 48, 0.5)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(0, 6); ctx.lineTo(10, -4); ctx.stroke();
    }
    ctx.restore();
  }

  /** 雷核（动态亮度） */
  private drawCore(ctx: any): void {
    const isComplete = this._phase === "armor_break_show" || this._phase === "armor_complete_hold";
    let coreAlpha: number;
    let coreColor0: string;
    let coreColor1: string;
    if (this._phase === "armor_break_show") {
      const p = Math.min(this.breakShowTimer / 0.4, 1);
      coreAlpha = 0.3 + 0.7 * p;
      coreColor0 = "#8e44ad"; coreColor1 = "#f0e130";
    } else if (this._phase === "armor_complete_hold") {
      coreAlpha = 0.75 + Math.sin(Date.now() / 300) * 0.15;
      coreColor0 = "#a855f7"; coreColor1 = "#f0e130";
    } else {
      coreAlpha = 0.35;
      coreColor0 = "#6c3483"; coreColor1 = "#3d1a50";
    }
    ctx.save();
    ctx.globalAlpha = coreAlpha;
    const coreR = 8;
    const pulse = this._phase === "armor_break_show" ? 1 + Math.sin(this.breakShowTimer * 12) * 0.2 : 0.9 + Math.sin(Date.now() / 250) * 0.1;
    const grd = ctx.createRadialGradient(0, 2, 0, 0, 2, coreR * pulse);
    grd.addColorStop(0, coreColor0); grd.addColorStop(1, coreColor1);
    ctx.fillStyle = grd;
    ctx.shadowColor = isComplete ? "#a855f7" : "#6c3483";
    ctx.shadowBlur = isComplete ? 16 : 6;
    ctx.beginPath(); ctx.arc(0, 2, coreR * pulse, 0, Math.PI * 2); ctx.fill();
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
    ctx.fillText("切发亮护甲", DESIGN_WIDTH / 2, 108); ctx.restore();
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
    ctx.fillText(phaseLabel, barLeft, labelY);
    ctx.fillStyle = "#a569bd"; ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "right";
    ctx.fillText(`护甲 ${this.armorProgress}/${this.maxArmor}`, DESIGN_WIDTH - 14, labelY);
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
