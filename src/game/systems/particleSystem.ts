import type { Particle, ParticleKind, Vec2 } from "../types";
import { randomRange } from "../../utils/math";

let particleCounter = 0;

function particleId() {
  particleCounter += 1;
  return `p_${particleCounter}`;
}

export function makeParticle(kind: ParticleKind, origin: Vec2, color: string, speed = 90): Particle {
  const angle = randomRange(0, Math.PI * 2);
  const velocity = randomRange(speed * 0.35, speed);
  const life = randomRange(0.35, 0.9);

  return {
    id: particleId(),
    kind,
    x: origin.x,
    y: origin.y,
    vx: Math.cos(angle) * velocity,
    vy: Math.sin(angle) * velocity - randomRange(10, 50),
    life,
    maxLife: life,
    size: randomRange(2.5, 7.5),
    color,
    rotation: randomRange(0, Math.PI * 2),
    spin: randomRange(-7, 7)
  };
}

export function paperBurst(origin: Vec2, amount: number, colors: string[], speedBoost = 0) {
  return Array.from({ length: amount }, () => makeParticle("paper", origin, colors[Math.floor(Math.random() * colors.length)], 115 + speedBoost));
}

export function sparkBurst(origin: Vec2, amount: number, color = "#ffd67c", speedBoost = 0) {
  return Array.from({ length: amount }, () => makeParticle("spark", origin, color, 155 + speedBoost));
}

export function ringParticle(origin: Vec2, color: string, size: number, life = 0.45): Particle {
  particleCounter += 1;
  return {
    id: `p_${particleCounter}`,
    kind: "ring",
    x: origin.x,
    y: origin.y,
    vx: 0,
    vy: 0,
    life,
    maxLife: life,
    size,
    color,
    rotation: 0,
    spin: 0
  };
}

/** 光晕粒子（smoke 类型：圆形渐变光圈） */
export function glowParticle(origin: Vec2, color: string, size: number, speed = 0): Particle {
  particleCounter += 1;
  const angle = randomRange(0, Math.PI * 2);
  const velocity = randomRange(0, speed);
  return {
    id: `p_${particleCounter}`,
    kind: "smoke",
    x: origin.x,
    y: origin.y,
    vx: Math.cos(angle) * velocity,
    vy: Math.sin(angle) * velocity - 10,
    life: 0.35,
    maxLife: 0.35,
    size,
    color,
    rotation: 0,
    spin: 0
  };
}

/** 混合爆发：纸片 + 火花 + 光晕 + 冲击波环 */
export function explosionBurst(origin: Vec2, tierPower: number, colors: string[], sparkColor = "#ffd67c"): Particle[] {
  const particles: Particle[] = [];
  const count = 18 + tierPower * 5;
  // 纸片
  for (let i = 0; i < count; i++) {
    const p = makeParticle("paper", origin, colors[Math.floor(Math.random() * colors.length)], 120 + tierPower * 6);
    p.size = randomRange(2.5, 7 + tierPower * 0.8);
    particles.push(p);
  }
  // 火花
  for (let i = 0; i < Math.floor(count * 0.4); i++) {
    particles.push(makeParticle("spark", origin, sparkColor, 160 + tierPower * 8));
  }
  // 光晕
  particles.push(glowParticle(origin, sparkColor, 30 + tierPower * 5));
  particles.push(glowParticle(origin, "#ffffff", 18 + tierPower * 3));
  // 冲击波双环
  particles.push(ringParticle(origin, sparkColor, 50 + tierPower * 10, 0.5));
  particles.push(ringParticle(origin, "#ffffff", 30 + tierPower * 8, 0.35));
  return particles;
}

/** 阵眼崩塌特效 */
export function coreCollapseBurst(origin: Vec2, radius: number, tierPower: number): Particle[] {
  const particles: Particle[] = [];
  const colors = ["#e8d7ff", "#5d4a8f", "#ead8a7", "#ffffff"];
  const count = 25 + tierPower * 8;
  for (let i = 0; i < count; i++) {
    const p = makeParticle("paper", origin, colors[Math.floor(Math.random() * colors.length)], 110 + tierPower * 10);
    p.size = randomRange(2, 8 + tierPower);
    particles.push(p);
  }
  for (let i = 0; i < 10; i++) {
    particles.push(makeParticle("spark", origin, "#e8d7ff", 170 + tierPower * 10));
  }
  // 大光晕
  particles.push(glowParticle(origin, "#e8d7ff", 50 + radius * 0.15, 20));
  particles.push(glowParticle(origin, "#ffffff", 25, 10));
  // 多环冲击波
  particles.push(ringParticle(origin, "#e8d7ff", radius * 0.6, 0.6));
  particles.push(ringParticle(origin, "#c8b0ff", radius * 0.8, 0.45));
  particles.push(ringParticle(origin, "#ffffff", radius * 0.3, 0.3));
  return particles;
}
