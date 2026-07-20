import type { BossId, BossPhaseState, Enemy, Vec2 } from "../types";
import { BOSS_CONFIG, type BossConfig } from "../config/bosses";
import { BOSS_VISUAL_DEFS } from "../../data/bosses";
import { DESIGN_WIDTH, DESIGN_HEIGHT } from "../config/constants";
import { BALANCE } from "../config/balance";
import { glowParticle, ringParticle, sparkBurst } from "./particleSystem";
import type { Particle } from "../types";

/** P4.4A: Boss专属状态控制器 */
export class BossController {
  /** 当前状态机阶段 */
  private _phase: BossPhaseState = "intro";
  get phase(): BossPhaseState { return this._phase; }

  /** Boss 配置 */
  private bossConfig: BossConfig;
  get config(): BossConfig { return this.bossConfig; }

  /** 关联的 Enemy 对象 */
  private _boss: Enemy | null = null;
  get boss(): Enemy | null { return this._boss; }

  /** 开场经过时间 */
  private introElapsed = 0;

  /** 开场是否被跳过 */
  private _introSkipped = false;
  get introSkipped(): boolean { return this._introSkipped; }

  /** 粒子列表（BossController 独立管理） */
  particles: Particle[] = [];

  /** 开场的目标 Y 坐标 */
  private readonly targetY = 140;

  /** 开场总时长 */
  static readonly INTRO_DURATION = 3.2;

  /** 当前阶段提示 */
  private phaseHintText = "";
  private phaseHintAlpha = 0;
  private phaseHintElapsed = 0;

  /** HUD 动画 */
  private hudSlideProgress = 0;

  /** Boss ID */
  readonly bossId: BossId;

  /** P4.4A.2: 破甲进度 */
  private armorProgress = 0;
  private readonly maxArmorProgress = 3;

  /** 开启Debug */
  debugSkipEnabled = false;

  /** 开场演出粒子 */
  private introParticles: { x: number; y: number; alpha: number; life: number; size: number; color: string }[] = [];

  constructor(bossId: BossId) {
    this.bossId = bossId;
    this.bossConfig = BOSS_CONFIG[bossId];
  }

  /** 关联到 Game.ts 创建的 Boss Enemy */
  attachBoss(enemy: Enemy): void {
    this._boss = enemy;
  }

  /** 跳过开场 */
  skipIntro(): void {
    if (this._phase !== "intro") return;
    this._introSkipped = true;
    this.introElapsed = BossController.INTRO_DURATION;
    if (this._boss) {
      this._boss.y = this.targetY;
    }
    this.transitionTo("armor");
  }

  /** 更新 */
  update(dt: number): void {
    // 无效更新
    if (!this._boss) return;

    // 更新粒子
    this.particles = this.particles.filter(p => {
      p.life -= dt;
      return p.life > 0;
    });

    this.updateIntroParticles(dt);

    switch (this._phase) {
      case "intro": {
        this.introElapsed += dt;

        // Boss 从上方滑入
        if (this._boss) {
          const progress = Math.min(this.introElapsed / 1.5, 1);
          const easeOut = 1 - Math.pow(1 - progress, 2);
          this._boss.y = BALANCE.battlefield.enemySpawnY + (this.targetY - BALANCE.battlefield.enemySpawnY) * easeOut;
        }

        // 开场粒子
        if (this.introElapsed < 2.0) {
          this.spawnIntroParticles();
        }

        // 开场结束
        if (this.introElapsed >= BossController.INTRO_DURATION) {
          this.transitionTo("armor");
        }
        break;
      }

      case "armor": {
        // P4.4A.2 将实现：破甲判定
        this.updatePhaseHint("切发亮护甲", dt);
        this.updateHudSlide(dt);
        break;
      }

      default:
        break;
    }
  }

  /** 渲染Boss专属UI */
  render(ctx: CanvasRenderingContext2D): void {
    if (!this._boss) return;

    this.renderVignette(ctx);
    this.renderIntroBoss(ctx);

    if (this._phase === "intro") {
      this.renderIntroText(ctx);
    } else {
      this.renderBossHud(ctx);
      this.renderPhaseHint(ctx);
    }
  }

