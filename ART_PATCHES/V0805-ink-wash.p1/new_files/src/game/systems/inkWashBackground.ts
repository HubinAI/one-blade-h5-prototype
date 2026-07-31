/**
 * 国风水墨写意背景绘制
 * V0731.004 | feature/v0805-ink-wash
 *
 * 全部 Canvas 程序化绘制，零外部图片依赖。
 * 等美术输出真实素材后，可在入口处切换为 drawImage。
 */

import { DESIGN_WIDTH, DESIGN_HEIGHT } from "../config/constants";

// ---- 色板 ----
const INK = {
  paper: "#F7F3EA",
  far: "rgba(180, 175, 165, 0.35)",
  mid: "rgba(155, 148, 138, 0.50)",
  near: "rgba(120, 112, 100, 0.62)",
  mist: "#F7F3EA",
  mountainDeep: "rgba(60, 50, 40, 0.25)",
  hudBg: "rgba(247, 243, 234, 0.92)",
  hudBorder: "rgba(180, 175, 165, 0.55)",
  hudText: "#3D3A35",
  hudTextMuted: "rgba(61, 58, 53, 0.60)",
};

/** 宣纸底色 + 三层水墨山 */
export function drawInkWashBackground(ctx: CanvasRenderingContext2D) {
  // 宣纸底色
  ctx.fillStyle = INK.paper;
  ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

  // 远山：最淡，低处起
  drawMountainLayer(ctx, [
    { x: -20, y: 520 },
    { x: 40, y: 420 },
    { x: 100, y: 460 },
    { x: 170, y: 390 },
    { x: 240, y: 430 },
    { x: 310, y: 370 },
    { x: 370, y: 400 },
    { x: 410, y: 380 },
  ], INK.far, 0);

  // 中层山
  drawMountainLayer(ctx, [
    { x: -20, y: 580 },
    { x: 60, y: 470 },
    { x: 140, y: 510 },
    { x: 200, y: 440 },
    { x: 280, y: 490 },
    { x: 340, y: 430 },
    { x: 410, y: 470 },
  ], INK.mid, 0);

  // 近山左
  drawMountainLayer(ctx, [
    { x: -20, y: 650 },
    { x: 60, y: 530 },
    { x: 130, y: 570 },
    { x: 190, y: 500 },
    { x: 250, y: 550 },
    { x: 290, y: 520 },
  ], INK.near, 0);

  // 近山右
  drawMountainLayer(ctx, [
    { x: 150, y: 530 },
    { x: 220, y: 470 },
    { x: 300, y: 510 },
    { x: 360, y: 460 },
    { x: 430, y: 500 },
  ], INK.mountainDeep, 0);
}

/** 雾气层：横向椭圆叠层 */
export function drawInkWashMist(ctx: CanvasRenderingContext2D) {
  const w = DESIGN_WIDTH;
  const mists = [
    { cy: 380, rx: 200, ry: 28, op: 0.65 },
    { cy: 420, rx: 240, ry: 24, op: 0.50 },
    { cy: 460, rx: 280, ry: 22, op: 0.40 },
    { cy: 350, rx: 160, ry: 20, op: 0.55 },
    { cy: 400, rx: 180, ry: 18, op: 0.45 },
  ];

  for (const m of mists) {
    ctx.save();
    ctx.globalAlpha = m.op;
    ctx.fillStyle = INK.mist;
    ctx.beginPath();
    ctx.ellipse(w / 2, m.cy, m.rx, m.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** 底层：敌人生成区上方山峦剪影（替代原 drawTopMist 的下层） */
export function drawInkWashMountainCover(ctx: CanvasRenderingContext2D) {
  drawMountainLayer(ctx, [
    { x: -20, y: 0 },
    { x: 28, y: 72 },
    { x: 58, y: 36 },
    { x: 96, y: 96 },
    { x: 128, y: 28 },
    { x: 168, y: 88 },
    { x: 206, y: 44 },
    { x: 244, y: 102 },
    { x: 278, y: 52 },
    { x: 320, y: 108 },
    { x: 356, y: 62 },
    { x: 410, y: 84 },
  ], "rgba(160, 152, 140, 0.45)", 0, true);
}

/** 雾渐变：从顶部向下渐淡 */
export function drawInkWashFogGradient(ctx: CanvasRenderingContext2D) {
  const fog = ctx.createLinearGradient(0, 0, 0, 140);
  fog.addColorStop(0, "rgba(247, 243, 234, 0.72)");
  fog.addColorStop(0.4, "rgba(247, 243, 234, 0.42)");
  fog.addColorStop(0.7, "rgba(247, 243, 234, 0.15)");
  fog.addColorStop(1, "rgba(247, 243, 234, 0.0)");
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, DESIGN_WIDTH, 140);
}

/** 水墨 HUD 背景绘制 */
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

/** HUD 文字颜色 */
export const INK_HUD_TEXT = INK.hudText;
export const INK_HUD_TEXT_MUTED = INK.hudTextMuted;

// ---- 内部工具 ----

interface Point {
  x: number;
  y: number;
}

function drawMountainLayer(
  ctx: CanvasRenderingContext2D,
  peaks: Point[],
  color: string,
  baseY?: number,
  fillToTop = false
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();

  if (fillToTop) {
    ctx.moveTo(peaks[0].x, 0);
  } else {
    ctx.moveTo(peaks[0].x, DESIGN_HEIGHT);
  }

  for (let i = 0; i < peaks.length; i++) {
    const p = peaks[i];
    const prev = i > 0 ? peaks[i - 1] : null;
    const next = i < peaks.length - 1 ? peaks[i + 1] : null;

    if (prev && next) {
      const cpx = (prev.x + p.x) / 2;
      const cpy = Math.min(prev.y, p.y) - 20;
      ctx.quadraticCurveTo(cpx, cpy, p.x, p.y);
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
