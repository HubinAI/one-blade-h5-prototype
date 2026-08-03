/**
 * 0807-11B-1: 碰撞链路根因诊断 — 确定性自动测试
 *
 * 测试目标：
 * 1. 构造穿过105HP目标圆心的刀路 → 断言完整碰撞链路
 * 2. 构造穿过火环弹幕圆心的刀路 → 断言销毁 + 击杀数不变
 * 3. segmentHitCircle 基础数学验证
 */
import { describe, it, expect, beforeEach } from "vitest";
import { segmentHitCircle } from "./collisionSystem";
import { createDefaultPlayerStats, computeRawDamage, resolveDamage, resolveThreatDamage, DAMAGE_SOURCE_REGISTRY, type DamageRequest } from "./damageSystem";

// ═══════════════════════════════════════════════════════
// 碰撞数学基础验证
// ═══════════════════════════════════════════════════════

describe("碰撞链路 - segmentHitCircle 基础", () => {
  it("水平线段穿过圆心 → 距离=0 → 命中", () => {
    const center = { x: 195, y: 600 };
    const a = { x: 50, y: 600 };  // 水平线
    const b = { x: 350, y: 600 };
    const radius = 50;
    expect(segmentHitCircle(a, b, center, radius)).toBe(true);
  });

  it("垂直线段穿过圆心 → 命中", () => {
    const center = { x: 195, y: 600 };
    const a = { x: 195, y: 400 };
    const b = { x: 195, y: 800 };
    const radius = 50;
    expect(segmentHitCircle(a, b, center, radius)).toBe(true);
  });

  it("斜线穿过圆心 → 命中", () => {
    const center = { x: 195, y: 600 };
    const a = { x: 50, y: 450 };
    const b = { x: 350, y: 750 };
    const radius = 50;
    expect(segmentHitCircle(a, b, center, radius)).toBe(true);
  });

  it("线段远离圆心 → 不命中", () => {
    const center = { x: 195, y: 600 };
    const a = { x: 50, y: 100 };
    const b = { x: 350, y: 100 };
    const radius = 50;
    expect(segmentHitCircle(a, b, center, radius)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════
// 105HP 测试目标确定性命中链路
// ═══════════════════════════════════════════════════════

describe("碰撞链路 - 105HP测试目标确定性命中", () => {
  it("刀路穿过圆心 → segmentHitCircle=true", () => {
    const target = { x: 195, y: 600, radius: 30 };
    const bladeReach = 10;
    const a = { x: 50, y: 600 };
    const b = { x: 350, y: 600 };
    expect(segmentHitCircle(a, b, target, target.radius + bladeReach + 12)).toBe(true);
  });

  it("低刀势100伤害 → 105HP目标 → 命中后剩余5HP", () => {
    const stats = createDefaultPlayerStats(100);
    stats.bladeDamageBonus = 0; // 低刀势
    const req: DamageRequest = {
      actionId: "t1", parentActionId: "s1",
      sourceType: "MAIN_SLASH",
      sourceConfig: DAMAGE_SOURCE_REGISTRY.MAIN_SLASH,
      attackerId: "player", targetId: "test_target",
      targetCategory: "ENEMY",
      skillCoefficient: 1.00,
      stats,
      bladeBand: "low",
      tags: ["main"], hitPos: { x: 195, y: 600 }, timestamp: 0,
    };
    const result = resolveDamage(req, 105, 105, true, false);
    expect(result).not.toBeNull();
    expect(result!.isAccepted).toBe(true);
    expect(result!.isKill).toBe(false);
    expect(result!.resolvedDamage).toBe(100);
    expect(result!.hpAfter).toBe(5);
  });

  it("中刀势110伤害 → 105HP目标 → 一���击杀", () => {
    const stats = createDefaultPlayerStats(100);
    stats.bladeDamageBonus = 0.10;
    const req: DamageRequest = {
      actionId: "t2", parentActionId: "s1",
      sourceType: "MAIN_SLASH",
      sourceConfig: DAMAGE_SOURCE_REGISTRY.MAIN_SLASH,
      attackerId: "player", targetId: "test_target",
      targetCategory: "ENEMY",
      skillCoefficient: 1.00,
      stats,
      bladeBand: "mid",
      tags: ["main"], hitPos: { x: 195, y: 600 }, timestamp: 0,
    };
    const result = resolveDamage(req, 105, 105, true, false);
    expect(result!.isKill).toBe(true);
    expect(result!.resolvedDamage).toBe(110);
  });
});

// ═══════════════════════════════════════════════════════
// 火环弹幕确定性命中链路
// ═══════════════════════════════════════════════════════

describe("碰撞链路 - 火环弹幕确定性命中", () => {
  it("刀路穿过火环圆心 → segmentHitCircle=true", () => {
    const fireRing = { x: 200, y: 400, r: 16 };
    const bladeReach = 10;
    const a = { x: 50, y: 400 };
    const b = { x: 350, y: 400 };
    expect(segmentHitCircle(a, b, { x: fireRing.x, y: fireRing.y }, fireRing.r + bladeReach + 6)).toBe(true);
  });

  it("低刀势100伤害 → 80HP火环 → 销毁，isDestroy=true, isKill=false", () => {
    const stats = createDefaultPlayerStats(100);
    const req: DamageRequest = {
      actionId: "fr1", parentActionId: "s1",
      sourceType: "MAIN_SLASH",
      sourceConfig: DAMAGE_SOURCE_REGISTRY.MAIN_SLASH,
      attackerId: "player", targetId: "fr_test",
      targetCategory: "THREAT",
      skillCoefficient: 1.00,
      stats,
      bladeBand: "low",
      tags: ["main"], hitPos: { x: 200, y: 400 }, timestamp: 0,
    };
    const result = resolveThreatDamage(req, 80, 80, true, false);
    expect(result!.isAccepted).toBe(true);
    expect(result!.isDestroy).toBe(true);
    expect(result!.isKill).toBe(false);
    expect(result!.resolvedDamage).toBe(100);
    expect(result!.hpAfter).toBe(0);
  });

  it("火环销毁不增加击杀数（不计入普通击杀）", () => {
    const stats = createDefaultPlayerStats(100);
    const req: DamageRequest = {
      actionId: "fr2", parentActionId: "s1",
      sourceType: "MAIN_SLASH",
      sourceConfig: DAMAGE_SOURCE_REGISTRY.MAIN_SLASH,
      attackerId: "player", targetId: "fr_test2",
      targetCategory: "THREAT",
      skillCoefficient: 1.00,
      stats,
      bladeBand: "low",
      tags: ["main"], hitPos: { x: 200, y: 400 }, timestamp: 0,
    };
    const result = resolveThreatDamage(req, 80, 80, true, false);
    expect(result!.isKill).toBe(false); // 威胁物不计普通击杀
    expect(result!.isDestroy).toBe(true);
  });
});
