import type { BossId, BossPhaseState, Enemy } from "../types";
import { BOSS_CONFIG, type BossConfig } from "../config/bosses";
import { BOSS_VISUAL_DEFS } from "../../data/bosses";
import { BALANCE } from "../config/balance";
import { DESIGN_WIDTH, DESIGN_HEIGHT } from "../config/constants";

// ========================================================================
// P4.4A.1: BossController — 独立状态机，管理玄甲雷将从开场到战斗的全流程
// 不参与普通关 Flow / 军令 / 副刀系统
// ========================================================================

/** 护甲部件索引 */
const ARMOR_LEFT = 0;
const ARMOR_RIGHT = 1;
const ARMOR_CHEST = 2;

/** Boss 安全区 Y（落位后的目标 Y） */
const BOSS_LAND_Y = 165;

/** 开场持续秒数 */
const INTRO_DURATION = 3.0;

export class BossController {
  // ---- 基础状态 ----
  private _phase: BossPhaseState = "intro";
  get phase(): BossPhaseState { return this._phase; }

  private _boss: Enemy | null = null;
  get boss(): Enemy | null { return this._boss; }

  private bossConfig: BossConfig;
  readonly bossId: BossId;

  // ---- 开场动画 ----
  private introElapsed = 0;
  private _introSkipped = false;
  get introSkipped(): boolean { return this._introSkipped; }

  /** 开场期间暂停外部系统 */
  get isIntroActive(): boolean { return this._phase === "intro" && !this._introSkipped; }

  // ---- 护甲占位（P4.4A.2 完整实现） ----
  private armorProgress = 0;
  private readonly maxArmor = 3;
  /** 当前激活的护甲索引（0=左肩,1=右肩,2=胸甲） */
  private activeArmorIndex = 0;

  // ---- HUD 动画 ----
  private hudSlideProgress = 0;
  private phaseHintAlpha = 0;
  private phaseHintElapsed = 0;

  // ---- 开场粒子 ----
  private introParticles: { x: number; y: number; alpha: number; life: number; size: number; color: string }[] = [];

  // ---- 视觉 ----
  /** Boss 当前渲染 Y（从出场到落位动态变化） */
  private renderY = -100;
  private shakeTimer = 0;

  constructor(bossId: BossId) {
    this.bossId = bossId;
    this.bossConfig = BOSS_CONFIG[bossId];
  }

  /** 关联 Enemy */
  attachBoss(enemy: Enemy): void {
    this._boss = enemy;
    this.renderY = enemy.y;
  }

  /** 跳过开场（Debug） */
  skipIntro(): void {
    if (this._phase !== "intro") return;
    this._introSkipped = true;
    this.introElapsed = INTRO_DURATION;
    this.renderY = BOSS_LAND_Y;
    if (this._boss) this._boss.y = BOSS_LAND_Y;
    this.transitionTo("armor");
  }

  // ====================================================================
  // update
  // ====================================================================
  update(dt: number): void {
    if (!this._boss) return;

    // 开场粒子衰减
    this.introParticles = this.introParticles.filter(p => {
      p.life -= dt;
      return p.life > 0;
    });

    switch (this._phase) {
      case "intro": {
        this.introElapsed += dt;

        // 1) Boss 从上方入场（前 1.2s 下降至落位点）
        if (this.introElapsed <= 1.2) {
          const t = this.introElapsed / 1.2;
          const easeOut = 1 - Math.pow(1 - t, 3);
          this.renderY = -80 + (BOSS_LAND_Y + 80) * easeOut;
        } else {
          this.renderY = BOSS_LAND_Y;
        }

        // 2) Boss 落位时震屏
        if (this.introElapsed >= 1.1 && this.introElapsed <= 1.4) {
          this.shakeTimer = 0.3;
        } else {
          this.shakeTimer = Math.max(0, this.shakeTimer - dt);
        }

        // 3) 同步 Enemy 坐标
        if (this._boss) this._boss.y = this.renderY;

        // 4) 开场粒子
        if (this.introElapsed < 2.5 && Math.random() > 0.12) {
          this.spawnIntroParticle();
        }

        // 5) 开场结束 → 转入 armor
        if (this.introElapsed >= INTRO_DURATION) {
          this.transitionTo("armor");
        }
        break;
      }

      case "armor": {
        // P4.4A.2 完整实现破甲判定
        // 当前仅保持护甲激活状态和提示
        this.phaseHintElapsed += dt;
        if (this.phaseHintElapsed < 0.3) {
          this.phaseHintAlpha = this.phaseHintElapsed / 0.3;
        } else if (this.phaseHintElapsed > 4.0) {
          this.phaseHintAlpha = Math.max(0, this.phaseHintAlpha - dt * 0.4);
        } else {
          this.phaseHintAlpha = 1;
        }
        this.hudSlideProgress = Math.min(1, this.hudSlideProgress + dt * 3);
        break;
      }

      default:
        break;
    }
  }

