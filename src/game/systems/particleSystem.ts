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

export function paperBurst(origin: Vec2, amount: number, colors: string[]) {
  return Array.from({ length: amount }, () => makeParticle("paper", origin, colors[Math.floor(Math.random() * colors.length)], 115));
}

export function sparkBurst(origin: Vec2, amount: number, color = "#ffd67c") {
  return Array.from({ length: amount }, () => makeParticle("spark", origin, color, 155));
}

export function ringParticle(origin: Vec2, color: string, size: number): Particle {
  return {
    id: particleId(),
    kind: "ring",
    x: origin.x,
    y: origin.y,
    vx: 0,
    vy: 0,
    life: 0.45,
    maxLife: 0.45,
    size,
    color,
    rotation: 0,
    spin: 0
  };
}
