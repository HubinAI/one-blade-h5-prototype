// ========================================================================
// P4.4A.1-R2: BossController — 完全重写
// 生命周期: BOSS_LOADING → BOSS_INTRO → BOSS_ARMOR → BOSS_FAIL → BOSS_EXIT
// 单一 Timeline 管控开场时序
// 不参与普通关 Flow / 军令 / 副刀系统
// ========================================================================
import type { BossId, BossPhaseState } from "../types";
import { BOSS_CONFIG } from "../config/bosses";
import { BOSS_VISUAL_DEFS } from "../../data/bosses";
import { DESIGN_WIDTH, DESIGN_HEIGHT } from "../config/constants";

// ===== 常量 =====
const BOSS_CY = 195;            // Boss 中心 Y（HUD 下方足够距离）
const BOSS_R = 72;              // Boss 主体半宽（~34% 屏幕宽度）
const INTRO_DURATION = 2.85;    // 开场总时长

// ===== 护甲索引 =====
const ARMOR_L = 0;
const ARMOR_R = 1;
const ARMOR_C = 2;

// ========================================================================
export class BossController {
  // ---- 生命周期 ----
  private _phase: BossPhaseState = "loading";
  get phase(): BossPhaseState { return this._phase; }

  // ---- 隔离标志 ----
  /** 开场进行中（输入/波次/副刀全部阻断） */
  get isIntroActive(): boolean {
    return this._phase === "loading" || this._phase === "intro";
  }
  /** 玩家是否无敌 */
  get playerInvulnerable(): boolean { return this.isIntroActive; }
  /** Boss 是否可受伤 */
  get bossDamageable(): boolean { return false; } // P4.4A.1 全程锁死
  /** 普通波次是否暂停 */
  get normalSpawnerPaused(): boolean { return this.getPhase() !== "exit" && this.getPhase() !== "result" && this.getPhase() !== "fail"; }
  /** 军令波次是否暂停 */
  get edictSpawnerPaused(): boolean { return this.getPhase() !== "exit" && this.getPhase() !== "result" && this.getPhase() !== "fail"; }
  /** 副刀是否锁定 */
  get subBladesLocked(): boolean { return this.isIntroActive; }
  /** 是否为 Boss 模式（隐藏普通 HUD） */
  get bossModeActive(): boolean {
    return this.getPhase() !== "exit";
  }

  /** 避开TS类型缩窄的辅助方法 */
  private getPhase(): BossPhaseState { return this._phase; }

  // ---- 调试状态快照 ----
  get debugSnapshot(): Record<string, string | number | boolean> {
    return {
      "Boss Mode": this.bossModeActive,
      "Boss State": this._phase,
      "Intro Time": this.introElapsed.toFixed(2),
      "Input Locked": this.isIntroActive,
      "Player Invuln": this.playerInvulnerable,
      "Normal Spawner Paused": this.normalSpawnerPaused,
      "Boss Damageable": this.bossDamageable,
      "Boss HP": `${this._bossHP}/${this._bossMaxHP}`,
      "Active Armor": ["左肩","右肩","胸甲"][this.activeArmorIndex] ?? "无",
      "Armor Progress": `${this.armorProgress}/${this.maxArmor}`,
      "Sub Blades Locked": this.subBladesLocked,
    };
  }

  readonly bossId: BossId;

  // ---- 开场时间轴 ----
  private introElapsed = 0;
  private timelineEvents: { time: number; fired: boolean; fn: () => void }[] = [];
  private introFinished = false;

  // ---- 动画状态 ----
  private _introSkipped = false;
  private renderY = -120;      // Boss 渲染 Y（动态变）
  private shakeTimer = 0;
  private bossRenderScale = 0.75;
  private hudSlideY = -80;
  private guardianAlpha = 0;
  private bossNameAlpha = 0;
  private objectiveAlpha = 0;
  private vignetteIntensity = 0;

  // ---- 护甲 ----
  private armorProgress = 0;
  private readonly maxArmor = 3;
  private activeArmorIndex = ARMOR_L;

  // ---- Boss 数值 ----
  private _bossHP = 16;
  private _bossMaxHP = 16;

  // ---- 开场粒子 ----
  private particles: { x: number; y: number; life: number; size: number; color: string }[] = [];

