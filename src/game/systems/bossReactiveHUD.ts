// ========================================================================
// Boss Reactive HUD — 刀势条/生命条/护甲状态等HUD渲染
// ========================================================================
import { DESIGN_WIDTH, DESIGN_HEIGHT } from "../config/constants";
import { clamp } from "../../utils/math";

/** 绘制刀势条 */
export function drawEnergyBar(
  ctx: any,
  energy: number,
  maxEnergy: number,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const ratio = clamp(energy / Math.max(1, maxEnergy), 0, 1);
  ctx.save();
  // 背景
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 4);
  ctx.fill();
  // 填充
  let barColor: string;
  let glowColor: string;
  if (ratio < 0.3) {
    barColor = "#666666";
    glowColor = "rgba(102,102,102,0.4)";
  } else if (ratio < 0.7) {
    barColor = "#5bc0ff";
    glowColor = "rgba(91,192,255,0.6)";
  } else {
    barColor = "#fff4a0";
    glowColor = "rgba(255,244,160,0.8)";
  }
  ctx.fillStyle = barColor;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.roundRect(x, y, width * ratio, height, 4);
  ctx.fill();
  ctx.shadowBlur = 0;
  // 外框
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 4);
  ctx.stroke();
  // 文字
  ctx.fillStyle = "#d7bde2";
  ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`刀势 ${Math.round(energy)}%`, x + width / 2, y + height / 2);
  ctx.restore();
}

/** 绘制生命条 */
export function drawHpBar(
  ctx: any,
  current: number,
  max: number,
  flashTimer: number,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const ratio = clamp(current / Math.max(1, max), 0, 1);
  const isFlashing = flashTimer > 0;
  ctx.save();
  // 背景
  ctx.fillStyle = "rgba(40, 18, 18, 0.8)";
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 4);
  ctx.fill();
  // 填充
  let barColor: string;
  if (ratio < 0.25) {
    barColor = "#ff4444";
  } else if (ratio < 0.5) {
    barColor = "#ff8c00";
  } else {
    barColor = "#4caf50";
  }
  if (isFlashing) {
    barColor = "#ffffff";
  }
  ctx.fillStyle = barColor;
  ctx.shadowColor = isFlashing ? "#ffffff" : barColor;
  ctx.shadowBlur = isFlashing ? 10 : 4;
  ctx.beginPath();
  ctx.roundRect(x, y, width * ratio, height, 4);
  ctx.fill();
  ctx.shadowBlur = 0;
  // 外框
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 4);
  ctx.stroke();
  // 文字
  ctx.fillStyle = "#ffffff";
  ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`HP ${Math.round(current)}/${max}`, x + width / 2, y + height / 2);
  ctx.restore();
}

/** 绘制护甲状态指示器 */
export function drawArmorIndicators(
  ctx: any,
  armorBrokenFlags: boolean[],
  x: number,
  y: number,
  activeIndex: number
): void {
  const names = ["左肩", "右肩", "胸甲"];
  ctx.save();
  for (let i = 0; i < armorBrokenFlags.length; i++) {
    const isBroken = armorBrokenFlags[i];
    const isActive = i === activeIndex && !isBroken;
    const bx = x + i * 70;
    ctx.fillStyle = isBroken ? "rgba(40,40,40,0.5)" : (isActive ? "rgba(240,225,48,0.3)" : "rgba(108,52,131,0.3)");
    ctx.strokeStyle = isBroken ? "#333" : (isActive ? "#f0e130" : "#8e44ad");
    ctx.lineWidth = isActive ? 2 : 1;
    if (isActive) {
      ctx.shadowColor = "#f0e130";
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.roundRect(bx, y, 60, 18, 4);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = isBroken ? "#555" : (isActive ? "#f0e130" : "#d7bde2");
    ctx.font = '10px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = isBroken ? "破碎" : names[i];
    ctx.fillText(label, bx + 30, y + 9);
  }
  ctx.restore();
}

/** 绘制浮动提示文字 */
export function drawFloatText(
  ctx: any,
  text: string,
  x: number,
  y: number,
  color: string,
  size: number,
  alpha: number
): void {
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillText(text, x, y);
  ctx.restore();
}