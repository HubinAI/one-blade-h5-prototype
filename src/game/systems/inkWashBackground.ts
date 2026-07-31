/**
 * 国风水墨写意背景绘制
 * V0805-ink-wash.p3 | feature/v0805-ink-wash
 *
 * 全部 Canvas 程序化绘制，零外部图片依赖。
 * 等美术输出真实素材后，可在入口处切换为 drawImage。
 * 
 * V0805.p3 fix: 降低山峰高度，避免遮挡战斗区域（敌人 y=86~400）。
 */

import { DESIGN_WIDTH, DESIGN_HEIGHT } from "../config/constants";

const INK = {
  paper: "#F7F3EA",
  far: "rgba(180, 175, 165, 0.30)",
  mid: "rgba(155, 148, 138, 0.42)",
  near: "rgba(120, 112, 100, 0.55)",
  mist: "#F7F3EA",
  hudBg: "rgba(247, 243, 234, 0.92)",
  hudBorder: "rgba(180, 175, 165, 0.55)",
  hudText: "#1A1816",
  hudTextMuted: "rgba(26, 24, 22, 0.60)",
};

export function drawInkWashBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = INK.paper;
  ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

  // 远山（推低至 y=480+，避免遮挡敌人）
  drawMountainLayer(ctx, [
    { x: -20, y: 600 }, { x: 40, y: 510 }, { x: 100, y: 550 },
    { x: 170, y: 490 }, { x: 240, y: 530 }, { x: 310, y: 480 },
    { x: 370, y: 520 }, { x: 410, y: 500 },
  ], INK.far);

  // 中层山
  drawMountainLayer(ctx, [
    { x: -20, y: 660 }, { x: 60, y: 570 }, { x: 140, y: 610 },
    { x: 200, y: 550 }, { x: 280, y: 590 }, { x: 340, y: 540 },
    { x: 410, y: 580 },
  ], INK.mid);

  // 近山左（底部装饰）
  drawMountainLayer(ctx, [
    { x: -20, y: 740 }, { x: 60, y: 650 }, { x: 130, y: 690 },
    { x: 190, y: 630 }, { x: 250, y: 670 }, { x: 290, y: 650 },
  ], INK.near);
}

/** 雾气层：大幅增加透明度和覆盖，柔化山间过渡 */
export function drawInkWashMist(ctx: CanvasRenderingContext2D) {
  const w = DESIGN_WIDTH;
  const mists = [
    { cx: w/2, cy: 440, rx: 260, ry: 32, op: 0.75 },
    { cx: w/2, cy: 500, rx: 300, ry: 28, op: 0.60 },
    { cx: w/2, cy: 560, rx: 340, ry: 26, op: 0.50 },
    { cx: 140, cy: 410, rx: 140, ry: 22, op: 0.60 },
    { cx: 300, cy: 460, rx: 160, ry: 20, op: 0.50 },
  ];

  for (const m of mists) {
    ctx.save();
    ctx.globalAlpha = m.op;
    ctx.fillStyle = INK.mist;
    ctx.beginPath();
    ctx.ellipse(m.cx, m.cy, m.rx, m.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function drawInkWashMountainCover(ctx: CanvasRenderingContext2D) {
  drawMountainLayer(ctx, [
    { x: -20, y: 0 }, { x: 28, y: 82 }, { x: 58, y: 50 },
    { x: 96, y: 108 }, { x: 128, y: 48 }, { x: 168, y: 100 },
    { x: 206, y: 58 }, { x: 244, y: 114 }, { x: 278, y: 66 },
    { x: 320, y: 120 }, { x: 356, y: 74 }, { x: 410, y: 96 },
  ], "rgba(160, 152, 140, 0.45)", undefined, true);
}

export function drawInkWashFogGradient(ctx: CanvasRenderingContext2D) {
  const fog = ctx.createLinearGradient(0, 0, 0, 160);
  fog.addColorStop(0, "rgba(247, 243, 234, 0.78)");
  fog.addColorStop(0.4, "rgba(247, 243, 234, 0.48)");
  fog.addColorStop(0.7, "rgba(247, 243, 234, 0.18)");
  fog.addColorStop(1, "rgba(247, 243, 234, 0.0)");
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, DESIGN_WIDTH, 160);
}

export function drawInkWashHud(ctx: CanvasRenderingContext2D, hudHeight: number) {
  ctx.fillStyle = INK.hudBg;
  ctx.fillRect(0, 0, DESIGN_WIDTH, hudHeight);
  ctx.strokeStyle = INK.hudBorder;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, hudHeight);
  ctx.lineTo(DESIGN_WIDTH, hudHeight);
  ctx.stroke();
}

export const INK_HUD_TEXT = INK.hudText;
export const INK_HUD_TEXT_MUTED = INK.hudTextMuted;

// ---- 内部 ----
interface Point { x: number; y: number; }

function drawMountainLayer(ctx: CanvasRenderingContext2D, peaks: Point[], color: string, _baseY?: number, fillToTop = false) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  fillToTop ? ctx.moveTo(peaks[0].x, 0) : ctx.moveTo(peaks[0].x, DESIGN_HEIGHT);

  for (let i = 0; i < peaks.length; i++) {
    const p = peaks[i];
    const prev = i > 0 ? peaks[i - 1] : null;
    const next = i < peaks.length - 1 ? peaks[i + 1] : null;
    if (prev && next) {
      ctx.quadraticCurveTo((prev.x + p.x) / 2, Math.min(prev.y, p.y) - 20, p.x, p.y);
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }

  if (fillToTop) {
    ctx.lineTo(peaks[peaks.length - 1].x, 0);
  } else {
    ctx.lineTo(peaks[peaks.length - 1].x, DESIGN_HEIGHT);
    ctx.lineTo(-20, DESIGN_HEIGHT);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}