  // ====================================================================
  // render
  // ====================================================================
  render(ctx: CanvasRenderingContext2D): void {
    if (!this._boss) return;

    const cx = DESIGN_WIDTH / 2;
    const cy = this.renderY;

    // 1) 四角暗角
    this.drawVignette(ctx);

    // 2) 顶部雷光
    if (this._phase === "intro") {
      this.drawTopLightning(ctx);
    }

    // 3) Boss 主体
    this.drawBossBody(ctx, cx, cy);

    // 4) 护甲部件
    this.drawArmorPieces(ctx, cx, cy);

    // 5) 胸口雷核
    this.drawCore(ctx, cx, cy);

    // 6) 开场文字
    if (this._phase === "intro") {
      this.drawIntroText(ctx);
    }

    // 7) Boss 专属 HUD
    if (this._phase !== "intro") {
      this.drawBossHud(ctx);
      // 8) 目标提示
      if (this.phaseHintAlpha > 0) {
        this.drawPhaseHint(ctx);
      }
    }
  }

  // ====================================================================
  // 内部
  // ====================================================================
  private transitionTo(newPhase: BossPhaseState): void {
    this._phase = newPhase;
    this.phaseHintElapsed = 0;
    this.phaseHintAlpha = 0;
    this.hudSlideProgress = 0;
    if (this._boss) this._boss.y = this.renderY;
  }

  private spawnIntroParticle(): void {
    this.introParticles.push({
      x: DESIGN_WIDTH / 2 + (Math.random() - 0.5) * 180,
      y: this.renderY - 40 + (Math.random() - 0.5) * 120,
      alpha: 0.2 + Math.random() * 0.4,
      life: 0.4 + Math.random() * 0.6,
      size: 1.5 + Math.random() * 3,
      color: Math.random() > 0.5 ? "#f0e130" : "#8e44ad"
    });
  }

