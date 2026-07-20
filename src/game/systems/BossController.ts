// ========================================================================
// P4.4A.2: BossController
// 生命周期: loading → intro → armor → armor_break → result → exit
// 护甲系统: 左肩/右肩/胸甲 → 刀路相交检测 → 进度 → 破碎演出
// ========================================================================
import type { BossId, BossPhaseState, Vec2 } from "../types";
import { BOSS_CONFIG } from "../config/bosses";
import { BOSS_VISUAL_DEFS } from "../../data/bosses";
import { DESIGN_WIDTH, DESIGN_HEIGHT } from "../config/constants";
import { segmentHitCircle } from "./collisionSystem";
import { distanceToSegment } from "../../utils/math";

const BOSS_CY = 195;
const INTRO_DURATION = 2.85;
const ARMOR_L = 0, ARMOR_R = 1, ARMOR_C = 2;
const CONSECUTIVE_ERROR_LIMIT = 2;

/** P4.4A.2: 护甲判定结果（原子化） */
export type ArmorResolveResult =
  | { kind: "armor_hit"; targetId: number; hitPos: { x: number; y: number }; progress: number; maxProgress: number; completed: boolean; slashId: string }
  | { kind: "wrong_hit"; hitPos: { x: number; y: number }; rePrompt: boolean; slashId: string }
  | { kind: "miss"; slashId: string };

type ArmorTarget = {
  id: number; name: string;
  relX: number; relY: number; hitRadius: number;
  active: boolean; broken: boolean;
  animTimer: number;
  lastHitSlashId: string;
};

export class BossController {
  private _phase: BossPhaseState = "loading";
  get phase(): BossPhaseState { return this._phase; }

  get isIntroActive(): boolean { return this._phase === "loading" || this._phase === "intro"; }
  get playerInvulnerable(): boolean { return this.isIntroActive; }
  get bossDamageable(): boolean { return false; }
  get bossModeActive(): boolean { return this.getPhase() !== "exit"; }
  private getPhase(): BossPhaseState { return this._phase; }

  get debugSnapshot(): Record<string, string | number | boolean> {
    const arm = this.armorTargets[this.activeArmorIndex];
    const activeCenter = arm ? `(${DESIGN_WIDTH / 2 + arm.relX},${BOSS_CY + arm.relY})` : "无";
    return {
      "Game Mode": "boss", "Boss State": this._phase,
      "Visual Boss Pos": `(${DESIGN_WIDTH / 2}, ${this.renderY})`,
      "Boss HP": `${this._bossHP}/${this._bossMaxHP}`,
      "Active Armor": arm?.name ?? "无",
      "Active Armor Center": activeCenter,
      "Armor Progress": `${this.armorProgress}/${this.maxArmor}`,
      "Input Locked": this.isIntroActive,
      "Player Invuln": this.playerInvulnerable,
      "Consecutive Errors": this.consecutiveErrors,
      "Normal HUD Visible": false,
      "Boss HUD Visible": true,
      "Sub Blade Locked": true,
    };
  }

  readonly bossId: BossId;

  // -- 开场 --
  private introElapsed = 0;
  private timelineEvents: { time: number; fired: boolean; fn: () => void }[] = [];
  private _introSkipped = false;
  private renderY = -120;
  private shakeTimer = 0;
  private bossRenderScale = 0.75;
  private hudSlideY = -80;
  private guardianAlpha = 0;
  private bossNameAlpha = 0;
  private objectiveAlpha = 0;
  private vignetteIntensity = 0;
  private particles: { x: number; y: number; life: number; size: number; color: string }[] = [];

  // -- 护甲 --
  private armorProgress = 0;
  private readonly maxArmor = 3;
  private activeArmorIndex = ARMOR_L;
  private armorTargets: ArmorTarget[] = [];
  private consecutiveErrors = 0;
  private lastErrorRePromptAt = 0;
  private armorBreakTimer = 0;

  // -- Boss 数值 --
  private _bossHP = 16;
  private _bossMaxHP = 16;

