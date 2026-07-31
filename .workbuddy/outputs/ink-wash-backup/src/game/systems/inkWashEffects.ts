/**
 * 国风水墨写意效果层（刀光 + 敌人颜色）
 * V0805-ink-wash.p3
 */
import type { Vec2 } from "../types";

/** 墨色飞白底纹 */
export function drawInkWashSlashUnderlay(ctx: CanvasRenderingContext2D, points: Vec2[], ratio: number, visualLength: number) {
  if (!points || points.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const passCount = 3;
  for (let pass = 0; pass < passCount; pass++) {
    ctx.beginPath();
    for (let i = 1; i < points.length; i++) {
      const offset = (pass - 1) * 1.5;
      if (i === 1) ctx.moveTo(points[0].x + offset, points[0].y + offset);
      ctx.lineTo(points[i].x + offset, points[i].y + offset);
    }
    ctx.strokeStyle = `rgba(26, 24, 22, ${0.18 + ratio * 0.15})`;
    ctx.lineWidth = visualLength * (1.6 + pass * 0.4);
    ctx.stroke();
  }
  ctx.restore();
}

/** 刀锋墨点残响 */
export function drawInkWashTipSplash(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, intensity: number) {
  if (intensity < 0.3) return;
  ctx.save();
  ctx.fillStyle = "rgba(26, 24, 22, 0.35)";
  const dropCount = 4 + Math.floor(intensity * 4);
  for (let i = 0; i < dropCount; i++) {
    const dist = 6 + i * 4 + Math.random() * 6;
    const spread = (Math.random() - 0.5) * 0.9;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle + spread) * dist, y + Math.sin(angle + spread) * dist, 0.6 + Math.random() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 刀身墨色高光（备用） */
export function drawInkWashBladeHighlight(ctx: CanvasRenderingContext2D, visualLength: number, _width: number) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(26, 24, 22, 0.55)";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(visualLength * 0.2, -1);
  ctx.lineTo(visualLength * 0.85, -1);
  ctx.stroke();
  ctx.restore();
}
