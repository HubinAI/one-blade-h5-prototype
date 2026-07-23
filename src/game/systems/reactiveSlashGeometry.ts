// ========================================================================
// P4.4B-R4 P0-A: Reactive 真实刀体几何统一模块
// ------------------------------------------------------------------------
// 审计文档 §5："建立唯一的真实刀体几何"。
// 玩家看到的是"发光刀身击中了护甲"，但旧代码只检测"手指采样点细线"是否穿过护甲中心。
// 本模块构建统一几何对象，让渲染和碰撞共用同一套：
//   1. baseA → baseB：手指真实轨迹
//   2. baseB → tipB：当前帧可见刀身（从手指点沿挥刀方向延伸 visualLength）
//   3. tipA → tipB：刀尖随手势移动形成的扫掠区域
// 每个胶囊半径 = reactiveBladeEffect.width / 2 + 移动端容差(8~12px)。
// 只要任意胶囊与护甲椭圆相交，即视为视觉刀体命中。
// ========================================================================
import type { Vec2, ProjectileKind } from "../types";
import { distanceToSegment } from "../../utils/math";

/** P4.4B-R5.1 P1-6: 胶囊来源标识（用于 Debug 和碰撞来源追踪） */
export type CapsuleSource = "baseTrail" | "visibleBlade" | "tipSweep";

export type Capsule = {
  a: Vec2;
  b: Vec2;
  radius: number;
  /** P4.4B-R5.1: 胶囊来源（手指轨迹/可见刀身/刀尖扫掠区） */
  source: CapsuleSource;
};

export type ReactiveSlashGeometry = {
  slashId: string;
  /** 上一手指采样点 */
  baseA: Vec2;
  /** 当前手指采样点 */
  baseB: Vec2;
  /** 当前帧刀尖（baseB + direction * visualLength） */
  tipB: Vec2;
  /** 上一帧刀尖（baseA + direction * visualLength） */
  tipA: Vec2;
  /** 刀身宽度（来自 reactiveBladeEffect.width） */
  width: number;
  /** 可见刀身长度（来自 reactiveBladeEffect.visualLength） */
  visualLength: number;
  /** 起刀锁定的刀势能量 */
  lockedEnergy: number;
  /** 有效碰撞线段：从 baseA 到 tipB（手指轨迹 + 可见刀身合并） */
  effectiveSegA: Vec2;
  effectiveSegB: Vec2;
  /** 有效碰撞半径（刀身宽度/2 + 移动端容差） */
  effectiveRadius: number;
  /** 三个胶囊体（用于精确碰撞检测） */
  capsules: Capsule[];
};

/**
 * 构建 Reactive 挥刀的真实刀体几何。
 * @param baseA 上一手指采样点
 * @param baseB 当前手指采样点
 * @param directionAngle 挥刀方向（弧度，来自 lastSlashAngle）
 * @param visualLength 可见刀身长度（reactiveBladeEffect.visualLength）
 * @param width 刀身宽度（reactiveBladeEffect.width）
 * @param slashId 挥刀 ID
 * @param lockedEnergy 起刀锁定的刀势能量
 */
export function buildReactiveSlashGeometry(
  baseA: Vec2,
  baseB: Vec2,
  directionAngle: number,
  visualLength: number,
  width: number,
  slashId: string,
  lockedEnergy: number,
): ReactiveSlashGeometry {
  const dx = Math.cos(directionAngle);
  const dy = Math.sin(directionAngle);
  // 当前帧刀尖：从当前手指点沿挥刀方向延伸 visualLength
  const tipB = {
    x: baseB.x + dx * visualLength,
    y: baseB.y + dy * visualLength,
  };
  // 上一帧刀尖：从上一手指点沿挥刀方向延伸 visualLength
  const tipA = {
    x: baseA.x + dx * visualLength,
    y: baseA.y + dy * visualLength,
  };
  // 移动端容差 8~12px，取 10
  const touchTolerance = 10;
  const capsuleRadius = width / 2 + touchTolerance;

  return {
    slashId,
    baseA,
    baseB,
    tipB,
    tipA,
    width,
    visualLength,
    lockedEnergy,
    // 有效碰撞线段：从上一手指点到当前刀尖（覆盖手指轨迹 + 可见刀身）
    effectiveSegA: baseA,
    effectiveSegB: tipB,
    effectiveRadius: capsuleRadius,
    capsules: [
      // 1. 手指真实轨迹
      { a: baseA, b: baseB, radius: capsuleRadius, source: "baseTrail" as const },
      // 2. 当前帧可见刀身（手指点 → 刀尖）
      { a: baseB, b: tipB, radius: capsuleRadius, source: "visibleBlade" as const },
      // 3. 刀尖扫掠区（上一帧刀尖 → 当前帧刀尖）
      { a: tipA, b: tipB, radius: capsuleRadius, source: "tipSweep" as const },
    ],
  };
}

