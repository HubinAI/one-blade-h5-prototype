/**
 * 国风水墨写意效果层
 * V0805-ink-wash.p2 | feature/v0805-ink-wash
 *
 * 在现有绘制基础上叠加水墨效果（不替换原逻辑）。
 * 每个函数都是"增强"型 — 失败/无context时安全 noop。
 */
import type { Vec2 } from "../types";

/**
 * 墨色飞白底纹 — 在刀光主光效前绘制
 * 多段粗细不均的墨色弧线，模拟毛笔快速划过宣纸的飞白感。
 */
export function drawInkWashSlashUnderlay(
  ctx: CanvasRenderingContext2D,
  points: Vec2[],
  ratio: number,
  visualLength: number
) {
  if (!points || points.length < 2) return;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const passCount = 3;
  for (let pass = 0; pass < passCount; pass++) {
    ctx.beginPath();
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const age = i / Math.max(1, points.length - 1);
      const offset = (pass - 1) * 1.5;
      ctx.lineTo(b.x + offset, b.y + offset);
      if (i === 1) ctx.moveTo(a.x + offset, a.y + offset);
    }
    const alpha = 0.18 + ratio * 0.15;
    const widthMult = 1.6 + pass * 0.4;
    ctx.strokeStyle = `rgba(26, 24, 22, ${alpha})`;
    ctx.lineWidth = visualLength * widthMult;
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * 刀锋墨点残响 — 刀光结束位置甩出几个墨点
 * 模拟笔锋离纸瞬间的飞墨。
 */
export function drawInkWashTipSplash(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  intensity: number
) {
  if (intensity < 0.3) return;

  ctx.save();
  ctx.fillStyle = "rgba(26, 24, 22, 0.35)";

  const dropCount = 4 + Math.floor(intensity * 4);
  for (let i = 0; i < dropCount; i++) {
    const dist = 6 + i * 4 + Math.random() * 6;
    const spread = (Math.random() - 0.5) * 0.9;
    const dx = Math.cos(angle + spread) * dist;
    const dy = Math.sin(angle + spread) * dist;
    const r = 0.6 + Math.random() * 1.4;
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * 玩家刀身墨色高光 — 在刀身前叠加一道墨色细线
 * 模拟刀身反光中的墨色质感。
 */
export function drawInkWashBladeHighlight(
  ctx: CanvasRenderingContext2D,
  visualLength: number,
  width: number
) {
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