  // ============ 私有方法 ============

  /** 阶段切换 */
  private transitionTo(newPhase: BossPhaseState): void {
    this._phase = newPhase;
    this.phaseHintElapsed = 0;
    if (this._boss) {
      this._boss.y = this.targetY;
    }
  }

  /** 更新阶段提示文字 */
  private updatePhaseHint(text: string, dt: number): void {
    this.phaseHintText = text;
    this.phaseHintElapsed += dt;
    if (this.phaseHintElapsed < 0.3) {
      this.phaseHintAlpha = this.phaseHintElapsed / 0.3;
    } else if (this.phaseHintElapsed > 3.5) {
      this.phaseHintAlpha = Math.max(0, this.phaseHintAlpha - dt * 0.5);
    } else {
      this.phaseHintAlpha = 1;
    }
  }

  /** 更新 HUD 滑入动画 */
  private updateHudSlide(dt: number): void {
    this.hudSlideProgress = Math.min(1, this.hudSlideProgress + dt * 3);
  }

  /** 生成开场粒子 */
  private spawnIntroParticles(): void {
    if (Math.random() > 0.15) return;
    this.introParticles.push({
      x: (this._boss?.x ?? DESIGN_WIDTH / 2) + (Math.random() - 0.5) * 100,
      y: (this._boss?.y ?? 0) - 20 + (Math.random() - 0.5) * 80,
      alpha: 0.3 + Math.random() * 0.5,
      life: 0.5 + Math.random() * 0.8,
      size: 2 + Math.random() * 4,
      color: Math.random() > 0.5 ? "#f0e130" : "#6c3483"
    });
  }

  /** 更新开场粒子 */
  private updateIntroParticles(dt: number): void {
    for (const p of this.introParticles) {
      p.life -= dt;
      p.y += 20 * dt;
    }
    this.introParticles = this.introParticles.filter(p => p.life > 0);
  }

  // ============ 渲染 ============