  constructor(bossId: BossId) {
    this.bossId = bossId;
    const cfg = BOSS_CONFIG[bossId];
    this._bossMaxHP = cfg.maxHp;
    this._bossHP = cfg.maxHp;
    this.initArmorTargets();
    this.setupTimeline();
  }

  private initArmorTargets(): void {
    this.armorTargets = [
      { id: ARMOR_L, name: "左肩", relX: -50, relY: -30, hitRadius: 38, active: false, broken: false, animTimer: 0, lastHitSlashId: "" },
      { id: ARMOR_R, name: "右肩", relX: 50, relY: -30, hitRadius: 38, active: false, broken: false, animTimer: 0, lastHitSlashId: "" },
      { id: ARMOR_C, name: "胸甲", relX: 0, relY: 6, hitRadius: 40, active: false, broken: false, animTimer: 0, lastHitSlashId: "" },
    ];
  }

  // ==============================================================
  // 生命周期
  // ==============================================================
  enterLoading(): void {
    this._phase = "loading";
    this.introElapsed = 0;
    this._introSkipped = false;
    this.renderY = -120;
    this.bossRenderScale = 0.6;
    this.vignetteIntensity = 0;
    this.guardianAlpha = 0;
    this.bossNameAlpha = 0;
    this.objectiveAlpha = 0;
    this.hudSlideY = -80;
    this.shakeTimer = 0;
    this.armorProgress = 0;
    this.consecutiveErrors = 0;
    this.armorBreakTimer = 0;
    this.activeArmorIndex = ARMOR_L;
    this._bossHP = this._bossMaxHP;
    this.particles = [];
    this.initArmorTargets();
    this.armorTargets[ARMOR_L].active = true;
    this.setupTimeline();
  }

  skipIntro(): void {
    if (this._phase !== "loading" && this._phase !== "intro") return;
    this._introSkipped = true;
    this.introElapsed = INTRO_DURATION;
    this.renderY = BOSS_CY;
    this.bossRenderScale = 1;
    this.vignetteIntensity = 0.15;
    this.guardianAlpha = 1;
    this.bossNameAlpha = 1;
    this.objectiveAlpha = 1;
    this.hudSlideY = 0;
    this.transitionToArmor();
  }

  // ==============================================================
  // update
  // ==============================================================
  update(dt: number): void {
    this.particles = this.particles.filter(p => { p.life -= dt; return p.life > 0; });

    if (this._phase === "loading") {
      this._phase = "intro";
      return;
    }

    if (this._phase === "intro") {
      this.introElapsed += dt;
      this.updateIntroTimeline();
      this.spawnParticles();
      return;
    }

    if (this._phase === "armor") {
      this.updateArmorPhase(dt);
      return;
    }

    if (this._phase === "armor_break") {
      this.armorBreakTimer += dt;
      // 演出结束后保持
      return;
    }
  }

