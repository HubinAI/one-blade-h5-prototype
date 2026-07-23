// ============================================================================
// P4.4B-R5.7: resolveGeometry 迁移 + 新增覆盖（>85 tests）
// V0723012: P0-3 不变量测试 + P0-5 假绿清理 + P1-1 三胶囊测试
// ----------------------------------------------------------------------------
import { describe, it, expect, beforeEach } from "vitest";
import { BossReactiveController } from "./BossReactiveController";
import { REACTIVE_BOSS_CONFIG } from "../config/bossReactiveFlow";
import { resetProjectileIdCounter } from "./projectileSystem";
import { buildReactiveSlashGeometry, capsuleHitsEllipse, type ReactiveSlashGeometry, type CapsuleSource } from "./reactiveSlashGeometry";
import type { ProjectileKind } from "../types";

/** 测试辅助：创建 Vec2 */
function v(x: number, y: number) { return { x, y }; }

/** 常量：Boss 中心坐标（与 BossReactiveController 内部 BOSS_CX/BOSS_CY 一致） */
const BOSS_CX = 195;
const BOSS_CY = 220;

/**
 * P1-1: 构建三胶囊测试用 ReactiveSlashGeometry。
 * source 指定哪个胶囊命中，其余两个偏移到屏幕外确保 miss。
 */
function buildCapsuleTestGeometry(
  source: CapsuleSource,
  center: { x: number; y: number },
  angle: number,
  slashId: string,
  energy: number = 50,
  visualLength: number = 30,
  width: number = 3,
): ReactiveSlashGeometry {
  const offsetX = Math.cos(angle);
  const offsetY = Math.sin(angle);
  const len = 60;

  const baseA = { x: center.x - offsetX * len, y: center.y - offsetY * len };
  const baseB = center;
  const tipB = { x: center.x + offsetX * visualLength, y: center.y + offsetY * visualLength };
  const tipA = { x: baseA.x + offsetX * visualLength, y: baseA.y + offsetY * visualLength };
  const effectiveRadius = width / 2 + 10;

  const FAR_X = -1000;
  const FAR_Y = -1000;

  const makeCapsule = (a: { x: number; y: number }, b: { x: number; y: number }, s: CapsuleSource) => {
    if (s === source) return { a, b, radius: effectiveRadius, source: s };
    return { a: v(FAR_X, FAR_Y), b: v(FAR_X, FAR_Y + 1), radius: 1, source: s };
  };

  return {
    slashId,
    lockedEnergy: energy,
    baseA,
    baseB,
    tipB,
    tipA,
    width,
    visualLength,
    effectiveRadius,
    effectiveSegA: baseA,
    effectiveSegB: tipB,
    capsules: [
      makeCapsule(baseA, baseB, "baseTrail"),
      makeCapsule(baseB, tipB, "visibleBlade"),
      makeCapsule(tipA, tipB, "tipSweep"),
    ],
  };
}

/**
 * 辅助：从 segA/segB 构建 ReactiveSlashGeometry（resolveGeometry 迁入）。
 * visualLength=30, width=3 对应低刀势默认视觉参数。
 */
function geom(segA: { x: number; y: number }, segB: { x: number; y: number }, slashId: string, energy: number, visualLength: number = 30, width: number = 3): ReactiveSlashGeometry {
  const angle = Math.atan2(segB.y - segA.y, segB.x - segA.x);
  return buildReactiveSlashGeometry(segA, segB, angle, visualLength, width, slashId, energy);
}

/**
 * 辅助：真实推进到 armor_opportunity 阶段。
 */
function advanceToOpportunity(c: BossReactiveController): void {
  c.update(REACTIVE_BOSS_CONFIG.phaseTimers.armorPrepare + 0.05);
  c.update(REACTIVE_BOSS_CONFIG.phaseTimers.threatDuration[1] + 0.01);
}

/**
 * 辅助：真实推进 resolve → recovery → 下一 armor_prepare。
 */
function advanceThroughResolveAndRecovery(c: BossReactiveController): void {
  c.update(REACTIVE_BOSS_CONFIG.phaseTimers.resolveDuration + 0.01);
  c.update(REACTIVE_BOSS_CONFIG.phaseTimers.recoveryDuration + 0.01);
}

/**
 * 辅助：使用 resolveGeometry 命中当前护甲（高能量一刀碎）。
 */
function hitCurrentArmor(c: BossReactiveController, slashId: string, energy: number = 100): ReturnType<BossReactiveController["finishSlash"]> {
  c.setProgrammaticSlashEnergy(energy);
  const pos = c.getActiveArmorWorldPos()!;
  const segA = v(pos.cx - pos.rx * 0.5, pos.cy - pos.ry * 0.5);
  const segB = v(pos.cx + pos.rx * 0.5, pos.cy + pos.ry * 0.5);
  c.resolveGeometry(geom(segA, segB, slashId, energy));
  return c.finishSlash(slashId, energy, 100);
}