  /** 渲染四角暗角 + 幕布压暗 */
  private renderVignette(ctx: CanvasRenderingContext2D): void {
    if (this._phase !== "intro" && this._phase !== "armor") return;

    const intensity = this._phase === "intro"
      ? Math.min(this.introElapsed / 0.8, 0.45)
      : 0.2;

    if (intensity <= 0) return;

    const grd = ctx.createRadialGradient(
      DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, 60,
      DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, 320
    );
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(0.6, `rgba(42,8,56,${intensity * 0.4})`);
    grd.addColorStop(1, `rgba(0,0,0,${intensity})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  }

  /** 渲染开场Boss本体 */
  private renderIntroBoss(ctx: CanvasRenderingContext2D): void {
    if (!this._boss) return;
    const e = this._boss;
    const conf = this.bossConfig;
    const vis = BOSS_VISUAL_DEFS[this.bossId];
    const cx = e.x;
    const cy = e.y;
    const r = this._phase === "intro"
      ? conf.radius + Math.sin(this.introElapsed * 3) * 2
      : conf.radius;

    // === 雷光外层（只在开场或播放时） ===
    if (this._phase === "intro") {
      // 外围雷光
      const flashAlpha = 0.1 + Math.sin(this.introElapsed * 8) * 0.08;
      ctx.save();
      ctx.strokeStyle = `rgba(240, 225, 48, ${flashAlpha})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = "#f0e130";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 暗紫光晕
      ctx.save();
      const glow = ctx.createRadialGradient(cx - 10, cy - 10, 0, cx, cy, r * 1.6);
      glow.addColorStop(0, `rgba(108, 52, 131, ${0.15 + Math.sin(this.introElapsed * 2) * 0.05})`);
      glow.addColorStop(1, "rgba(108,52,131,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // === 主体圆盘 ===
    ctx.save();

    // 主躯干（暗紫重甲）
    const bodyGrd = ctx.createRadialGradient(cx - 8, cy - 8, 2, cx, cy, r);
    bodyGrd.addColorStop(0, "#5b2c6f");
    bodyGrd.addColorStop(0.6, "#3d1a4a");
    bodyGrd.addColorStop(1, "#2c0e37");
    ctx.fillStyle = bodyGrd;
    ctx.shadowColor = "#4a235a";
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // === 装甲护甲板（三块） ===
    // 左肩甲
    this.drawArmorPlate(ctx, cx - r * 0.5, cy - r * 0.3, r * 0.3, r * 0.2, -0.2);
    // 右肩甲
    this.drawArmorPlate(ctx, cx + r * 0.5, cy - r * 0.3, r * 0.3, r * 0.2, 0.2);
    // 胸甲（中心）
    this.drawArmorPlate(ctx, cx, cy + r * 0.1, r * 0.35, r * 0.35, 0);

    // === 金色裂纹 ===
    this.drawGoldenCracks(ctx, cx, cy, r);

    // === 胸口雷核 ===
    const coreR = r * 0.22;
    const corePulse = 0.85 + Math.sin(this.introElapsed * 4) * 0.15;
    const coreGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * corePulse);
    coreGrd.addColorStop(0, "#ffffff");
    coreGrd.addColorStop(0.3, "#f0e130");
    coreGrd.addColorStop(0.7, "#e67e22");
    coreGrd.addColorStop(1, "#c0392b");
    ctx.fillStyle = coreGrd;
    ctx.shadowColor = "#f0e130";
    ctx.shadowBlur = 20 + Math.sin(this.introElapsed * 5) * 10;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * corePulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // === 雷光闪电 ===
    if (this._phase === "intro" && this.introElapsed > 0.5) {
      this.drawLightning(ctx, cx, cy, r);
    }
  }

  /** 绘制装甲板 */
  private drawArmorPlate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rot: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    const grd = ctx.createLinearGradient(-w, -h, w, h);
    grd.addColorStop(0, "#4a2a5e");
    grd.addColorStop(0.5, "#6c3483");
    grd.addColorStop(1, "#2c0e37");
    ctx.fillStyle = grd;
    ctx.strokeStyle = "#f0e130";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** 绘制金色裂纹 */
  private drawGoldenCracks(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.save();
    ctx.strokeStyle = "rgba(240, 225, 48, 0.3)";
    ctx.lineWidth = 1.5;
    const crackPoints = [
      { x: cx - r * 0.3, y: cy - r * 0.5 },
      { x: cx - r * 0.1, y: cy - r * 0.3 },
      { x: cx, y: cy - r * 0.4 },
      { x: cx + r * 0.2, y: cy - r * 0.2 },
    ];
    for (const p of crackPoints) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 绘制雷光闪电 */
  private drawLightning(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    if (Math.random() > 0.05) return;
    ctx.save();
    ctx.strokeStyle = "rgba(240, 225, 48, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "#f0e130";
    ctx.shadowBlur = 8;
    const endX = cx + (Math.random() - 0.5) * r * 2;
    const endY = cy - r - Math.random() * 30;
    const midX = cx + (Math.random() - 0.5) * r * 1.2;
    const midY = (cy + endY) / 2 + (Math.random() - 0.5) * 20;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.5);
    ctx.lineTo(midX, midY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();
  }

  /** 渲染开场文字 */
  private renderIntroText(ctx: CanvasRenderingContext2D): void {
    const progress = this.introElapsed / BossController.INTRO_DURATION;

    // "境界镇守者" — 从 2.0s 开始淡入
    if (progress >= 0.62) {
      const alpha = Math.min(1, (progress - 0.62) / 0.1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#e8d5f5";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("境界镇守者", DESIGN_WIDTH / 2, 240);
      ctx.restore();
    }

    // "玄甲雷将" — 从 2.3s 开始淡入（大字）
    if (progress >= 0.72) {
      const alpha = Math.min(1, (progress - 0.72) / 0.1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#f0e130";
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#f0e130";
      ctx.shadowBlur = 12;
      ctx.fillText("玄甲雷将", DESIGN_WIDTH / 2, 282);
      ctx.restore();
    }

    // 开场粒子
    for (const p of this.introParticles) {
      if (p.life <= 0) continue;
      ctx.save();
      ctx.globalAlpha = p.alpha * Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** 渲染Boss专属顶部HUD */
  private renderBossHud(ctx: CanvasRenderingContext2D): void {
    if (!this._boss) return;

    const e = this._boss;
    const conf = this.bossConfig;
    const vis = BOSS_VISUAL_DEFS[this.bossId];
    const hudTop = 8;
    const hudW = DESIGN_WIDTH - 16;
    const hudX = 8;
    const slideX = (1 - this.hudSlideProgress) * 30;

    ctx.save();

    // === 背景 ===
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = "rgba(30, 16, 40, 0.85)";
    ctx.shadowColor = "rgba(108, 52, 131, 0.3)";
    ctx.shadowBlur = 8;
    roundRect(ctx, hudX + slideX, hudTop, hudW, 66, 6);
    ctx.fill();
    ctx.shadowBlur = 0;

    // === Boss名称 ===
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#f0e130";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(conf.name, hudX + 14 + slideX, hudTop + 6);

    // === Boss主血条 ===
    const barTop = hudTop + 26;
    const barLeft = hudX + 14 + slideX;
    const barW = hudW - 28;
    const barH = 8;
    const hpRatio = e.hp / e.maxHp;

    // 血条背景
    ctx.fillStyle = "rgba(40, 20, 20, 0.8)";
    roundRect(ctx, barLeft, barTop, barW, barH, 4);
    ctx.fill();

    // 血条填充
    const hpColor = hpRatio > 0.5 ? "#6c3483" : hpRatio > 0.25 ? "#e67e22" : "#c0392b";
    ctx.fillStyle = hpColor;
    ctx.shadowColor = hpColor;
    ctx.shadowBlur = 4;
    roundRect(ctx, barLeft, barTop, barW * hpRatio, barH, 4);
    ctx.fill();
    ctx.shadowBlur = 0;

    // === 阶段标签 & 进度 ===
    const stageLabel = this.getPhaseLabel();
    ctx.fillStyle = "#e8d5f5";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(stageLabel, barLeft, barTop + barH + 4);

    // 阶段进度
    const progressText = this.getPhaseProgressText();
    ctx.fillStyle = "#a569bd";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(progressText, hudX + hudW - 14 + slideX, barTop + barH + 4);

    ctx.restore();
  }

  /** 获取阶段标签 */
  private getPhaseLabel(): string {
    switch (this._phase) {
      case "intro": return "降临";
      case "armor": return "阶段 1 · 破甲";
      case "armor_break": return "破甲成功";
      case "pursuit": return "阶段 2 · 追击";
      case "core_break": return "核心击破";
      case "execution": return "阶段 3 · 终结";
      case "victory_show": return "破境成功";
      case "fail": return "失败";
      default: return "";
    }
  }

  /** 获取阶段进度文本 */
  private getPhaseProgressText(): string {
    switch (this._phase) {
      case "armor": return `护甲 ${this.armorProgress}/${this.maxArmorProgress}`;
      case "pursuit": return `追击 0/3`;
      case "execution": return `终结 0/4`;
      default: return "";
    }
  }

  /** 渲染阶段提示（目标文字） */
  private renderPhaseHint(ctx: CanvasRenderingContext2D): void {
    if (this.phaseHintAlpha <= 0) return;

    const hintY = 140;
    ctx.save();
    ctx.globalAlpha = this.phaseHintAlpha;
    ctx.fillStyle = "#f0e130";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#f0e130";
    ctx.shadowBlur = 6;
    ctx.fillText(this.phaseHintText, DESIGN_WIDTH / 2, hintY);
    ctx.restore();
  }
}

/** 辅助：roundRect */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