  // ==============================================================
  // 护甲命中判定（Game.ts 调用）
  // ==============================================================
  /** P4.4A.2: 原子化护甲判定 */
  resolveArmorSegment(segA: Vec2, segB: Vec2, slashId: string): ArmorResolveResult | null {
    if (this._phase !== "armor") return null;
    if (this._phase !== "armor") return null;
    const active = this.armorTargets[this.activeArmorIndex];
    if (!active || active.broken) return null;
    if (active.lastHitSlashId === slashId) return null;

    const cx = DESIGN_WIDTH / 2;
    const cy = this.renderY;
    const tcX = cx + active.relX;
    const tcY = cy + active.relY;
    const center: Vec2 = { x: tcX, y: tcY };
    const minDist = distanceToSegment(center, segA, segB);

    if (minDist <= active.hitRadius) {
      active.lastHitSlashId = slashId;
      active.broken = true;
      active.active = false;
      this.armorProgress++;
      this.consecutiveErrors = 0;
      const completed = this.armorProgress >= this.maxArmor;
      if (completed) {
        this._phase = "armor_break";
        this.armorBreakTimer = 0;
      } else {
        const nextId = (this.activeArmorIndex + 1) % this.maxArmor;
        this.activeArmorIndex = nextId;
        this.armorTargets[nextId].active = true;
      }
      return { kind: "armor_hit", targetId: active.id, hitPos: { x: tcX, y: tcY }, progress: this.armorProgress, maxProgress: this.maxArmor, completed, slashId };
    }

    this.consecutiveErrors++;
    const rePrompt = this.consecutiveErrors >= CONSECUTIVE_ERROR_LIMIT && (Date.now() - this.lastErrorRePromptAt > 3000);
    if (rePrompt) { this.lastErrorRePromptAt = Date.now(); this.objectiveAlpha = 1; }
    return { kind: "wrong_hit", hitPos: { x: tcX, y: tcY }, rePrompt, slashId };
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
    if (this._phase === "armor" && this.objectiveAlpha > 0.01) {
      this.drawObjective(ctx);
    }
    if (this._phase === "armor_break") {
      this.drawArmorBreakShow(ctx);
    }
    // HUD: 非 intro/loading 时显示
    if (this._phase !== "loading" && this._phase !== "intro" && this.getPhase() !== "exit") {
      this.drawBossHud(ctx);
    }
  }

  // ---- 护甲命中提醒（Game.ts 用于世界坐标"破甲"文字） ----
  /** 获取激活护甲的中心世界坐标 */
  getActiveArmorWorldPos(): Vec2 | null {
    if (this._phase !== "armor") return null;
    const target = this.armorTargets[this.activeArmorIndex];
    if (!target || target.broken) return null;
    return { x: DESIGN_WIDTH / 2 + target.relX, y: this.renderY + target.relY };
  }

  /** 生成碎甲粒子 */
  getArmorShardParticles(count: number, baseColor: string): { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }[] {
    const target = this.armorTargets[this.activeArmorIndex === 0 ? (this.armorProgress < this.maxArmor ? this.activeArmorIndex : 0) : this.activeArmorIndex];
    const cx = DESIGN_WIDTH / 2 + (target?.relX ?? 0);
    const cy = this.renderY + (target?.relY ?? 0);
    const parts = [];
    for (let i = 0; i < count; i++) {
      parts.push({
        x: cx + (Math.random() - 0.5) * 16,
        y: cy + (Math.random() - 0.5) * 16,
        vx: (Math.random() - 0.5) * 80,
        vy: -30 - Math.random() * 60,
        life: 0.3 + Math.random() * 0.4,
        color: baseColor,
        size: 2 + Math.random() * 4,
      });
    }
    return parts;
  }

  // ==============================================================
  // 内部: 护甲阶段
  // ==============================================================
  private updateArmorPhase(dt: number): void {
    // 护甲动画计时器
    for (const t of this.armorTargets) {
      if (t.animTimer > 0) t.animTimer = Math.max(0, t.animTimer - dt);
    }
    // 目标提示
    this.objectiveAlpha = Math.max(0, this.objectiveAlpha - dt * 0.2);
    this.hudSlideY = Math.min(0, this.hudSlideY + dt * 60);
  }

  // ==============================================================
  // 内部: 其余方法（开场、时间轴、渲染）
  // ==============================================================
  private setupTimeline(): void {
    this.timelineEvents = [
      { time: 0.00, fired: false, fn: () => {} },
      { time: 0.10, fired: false, fn: () => { this.vignetteIntensity = 0.15; } },
      { time: 0.30, fired: false, fn: () => { this.vignetteIntensity = 0.35; } },
      { time: 0.45, fired: false, fn: () => {} },
      { time: 1.25, fired: false, fn: () => { this.shakeTimer = 0.25; this.bossRenderScale = 1; } },
      { time: 1.45, fired: false, fn: () => { this.guardianAlpha = 1; } },
      { time: 1.75, fired: false, fn: () => { this.bossNameAlpha = 1; } },
      { time: 2.10, fired: false, fn: () => { this.hudSlideY = 0; } },
      { time: 2.40, fired: false, fn: () => { this.objectiveAlpha = 1; } },
      { time: 2.85, fired: false, fn: () => { this.transitionToArmor(); } },
    ];
  }