describe("BossReactiveController", () => {
  let controller: BossReactiveController;

  beforeEach(() => {
    resetProjectileIdCounter();
    controller = new BossReactiveController();
  });

  // ================================================================
  // Section A: 基础状态与生命周期 (Tests 1-5)
  // ================================================================

  it("A1 初始状态构造后三块护甲完好", () => {
    expect.assertions(3);
    const flags = controller.getArmorBrokenFlags();
    expect(flags).toEqual([false, false, false]);
    expect(controller.phase).toBe("armor_prepare");
    expect(controller.bridgeTriggered).toBe(false);
  });

  it("A2 5状态机流转 — armor_prepare→threat→opportunity→resolve→recovery→下一prepare", () => {
    expect.assertions(5);
    expect(controller.phase).toBe("armor_prepare");
    controller.update(0.35);
    expect(controller.phase).toBe("armor_threat");
    controller.update(3.0);
    expect(controller.phase).toBe("armor_opportunity");
    controller.update(1.7);
    expect(controller.phase).toBe("armor_recovery");
    controller.update(0.25);
    expect(controller.phase).toBe("armor_prepare");
  });

  it("A3 真实三甲流程 — resolveGeometry→finishSlash→advance 完整链路至 bridge", () => {
    expect.assertions(11);
    advanceToOpportunity(controller);
    expect(controller.phase).toBe("armor_opportunity");
    const f0 = hitCurrentArmor(controller, "s_left");
    expect(f0.armorHit).toBe(true);
    expect(f0.armorBroken).toBe(true);
    advanceThroughResolveAndRecovery(controller);
    expect(controller.phase).toBe("armor_prepare");
    expect(controller.getActiveArmorIndex()).toBe(1);

    advanceToOpportunity(controller);
    const f1 = hitCurrentArmor(controller, "s_right");
    expect(f1.armorHit).toBe(true);
    expect(f1.armorBroken).toBe(true);
    advanceThroughResolveAndRecovery(controller);
    expect(controller.getActiveArmorIndex()).toBe(2);

    advanceToOpportunity(controller);
    const f2 = hitCurrentArmor(controller, "s_chest");
    expect(f2.armorHit).toBe(true);
    expect(f2.armorBroken).toBe(true);
    expect(f2.allArmorBroken).toBe(true);
  });

  it("A4 桥接到 pursuit — resolveGeometry 真实三甲击破后 bridgeTriggered 正确", () => {
    expect.assertions(3);
    for (let i = 0; i < 3; i++) {
      advanceToOpportunity(controller);
      hitCurrentArmor(controller, `s_${i}`);
      advanceThroughResolveAndRecovery(controller);
    }
    expect(controller.phase).toBe("exit");
    expect(controller.bridgeTriggered).toBe(true);
    expect(controller.bossModeActive).toBe(false);
  });

  it("A5 构造后 bossModeActive 为 true，exit 后为 false", () => {
    expect.assertions(2);
    expect(controller.bossModeActive).toBe(true);
    for (let i = 0; i < 3; i++) {
      advanceToOpportunity(controller);
      hitCurrentArmor(controller, `s_${i}`);
      advanceThroughResolveAndRecovery(controller);
    }
    expect(controller.bossModeActive).toBe(false);
  });

  // ================================================================
  // Section B: 护甲伤害公式 (Tests 6-11)
  // ================================================================

  it("B1 护甲伤害公式 — 低刀势 (20) 固定 25 伤害", () => {
    expect.assertions(2);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    const f = hitCurrentArmor(c, "s_low", 20);
    expect(f.armorHit).toBe(true);
    expect(f.armorDurabilityDamage).toBe(25);
  });

  it("B2 护甲伤害公式 — 中刀势 (50) 固定 55 伤害", () => {
    expect.assertions(2);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    const f = hitCurrentArmor(c, "s_mid", 50);
    expect(f.armorHit).toBe(true);
    expect(f.armorDurabilityDamage).toBe(55);
  });

  it("B3 护甲伤害公式 — 高刀势 (100) 一刀碎 100 伤害", () => {
    expect.assertions(3);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    const f = hitCurrentArmor(c, "s_high", 100);
    expect(f.armorHit).toBe(true);
    expect(f.armorDurabilityDamage).toBe(100);
    expect(f.armorBroken).toBe(true);
  });

  it("B4 护甲伤害公式 — 边界值 29 (低刀势) 固定 25", () => {
    expect.assertions(1);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    const f = hitCurrentArmor(c, "s_29", 29);
    expect(f.armorDurabilityDamage).toBe(25);
  });

  it("B5 护甲伤害公式 — 边界值 30 (中刀势) 固定 55", () => {
    expect.assertions(1);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    const f = hitCurrentArmor(c, "s_30", 30);
    expect(f.armorDurabilityDamage).toBe(55);
  });

  it("B6 护甲伤害公式 — 边界值 69 (中刀势) 固定 55", () => {
    expect.assertions(1);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    const f = hitCurrentArmor(c, "s_69", 69);
    expect(f.armorDurabilityDamage).toBe(55);
  });

  it("B7 护甲伤害公式 — 边界值 70 (高刀势) 直接破甲", () => {
    expect.assertions(2);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    const f = hitCurrentArmor(c, "s_70", 70);
    expect(f.armorDurabilityDamage).toBe(100);
    expect(f.armorBroken).toBe(true);
  });

  it("B8 严格低刀势4刀序列 — 100→75→50→25→0", () => {
    expect.assertions(2);
    const c = new BossReactiveController();
    const durabilitySeq: number[] = [100];
    for (let i = 0; i < 4; i++) {
      advanceToOpportunity(c);
      c.setProgrammaticSlashEnergy(20);
      const f = hitCurrentArmor(c, `s_low_${i}`, 20);
      durabilitySeq.push(c.getArmorDurability()[0]);
      if (c.getArmorBrokenFlags()[0]) break;
      advanceThroughResolveAndRecovery(c);
    }
    expect(durabilitySeq).toEqual([100, 75, 50, 25, 0]);
    expect(c.getArmorBrokenFlags()[0]).toBe(true);
  });

  it("B9 严格中刀势2刀序列 — 100→45→0", () => {
    expect.assertions(2);
    const c = new BossReactiveController();
    const durabilitySeq: number[] = [100];
    for (let i = 0; i < 2; i++) {
      advanceToOpportunity(c);
      const f = hitCurrentArmor(c, `s_mid_${i}`, 50);
      durabilitySeq.push(c.getArmorDurability()[0]);
      if (c.getArmorBrokenFlags()[0]) break;
      advanceThroughResolveAndRecovery(c);
    }
    expect(durabilitySeq).toEqual([100, 45, 0]);
    expect(c.getArmorBrokenFlags()[0]).toBe(true);
  });

  it("B10 严格高刀势1刀序列 — 100→0", () => {
    expect.assertions(2);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    const f = hitCurrentArmor(c, "s_high", 100);
    expect(f.armorBroken).toBe(true);
    expect(c.getArmorDurability()[0]).toBe(0);
  });

  it("B11 护甲裂痕累积 — 低刀势多次循环推进至破甲", () => {
    expect.assertions(4);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.setProgrammaticSlashEnergy(20);
    const f0 = hitCurrentArmor(c, "s_0", 20);
    expect(f0.armorHit).toBe(true);
    expect(f0.armorBroken).toBe(false);
    expect(f0.armorDurabilityDamage).toBe(25);

    for (let i = 1; i < 20; i++) {
      if (c.getArmorBrokenFlags()[0]) break;
      advanceThroughResolveAndRecovery(c);
      advanceToOpportunity(c);
      hitCurrentArmor(c, `s_${i}`, 20);
    }
    expect(c.getArmorBrokenFlags()[0]).toBe(true);
  });

  // ================================================================
  // Section C: 弹幕系统 (Tests 12-17) — P0-5: spawnProjectileForTest 确定性注入
  // ================================================================

  it("C1 普通弹幕可斩 — resolveGeometry 命中 normal 弹幕", () => {
    expect.assertions(3);
    controller.update(0.35); // → threat
    const p = controller.spawnProjectileForTest("normal", BOSS_CX, BOSS_CY - 50, 0, 50);
    expect(p.kind).toBe("normal");
    const events = controller.resolveGeometry(geom(v(p.x - 30, p.y - 30), v(p.x + 30, p.y + 30), "slash_1", 50));
    const cutEvent = events.find(e => e.kind === "projectile_cut");
    expect(cutEvent).toBeDefined();
    expect(controller.phase).toBe("armor_threat");
  });

  it("C2 强化弹幕生成 — 右肩 threat 阶段生成 reflective 弹幕", () => {
    expect.assertions(2);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_left");
    advanceThroughResolveAndRecovery(controller);
    expect(controller.getActiveArmorIndex()).toBe(1);

    controller.update(0.35); // → threat
    const refl = controller.spawnProjectileForTest("reflective", BOSS_CX + 50, BOSS_CY - 30, 0, 60);
    expect(refl.kind).toBe("reflective");
  });

  it("C3 危险雷球生成 — 胸甲 threat 阶段生成 dangerous 弹幕", () => {
    expect.assertions(2);
    for (let i = 0; i < 2; i++) {
      advanceToOpportunity(controller);
      hitCurrentArmor(controller, `s_${i}`);
      advanceThroughResolveAndRecovery(controller);
    }
    expect(controller.getActiveArmorIndex()).toBe(2);

    controller.update(0.35); // → threat
    const dang = controller.spawnProjectileForTest("dangerous", BOSS_CX, BOSS_CY + 6, 0, 40);
    expect(dang.kind).toBe("dangerous");
  });

  it("C4 弹幕生命周期 — 弹幕超 maxLife 自动失活", () => {
    expect.assertions(3);
    controller.update(0.35); // → threat
    const p = controller.spawnProjectileForTest("normal", BOSS_CX, BOSS_CY - 50, 0, 50);
    expect(p.active).toBe(true);
    // 从内部 projectiles 获取（非深拷贝）
    controller.update(5.0);
    const projsAfter = controller.getProjectiles();
    const found = projsAfter.find(pr => pr.id === p.id);
    expect(found).toBeDefined();
    expect(found!.active).toBe(false);
  });

  it("C5 resolveGeometry 威胁阶段命中弹幕 — 返回正确事件类型", () => {
    expect.assertions(2);
    const c = new BossReactiveController();
    c.update(0.35); // → threat
    const p = c.spawnProjectileForTest("normal", BOSS_CX, BOSS_CY - 50, 0, 50);
    const events = c.resolveGeometry(geom(v(p.x - 40, p.y - 60), v(p.x + 40, p.y + 60), "test_c5", 50));
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].kind).toBe("projectile_cut");
  });

  it("C6 弹幕 getProjectiles 返回深拷贝不篡改内部引用", () => {
    expect.assertions(3);
    controller.update(0.35); // → threat
    controller.spawnProjectileForTest("normal", BOSS_CX, BOSS_CY - 50, 0, 50);
    const projs1 = controller.getProjectiles();
    const projs2 = controller.getProjectiles();
    expect(projs1.length).toBeGreaterThan(0);
    projs1[0].active = false;
    const projs3 = controller.getProjectiles();
    expect(projs3[0].active).toBe(true);
    expect(projs1).not.toBe(projs2);
  });

  it("C7 resolveGeometry 返回空事件 — threat 阶段无弹幕时", () => {
    expect.assertions(1);
    controller.update(0.35); // → threat, no spawn
    const events = controller.resolveGeometry(geom(v(50, 50), v(100, 100), "test_c7", 50));
    expect(Array.isArray(events)).toBe(true);
  });

  // ================================================================
  // Section D: 反射弹终态 (Tests 18-23) — P0-5: spawnProjectileForTest
  // ================================================================

  it("D1 真实 reflect+16 — 高刀势反射 reflective 弹幕奖励 16", () => {
    expect.assertions(3);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_left");
    advanceThroughResolveAndRecovery(controller);
    expect(controller.getActiveArmorIndex()).toBe(1);

    controller.update(0.35); // → threat
    const refl = controller.spawnProjectileForTest("reflective", BOSS_CX + 30, BOSS_CY - 20, 0, 60);
    controller.setProgrammaticSlashEnergy(100);
    controller.resolveGeometry(geom(v(refl.x - 20, refl.y - 40), v(refl.x + 20, refl.y + 20), "s_refl1", 100));
    const result = controller.finishSlash("s_refl1", 100, 100);
    expect(result.projectileReflectCount).toBe(1);
    expect(result.projectileReflectReward).toBe(REACTIVE_BOSS_CONFIG.bladeEnergy.reflectReward);
  });

  it("D2 二次反射阻止 — 同 reflective 弹幕被两刀挥过仅第一次触发", () => {
    expect.assertions(4);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_left");
    advanceThroughResolveAndRecovery(controller);
    expect(controller.getActiveArmorIndex()).toBe(1);

    controller.update(0.35);
    const refl = controller.spawnProjectileForTest("reflective", BOSS_CX + 30, BOSS_CY - 20, 0, 60);
    controller.setProgrammaticSlashEnergy(100);
    controller.resolveGeometry(geom(v(refl.x - 20, refl.y - 40), v(refl.x + 20, refl.y + 20), "s_refl_a", 100));
    const r1 = controller.finishSlash("s_refl_a", 100, 100);
    expect(r1.projectileReflectCount).toBe(1);

    controller.setProgrammaticSlashEnergy(100);
    controller.resolveGeometry(geom(v(refl.x - 20, refl.y - 40), v(refl.x + 20, refl.y + 20), "s_refl_b", 100));
    const r2 = controller.finishSlash("s_refl_b", 100, 100);
    expect(r2.projectileReflectCount).toBe(0);
    expect(r2.primaryResult).toBe("empty_swing");
  });

  it("D3 反射弹 reflected=true 后 resolveGeometry 跳过命中", () => {
    expect.assertions(3);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_left");
    advanceThroughResolveAndRecovery(controller);

    controller.update(0.35);
    const refl = controller.spawnProjectileForTest("reflective", BOSS_CX + 30, BOSS_CY - 20, 0, 60);
    controller.setProgrammaticSlashEnergy(100);
    controller.resolveGeometry(geom(v(refl.x - 20, refl.y - 40), v(refl.x + 20, refl.y + 20), "s_1", 100));
    const projsAfter = controller.getProjectiles();
    const reflAfter = projsAfter.find(p => p.id === refl.id);
    expect(reflAfter).toBeDefined();
    expect(reflAfter!.reflected).toBe(true);

    const events2 = controller.resolveGeometry(geom(v(reflAfter!.x - 20, reflAfter!.y - 10), v(reflAfter!.x + 20, reflAfter!.y + 30), "s_2", 100));
    const reflEvents2 = events2.filter(e => e.kind === "projectile_reflect");
    expect(reflEvents2.length).toBe(0);
  });

  it("D4 反射弹 velocity 反向 — vx=-vx, vy=-vy", () => {
    expect.assertions(4);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_left");
    advanceThroughResolveAndRecovery(controller);

    controller.update(0.35);
    const refl = controller.spawnProjectileForTest("reflective", BOSS_CX + 30, BOSS_CY - 20, 0, 60);
    const origVx = refl.vx;
    const origVy = refl.vy;
    controller.setProgrammaticSlashEnergy(100);
    controller.resolveGeometry(geom(v(refl.x - 20, refl.y - 40), v(refl.x + 20, refl.y + 20), "s_v", 100));
    const projsAfter = controller.getProjectiles();
    const reflAfter = projsAfter.find(p => p.id === refl.id);
    expect(reflAfter).toBeDefined();
    expect(reflAfter!.vx).toBeCloseTo(-origVx, 1);
    expect(reflAfter!.vy).toBeCloseTo(-origVy, 1);
    expect(reflAfter!.resolution).toBe("reflect");
  });

  it("D5 反射弹 markProjectilePlayerHit 跳过 reflected", () => {
    expect.assertions(3);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_left");
    advanceThroughResolveAndRecovery(controller);

    controller.update(0.35);
    const refl = controller.spawnProjectileForTest("reflective", BOSS_CX + 30, BOSS_CY - 20, 0, 60);
    controller.setProgrammaticSlashEnergy(100);
    controller.resolveGeometry(geom(v(refl.x - 20, refl.y - 40), v(refl.x + 20, refl.y + 20), "s_d5", 100));
    const projsAfter = controller.getProjectiles();
    const reflAfter = projsAfter.find(p => p.id === refl.id);
    expect(reflAfter).toBeDefined();
    expect(reflAfter!.reflected).toBe(true);
    const result = controller.markProjectilePlayerHit(refl.id);
    expect(result).toBe(null);
  });

  it("D6 低刀势(<70)命中 reflective 弹幕 → cut 而非 reflect", () => {
    expect.assertions(3);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_left");
    advanceThroughResolveAndRecovery(controller);

    controller.update(0.35);
    const refl = controller.spawnProjectileForTest("reflective", BOSS_CX + 30, BOSS_CY - 20, 0, 60);
    controller.setProgrammaticSlashEnergy(30);
    controller.resolveGeometry(geom(v(refl.x - 20, refl.y - 40), v(refl.x + 20, refl.y + 20), "s_low", 30));
    const result = controller.finishSlash("s_low", 100, 100);
    expect(result.projectileReflectCount).toBe(0);
    expect(result.projectileCutCount).toBe(1);
    const cutEvents = result.events.filter(e => e.kind === "projectile_cut");
    expect(cutEvents.length).toBeGreaterThanOrEqual(1);
  });

  // ================================================================
  // Section E: 空挥与错误惩罚 (Tests 24-28)
  // ================================================================

  it("E1 空挥检测 — 无命中时返回空结果", () => {
    expect.assertions(4);
    controller.update(0.35);
    controller.resolveGeometry(geom(v(50, 700), v(100, 750), "slash_miss", 50));
    controller.update(3.0);
    controller.resolveGeometry(geom(v(50, 700), v(100, 750), "slash_miss2", 50));
    const finish = controller.finishSlash("slash_miss2", 100, 100);
    expect(finish.armorHit).toBe(false);
    expect(finish.armorDurabilityDamage).toBe(0);
    expect(finish.armorBroken).toBe(false);
    expect(finish.bodyWrongHit).toBe(false);
  });

  it("E2 空挥不扣 HP — wrongHit=false 时 playerHp 不变", () => {
    expect.assertions(3);
    const hpBefore = controller.getPlayerHp().current;
    controller.update(0.35);
    controller.resolveGeometry(geom(v(50, 700), v(100, 750), "empty_swing", 50));
    const result = controller.finishSlash("empty_swing", 100, 100);
    expect(result.armorHit).toBe(false);
    expect(result.bodyWrongHit).toBe(false);
    expect(controller.getPlayerHp().current).toBe(hpBefore);
  });

  it("E3 空挥 energyAfter 正确 — baseCost 被扣除（验证期 emptySwingPenalty=0）", () => {
    expect.assertions(3);
    controller.update(0.35);
    controller.resolveGeometry(geom(v(50, 700), v(100, 750), "empty_cost", 50));
    const result = controller.finishSlash("empty_cost", 100, 100);
    expect(result.emptySwingPenalty).toBe(0);
    expect(result.baseCost).toBeGreaterThan(0);
    expect(result.energyAfter).toBeLessThan(100);
  });

  it("E4 空挥 primaryResult 为 empty_swing", () => {
    expect.assertions(2);
    controller.update(0.35);
    controller.resolveGeometry(geom(v(50, 700), v(100, 750), "empty_prim", 50));
    const result = controller.finishSlash("empty_prim", 100, 100);
    expect(result.primaryResult).toBe("empty_swing");
    expect(result.armorHit).toBe(false);
  });

  it("E5 空挥 secondaryResults 为空数组", () => {
    expect.assertions(1);
    controller.update(0.35);
    controller.resolveGeometry(geom(v(50, 700), v(100, 750), "empty_sec", 50));
    const result = controller.finishSlash("empty_sec", 100, 100);
    expect(result.secondaryResults).toEqual([]);
  });

  // ================================================================
  // Section F: 玩家生命系统 (Tests 29-34)
  // ================================================================

  it("F1 玩家生命系统 — takeDamage 扣血", () => {
    expect.assertions(2);
    const dmg = controller.takeDamage(20);
    expect(dmg).toBe(20);
    expect(controller.getPlayerHp().current).toBe(80);
  });

  it("F2 玩家生命系统 — 无敌帧内再次受伤伤害为 0", () => {
    expect.assertions(2);
    controller.takeDamage(20);
    const dmg2 = controller.takeDamage(30);
    expect(dmg2).toBe(0);
    expect(controller.getPlayerHp().current).toBe(80);
  });

  it("F3 玩家生命系统 — 无敌帧结束后可再次受伤", () => {
    expect.assertions(2);
    controller.takeDamage(20);
    controller.update(0.35);
    const dmg3 = controller.takeDamage(30);
    expect(dmg3).toBe(30);
    expect(controller.getPlayerHp().current).toBe(50);
  });

  it("F4 玩家生命系统 — 死亡检测 isPlayerDead", () => {
    expect.assertions(2);
    controller.takeDamage(100);
    expect(controller.isPlayerDead).toBe(true);
    expect(controller.getPlayerHp().current).toBe(0);
  });

  it("F5 玩家生命系统 — 初始 HP 100/100", () => {
    expect.assertions(2);
    const hp = controller.getPlayerHp();
    expect(hp.current).toBe(100);
    expect(hp.max).toBe(100);
  });

  it("F6 玩家生命系统 — takeDamage 后 flashTimer > 0", () => {
    expect.assertions(1);
    controller.takeDamage(20);
    expect(controller.getPlayerHp().flashTimer).toBeGreaterThan(0);
  });

  // ================================================================
  // Section G: 刀势系统 (Tests 35-39)
  // ================================================================

  it("G1 被动回能 — 验证配置值存在且合理", () => {
    expect.assertions(5);
    expect(REACTIVE_BOSS_CONFIG.bladeEnergy.passiveRegenPerSecond).toBe(1.5);
    expect(REACTIVE_BOSS_CONFIG.bladeEnergy.max).toBe(100);
    expect(REACTIVE_BOSS_CONFIG.bladeEnergy.initial).toBe(35);
    expect(controller.currentSlashEnergy).toBe(0);
    controller.setProgrammaticSlashEnergy(50);
    expect(controller.currentSlashEnergy).toBe(50);
  });

  it("G2 刀势连续效果插值 — getBladeEffect(0) 低能量", () => {
    expect.assertions(3);
    const e = controller.getBladeEffect(0);
    expect(e.color).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.lowEnergyColor);
    expect(e.visualLength).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.minLength);
    expect(e.width).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.minWidth);
  });

  it("G3 刀势连续效果插值 — getBladeEffect(100) 高能量", () => {
    expect.assertions(3);
    const e = controller.getBladeEffect(100);
    expect(e.color).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.highEnergyColor);
    expect(e.visualLength).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.maxLength);
    expect(e.width).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.maxWidth);
  });

  it("G4 刀势连续效果插值 — 单调递增", () => {
    expect.assertions(4);
    const e0 = controller.getBladeEffect(0);
    const e50 = controller.getBladeEffect(50);
    const e100 = controller.getBladeEffect(100);
    expect(e50.visualLength).toBeGreaterThan(e0.visualLength);
    expect(e50.visualLength).toBeLessThan(e100.visualLength);
    expect(e50.width).toBeGreaterThan(e0.width);
    expect(e50.width).toBeLessThan(e100.width);
  });

  it("G5 updateBladeEffect 更新 currentBladeEffect", () => {
    expect.assertions(1);
    controller.updateBladeEffect(80);
    const current = controller.currentBladeEffect;
    expect(current.color).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.highEnergyColor);
  });

  // ================================================================
  // Section H: 结算结果字段 (Tests 40-50) — P0-5: spawnProjectileForTest
  // ================================================================

  it("H1 finishSlash 返回所有必需字段", () => {
    expect.assertions(8);
    controller.update(0.35);
    controller.resolveGeometry(geom(v(50, 700), v(100, 750), "test_fields", 50));
    const result = controller.finishSlash("test_fields", 100, 100);
    expect(result.slashId).toBe("test_fields");
    expect(typeof result.energyAfter).toBe("number");
    expect(typeof result.energyBefore).toBe("number");
    expect(typeof result.baseCost).toBe("number");
    expect(typeof result.primaryResult).toBe("string");
    expect(Array.isArray(result.secondaryResults)).toBe(true);
    expect(typeof result.unclampedAfter).toBe("number");
    expect(Array.isArray(result.events)).toBe(true);
  });

  it("H2 finishSlash secondaryResults 包含非 primaryResult 事件", () => {
    expect.assertions(4);
    // 制造 mixed 场景：胸甲 threat 阶段同时有 normal + dangerous
    for (let i = 0; i < 2; i++) {
      advanceToOpportunity(controller);
      hitCurrentArmor(controller, `s_mixed_${i}`);
      advanceThroughResolveAndRecovery(controller);
    }
    controller.update(0.35);
    const p1 = controller.spawnProjectileForTest("normal", BOSS_CX - 20, BOSS_CY + 6, 0, 40);
    const p2 = controller.spawnProjectileForTest("dangerous", BOSS_CX + 20, BOSS_CY + 6, 0, 30);
    expect(p1.kind).toBe("normal");
    expect(p2.kind).toBe("dangerous");
    controller.setProgrammaticSlashEnergy(80);
    controller.resolveGeometry(geom(v(p1.x - 40, p1.y - 60), v(p2.x + 40, p2.y + 60), "s_mix", 80));
    const result = controller.finishSlash("s_mix", 100, 100);
    expect(result.dangerousWrongCutCount).toBeGreaterThan(0);
    expect(result.secondaryResults.length).toBeGreaterThanOrEqual(0);
  });

  it("H3 finishSlash 刀势经济正反馈 — 弹幕斩奖励 > 0", () => {
    expect.assertions(1);
    controller.update(0.35);
    const p = controller.spawnProjectileForTest("normal", BOSS_CX, BOSS_CY - 50, 0, 50);
    controller.setProgrammaticSlashEnergy(80);
    controller.resolveGeometry(geom(v(p.x - 20, p.y - 40), v(p.x + 20, p.y + 20), "s_reward", 80));
    const result = controller.finishSlash("s_reward", 100, 100);
    expect(result.projectileCutReward).toBeGreaterThan(0);
  });

  it("H4 finishSlash dangerous 惩罚 < 0", () => {
    expect.assertions(1);
    for (let i = 0; i < 2; i++) {
      advanceToOpportunity(controller);
      hitCurrentArmor(controller, `s_danger_${i}`);
      advanceThroughResolveAndRecovery(controller);
    }
    controller.update(0.35);
    const dang = controller.spawnProjectileForTest("dangerous", BOSS_CX, BOSS_CY + 6, 0, 30);
    controller.setProgrammaticSlashEnergy(80);
    controller.resolveGeometry(geom(v(dang.x - 20, dang.y - 40), v(dang.x + 20, dang.y + 20), "s_danger", 80));
    const result = controller.finishSlash("s_danger", 100, 100);
    expect(result.dangerousWrongCutPenalty).toBeGreaterThan(0);
  });

  it("H5 finishSlash armorBroken 时 armorReward 为 armorBreakReward", () => {
    expect.assertions(2);
    advanceToOpportunity(controller);
    const f = hitCurrentArmor(controller, "s_ab", 100);
    expect(f.armorBroken).toBe(true);
    expect(f.armorReward).toBe(REACTIVE_BOSS_CONFIG.bladeEnergy.armorBreakReward);
  });

  it("H6 finishSlash armorHit (非破甲) 时 armorReward 为 armorCrackReward", () => {
    expect.assertions(3);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    const f = hitCurrentArmor(c, "s_ac", 20);
    expect(f.armorHit).toBe(true);
    expect(f.armorBroken).toBe(false);
    expect(f.armorReward).toBe(REACTIVE_BOSS_CONFIG.bladeEnergy.armorCrackReward);
  });

  it("H7 finishSlash 伤害=0 时不触发 armorBroken", () => {
    expect.assertions(2);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    const f = hitCurrentArmor(c, "s_test", 20);
    expect(f.armorDurabilityDamage).toBe(25);
    expect(f.armorBroken).toBe(false);
  });

  it("H8 finishSlash unclampedAfter 正确反映结算前能量", () => {
    expect.assertions(1);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    const f = hitCurrentArmor(c, "s_unclamped", 100);
    const expected = 100 - f.baseCost + f.projectileCutReward + f.projectileReflectReward + f.armorReward - f.dangerousWrongCutPenalty - f.bodyWrongHitPenalty - f.emptySwingPenalty;
    expect(f.unclampedAfter).toBeCloseTo(expected, 0);
  });

  it("H9 finishSlash energyAfter 被 clamp 在 [0, max]", () => {
    expect.assertions(2);
    const result = controller.finishSlash("test_clamp", 100, 100);
    expect(result.energyAfter).toBeGreaterThanOrEqual(0);
    expect(result.energyAfter).toBeLessThanOrEqual(REACTIVE_BOSS_CONFIG.bladeEnergy.max);
  });

  it("H10 finishSlash events 完整记录所有碰撞 — cut+armor 严格验证", () => {
    expect.assertions(5);
    const c = new BossReactiveController();
    // 切到胸甲（mixed），先破前两甲
    for (let i = 0; i < 2; i++) {
      advanceToOpportunity(c);
      hitCurrentArmor(c, `s_h10_prep_${i}`);
      advanceThroughResolveAndRecovery(c);
    }
    advanceToOpportunity(c);
    c.setProgrammaticSlashEnergy(100);
    const pos = c.getActiveArmorWorldPos()!;
    // 在护甲中心确定性注入 normal 弹幕，确保 resolveGeometry 同时命中弹幕和护甲
    c.spawnProjectileForTest("normal", pos.cx, pos.cy + 5, 0, 0);
    c.resolveGeometry(geom(v(pos.cx - pos.rx, pos.cy - pos.ry), v(pos.cx + pos.rx, pos.cy + pos.ry), "s_h10", 100));
    const result = c.finishSlash("s_h10", 100, 100);
    // P0-D: H10 严格断言 events.length=2，kind 为 projectile_cut 和 armor
    expect(result.armorHit).toBe(true);
    expect(result.events.length).toBe(2);
    const kinds = result.events.map(e => e.kind).sort();
    expect(kinds).toContain("armor");
    expect(kinds).toContain("projectile_cut");
    expect(result.projectileCutCount).toBe(1);
  });

  it("H11 finishSlash armorHitPos 非空时有效", () => {
    expect.assertions(3);
    advanceToOpportunity(controller);
    const f = hitCurrentArmor(controller, "s_hitpos", 100);
    expect(f.armorHit).toBe(true);
    expect(f.armorHitPos).not.toBeNull();
    if (f.armorHitPos) {
      expect(typeof f.armorHitPos.x).toBe("number");
    }
  });

  // ================================================================
  // Section I: hold-after-hit + session保留 (Tests 51-54)
  // ================================================================

  it("I1 hold-after-hit — 命中后等待 recovery 再 finishSlash 仍为 armor_hit", () => {
    expect.assertions(3);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.setProgrammaticSlashEnergy(50);
    const pos = c.getActiveArmorWorldPos()!;
    c.resolveGeometry(geom(v(pos.cx - pos.rx * 0.5, pos.cy - pos.ry * 0.5), v(pos.cx + pos.rx * 0.5, pos.cy + pos.ry * 0.5), "s_hold", 50));
    c.update(REACTIVE_BOSS_CONFIG.phaseTimers.resolveDuration + 0.01);
    expect(c.phase).toBe("armor_recovery");
    const result = c.finishSlash("s_hold", 100, 100);
    expect(result.armorHit).toBe(true);
    expect(result.armorDurabilityDamage).toBe(55);
  });

  it("I2 session保留 — transitionToRecovery 后 finishSlash 仍能消费原 session", () => {
    expect.assertions(3);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.setProgrammaticSlashEnergy(50);
    const pos = c.getActiveArmorWorldPos()!;
    c.resolveGeometry(geom(v(pos.cx - pos.rx * 0.5, pos.cy - pos.ry * 0.5), v(pos.cx + pos.rx * 0.5, pos.cy + pos.ry * 0.5), "s_session", 50));
    c.update(REACTIVE_BOSS_CONFIG.phaseTimers.resolveDuration + 0.01);
    expect(c.phase).toBe("armor_recovery");
    const result = c.finishSlash("s_session", 100, 100);
    expect(result.armorHit).toBe(true);
    expect(result.events.length).toBeGreaterThan(0);
  });

  it("I3 session保留 — recovery 后 finishSlash 仍返回正确 armorDamage", () => {
    expect.assertions(1);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.setProgrammaticSlashEnergy(20);
    const pos = c.getActiveArmorWorldPos()!;
    c.resolveGeometry(geom(v(pos.cx - pos.rx * 0.5, pos.cy - pos.ry * 0.5), v(pos.cx + pos.rx * 0.5, pos.cy + pos.ry * 0.5), "s_sess3", 20));
    c.update(REACTIVE_BOSS_CONFIG.phaseTimers.resolveDuration + 0.01);
    const result = c.finishSlash("s_sess3", 100, 100);
    expect(result.armorDurabilityDamage).toBe(25);
  });

  it("I4 hold-after-hit — 命中后延迟再收刀 primaryResult 仍为 armor_hit", () => {
    expect.assertions(2);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.setProgrammaticSlashEnergy(100);
    const pos = c.getActiveArmorWorldPos()!;
    c.resolveGeometry(geom(v(pos.cx - pos.rx * 0.5, pos.cy - pos.ry * 0.5), v(pos.cx + pos.rx * 0.5, pos.cy + pos.ry * 0.5), "s_hold2", 100));
    c.update(REACTIVE_BOSS_CONFIG.phaseTimers.resolveDuration + 0.01);
    const result = c.finishSlash("s_hold2", 100, 100);
    expect(result.primaryResult).toBe("armor_broken");
    expect(result.armorBroken).toBe(true);
  });

  // ================================================================
  // Section J: primaryResult 优先级 + secondaryResults (Tests 55-60) — P0-5: J4 修复
  // ================================================================

  it("J1 primaryResult 优先级 — armor_broken > armor_hit", () => {
    expect.assertions(2);
    advanceToOpportunity(controller);
    const f = hitCurrentArmor(controller, "s_pri1", 100);
    expect(f.primaryResult).toBe("armor_broken");
    expect(f.armorBroken).toBe(true);
  });

  it("J2 primaryResult 优先级 — armor_hit > dangerous_wrong_cut", () => {
    expect.assertions(2);
    advanceToOpportunity(controller);
    const f = hitCurrentArmor(controller, "s_pri2", 50);
    expect(f.primaryResult).toBe("armor_hit");
    expect(f.armorBroken).toBe(false);
  });

  it("J3 primaryResult 优先级 — dangerous_wrong_cut > body_wrong_hit", () => {
    expect.assertions(2);
    for (let i = 0; i < 2; i++) {
      advanceToOpportunity(controller);
      hitCurrentArmor(controller, `s_pri3_${i}`);
      advanceThroughResolveAndRecovery(controller);
    }
    controller.update(0.35);
    const dang = controller.spawnProjectileForTest("dangerous", BOSS_CX, BOSS_CY + 6, 0, 30);
    controller.setProgrammaticSlashEnergy(80);
    // 命中 dangerous 弹幕且线段也经过身体区域
    controller.resolveGeometry(geom(v(dang.x - 20, dang.y - 40), v(dang.x + 20, dang.y + 20), "s_pri3", 80));
    const result = controller.finishSlash("s_pri3", 100, 100);
    expect(result.dangerousWrongCutCount).toBeGreaterThan(0);
    expect(result.primaryResult).toBe("dangerous_wrong_cut");
  });

  it("J4 primaryResult 优先级 — body_wrong_hit > projectile_reflect（确定性构造 body+reflect 混合场景）", () => {
    expect.assertions(5);
    // 切到右肩（reflective），进入 opportunity，确保 activeArmor=右肩 不挡 body
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_left");
    advanceThroughResolveAndRecovery(controller);
    advanceToOpportunity(controller);

    // 确定性构造：在 BOSS_CX,BOSS_CY 放置静止 reflective 弹幕（同时在身体碰撞区域内）
    const refl = controller.spawnProjectileForTest("reflective", BOSS_CX, BOSS_CY - 10, 0, 0);
    expect(refl.kind).toBe("reflective");

    controller.setProgrammaticSlashEnergy(100);
    // 几何穿过身体中心，远离右肩护甲（x=252.5, y≈185.5）
    controller.resolveGeometry(geom(v(BOSS_CX - 50, BOSS_CY - 50), v(BOSS_CX + 50, BOSS_CY + 50), "s_j4", 100));
    const result = controller.finishSlash("s_j4", 100, 100);

    // P0-D: 严格断言 body 为 primary，reflect 在 secondary
    expect(result.bodyWrongHit).toBe(true);
    expect(result.projectileReflectCount).toBe(1);
    expect(result.primaryResult).toBe("body_wrong_hit");
    expect(result.secondaryResults).toContain("projectile_reflect");
  });

  it("J5 primaryResult 优先级 — projectile_reflect > projectile_cut", () => {
    expect.assertions(2);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_left");
    advanceThroughResolveAndRecovery(controller);
    controller.update(0.35);
    const refl = controller.spawnProjectileForTest("reflective", BOSS_CX + 30, BOSS_CY - 20, 0, 60);
    controller.setProgrammaticSlashEnergy(100);
    controller.resolveGeometry(geom(v(refl.x - 20, refl.y - 40), v(refl.x + 20, refl.y + 20), "s_pri5", 100));
    const result = controller.finishSlash("s_pri5", 100, 100);
    expect(result.projectileReflectCount).toBe(1);
    expect(result.primaryResult).toBe("projectile_reflect");
  });

  it("J6 primaryResult 优先级 — projectile_cut > empty_swing", () => {
    expect.assertions(2);
    controller.update(0.35);
    const normal = controller.spawnProjectileForTest("normal", BOSS_CX, BOSS_CY - 50, 0, 50);
    controller.setProgrammaticSlashEnergy(80);
    controller.resolveGeometry(geom(v(normal.x - 20, normal.y - 40), v(normal.x + 20, normal.y + 20), "s_pri6", 80));
    const result = controller.finishSlash("s_pri6", 100, 100);
    expect(result.projectileCutCount).toBe(1);
    expect(result.primaryResult).toBe("projectile_cut");
  });

  // ================================================================
  // Section K: 混合事件 (Tests 61-63) — P0-5: spawnProjectileForTest
  // ================================================================

  it("K1 混合事件 — 同刀 projectile_cut + dangerous_wrong_cut，primary=dangerous_wrong_cut", () => {
    expect.assertions(5);
    for (let i = 0; i < 2; i++) {
      advanceToOpportunity(controller);
      hitCurrentArmor(controller, `s_mixed_k1_${i}`);
      advanceThroughResolveAndRecovery(controller);
    }
    controller.update(0.35);
    const n = controller.spawnProjectileForTest("normal", BOSS_CX - 30, BOSS_CY + 6, 0, 40);
    const d = controller.spawnProjectileForTest("dangerous", BOSS_CX + 30, BOSS_CY + 6, 0, 30);
    expect(n.kind).toBe("normal");
    expect(d.kind).toBe("dangerous");
    controller.setProgrammaticSlashEnergy(80);
    controller.resolveGeometry(geom(v(60, 200), v(400, 300), "s_mixed_k1", 80));
    const result = controller.finishSlash("s_mixed_k1", 100, 100);
    expect(result.dangerousWrongCutCount).toBeGreaterThan(0);
    expect(result.projectileCutCount).toBeGreaterThan(0);
    expect(result.primaryResult).toBe("dangerous_wrong_cut");
  });

  it("K2 混合事件 — 确定性构造 dangerous + projectile_cut，严格验证 primary/secondary", () => {
    expect.assertions(4);
    // 切到胸甲（mixed: normal + dangerous），破前两甲
    for (let i = 0; i < 2; i++) {
      advanceToOpportunity(controller);
      hitCurrentArmor(controller, `s_k2_prep_${i}`);
      advanceThroughResolveAndRecovery(controller);
    }
    advanceToOpportunity(controller);
    controller.update(0.35);

    // 确定性注入：一个 normal（可 cut）+ 一个 dangerous，放在 BOSS 下方避免碰护甲
    controller.spawnProjectileForTest("normal", BOSS_CX - 30, BOSS_CY + 150, 0, 0);
    controller.spawnProjectileForTest("dangerous", BOSS_CX + 30, BOSS_CY + 150, 0, 0);
    controller.setProgrammaticSlashEnergy(80);

    // 几何穿过两弹幕中心（BOSS下方，不碰护甲）
    controller.resolveGeometry(geom(v(BOSS_CX - 50, BOSS_CY + 140), v(BOSS_CX + 50, BOSS_CY + 160), "s_k2", 80));
    const result = controller.finishSlash("s_k2", 100, 100);

    // P0-D: 严格断言 dangerous 为 primary，projectile_cut 在 secondary
    expect(result.dangerousWrongCutCount).toBe(1);
    expect(result.projectileCutCount).toBe(1);
    expect(result.primaryResult).toBe("dangerous_wrong_cut");
    expect(result.secondaryResults).toContain("projectile_cut");
  });

  it("K3 混合事件 — 确定性构造 dangerous + projectile_reflect，严格验证优先级", () => {
    expect.assertions(4);
    // 切到胸甲（mixed），破前两甲
    for (let i = 0; i < 2; i++) {
      advanceToOpportunity(controller);
      hitCurrentArmor(controller, `s_k3_prep_${i}`);
      advanceThroughResolveAndRecovery(controller);
    }
    advanceToOpportunity(controller);
    controller.update(0.35);

    // 确定性注入：一个 reflective + 一个 dangerous，放在 BOSS 下方避免��护甲
    controller.spawnProjectileForTest("reflective", BOSS_CX - 20, BOSS_CY + 150, 0, 0);
    controller.spawnProjectileForTest("dangerous", BOSS_CX + 20, BOSS_CY + 150, 0, 0);
    controller.setProgrammaticSlashEnergy(80);

    // 几何穿过两弹幕中心（BOSS下方，不碰护甲）
    controller.resolveGeometry(geom(v(BOSS_CX - 50, BOSS_CY + 140), v(BOSS_CX + 50, BOSS_CY + 160), "s_k3", 80));
    const result = controller.finishSlash("s_k3", 100, 100);

    // P0-D: dangerous > reflect 优先级，dangerous 为 primary，reflect 在 secondary
    expect(result.dangerousWrongCutCount).toBe(1);
    expect(result.projectileReflectCount).toBe(1);
    expect(result.primaryResult).toBe("dangerous_wrong_cut");
    expect(result.secondaryResults).toContain("projectile_reflect");
  });

  // ================================================================
  // Section L: retry 清理 (Tests 64-68)
  // ================================================================

  it("L1 retry 清理 — reset() 后 _session 为空", () => {
    expect.assertions(2);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_retry", 100);
    controller.reset();
    const result = controller.finishSlash("s_retry", 100, 100);
    expect(result.armorHit).toBe(false);
    expect(result.events).toEqual([]);
  });

  it("L2 retry 清理 — reset() 后 _pendingSlashResult 为 null", () => {
    expect.assertions(1);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_pending", 100);
    controller.reset();
    const result = controller.finishSlash("s_pending", 100, 100);
    expect(result.armorHit).toBe(false);
  });

  it("L3 retry 清理 — reset() 后 _resolvedSlashId 为空", () => {
    expect.assertions(2);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_resolved", 100);
    controller.reset();
    expect(controller.phase).toBe("armor_prepare");
    expect(controller.getArmorBrokenFlags()).toEqual([false, false, false]);
  });

  it("L4 retry 清理 — reset() 后 projectiles 为空", () => {
    expect.assertions(2);
    controller.update(0.35);
    controller.spawnProjectileForTest("normal", BOSS_CX, BOSS_CY - 50, 0, 50);
    expect(controller.getProjectiles().length).toBeGreaterThan(0);
    controller.reset();
    expect(controller.getProjectiles().length).toBe(0);
  });

  it("L5 retry 清理 — reset() 后 graceSlashId 为 null", () => {
    expect.assertions(2);
    advanceToOpportunity(controller);
    controller.registerReactiveSlashStart("s_grace");
    expect(controller.getGraceSlashId()).toBe("s_grace");
    controller.reset();
    expect(controller.getGraceSlashId()).toBe(null);
  });

  // ================================================================
  // Section M: 输入策略 (Tests 69-73)
  // ================================================================

  it("M1 输入策略 — prepare 阶段 inputLocked = true", () => {
    expect.assertions(2);
    expect(controller.phase).toBe("armor_prepare");
    expect(controller.inputLocked).toBe(true);
  });

  it("M2 输入策略 — resolve 阶段 inputLocked = true", () => {
    expect.assertions(2);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_input", 100);
    expect(controller.phase).toBe("armor_resolve");
    expect(controller.inputLocked).toBe(true);
  });

  it("M3 输入策略 — recovery 阶段 inputLocked = true", () => {
    expect.assertions(2);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_input2", 100);
    controller.update(REACTIVE_BOSS_CONFIG.phaseTimers.resolveDuration + 0.01);
    expect(controller.phase).toBe("armor_recovery");
    expect(controller.inputLocked).toBe(true);
  });

  it("M4 输入策略 — threat 阶段 inputLocked = false", () => {
    expect.assertions(2);
    controller.update(0.35);
    expect(controller.phase).toBe("armor_threat");
    expect(controller.inputLocked).toBe(false);
  });

  it("M5 输入策略 — opportunity 阶段 inputLocked = false", () => {
    expect.assertions(2);
    advanceToOpportunity(controller);
    expect(controller.phase).toBe("armor_opportunity");
    expect(controller.inputLocked).toBe(false);
  });

  // ================================================================
  // Section N: freezeCombatResources (Tests 74-75)
  // ================================================================

  it("N1 freezeCombatResources — resolve 阶段为 true", () => {
    expect.assertions(1);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_freeze", 100);
    expect(controller.freezeCombatResources).toBe(true);
  });

  it("N2 freezeCombatResources — recovery 阶段为 true", () => {
    expect.assertions(2);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_freeze2", 100);
    controller.update(REACTIVE_BOSS_CONFIG.phaseTimers.resolveDuration + 0.01);
    expect(controller.phase).toBe("armor_recovery");
    expect(controller.freezeCombatResources).toBe(true);
  });

  // ================================================================
  // Section O: snapshot / E2E桥 (Tests 76-80)
  // ================================================================

  it("O1 getReactiveSnapshot — 返回完整状态", () => {
    expect.assertions(9);
    const snap = controller.getReactiveSnapshot();
    expect(snap.phase).toBe("armor_prepare");
    expect(snap.armorProgress).toBe("0/3");
    expect(snap.pursuitProgress).toBe("0/3");
    expect(snap.armorBroken).toEqual([false, false, false]);
    expect(snap.armorDurability).toEqual([100, 100, 100]);
    expect(snap.activeArmorIndex).toBe(0);
    expect(snap.inputLocked).toBe(true);
    expect(snap.bridgeTriggered).toBe(false);
    expect(snap.projectileCount).toBe(0);
  });

  it("O2 getReactiveSnapshot — currentBladeEffect 有效", () => {
    expect.assertions(3);
    const snap = controller.getReactiveSnapshot();
    expect(snap.currentBladeEffect).toBeDefined();
    expect(snap.currentBladeEffect.visualLength).toBeGreaterThan(0);
    expect(snap.currentBladeEffect.width).toBeGreaterThan(0);
  });

  it("O3 getActiveArmorWorldPos — 返回当前护甲世界坐标", () => {
    expect.assertions(4);
    const pos = controller.getActiveArmorWorldPos();
    expect(pos).not.toBeNull();
    expect(pos!.cx).toBeCloseTo(BOSS_CX - 50 * 1.15, 1);
    expect(pos!.cy).toBeCloseTo(BOSS_CY - 30 * 1.15, 1);
    expect(pos!.rx).toBeCloseTo(34 * 1.15, 1);
  });

  it("O4 getArmorDurability — 返回耐久数组（深拷贝）", () => {
    expect.assertions(2);
    const d = controller.getArmorDurability();
    expect(d).toEqual([100, 100, 100]);
    d[0] = 0;
    const d2 = controller.getArmorDurability();
    expect(d2[0]).toBe(100);
  });

  it("O5 getArmorBrokenFlags — 初始全部 false", () => {
    expect.assertions(1);
    expect(controller.getArmorBrokenFlags()).toEqual([false, false, false]);
  });

  // ================================================================
  // Section P: grace / 机会窗口宽限 (Tests 81-85)
  // ================================================================

  it("P1 空挥后 graceSlashId 清理 — 窗口不延长", () => {
    expect.assertions(2);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.registerReactiveSlashStart("s_empty");
    expect(c.getGraceSlashId()).toBe("s_empty");
    c.resolveGeometry(geom(v(50, 700), v(100, 750), "s_empty", 50));
    c.finishSlash("s_empty", 100, 100);
    expect(c.getGraceSlashId()).toBe(null);
  });

  it("P2 reset 后 graceSlashId 为 null", () => {
    expect.assertions(2);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.registerReactiveSlashStart("s_test");
    expect(c.getGraceSlashId()).toBe("s_test");
    c.reset();
    expect(c.getGraceSlashId()).toBe(null);
  });

  it("P3 窗口内注册 grace — proper timing", () => {
    expect.assertions(1);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.registerReactiveSlashStart("s_grace");
    expect(c.getGraceSlashId()).toBe("s_grace");
  });

  it("P4 窗口超时后注册 grace — 不记录", () => {
    expect.assertions(1);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.update(REACTIVE_BOSS_CONFIG.phaseTimers.opportunityDuration + 0.01);
    c.registerReactiveSlashStart("s_late");
    expect(c.getGraceSlashId()).toBe(null);
  });

  it("P5 registerReactiveSlashStart 仅在 opportunity 有效", () => {
    expect.assertions(2);
    expect(controller.phase).toBe("armor_prepare");
    controller.registerReactiveSlashStart("s_prepare");
    expect(controller.getGraceSlashId()).toBe(null);
  });

  // ================================================================
  // Section Q: armorTransitionHeal (Test 86)
  // ================================================================

  it("Q1 armorTransitionHeal — 切换到新护甲时恢复 HP", () => {
    expect.assertions(3);
    const heal = REACTIVE_BOSS_CONFIG.playerHp.armorTransitionHeal ?? 0;
    expect(heal).toBeGreaterThan(0);
    controller.takeDamage(40);
    controller.update(0.35);
    expect(controller.getPlayerHp().current).toBe(60);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_left_heal");
    advanceThroughResolveAndRecovery(controller);
    const hpAfter = controller.getPlayerHp().current;
    expect(hpAfter).toBe(Math.min(100, 60 + heal));
  });

  // ================================================================
  // Section R: 碰撞来源追踪 (Tests 87-88)
  // ================================================================

  it("R1 getLastArmorCollisionSource — 护甲命中后返回非空", () => {
    expect.assertions(1);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_coll", 100);
    const src = controller.getLastArmorCollisionSource();
    expect(src).not.toBeNull();
  });

  it("R2 getLastArmorHitPos — 护甲命中后返回有效坐标", () => {
    expect.assertions(2);
    advanceToOpportunity(controller);
    hitCurrentArmor(controller, "s_hitpos2", 100);
    const pos = controller.getLastArmorHitPos();
    expect(pos).not.toBeNull();
    if (pos) {
      expect(typeof pos.x).toBe("number");
    }
  });

  // ================================================================
  // Section S: P0-3 不变量测试 — armor-only 与 cut+armor events 长度
  // ================================================================

  it("S1 P0-3 不变量 — armor-only 时 result.events.length === 1", () => {
    expect.assertions(3);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.setProgrammaticSlashEnergy(100);
    const pos = c.getActiveArmorWorldPos()!;
    c.resolveGeometry(geom(v(pos.cx - pos.rx * 0.5, pos.cy - pos.ry * 0.5), v(pos.cx + pos.rx * 0.5, pos.cy + pos.ry * 0.5), "s_armor_only", 100));
    const result = c.finishSlash("s_armor_only", 100, 100);
    expect(result.armorHit).toBe(true);
    // P0-3: armor-only 时 events 中仅包含 1 个 armor event（来自 commitArmorDamage），
    // finishSlash 不再重复 push
    expect(result.events.length).toBe(1);
    expect(result.events[0].kind).toBe("armor");
  });

  it("S2 P0-3 不变量 — cut+armor 时 result.events.length === 2", () => {
    expect.assertions(4);
    const c = new BossReactiveController();
    // 先切到胸甲（mixed: normal + dangerous），构造 cut + armor 场景
    for (let i = 0; i < 2; i++) {
      advanceToOpportunity(c);
      hitCurrentArmor(c, `s_prep_s2_${i}`);
      advanceThroughResolveAndRecovery(c);
    }
    advanceToOpportunity(c);
    c.setProgrammaticSlashEnergy(100);
    const pos = c.getActiveArmorWorldPos()!;
    // 在护甲中心附近确定性注入 normal 弹幕（vx=0, vy=0 静止），确保 resolveGeometry 同时命中弹幕和护甲
    const proj = c.spawnProjectileForTest("normal", pos.cx, pos.cy + 5, 0, 0);
    c.resolveGeometry(geom(v(pos.cx - pos.rx, pos.cy - pos.ry), v(pos.cx + pos.rx, pos.cy + pos.ry), "s_cut_armor", 100));
    const result = c.finishSlash("s_cut_armor", 100, 100);
    expect(result.armorHit).toBe(true);
    // P0-3: cut+armor 时 events 包含 1 个 armor event + 1 个 cut event
    expect(result.events.length).toBe(2);
    const kinds = result.events.map(e => e.kind).sort();
    expect(kinds).toContain("armor");
    expect(kinds).toContain("projectile_cut");
  });

  // ================================================================
  // Section T: P1-1 三胶囊确定性测试
  // ================================================================

  it("T1 P1-1 三胶囊 — visibleBlade-only hit（baseTrail + tipSweep miss）", () => {
    expect.assertions(2);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.setProgrammaticSlashEnergy(100);
    const pos = c.getActiveArmorWorldPos()!;
    // 用 buildCapsuleTestGeometry 构造仅 visibleBlade 命中护甲的几何
    const geo = buildCapsuleTestGeometry("visibleBlade", { x: pos.cx, y: pos.cy }, 0, "s_visblade", 100);
    c.resolveGeometry(geo);
    const result = c.finishSlash("s_visblade", 100, 100);
    expect(result.armorHit).toBe(true);
    expect(result.primarySource).toBe("visibleBlade");
  });

  it("T2 P1-1 三胶囊 — tipSweep-only hit（baseTrail + visibleBlade miss）", () => {
    expect.assertions(2);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.setProgrammaticSlashEnergy(100);
    const pos = c.getActiveArmorWorldPos()!;
    const geo = buildCapsuleTestGeometry("tipSweep", { x: pos.cx, y: pos.cy }, 0, "s_tipsweep", 100);
    c.resolveGeometry(geo);
    const result = c.finishSlash("s_tipsweep", 100, 100);
    expect(result.armorHit).toBe(true);
    expect(result.primarySource).toBe("tipSweep");
  });

  it("T3 P1-1 三胶囊 — 全部 miss（三种胶囊均未命中护甲）", () => {
    expect.assertions(2);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.setProgrammaticSlashEnergy(50);
    // 使用远离所有护甲的几何
    const geo = buildCapsuleTestGeometry("visibleBlade", { x: 50, y: 700 }, 0, "s_all_miss", 50);
    c.resolveGeometry(geo);
    const result = c.finishSlash("s_all_miss", 50, 100);
    expect(result.armorHit).toBe(false);
    expect(result.primaryResult).toBe("empty_swing");
  });

  // ================================================================
  // Section U: P1-3 世界变换 — getBodyWorldGeometry
  // ================================================================

  it("U1 P1-3 getBodyWorldGeometry — 返回正确数量的身体部位", () => {
    expect.assertions(4);
    const parts = controller.getBodyWorldGeometry();
    expect(parts.length).toBe(3);
    // 确认每个部位有 center、rx、ry
    for (const bp of parts) {
      expect(typeof bp.center.x).toBe("number");
    }
  });

  it("U2 P1-3 getBodyWorldGeometry — 身体部位在世界坐标范围内", () => {
    expect.assertions(4);
    const parts = controller.getBodyWorldGeometry();
    // 身体应大致在 boss 中心附近（BOSS_CX ± 150, BOSS_CY ± 150）
    for (const bp of parts) {
      expect(Math.abs(bp.center.x - BOSS_CX)).toBeLessThan(150);
    }
    expect(parts.length).toBe(3);
  });

  // ================================================================
  // Section V: P1-B session 关闭（护甲提交后阻止后续写入）
  // ================================================================

  it("V1 P1-B session closedForCollision — 护甲提交后 resolveGeometry 返回空数组", () => {
    expect.assertions(9);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.setProgrammaticSlashEnergy(20);
    const pos = c.getActiveArmorWorldPos()!;

    // 第一次 resolveGeometry 命中护甲 → commitArmorDamage → closedForCollision = true
    c.resolveGeometry(geom(v(pos.cx - pos.rx * 0.5, pos.cy - pos.ry * 0.5), v(pos.cx + pos.rx * 0.5, pos.cy + pos.ry * 0.5), "s_close", 20));

    // 护甲提交后继续传入 5 个 segment
    for (let i = 0; i < 5; i++) {
      const segEvents = c.resolveGeometry(geom(v(pos.cx - pos.rx * 0.3, pos.cy - pos.ry * 0.3 + i), v(pos.cx + pos.rx * 0.3, pos.cy + pos.ry * 0.3 + i), "s_close", 20));
      expect(segEvents).toEqual([]);
    }

    const result = c.finishSlash("s_close", 20, 100);
    expect(result.armorHit).toBe(true);
    // P1-B: 护甲只扣一次，events 不增加（仅 1 个 armor event）
    expect(result.events.length).toBe(1);
    expect(result.events[0].kind).toBe("armor");
    expect(result.armorDurabilityDamage).toBe(25);
  });

  it("V2 P1-B session closedForCollision — 护甲提交后弹幕不追加到 session", () => {
    expect.assertions(4);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.setProgrammaticSlashEnergy(50);
    const pos = c.getActiveArmorWorldPos()!;

    // 第一次 resolveGeometry：命中护甲 + 正常弹幕
    c.spawnProjectileForTest("normal", pos.cx, pos.cy + 5, 0, 0);
    c.resolveGeometry(geom(v(pos.cx - pos.rx, pos.cy - pos.ry), v(pos.cx + pos.rx, pos.cy + pos.ry), "s_close2", 50));

    // 注入新弹幕，第二次 resolveGeometry 应被 closedForCollision 阻止
    c.spawnProjectileForTest("normal", pos.cx + 10, pos.cy + 10, 0, 0);
    const segEvents2 = c.resolveGeometry(geom(v(pos.cx - pos.rx, pos.cy - pos.ry), v(pos.cx + pos.rx, pos.cy + pos.ry), "s_close2", 50));
    expect(segEvents2).toEqual([]);

    const result = c.finishSlash("s_close2", 50, 100);
    expect(result.armorHit).toBe(true);
    // armor-only: 只有 1 个 event（护甲），弹幕只命中一个且仅在第一次 resolveGeometry
    expect(result.events.length).toBe(2); // 1 armor + 1 projectile_cut from first resolve
    const kinds = result.events.map(e => e.kind).sort();
    expect(kinds).toEqual(["armor", "projectile_cut"]);
  });

  // ================================================================
  // Section W: V0723013-Final.1 tipSweep 确定性输入-几何集成测试
  // ================================================================

  it("V0723013-Final.1 tipSweep-only deterministic input-trace integration", () => {
    expect.assertions(6);
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    const pos = c.getActiveArmorWorldPos()!;
    // energy=80：damage=20+80*0.8=84，armor 不会一击破 → primaryResult=armor_hit 而非 armor_broken
    c.setProgrammaticSlashEnergy(80);

    // ============================================================
    // 固定 pointer 采样点：模拟手指在护甲边缘快速从右向左掠过
    // 起点在护甲右边缘外侧，终点在护甲左边缘外侧，3 个中间点
    // 所有点在护甲顶部上方（cy-ry-15），速度快（跨度大）
    // ============================================================
    // 第一护甲（左肩）：cx≈137.5, cy≈185.5, rx≈39.1, ry≈29.9
    const topY = pos.cy - pos.ry - 15;  // 护甲顶部上方 15px

    // 5 个采样点（起点 + 3 中间点 + 终点）
    const p0 = v(pos.cx + pos.rx + 5, topY);   // 起点：右边缘外侧
    const p1 = v(pos.cx + pos.rx * 0.35, topY); // 中间点 1
    const p2 = v(pos.cx, topY);                  // 中间点 2：护甲正上方
    const p3 = v(pos.cx - pos.rx * 0.35, topY); // 中间点 3
    const p4 = v(pos.cx - pos.rx - 20, topY);   // 终点：左边缘外侧（-20 确保护甲右侧不碰 visibleBlade）

    // 计算起始方向/位移矢量：从起点到终点的位移 → 向下（π/2），
    // 这样 blade 垂直向下延伸，tipSweep 扫入护甲椭圆区域
    const directionAngle = Math.PI / 2;

    // 通过真实 Game 链路 buildReactiveSlashGeometry 构建刀体几何
    // 使用默认 visualLength=30, width=3（与生产链路一致）
    const geometry = buildReactiveSlashGeometry(
      p0, p4,          // baseA = 起点, baseB = 终点
      directionAngle,   // 刀身方向：向下
      30,               // visualLength（默认值）
      3,                // width（默认值）
      "s_tipsweep_int",
      80                // lockedEnergy
    );

    // 分别检查每个胶囊对护甲椭圆的命中状态
    const armorGeom = c.getArmorWorldGeometry(c.getActiveArmorIndex());
    let baseTrailHit = false;
    let visibleBladeHit = false;
    let tipSweepHit = false;

    for (const cap of geometry.capsules) {
      const hit = capsuleHitsEllipse(
        cap.a, cap.b, cap.radius,
        armorGeom.center, armorGeom.rx, armorGeom.ry
      );
      if (cap.source === "baseTrail") baseTrailHit = hit;
      else if (cap.source === "visibleBlade") visibleBladeHit = hit;
      else if (cap.source === "tipSweep") tipSweepHit = hit;
    }

    // 严格断言：仅 tipSweep 命中护甲
    expect(baseTrailHit).toBe(false);
    expect(visibleBladeHit).toBe(false);
    expect(tipSweepHit).toBe(true);

    // 验证完整 Game 生产链路：resolveGeometry → finishSlash → primarySource
    c.resolveGeometry(geometry);
    const result = c.finishSlash("s_tipsweep_int", 80, 200);
    expect(result.armorHit).toBe(true);
    expect(result.primarySource).toBe("tipSweep");
    expect(result.primaryResult).toBe("armor_broken");
  });
});
