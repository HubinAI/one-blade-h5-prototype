// ========================================================================
// Boss Strategy Slice HUD — V0723016-S1.1
//
// 绘制策略切片所有视觉元素：
// - Boss 身体（复用 Reactive 模式外观）
// - 供能弹 + 拖尾 + 吸收轨迹
// - 核心弹三状态视觉
// - 危险弹
// - 破绽窗口指示
// - 切片总结
// ========================================================================

import { STRATEGY_SLICE_CONFIG, type SliceCoreState } from "../config/bossStrategySlice";
import type { SliceSnapshot } from "./BossStrategySliceController";
import type { Projectile } from "../types";

const DESIGN_W = 390;
const DESIGN_H = 844;

// 与 BossReactiveController 一致的 Boss 中心（缩放前）
const BOSS_CX = 195;
const BOSS_CY = 220;
const BOSS_SCALE = 1.4; // 相比原版放大 40%

// ================================================================
// 🔹 Boss 身体（复用 Reactive 模式外观）
// ================================================================

export function drawBossBody(ctx: CanvasRenderingContext2D, t: number, armorDurability: number, windowType: string): void {
  ctx.save();
  ctx.translate(BOSS_CX, BOSS_CY);
  ctx.scale(BOSS_SCALE, BOSS_SCALE);

  // 剪影
  ctx.save();
  ctx.shadowColor = "rgba(108, 52, 131, 0.3)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#1a0a26";
  drawSilhouette(ctx);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "rgba(108, 52, 131, 0.35)";
  ctx.lineWidth = 2;
  drawSilhouette(ctx);
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

  // 左肩甲（始终灰色，策略切片只关注右肩）
  drawShoulderPiece(ctx, "left", -50, -30);
  // 右肩甲（活跃）
  const isWindow = windowType !== "none";
  const durPct = armorDurability / 100;
  drawShoulderPiece(ctx, "right", 50, -30, durPct, isWindow);
  // 胸甲（灰色）
  drawChestPiece(ctx);

  ctx.restore();
}