  private updateIntroTimeline(): void {
    if (this.introElapsed >= 0.45 && this.introElapsed <= 1.25) {
      const t = (this.introElapsed - 0.45) / 0.8;
      const ease = 1 - Math.pow(1 - t, 3);
      this.renderY = -100 + (BOSS_CY + 100) * ease;
      this.bossRenderScale = 0.75 + 0.25 * ease;
    } else if (this.introElapsed > 1.25) {
      this.renderY = BOSS_CY;
    }
    this.shakeTimer = Math.max(0, this.shakeTimer - 0.033);
    for (const ev of this.timelineEvents) {
      if (!ev.fired && this.introElapsed >= ev.time) { ev.fired = true; ev.fn(); }
    }
  }

  private transitionToArmor(): void {
    this._phase = "armor";
    this.renderY = BOSS_CY;
    this.bossRenderScale = 1;
    this.vignetteIntensity = 0.15;
    this.hudSlideY = -60;
    this.objectiveAlpha = 1;
    this.armorTargets[ARMOR_L].active = true;
    this.activeArmorIndex = ARMOR_L;
  }

  private spawnParticles(): void {
    if (this.introElapsed < 2.0 && Math.random() > 0.1) {
      this.particles.push({
        x: DESIGN_WIDTH / 2 + (Math.random() - 0.5) * 200,
        y: this.renderY - 60 + (Math.random() - 0.5) * 160,
        life: 0.3 + Math.random() * 0.6, size: 1.5 + Math.random() * 3,
        color: Math.random() > 0.5 ? "#f0e130" : "#8e44ad",
      });
    }
  }