  // ================================================================
  constructor(bossId: BossId) {
    this.bossId = bossId;
    const cfg = BOSS_CONFIG[bossId];
    this._bossMaxHP = cfg.maxHp;
    this._bossHP = cfg.maxHp;
    this.setupTimeline();
  }

  /** 绑定到游戏实例（Boss Controller 不持有 Enemy 引用，通过 Game.ts 同步） */
  // 不需要 attachBoss，Game.ts 通过方法交互

  // ================================================================
  // 生命周期
  // ================================================================

  /** 进入 BOSS_LOADING（准备阶段，Game.ts 调用） */
  enterLoading(): void {
    this._phase = "loading";
    this.introElapsed = 0;
    this.introFinished = false;
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
    this.activeArmorIndex = ARMOR_L;
    this._bossHP = this._bossMaxHP;
    this.particles = [];
    this.setupTimeline(); // 重置时间轴
  }

  /** 跳过开场 */
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

  /** 更新 */
  update(dt: number): void {
    this.particles = this.particles.filter(p => { p.life -= dt; return p.life > 0; });

    if (this._phase === "loading") {
      // loading 仅做一次帧延迟确保 Game.ts 状态切换完成
      this._phase = "intro";
      return;
    }

    if (this._phase === "intro") {
      this.introElapsed += dt;
      this.updateIntroTimeline();
      this.updateParticleSpawn();
      return;
    }

    if (this._phase === "armor") {
      // P4.4A.1: 无破甲判定，只维护提示淡出
      this.objectiveAlpha = Math.max(0, this.objectiveAlpha - dt * 0.25);
    }
  }

  /** 渲染 */
  render(ctx: CanvasRenderingContext2D): void {
    if (this._phase === "exit") return;

    // 0) 场景暗角
    this.drawVignette(ctx);

    // 1) 背景雾幕
    if (this._phase === "loading" || this._phase === "intro") {
      this.drawTopMist(ctx);
    }

    // 2) Boss 本体
    this.drawBoss(ctx);

    // 3) 开场粒子
    this.drawParticles(ctx);

    // 4) 文字层
    this.drawTexts(ctx);

    // 5) 目标提示
    if (this._phase === "armor" && this.objectiveAlpha > 0.01) {
      this.drawObjective(ctx);
    }

    // 6) Boss 专属 HUD（exit 已在 render 开头排除）
    if (this.getPhase() !== "loading" && this.getPhase() !== "intro") {
      this.drawBossHud(ctx);
    }
  }

  // ================================================================
  // Timeline
  // ================================================================
  private setupTimeline(): void {
    this.timelineEvents = [
      { time: 0.00, fired: false, fn: () => {} },                       // (already done by enterLoading)
      { time: 0.10, fired: false, fn: () => { this.vignetteIntensity = 0.15; } },
      { time: 0.30, fired: false, fn: () => { this.vignetteIntensity = 0.35; } },
      { time: 0.45, fired: false, fn: () => {} },                       // boss 开始下降
      { time: 1.25, fired: false, fn: () => { this.shakeTimer = 0.25; this.bossRenderScale = 1; } },
      { time: 1.45, fired: false, fn: () => { this.guardianAlpha = 1; } },
      { time: 1.75, fired: false, fn: () => { this.bossNameAlpha = 1; } },
      { time: 2.10, fired: false, fn: () => { this.hudSlideY = 0; } },
      { time: 2.40, fired: false, fn: () => { this.objectiveAlpha = 1; } },
      { time: 2.85, fired: false, fn: () => { this.transitionToArmor(); } },
    ];
  }

  private updateIntroTimeline(): void {
    // Boss 下降运动（0.45~1.25s）
    if (this.introElapsed >= 0.45 && this.introElapsed <= 1.25) {
      const t = (this.introElapsed - 0.45) / 0.8;
      const ease = 1 - Math.pow(1 - t, 3);
      this.renderY = -100 + (BOSS_CY + 100) * ease;
      this.bossRenderScale = 0.75 + 0.25 * ease;
    } else if (this.introElapsed > 1.25) {
      this.renderY = BOSS_CY;
    }

    // 震屏衰减
    this.shakeTimer = Math.max(0, this.shakeTimer - 0.033);

    // 触发时间轴事件
    for (const ev of this.timelineEvents) {
      if (!ev.fired && this.introElapsed >= ev.time) {
        ev.fired = true;
        ev.fn();
      }
    }
  }