  // ====================================================================
  // 渲染: 暗角
  // ====================================================================
  private drawVignette(ctx: CanvasRenderingContext2D): void {
    const intensity = this._phase === "intro"
      ? Math.min(this.introElapsed / 0.6, 0.50)
      : 0.22;

    if (intensity <= 0) return;

    const grd = ctx.createRadialGradient(
      DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, 40,
      DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, 340
    );
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(0.55, `rgba(30, 6, 40, ${intensity * 0.35})`);
    grd.addColorStop(1, `rgba(0,0,0,${intensity})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  }

  // ====================================================================
  // 渲染: 顶部雷光
  // ====================================================================
  private drawTopLightning(ctx: CanvasRenderingContext2D): void {
    if (this.introElapsed < 0.3) return;
    const flashAlpha = 0.06 + Math.sin(this.introElapsed * 12) * 0.04;
    ctx.save();
    ctx.fillStyle = `rgba(200, 200, 255, ${flashAlpha})`;
    ctx.fillRect(0, 0, DESIGN_WIDTH, 60);

    // 闪电光斑
    for (let i = 0; i < 3; i++) {
      const lx = DESIGN_WIDTH * 0.2 + Math.random() * DESIGN_WIDTH * 0.6;
      const ly = 10 + Math.random() * 20;
      ctx.fillStyle = `rgba(240, 225, 255, ${0.1 + Math.random() * 0.15})`;
      ctx.beginPath();
      ctx.arc(lx, ly, 8 + Math.random() * 14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ====================================================================
  // 渲染: Boss 主体（分层剪影）
  // ====================================================================
  private drawBossBody(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    const R = 70; // 主体半径 ~33% 屏幕宽

    // 脉动呼吸
    const breathe = this._phase === "intro"
      ? 1 + Math.sin(this.introElapsed * 2.5) * 0.03
      : 1 + Math.sin(Date.now() / 300) * 0.02;

    ctx.save();

    // ---- 身体（大椭圆躯干） ----
    const bodyGrd = ctx.createRadialGradient(cx - 10, cy - 5, 2, cx, cy, R * breathe);
    bodyGrd.addColorStop(0, "#4a2a5e");
    bodyGrd.addColorStop(0.5, "#3d1a4a");
    bodyGrd.addColorStop(1, "#1c0a26");
    ctx.fillStyle = bodyGrd;
    ctx.shadowColor = "#4a235a";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 0.65 * breathe, R * breathe, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // ---- 头部（头顶小圆） ----
    const headY = cy - R * 0.85;
    ctx.fillStyle = "#5b2c6f";
    ctx.strokeStyle = "#6c3483";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, headY, R * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // ====================================================================
  // 渲染: 护甲部件
  // ====================================================================
  private drawArmorPieces(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    const R = 70;

    // ---- 左肩甲 ----
    const lx = cx - R * 0.55;
    const ly = cy - R * 0.35;
    this.drawShoulderArmor(ctx, lx, ly, R * 0.32, R * 0.22, -0.3, this.activeArmorIndex === ARMOR_LEFT);

    // ---- 右肩甲 ----
    const rx = cx + R * 0.55;
    const ry = cy - R * 0.35;
    this.drawShoulderArmor(ctx, rx, ry, R * 0.32, R * 0.22, 0.3, this.activeArmorIndex === ARMOR_RIGHT);

    // ---- 胸甲（中心） ----
    this.drawChestArmor(ctx, cx, cy + R * 0.08, R * 0.38, R * 0.32, this.activeArmorIndex === ARMOR_CHEST);
  }

  /** 单个肩甲 */
  private drawShoulderArmor(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rot: number, active: boolean): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    // 底
    const baseColor = active ? "#5b2c6f" : "#2c0e37";
    const edgeColor = active ? "#f0e130" : "#4a235a";
    ctx.fillStyle = baseColor;
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = active ? 3 : 1.5;

    // 多边形肩甲
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.lineTo(-w * 0.5, -h);
    ctx.lineTo(w * 0.5, -h);
    ctx.lineTo(w, 0);
    ctx.lineTo(w * 0.5, h);
    ctx.lineTo(-w * 0.5, h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 激活态发光
    if (active) {
      ctx.shadowColor = "#f0e130";
      ctx.shadowBlur = 16;
      ctx.strokeStyle = "rgba(240, 225, 48, 0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.lineTo(-w * 0.5, -h);
      ctx.lineTo(w * 0.5, -h);
      ctx.lineTo(w, 0);
      ctx.lineTo(w * 0.5, h);
      ctx.lineTo(-w * 0.5, h);
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  /** 胸甲 */
  private drawChestArmor(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, active: boolean): void {
    ctx.save();

    const baseColor = active ? "#5b2c6f" : "#2c0e37";
    const edgeColor = active ? "#f0e130" : "#4a235a";
    ctx.fillStyle = baseColor;
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = active ? 3 : 1.5;

    // 菱形胸甲
    ctx.beginPath();
    ctx.moveTo(cx - w, cy);
    ctx.lineTo(cx, cy - h);
    ctx.lineTo(cx + w, cy);
    ctx.lineTo(cx, cy + h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 激活态发光
    if (active) {
      ctx.shadowColor = "#f0e130";
      ctx.shadowBlur = 16;
      ctx.strokeStyle = "rgba(240, 225, 48, 0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - w, cy);
      ctx.lineTo(cx, cy - h);
      ctx.lineTo(cx + w, cy);
      ctx.lineTo(cx, cy + h);
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 金色裂纹（非激活时也有少量）
    if (!active) {
      ctx.strokeStyle = "rgba(240, 225, 48, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.3, cy - h * 0.1);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + w * 0.2, cy + h * 0.15);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ====================================================================
  // 渲染: 胸口雷核
  // ====================================================================
  private drawCore(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    const R = 70;
    const coreR = R * 0.18;
    const pulse = this._phase === "intro"
      ? 0.85 + Math.sin(this.introElapsed * 5) * 0.15
      : 0.88 + Math.sin(Date.now() / 200) * 0.12;

    ctx.save();
    const grd = ctx.createRadialGradient(cx, cy + R * 0.08, 0, cx, cy + R * 0.08, coreR * pulse);
    grd.addColorStop(0, "#ffffff");
    grd.addColorStop(0.3, "#f0e130");
    grd.addColorStop(0.6, "#e67e22");
    grd.addColorStop(1, "#c0392b");
    ctx.fillStyle = grd;
    ctx.shadowColor = "#f0e130";
    ctx.shadowBlur = this._phase === "intro" ? 20 + Math.sin(this.introElapsed * 5) * 10 : 14;
    ctx.beginPath();
    ctx.arc(cx, cy + R * 0.08, coreR * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ====================================================================
  // 渲染: 开场文字
  // ====================================================================
  private drawIntroText(ctx: CanvasRenderingContext2D): void {
    const progress = this.introElapsed / INTRO_DURATION;

    // 粒子
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

    // "境界镇守者" (2.0s 左右)
    if (progress >= 0.65) {
      const alpha = Math.min(1, (progress - 0.65) / 0.1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#d7bde2";
      ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(107, 52, 131, 0.6)";
      ctx.shadowBlur = 10;
      ctx.fillText("境界镇守者", DESIGN_WIDTH / 2, 240);
      ctx.restore();
    }

    // "玄甲雷将" (2.3s 左右，大字)
    if (progress >= 0.75) {
      const alpha = Math.min(1, (progress - 0.75) / 0.1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#f0e130";
      ctx.font = '700 30px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#f0e130";
      ctx.shadowBlur = 16;
      ctx.fillText("玄甲雷将", DESIGN_WIDTH / 2, 285);
      ctx.restore();
    }
  }

  // ====================================================================
  // 渲染: Boss 专属顶部 HUD
  // ====================================================================
  private drawBossHud(ctx: CanvasRenderingContext2D): void {
    if (!this._boss) return;
    const e = this._boss;
    const hpRatio = e.hp / Math.max(1, e.maxHp);
    const slideX = (1 - this.hudSlideProgress) * 30;
    const hudTop = 6;
    const hudW = DESIGN_WIDTH - 12;
    const hudX = 6;

    ctx.save();

    // ---- 背景面板 ----
    ctx.globalAlpha = 0.90;
    ctx.fillStyle = "rgba(26, 12, 36, 0.88)";
    ctx.shadowColor = "rgba(108, 52, 131, 0.25)";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.roundRect(hudX + slideX, hudTop, hudW, 72, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(108, 52, 131, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(hudX + slideX, hudTop, hudW, 72, 6);
    ctx.stroke();

    // ---- Boss 名称 ----
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#f0e130";
    ctx.font = '700 15px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.shadowColor = "#f0e130";
    ctx.shadowBlur = 6;
    ctx.fillText("玄甲雷将", hudX + 12 + slideX, hudTop + 5);
    ctx.shadowBlur = 0;

    // ---- 超宽血条 ----
    const barTop = hudTop + 26;
    const barLeft = hudX + 12 + slideX;
    const barW = hudW - 24;
    const barH = 9;

    // 背景
    ctx.fillStyle = "rgba(40, 18, 18, 0.85)";
    ctx.beginPath();
    ctx.roundRect(barLeft, barTop, barW, barH, 4);
    ctx.fill();

    // 填充
    const hpColor = hpRatio > 0.66 ? "#6c3483" : hpRatio > 0.33 ? "#e67e22" : "#c0392b";
    ctx.fillStyle = hpColor;
    ctx.shadowColor = hpColor;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.roundRect(barLeft, barTop, barW * hpRatio, barH, 4);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 血条边框
    ctx.strokeStyle = "rgba(240, 225, 48, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(barLeft, barTop, barW, barH, 4);
    ctx.stroke();

    // ---- 阶段标签 + 进度 ----
    const labelY = barTop + barH + 5;
    ctx.fillStyle = "#d7bde2";
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("阶段 1 · 破甲", barLeft, labelY);

    ctx.fillStyle = "#a569bd";
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "right";
    ctx.fillText(`护甲 ${this.armorProgress}/${this.maxArmor}`, hudX + hudW - 12 + slideX, labelY);

    ctx.restore();
  }

  // ====================================================================
  // 渲染: 阶段目标提示
  // ====================================================================
  private drawPhaseHint(ctx: CanvasRenderingContext2D): void {
    if (this.phaseHintAlpha <= 0.01) return;

    // "切发亮护甲"
    ctx.save();
    ctx.globalAlpha = this.phaseHintAlpha;
    ctx.fillStyle = "#f0e130";
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#f0e130";
    ctx.shadowBlur = 8;
    ctx.fillText("切发亮护甲", DESIGN_WIDTH / 2, 100);
    ctx.restore();
  }
}