  // ==============================================================
  // 渲染方法
  // ==============================================================
  private drawVignette(ctx: CanvasRenderingContext2D): void {
    if (this.vignetteIntensity <= 0) return;
    const v = this.vignetteIntensity;
    const c = Math.min(v, 0.5);
    const grd = ctx.createRadialGradient(DESIGN_WIDTH / 2, BOSS_CY - 20, 50, DESIGN_WIDTH / 2, BOSS_CY - 20, 320);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(0.5, `rgba(24, 8, 36, ${c * 0.3})`);
    grd.addColorStop(1, `rgba(0,0,0,${c})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  }

  private drawTopMist(ctx: CanvasRenderingContext2D): void {
    if (this.vignetteIntensity <= 0) return;
    const grad = ctx.createLinearGradient(0, 0, 0, 120);
    grad.addColorStop(0, `rgba(12, 4, 20, ${Math.min(this.vignetteIntensity * 1.5, 1)})`);
    grad.addColorStop(1, "rgba(12, 4, 20, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, DESIGN_WIDTH, 120);
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 3) * 0.6;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // ================================================================
  // Boss 武将剪影（含护甲高亮）
  // ================================================================
  private drawBoss(ctx: CanvasRenderingContext2D): void {
    const shakeX = this.shakeTimer > 0 ? (Math.random() - 0.5) * 4 : 0;
    const shakeY = this.shakeTimer > 0 ? (Math.random() - 0.5) * 3 : 0;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(DESIGN_WIDTH / 2 + shakeX, this.renderY + shakeY);
    ctx.scale(this.bossRenderScale, this.bossRenderScale);

    // 外发光
    ctx.save();
    ctx.shadowColor = "rgba(108, 52, 131, 0.3)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#1a0a26";
    this.drawSilhouette(ctx);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // 边缘描边
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

    // 肩甲（激活态发光）
    this.drawArmorPiece(ctx, this.armorTargets[ARMOR_L], -50, -30, 30, 22);
    this.drawArmorPiece(ctx, this.armorTargets[ARMOR_R], 50, -30, 30, 22);

    // 胸甲
    this.drawChestPiece(ctx, this.armorTargets[ARMOR_C]);

    // 雷核（低亮）
    ctx.save();
    ctx.globalAlpha = 0.35;
    const coreGrd = ctx.createRadialGradient(0, 2, 0, 0, 2, 8);
    coreGrd.addColorStop(0, "#6c3483");
    coreGrd.addColorStop(1, "#3d1a50");
    ctx.fillStyle = coreGrd;
    ctx.beginPath(); ctx.arc(0, 2, 8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // P4.4A.2-R2: Debug 模式下绘制 Hit Area 边界
    if (this._debugShowHitArea) {
      for (const t of this.armorTargets) {
        if (!t.active && !t.broken) continue;
        ctx.save();
        ctx.strokeStyle = t.broken ? "rgba(120, 120, 120, 0.4)" : "rgba(240, 225, 48, 0.6)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(t.relX, t.relY, t.hitRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(240, 225, 48, 0.7)";
        ctx.font = '9px "Consolas", monospace';
        ctx.textAlign = "center";
        ctx.fillText(`${t.name} r=${t.hitRadius}`, t.relX, t.relY - t.hitRadius - 4);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  private drawSilhouette(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.moveTo(-14, -86);
    ctx.lineTo(-4, -70); ctx.lineTo(-18, -58); ctx.lineTo(-22, -44);
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

  /** 绘制单块肩甲（含激活态高亮 + 破碎后暗化） */
  private drawArmorPiece(ctx: CanvasRenderingContext2D, target: ArmorTarget, x: number, y: number, w: number, h: number): void {
    const isActive = this._phase === "armor" && target.active && !target.broken;
    const isBroken = target.broken;
    const flash = isActive && this.consecutiveErrors >= CONSECUTIVE_ERROR_LIMIT;

    ctx.save();
    ctx.fillStyle = isBroken ? "#0d0515" : (isActive ? "#3d1a50" : "#150a20");
    ctx.strokeStyle = isActive ? (flash ? "#ff6a33" : "#f0e130") : "#3d1a4a";
    ctx.lineWidth = isActive ? 3 : 1.5;
    if (isActive) {
      ctx.shadowColor = flash ? "#ff6a33" : "#f0e130";
      ctx.shadowBlur = flash ? 20 : 12;
    }
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 裂纹
    if (isBroken && target.animTimer > 0) {
      ctx.strokeStyle = "rgba(240, 225, 48, 0.5)";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + 6, y + 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 绘制胸甲 */
  private drawChestPiece(ctx: CanvasRenderingContext2D, target: ArmorTarget): void {
    const isActive = this._phase === "armor" && target.active && !target.broken;
    const isBroken = target.broken;

    ctx.save();
    ctx.fillStyle = isBroken ? "#0d0515" : (isActive ? "#3d1a50" : "#150a20");
    ctx.strokeStyle = isActive ? "#f0e130" : "#3d1a4a";
    ctx.lineWidth = isActive ? 3 : 1.5;
    if (isActive) {
      ctx.shadowColor = "#f0e130";
      ctx.shadowBlur = 12;
    }
    ctx.beginPath();
    ctx.moveTo(0, -18); ctx.lineTo(20, 2); ctx.lineTo(0, 22); ctx.lineTo(-20, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (isBroken && target.animTimer > 0) {
      ctx.strokeStyle = "rgba(240, 225, 48, 0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, 0); ctx.lineTo(0, 6); ctx.lineTo(10, -4);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ================================================================
  // 文字 & HUD
  // ================================================================
  private drawTexts(ctx: CanvasRenderingContext2D): void {
    if (this._phase !== "intro") return;
    if (this.guardianAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.guardianAlpha;
      ctx.fillStyle = "#d7bde2";
      ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(107, 52, 131, 0.5)";
      ctx.shadowBlur = 8;
      ctx.fillText("境界镇守者", DESIGN_WIDTH / 2, 258);
      ctx.restore();
    }
    if (this.bossNameAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.bossNameAlpha;
      ctx.fillStyle = "#f0e130";
      ctx.font = '700 30px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "#f0e130"; ctx.shadowBlur = 16;
      ctx.fillText("玄甲雷将", DESIGN_WIDTH / 2, 302);
      ctx.restore();
    }
  }

  private drawObjective(ctx: CanvasRenderingContext2D): void {
    if (this.objectiveAlpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = this.objectiveAlpha;
    ctx.fillStyle = this.consecutiveErrors >= CONSECUTIVE_ERROR_LIMIT ? "#ff6a33" : "#f0e130";
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
    ctx.fillText("切发亮护甲", DESIGN_WIDTH / 2, 108);
    ctx.restore();
  }

  private drawArmorBreakShow(ctx: CanvasRenderingContext2D): void {
    // 破甲完成文字
    const progress = Math.min(this.armorBreakTimer / 0.8, 1);
    ctx.save();
    ctx.globalAlpha = Math.min(1, progress * 2);
    ctx.fillStyle = "#f0e130";
    ctx.font = '700 28px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "#f0e130"; ctx.shadowBlur = 20;
    ctx.fillText("护甲破碎", DESIGN_WIDTH / 2, 240);
    
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = "#d7bde2";
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
    ctx.fillText("弱点已暴露", DESIGN_WIDTH / 2, 285);
    ctx.restore();
  }

  private drawBossHud(ctx: CanvasRenderingContext2D): void {
    const hudTop = Math.max(8, this.hudSlideY);
    const hudW = DESIGN_WIDTH - 12;
    const hudX = 6;
    const hpRatio = this._bossHP / Math.max(1, this._bossMaxHP);

    ctx.save();
    ctx.globalAlpha = 0.90;
    ctx.fillStyle = "rgba(24, 10, 34, 0.90)";
    ctx.shadowColor = "rgba(108, 52, 131, 0.2)";
    ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.roundRect(hudX, hudTop, hudW, 66, 6); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(108, 52, 131, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(hudX, hudTop, hudW, 66, 6); ctx.stroke();

    // 名称（暂停按钮在左上方，名称靠右留间距~44px）
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#f0e130";
    ctx.font = '700 15px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.shadowColor = "#f0e130"; ctx.shadowBlur = 4;
    ctx.fillText("玄甲雷将", DESIGN_WIDTH / 2, hudTop + 5);
    ctx.shadowBlur = 0;

    // 血条（居中）
    const barTop = hudTop + 24;
    const barLeft = 14;
    const barW = DESIGN_WIDTH - 28;
    const barH = 9;
    ctx.fillStyle = "rgba(40, 18, 18, 0.85)";
    ctx.beginPath(); ctx.roundRect(barLeft, barTop, barW, barH, 4); ctx.fill();
    const hpColor = "#6c3483";
    ctx.fillStyle = hpColor;
    ctx.shadowColor = hpColor; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.roundRect(barLeft, barTop, barW * hpRatio, barH, 4); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(240, 225, 48, 0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(barLeft, barTop, barW, barH, 4); ctx.stroke();

    // 阶段+进度
    const labelY = barTop + barH + 4;
    ctx.fillStyle = "#d7bde2";
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const phaseLabel = this._phase === "armor_break" ? "破甲完成" : "阶段 1 · 破甲";
    ctx.fillText(phaseLabel, barLeft, labelY);
    ctx.fillStyle = "#a569bd";
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "right";
    ctx.fillText(`护甲 ${this.armorProgress}/${this.maxArmor}`, DESIGN_WIDTH - 14, labelY);
    ctx.restore();
  }

  /** P4.4A.2-R2: 是否显示 Hit Area 边界 */
  private _debugShowHitArea = false;

  // ================================================================
  // 外部方法
  // ================================================================
  get bossHP(): number { return this._bossHP; }
  get bossMaxHP(): number { return this._bossMaxHP; }

  onBossHit(damage: number, isArmorTarget: boolean): boolean { return false; }
  onBossKilled(): void { this._phase = "exit"; }
  resetForRetry(): void { this.enterLoading(); }
}