  private transitionToArmor(): void {
    this._phase = "armor";
    this.renderY = BOSS_CY;
    this.bossRenderScale = 1;
    this.vignetteIntensity = 0.15;
    this.hudSlideY = 0;
  }

  // ================================================================
  // 粒子
  // ================================================================
  private updateParticleSpawn(): void {
    if (this.introElapsed < 2.0 && Math.random() > 0.1) {
      this.particles.push({
        x: DESIGN_WIDTH / 2 + (Math.random() - 0.5) * 200,
        y: this.renderY - 60 + (Math.random() - 0.5) * 160,
        life: 0.3 + Math.random() * 0.6,
        size: 1.5 + Math.random() * 3,
        color: Math.random() > 0.5 ? "#f0e130" : "#8e44ad",
      });
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 3) * 0.6;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ================================================================
  // 渲染: 暗角 + 幕布
  // ================================================================
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
    // 顶部暗雾
    if (this.vignetteIntensity <= 0) return;
    const grad = ctx.createLinearGradient(0, 0, 0, 120);
    grad.addColorStop(0, `rgba(12, 4, 20, ${Math.min(this.vignetteIntensity * 1.5, 1)})`);
    grad.addColorStop(1, "rgba(12, 4, 20, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, DESIGN_WIDTH, 120);
  }

  // ================================================================
  // 渲染: Boss 武将剪影（皮影风格—整体黑金剪影）
  // ================================================================
  private drawBoss(ctx: CanvasRenderingContext2D): void {
    const cx = 0; // translate 已处理中心偏移
    const cy = 0;
    const s = this.bossRenderScale;
    const shakeX = this.shakeTimer > 0 ? (Math.random() - 0.5) * 4 : 0;
    const shakeY = this.shakeTimer > 0 ? (Math.random() - 0.5) * 3 : 0;

    ctx.save();
    // 先translate到屏幕中心+渲染Y，再应用scale
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(DESIGN_WIDTH / 2 + shakeX, this.renderY + shakeY);
    ctx.scale(s, s);

    const R = 72; // 整体半宽基准

    // ---- 外发光（统御全轮廓） ----
    ctx.save();
    ctx.shadowColor = "rgba(108, 52, 131, 0.3)";
    ctx.shadowBlur = 18;

    // ---- 1. 主体剪影（深紫黑一体轮廓） ----
    ctx.fillStyle = "#1a0a26";
    this.drawBodySilhouette(ctx, R);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // ---- 2. 边缘描边（突显武将轮廓） ----
    ctx.save();
    ctx.strokeStyle = "rgba(108, 52, 131, 0.35)";
    ctx.lineWidth = 2;
    this.drawBodySilhouette(ctx, R);
    ctx.stroke();
    ctx.restore();

    // ---- 3. 头盔细部 ----
    this.drawHelmetDetail(ctx, R);

    // ---- 4. 左右肩甲（独立绘制，支持激活态高亮） ----
    const leftActive = this.activeArmorIndex === ARMOR_L;
    const rightActive = this.activeArmorIndex === ARMOR_R;
    this.drawShoulderPlate(ctx, -1, R, leftActive);  // 左
    this.drawShoulderPlate(ctx, 1, R, rightActive);   // 右

    // ---- 5. 胸甲（菱形，支持激活态） ----
    const chestActive = this.activeArmorIndex === ARMOR_C;
    this.drawChestGuard(ctx, R, chestActive);

    // ---- 6. 雷核（低亮，不抢焦点） ----
    this.drawCoreLow(ctx, R);

    // ---- 7. 金色裂纹装饰 ----
    if (!chestActive) {
      ctx.strokeStyle = "rgba(240, 225, 48, 0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-12, -6);
      ctx.lineTo(-4, 0);
      ctx.lineTo(6, 6);
      ctx.stroke();
    }

    ctx.restore();
  }

  /** 武将主体轮廓路径 */
  private drawBodySilhouette(ctx: CanvasRenderingContext2D, R: number): void {
    ctx.beginPath();
    // 从头盔顶部开始
    ctx.moveTo(-14, -86);               // 盔缨顶部
    ctx.lineTo(-4, -70);
    ctx.lineTo(-18, -58);               // 头盔左侧
    ctx.lineTo(-22, -44);               // 脖子左侧
    // 左肩
    ctx.lineTo(-62, -42);               // 左肩外扩
    ctx.lineTo(-68, -32);               // 左肩外侧
    ctx.lineTo(-58, -28);               // 左肩下缘
    // 左臂
    ctx.lineTo(-44, -16);
    ctx.lineTo(-40, 16);                // 左臂外侧
    ctx.lineTo(-32, 18);                // 左臂底
    // 左腰
    ctx.lineTo(-32, 22);
    ctx.lineTo(-28, 40);               // 左甲裙
    // 左腿
    ctx.lineTo(-24, 62);               // 左腿外侧
    ctx.lineTo(-14, 64);               // 左脚
    // 裆部
    ctx.lineTo(-8, 48);
    ctx.lineTo(8, 48);
    // 右腿
    ctx.lineTo(14, 64);                // 右脚
    ctx.lineTo(24, 62);                // 右腿外侧
    // 右腰
    ctx.lineTo(28, 40);
    ctx.lineTo(32, 22);
    // 右臂
    ctx.lineTo(32, 18);                // 右臂底
    ctx.lineTo(40, 16);
    ctx.lineTo(44, -16);               // 右臂外侧
    // 右肩
    ctx.lineTo(58, -28);               // 右肩下缘
    ctx.lineTo(68, -32);               // 右肩外侧
    ctx.lineTo(62, -42);               // 右肩内缘
    // 脖子右侧到头顶
    ctx.lineTo(22, -44);
    ctx.lineTo(18, -58);               // 头盔右侧
    ctx.lineTo(4, -70);
    ctx.lineTo(14, -86);               // 盔缨右侧
    ctx.closePath();
  }

  /** 头盔细部 */
  private drawHelmetDetail(ctx: CanvasRenderingContext2D, R: number): void {
    // 头盔下部（面部区域）
    ctx.save();
    ctx.fillStyle = "#0d0515";
    ctx.beginPath();
    ctx.roundRect(-12, -56, 24, 12, 4);
    ctx.fill();
    // 盔缨（顶部尖角，使用亮色）
    ctx.fillStyle = "#6c3483";
    ctx.beginPath();
    ctx.moveTo(-5, -70);
    ctx.lineTo(0, -88);
    ctx.lineTo(5, -70);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** 肩甲（带激活态高亮） */
  private drawShoulderPlate(ctx: CanvasRenderingContext2D, dir: number, R: number, active: boolean): void {
    ctx.save();
    const xOff = dir * 45;
    const yOff = -38;
    const w = 28;
    const h = 20;

    // 肩甲底色
    ctx.fillStyle = active ? "#3d1a50" : "#150a20";
    ctx.strokeStyle = active ? "#f0e130" : "#3d1a4a";
    ctx.lineWidth = active ? 3 : 1.5;
    ctx.shadowColor = active ? "#f0e130" : "transparent";
    ctx.shadowBlur = active ? 12 : 0;

    ctx.beginPath();
    // 肩甲弧形轮廓
    ctx.ellipse(xOff, yOff, w, h, dir * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 肩甲内部装饰线条
    if (active) {
      ctx.strokeStyle = "rgba(240, 225, 48, 0.4)";
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.ellipse(xOff + dir * 4, yOff, w * 0.6, h * 0.5, dir * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 胸甲 */
  private drawChestGuard(ctx: CanvasRenderingContext2D, R: number, active: boolean): void {
    ctx.save();
    ctx.fillStyle = active ? "#3d1a50" : "#150a20";
    ctx.strokeStyle = active ? "#f0e130" : "#3d1a4a";
    ctx.lineWidth = active ? 3 : 1.5;
    ctx.shadowColor = active ? "#f0e130" : "transparent";
    ctx.shadowBlur = active ? 12 : 0;

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

  /** 雷核（第一阶段保持低亮） */
  private drawCoreLow(ctx: CanvasRenderingContext2D, R: number): void {
    ctx.save();
    ctx.globalAlpha = 0.35;
    const coreR = 8;
    const pulse = 0.9 + Math.sin(this.introElapsed * 3) * 0.1;
    const grd = ctx.createRadialGradient(0, 2, 0, 0, 2, coreR * pulse);
    grd.addColorStop(0, "#6c3483");
    grd.addColorStop(1, "#3d1a50");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 2, coreR * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ================================================================
  // 渲染: 文字层
  // ================================================================
  private drawTexts(ctx: CanvasRenderingContext2D): void {
    // 粒子（intro 阶段已有）

    if (this._phase !== "intro") return;

    // "境界镇守者" (1.45s)
    if (this.guardianAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.guardianAlpha;
      ctx.fillStyle = "#d7bde2";
      ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(107, 52, 131, 0.5)";
      ctx.shadowBlur = 8;
      ctx.fillText("境界镇守者", DESIGN_WIDTH / 2, 258);
      ctx.restore();
    }

    // "玄甲雷将" (1.75s)
    if (this.bossNameAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.bossNameAlpha;
      ctx.fillStyle = "#f0e130";
      ctx.font = '700 30px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#f0e130";
      ctx.shadowBlur = 16;
      ctx.fillText("玄甲雷将", DESIGN_WIDTH / 2, 302);
      ctx.restore();
    }
  }

  /** 目标提示 */
  private drawObjective(ctx: CanvasRenderingContext2D): void {
    if (this.objectiveAlpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = this.objectiveAlpha;
    ctx.fillStyle = "#f0e130";
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#f0e130";
    ctx.shadowBlur = 8;
    ctx.fillText("切发亮护甲", DESIGN_WIDTH / 2, 108);
    ctx.restore();
  }

  // ================================================================
  // 渲染: Boss 专属 HUD
  // ================================================================
  private drawBossHud(ctx: CanvasRenderingContext2D): void {
    const hudTop = 6 + this.hudSlideY;
    const hudW = DESIGN_WIDTH - 12;
    const hudX = 6;

    ctx.save();

    // 背景
    ctx.globalAlpha = 0.90;
    ctx.fillStyle = "rgba(24, 10, 34, 0.90)";
    ctx.shadowColor = "rgba(108, 52, 131, 0.2)";
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.roundRect(hudX, hudTop, hudW, 66, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(108, 52, 131, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(hudX, hudTop, hudW, 66, 6);
    ctx.stroke();

    // 名称（左对齐，与暂停按钮留安全间距 ~38px）
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#f0e130";
    ctx.font = '700 15px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.shadowColor = "#f0e130";
    ctx.shadowBlur = 4;
    ctx.fillText("玄甲雷将", hudX + 14, hudTop + 5);
    ctx.shadowBlur = 0;

    // 血条
    const barTop = hudTop + 24;
    const barLeft = hudX + 14;
    const barW = hudW - 28;
    const barH = 9;
    const hpRatio = this._bossHP / Math.max(1, this._bossMaxHP);
    ctx.fillStyle = "rgba(40, 18, 18, 0.85)";
    ctx.beginPath();
    ctx.roundRect(barLeft, barTop, barW, barH, 4);
    ctx.fill();
    const hpColor = hpRatio > 0.66 ? "#6c3483" : hpRatio > 0.33 ? "#e67e22" : "#c0392b";
    ctx.fillStyle = hpColor;
    ctx.shadowColor = hpColor;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.roundRect(barLeft, barTop, barW * hpRatio, barH, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(240, 225, 48, 0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(barLeft, barTop, barW, barH, 4);
    ctx.stroke();

    // 阶段+进度（同行）
    const labelY = barTop + barH + 4;
    ctx.fillStyle = "#d7bde2";
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("阶段 1 · 破甲", barLeft, labelY);
    ctx.fillStyle = "#a569bd";
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "right";
    ctx.fillText(`护甲 ${this.armorProgress}/${this.maxArmor}`, hudX + hudW - 14, labelY);

    ctx.restore();
  }

  // ================================================================
  // 外部方法（供 Game.ts 调用）
  // ================================================================

  /** 获取 Boss 当前 HP */
  get bossHP(): number { return this._bossHP; }
  get bossMaxHP(): number { return this._bossMaxHP; }

  /** Game.ts 调用——Boss 受击（P4.4A.1 仅播放弹刀反馈，不扣血） */
  onBossHit(damage: number, isArmorTarget: boolean): boolean {
    // P4.4A.1: 完全锁死，不扣血
    return false;
  }

  /** 标记 Boss 死亡（Game.ts 外部调用） */
  onBossKilled(): void {
    this._phase = "exit";
  }

  /** 重新进入开场 */
  resetForRetry(): void {
    this.enterLoading();
  }
}