function drawSilhouette(ctx: CanvasRenderingContext2D): void {
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

function drawShoulderPiece(ctx: CanvasRenderingContext2D, side: "left" | "right", x: number, y: number, durPct?: number, isWindow?: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  if (side === "left" || durPct === undefined) {
    ctx.fillStyle = "#150a20";
    ctx.strokeStyle = "#3d1a4a";
    ctx.lineWidth = 1.5;
  } else if (isWindow) {
    ctx.fillStyle = `rgba(255, 180, 80, 0.55)`;
    ctx.strokeStyle = "#ffd35a";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#ffd35a";
    ctx.shadowBlur = 16;
  } else {
    ctx.fillStyle = `rgba(61, 26, 80, ${0.4 + durPct * 0.4})`;
    ctx.strokeStyle = durPct > 0.5 ? "#8e44ad" : "#3d1a4a";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#8e44ad";
    ctx.shadowBlur = 6;
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, 30, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawChestPiece(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.fillStyle = "#150a20";
  ctx.strokeStyle = "#3d1a4a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ================================================================
// 🔹 供能弹（蓝白拖尾 + 吸收轨迹）
// ================================================================

export function drawFeederProjectile(ctx: CanvasRenderingContext2D, p: Projectile, t: number): void {
  if (!p.active) return;
  const { cx, cy } = STRATEGY_SLICE_CONFIG.absorbZone;

  // 拖尾
  const dx = cx - p.x;
  const dy = cy - p.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - (dx / dist) * 18, p.y - (dy / dist) * 18);
    ctx.strokeStyle = "rgba(130, 200, 255, 0.5)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  }

  // 弹体
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#7dc8ff";
  ctx.shadowColor = "#5bc0ff";
  ctx.shadowBlur = 6 + 2 * Math.sin(t * 5);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ================================================================
// 🔹 核心弹（三状态视觉：seed / charged / overloaded）
// ================================================================

export function drawCoreProjectile(ctx: CanvasRenderingContext2D, p: Projectile | null, state: SliceCoreState | null, t: number): void {
  // S1.4: seed 无弹幕对象，在吸收区中心绘制附着核心
  if (state === "seed") {
    const { cx, cy } = { cx: 195, cy: 340 };
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(70, 130, 180, 0.6)";
    ctx.fill();
    ctx.strokeStyle = "rgba(120, 170, 220, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = 'bold 9px "PingFang SC", sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = "#8bbfff";
    ctx.fillText("核心", cx, cy - 16);
    ctx.restore();
    return;
  }

  if (!p || !p.active || !state) return;
  const pulse = 1 + 0.12 * Math.sin(t * 6);

  ctx.save();
  ctx.translate(p.x, p.y);

  if (state === "charged") {
    // 亮金呼吸光圈
    ctx.shadowColor = "#ffd35a";
    ctx.shadowBlur = 16 * pulse;
    ctx.beginPath();
    ctx.arc(0, 0, 13 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 200, 60, 0.75)";
    ctx.fill();
    ctx.shadowBlur = 0;
    // 外圈呼吸
    ctx.beginPath();
    ctx.arc(0, 0, 22 * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 211, 90, ${0.3 + 0.2 * pulse})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (state === "overloaded") {
    // 红橙高频闪烁
    const flash = 0.6 + 0.4 * Math.sin(t * 15);
    ctx.shadowColor = "#ff3535";
    ctx.shadowBlur = 22 * pulse;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 50, 30, ${flash})`;
    ctx.fill();
    ctx.shadowBlur = 0;
    // 外圈膨胀
    ctx.beginPath();
    ctx.arc(0, 0, 24 * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 80, 60, ${0.4 * flash})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  } else if (state === "reflected") {
    // 反射路径高亮
    ctx.shadowColor = "#ff6a33";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fillStyle = "#ff6a33";
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // 标签
  if (state !== "cut") {
    ctx.font = 'bold 9px "PingFang SC", sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = coreColor(state);
    const label = state === "charged" ? "充能" : state === "overloaded" ? "过载" : "反射";
    ctx.fillText(label, 0, -22);
  }
  ctx.restore();
}

// ================================================================
// 🔹 危险弹（红色尖刺轮廓）
// ================================================================

export function drawDangerProjectile(ctx: CanvasRenderingContext2D, p: Projectile, t: number): void {
  if (!p.active) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  const rot = t * 3;

  // 尖刺外圈
  ctx.strokeStyle = "rgba(255, 40, 40, 0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const spikes = 6;
  for (let i = 0; i < spikes; i++) {
    const a1 = rot + (i / spikes) * Math.PI * 2;
    const a2 = a1 + Math.PI / spikes;
    ctx.lineTo(Math.cos(a1) * 10, Math.sin(a1) * 10);
    ctx.lineTo(Math.cos(a2) * 7, Math.sin(a2) * 7);
  }
  ctx.closePath();
  ctx.stroke();

  // 内圈
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 40, 40, 0.6)";
  ctx.fill();

  // 拖尾
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-p.vx * 0.3, -p.vy * 0.3);
  ctx.strokeStyle = "rgba(255, 60, 60, 0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

function coreColor(state: SliceCoreState): string {
  switch (state) { case "charged": return "#ffd35a"; case "overloaded": return "#ff3535"; case "reflected": return "#ff6a33"; default: return "#fff"; }
}

// ================================================================
// 🔹 破绽窗口（护甲裂纹 + 进度条）
// ================================================================

export function drawWindowIndicator(ctx: CanvasRenderingContext2D, snap: SliceSnapshot): void {
  if (snap.windowType === "none") return;

  const label = snap.windowType === "small" ? "小破绽" : "⚡ 大破绽";
  const color = snap.windowType === "small" ? "#5bc0ff" : "#ffd35a";
  const y = DESIGN_H - 145;

  const maxDur = snap.windowType === "small"
    ? STRATEGY_SLICE_CONFIG.phaseTimers.windowSmall
    : STRATEGY_SLICE_CONFIG.phaseTimers.windowLarge;
  const pct = Math.max(0, Math.min(1, snap.windowTimer / maxDur));
  const barW = 150;
  const barX = DESIGN_W / 2 - barW / 2;

  ctx.save();
  ctx.font = 'bold 15px "PingFang SC", sans-serif';
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillText(label, DESIGN_W / 2, y);
  ctx.shadowBlur = 0;

  // 进度条
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(barX, y + 8, barW, 6);
  ctx.fillStyle = color;
  ctx.fillRect(barX, y + 8, barW * (1 - pct), 6);
  ctx.restore();
}

// ================================================================
// 🔹 Boss 吸收区光晕
// ================================================================

export function drawAbsorbZone(ctx: CanvasRenderingContext2D, t: number, isCharging: boolean): void {
  const { cx, cy, radius } = STRATEGY_SLICE_CONFIG.absorbZone;
  const alpha = isCharging ? 0.35 + 0.15 * Math.sin(t * 4) : 0.15 + 0.05 * Math.sin(t * 2);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(120, 80, 255, ${alpha})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(180, 140, 255, ${alpha + 0.15})`;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ================================================================
// 🔹 吸收轨迹（供能弹飞向吸收区）
// ================================================================

export function drawFeederTrajectories(ctx: CanvasRenderingContext2D, feeders: { x: number; y: number; active: boolean }[], t: number): void {
  const { cx, cy } = STRATEGY_SLICE_CONFIG.absorbZone;
  for (const f of feeders) {
    if (!f.active) continue;
    const dx = cx - f.x;
    const dy = cy - f.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 40) {
      // 临近吸收区：加亮连线
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(cx, cy);
      ctx.strokeStyle = `rgba(150, 200, 255, ${0.4 + 0.2 * Math.sin(t * 3)})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}

// ================================================================
// 🔹 切片总结
// ================================================================

export function drawSliceSummary(ctx: CanvasRenderingContext2D, snap: SliceSnapshot): void {
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  ctx.font = 'bold 24px "PingFang SC", sans-serif';
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd35a";
  ctx.shadowColor = "#ffd35a";
  ctx.shadowBlur = 12;
  ctx.fillText("策略切片完成", DESIGN_W / 2, 240);
  ctx.shadowBlur = 0;

  const items = [
    ["安全清场", snap.cleanClears],
    ["充能反射", snap.chargedReflects],
    ["过载", snap.overloads],
    ["窗口攻击", snap.windowAttacks],
    ["放弃窗口", snap.windowSkips],
    ["危险误砍", snap.dangerWrongCuts],
  ];

  const sy = 310;
  ctx.font = '16px "PingFang SC", sans-serif';
  for (let i = 0; i < items.length; i++) {
    const yi = sy + i * 35;
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.textAlign = "right";
    ctx.fillText(`${items[i][0]}`, DESIGN_W / 2 - 24, yi);
    ctx.fillStyle = "#ffd35a";
    ctx.textAlign = "left";
    ctx.fillText(`${items[i][1]}`, DESIGN_W / 2 + 10, yi);
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.font = '12px "PingFang SC", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(`总耗时 ${snap.sliceElapsed.toFixed(1)}s`, DESIGN_W / 2, sy + items.length * 35 + 30);

  // 按钮提示
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = '13px "PingFang SC", sans-serif';
  ctx.fillText("点击任意位置返回", DESIGN_W / 2, DESIGN_H - 60);

  ctx.restore();
}