/**
 * 胶囊（线段+半径）与椭圆相交检测。
 * 将椭圆变换为单位圆，胶囊相应缩放，检测线段到原点的距离 <= 1 + 缩放后半径。
 * @param segA 线段起点
 * @param segB 线段终点
 * @param radius 胶囊半径
 * @param center 椭圆中心
 * @param rx 椭圆水平半径
 * @param ry 椭圆垂直半径
 */
export function capsuleHitsEllipse(
  segA: Vec2,
  segB: Vec2,
  radius: number,
  center: Vec2,
  rx: number,
  ry: number,
): boolean {
  const safeRx = Math.max(1, rx);
  const safeRy = Math.max(1, ry);
  const scaleX = 1 / safeRx;
  const scaleY = 1 / safeRy;
  // 归一化到单位圆空间
  const a = { x: (segA.x - center.x) * scaleX, y: (segA.y - center.y) * scaleY };
  const b = { x: (segB.x - center.x) * scaleX, y: (segB.y - center.y) * scaleY };
  // 胶囊半径在归一化空间下各向异性，取较大值保守估计
  const r = Math.max(radius * scaleX, radius * scaleY);
  return distanceToSegment({ x: 0, y: 0 }, a, b) <= 1 + r;
}

/**
 * 检测整个刀体几何是否命中护甲椭圆。
 * 只要有任意一个胶囊命中，即视为命中。
 */
export function geometryHitsArmor(
  geometry: ReactiveSlashGeometry,
  center: Vec2,
  rx: number,
  ry: number,
): boolean {
  for (const cap of geometry.capsules) {
    if (capsuleHitsEllipse(cap.a, cap.b, cap.radius, center, rx, ry)) return true;
  }
  return false;
}

/**
 * Debug 绘制真实刀体几何（用于 ?debug=1 验收）。
 * - 红色虚线：手指真实轨迹（baseA → baseB）
 * - 蓝色半透明区：真实可命中刀体（3个胶囊）
 * - 绿色圆点：刀尖位置（tipB）
 */
export function drawReactiveSlashDebug(
  ctx: CanvasRenderingContext2D,
  geometry: ReactiveSlashGeometry,
): void {
  ctx.save();
  // 1. 红色虚线：手指真实轨迹
  ctx.strokeStyle = "rgba(255, 50, 50, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(geometry.baseA.x, geometry.baseA.y);
  ctx.lineTo(geometry.baseB.x, geometry.baseB.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. 蓝色半透明区：3个胶囊
  ctx.fillStyle = "rgba(91, 192, 255, 0.18)";
  ctx.strokeStyle = "rgba(91, 192, 255, 0.6)";
  ctx.lineWidth = 1;
  for (const cap of geometry.capsules) {
    drawCapsule(ctx, cap);
  }

  // 3. 绿色圆点：刀尖位置
  ctx.fillStyle = "rgba(50, 255, 100, 0.9)";
  ctx.beginPath();
  ctx.arc(geometry.tipB.x, geometry.tipB.y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 绘制单个胶囊（两端半圆 + 中间矩形） */
function drawCapsule(ctx: CanvasRenderingContext2D, cap: Capsule): void {
  const dx = cap.b.x - cap.a.x;
  const dy = cap.b.y - cap.a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.01) {
    // 退化为圆
    ctx.beginPath();
    ctx.arc(cap.a.x, cap.a.y, cap.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return;
  }
  const angle = Math.atan2(dy, dx);
  ctx.save();
  ctx.translate(cap.a.x, cap.a.y);
  ctx.rotate(angle);
  // 矩形主体
  ctx.beginPath();
  ctx.rect(0, -cap.radius, len, cap.radius * 2);
  ctx.fill();
  ctx.stroke();
  // 两端半圆
  ctx.beginPath();
  ctx.arc(0, 0, cap.radius, Math.PI / 2, Math.PI * 1.5);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(len, 0, cap.radius, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
