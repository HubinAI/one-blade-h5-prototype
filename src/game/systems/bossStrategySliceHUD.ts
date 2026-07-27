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
// 吸能通道（S2.2新增）
// ================================================================

export function drawAbsorptionChannels(
  ctx: CanvasRenderingContext2D,
  t: number,
  isCharging: boolean,
  feeders: { x: number; y: number; active: boolean }[],
): void {
  if (!isCharging && feeders.every(f => !f.active)) return;
  const { cx, cy } = STRATEGY_SLICE_CONFIG.absorbZone;
  // Boss右肩世界位置（调整后）
  const shoulderX = BOSS_CX + 50 * BOSS_SCALE * 0.7;
  const shoulderY = BOSS_CY - 30 * BOSS_SCALE + (isCharging ? -3 : 0);

  // 通道：从右肩→吸收区中心
  ctx.save();
  const channelLvl = isCharging ? 0.3 + 0.1 * Math.sin(t * 5) : 0.1;
  // 左通道（左供能弹→核心）
  if (feeders[0]?.active) {
    ctx.beginPath();
    ctx.moveTo(feeders[0].x, feeders[0].y);
    ctx.lineTo(cx, cy);
    ctx.strokeStyle = `rgba(130, 200, 255, ${channelLvl + 0.1})`;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // 右通道
  if (feeders[1]?.active) {
    ctx.beginPath();
    ctx.moveTo(feeders[1].x, feeders[1].y);
    ctx.lineTo(cx, cy);
    ctx.strokeStyle = `rgba(130, 200, 255, ${channelLvl + 0.1})`;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // 主链路：右肩 → 吸收区
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(cx, cy);
  ctx.strokeStyle = `rgba(160, 120, 255, ${channelLvl + 0.05})`;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ================================================================
// 🔹 Boss 身体（复用 Reactive 模式外观）
// ================================================================

export function drawBossBody(ctx: CanvasRenderingContext2D, t: number, armorDurability: number, windowType: string, isCharging: boolean): void {
  ctx.save();
  ctx.translate(BOSS_CX, BOSS_CY);
  ctx.scale(BOSS_SCALE, BOSS_SCALE);

  // S2.2: 吸能时右肩抬起（向上偏移3-5px）
  const shoulderLift = isCharging ? 2 + Math.sin(t * 8) * 2 : 0;


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
  // S2.2: 右肩吸能时抬起
  const isWindow = windowType !== "none";
  const durPct = armorDurability / 100;
  drawShoulderPiece(ctx, "right", 50, -30 - shoulderLift, durPct, isWindow);
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
// S2 🔹 供能弹（梭形 + 吸收轨迹线 + 蓝白渐变）
// ================================================================

export function drawFeederProjectile(ctx: CanvasRenderingContext2D, p: Projectile, t: number): void {
  if (!p.active) return;
  const { cx, cy } = STRATEGY_SLICE_CONFIG.absorbZone;

  // S2: 吸收轨迹线（供能弹→核心，随距离变粗）
  const dx = cx - p.x;
  const dy = cy - p.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const maxDist = STRATEGY_SLICE_CONFIG.feeder.spawnRadius + 40;
  const proximity = 1 - Math.min(dist / maxDist, 1); // 越近越粗
  if (dist > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + (dx / dist) * 24, p.y + (dy / dist) * 24);
    ctx.strokeStyle = `rgba(130, 210, 255, ${0.2 + proximity * 0.6})`;
    ctx.lineWidth = 0.8 + proximity * 3.5;
    ctx.lineCap = "round";
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // S2: 梭形弹体（菱形）
  const len = 8 + proximity * 4;
  const hw = 3 + proximity * 2;
  const angle = Math.atan2(dy, dx);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(len, 0);
  ctx.lineTo(0, -hw);
  ctx.lineTo(-len, 0);
  ctx.lineTo(0, hw);
  ctx.closePath();
  const glow = 0.3 + Math.sin(t * 6) * 0.15;
  ctx.fillStyle = `rgba(140, 210, 255, ${0.85 + glow})`;
  ctx.strokeStyle = "#5bc0ff";
  ctx.lineWidth = 1;
  ctx.shadowColor = "#7dc8ff";
  ctx.shadowBlur = 5 + proximity * 6;
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ================================================================
// 🔹 核心弹（三状态视觉：seed / charged / overloaded）
// ================================================================

export function drawCoreProjectile(ctx: CanvasRenderingContext2D, p: Projectile | null, state: SliceCoreState | null, t: number): void {
  // S2: seed — 圆核+外环，附着在吸收区
  if (state === "seed") {
    const { cx, cy } = STRATEGY_SLICE_CONFIG.absorbZone;
    ctx.save();
    const breathe = 1 + 0.06 * Math.sin(t * 3);
    // 外环
    ctx.beginPath();
    ctx.arc(cx, cy, 14 * breathe, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(120, 170, 220, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 圆核
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(80, 140, 200, 0.7)";
    ctx.fill();
    ctx.restore();
    return;
  }

  if (!p || !p.active || !state) return;
  const pulse = 1 + 0.12 * Math.sin(t * 6);

  ctx.save();
  ctx.translate(p.x, p.y);

  if (state === "charged") {
    // S2: 金色呼吸核心 + 外圈膨胀
    const outerBreathe = 1 + 0.15 * Math.sin(t * 5);
    // 呼吸外环
    ctx.beginPath();
    ctx.arc(0, 0, 24 * outerBreathe, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 211, 90, ${0.4 + 0.2 * Math.sin(t * 4)})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // 核体
    ctx.shadowColor = "#ffd35a";
    ctx.shadowBlur = 18 * pulse;
    ctx.beginPath();
    ctx.arc(0, 0, 11 * pulse, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 11 * pulse);
    grad.addColorStop(0, "rgba(255, 255, 200, 0.95)");
    grad.addColorStop(0.6, "rgba(255, 200, 60, 0.8)");
    grad.addColorStop(1, "rgba(255, 160, 20, 0.3)");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;
    // 吸收线指示（指向核心中心的小箭头）
    const ax = STRATEGY_SLICE_CONFIG.absorbZone.cx;
    const ay = STRATEGY_SLICE_CONFIG.absorbZone.cy;
    const adx = ax - p.x;
    const ady = ay - p.y;
    const angle = Math.atan2(ady, adx);
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(10, -5);
    ctx.lineTo(10, 5);
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 211, 90, 0.45)";
    ctx.fill();
    ctx.restore();
  } else if (state === "overloaded") {
    // S2: 红橙脉冲核心 + 膨胀危险外环
    const flash = 0.5 + 0.5 * Math.sin(t * 12);
    const panic = 1 + 0.2 * Math.sin(t * 8);
    // 膨胀外环
    ctx.beginPath();
    ctx.arc(0, 0, 28 * panic, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 40, 20, ${0.5 * flash})`;
    ctx.lineWidth = 3;
    ctx.stroke();
    // 内核
    ctx.shadowColor = "#ff2020";
    ctx.shadowBlur = 24 * pulse;
    ctx.beginPath();
    ctx.arc(0, 0, 12 * panic, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 40, 20, ${0.8 * flash})`;
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (state === "reflected") {
    // S2: 反射高亮轨迹
    ctx.shadowColor = "#ff6a33";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#ff8c42";
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // S2: 状态标签（简洁，仅charged/overloaded）
  if (state === "charged" || state === "overloaded") {
    ctx.font = 'bold 10px "PingFang SC", sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = state === "charged" ? "#ffd35a" : "#ff3535";
    ctx.shadowColor = state === "charged" ? "#ffd35a" : "#ff3535";
    ctx.shadowBlur = 4;
    const label = state === "charged" ? "充能" : "过载!";
    ctx.fillText(label, 0, -24);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

// ================================================================
// 🔹 危险弹（红色尖刺轮廓）
// ================================================================

// ================================================================
// S2 🔹 危险弹（红橙尖刺裂片 + 旋转切割）
// ================================================================

export function drawDangerProjectile(ctx: CanvasRenderingContext2D, p: Projectile, t: number): void {
  if (!p.active) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  const rot = t * 4;

  // S2: 旋转尖刺裂片
  ctx.strokeStyle = "rgba(255, 50, 40, 0.8)";
  ctx.lineWidth = 1.6;
  const spikes = 5;
  for (let i = 0; i < spikes; i++) {
    const a = rot + (i / spikes) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 11, Math.sin(a) * 11);
    ctx.lineTo(Math.cos(a + 0.4) * 3, Math.sin(a + 0.4) * 3);
    ctx.lineTo(Math.cos(a - 0.4) * 3, Math.sin(a - 0.4) * 3);
    ctx.closePath();
    ctx.stroke();
  }
  // 红核
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 55, 35, 0.85)";
  ctx.fill();
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

  const isLarge = snap.windowType === "large";
  const label = isLarge ? "大破绽" : "小破绽";
  const color = isLarge ? "#ff6a33" : "#5bc0ff";
  const y = DESIGN_H - 145;

  // S2.2: 大破绽 = Boss后退震动 + 大裂纹；小破绽 = 细裂纹
  const shake = isLarge ? Math.sin(snap.windowTimer * 12) * 3 : 0;
  ctx.save();
  ctx.translate(shake, 0);

  ctx.font = isLarge ? 'bold 20px "PingFang SC", sans-serif' : 'bold 14px "PingFang SC", sans-serif';
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = isLarge ? 16 : 6;
  ctx.fillText(label, DESIGN_W / 2, y);
  ctx.shadowBlur = 0;

  // S2.2: 裂纹
  const crackColor = isLarge ? "rgba(255, 255, 255, 0.6)" : "rgba(200, 220, 255, 0.35)";
  ctx.strokeStyle = crackColor;
  ctx.lineWidth = isLarge ? 1.5 : 1;
  const cx = DESIGN_W / 2;
  const cracks = isLarge ? 5 : 3;
  for (let i = 0; i < cracks; i++) {
    const ox = cx - 60 + i * (120 / (cracks - 1 || 1));
    ctx.beginPath();
    ctx.moveTo(ox, y + 20);
    ctx.lineTo(ox + (i - (cracks - 1) / 2) * 10, y + 32);
    ctx.lineTo(ox + (i - (cracks - 1) / 2) * 6, y + 40);
    ctx.stroke();
  }

  ctx.restore();

  // S2.2: 进度条（大破绽更宽）
  const barW = isLarge ? 180 : 130;
  const maxDur = STRATEGY_SLICE_CONFIG.phaseTimers[isLarge ? "windowLarge" : "windowSmall"];
  const pct = Math.max(0, Math.min(1, snap.windowTimer / maxDur));
  const barX = DESIGN_W / 2 - barW / 2;
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(barX, y + 48, barW, 6);
  ctx.fillStyle = color;
  ctx.fillRect(barX, y + 48, barW * (1 - pct), 6);

  // S2.2: 大破绽全屏震屏提示
  if (isLarge && snap.windowTimer < 0.3) {
    ctx.save();
    ctx.fillStyle = `rgba(255, 106, 51, ${0.15 * (1 - snap.windowTimer / 0.3)})`;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    ctx.restore();
  }
}

// ================================================================
// 🔹 Boss 吸收区光晕
// ================================================================

export function drawAbsorbZone(ctx: CanvasRenderingContext2D, t: number, isCharging: boolean, chargePct: number = 0): void {
  const { cx, cy, radius } = STRATEGY_SLICE_CONFIG.absorbZone;
  // S2: 充能越强，吸收区越亮且跳动
  const alpha = 0.12 + chargePct * 0.35 + (isCharging ? 0.08 * Math.sin(t * 5) : 0);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(100, 120, 255, ${alpha})`;
  ctx.fill();
  const strokeAlpha = 0.2 + chargePct * 0.4;
  ctx.strokeStyle = `rgba(160, 180, 255, ${strokeAlpha})`;
  ctx.lineWidth = 1 + chargePct;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  // S2: 充能脉冲环
  if (chargePct > 0.3) {
    const pulse = 0.3 + 0.3 * Math.sin(t * 3);
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(180, 200, 255, ${pulse})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
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
