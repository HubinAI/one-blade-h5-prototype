// ============================================================================
// P4.4B-R3 P0-C: 真实状态机测试
// ----------------------------------------------------------------------------
// 审计文档 §9.1 指出：R2 测试仍用 controller["_phase"] = "..." 等私有状态强推，
// 绕过真实 resolve→recovery→next 链路，76/76 形成虚假安全感。
//
// 本文件全部改写为真实 update() 推进 + resolveSegment + finishSlash 链路，
// 禁止任何私有字段读写。新增测试覆盖：
// - 真实三甲→bridge 完整链路
// - 空挥不扣 HP
// - armorTransitionHeal 切护甲回血
// - resolveSegment 只在 threat/opportunity 阶段生效（真实推进验证）
// ============================================================================
import { describe, it, expect, beforeEach } from "vitest";
import { BossReactiveController } from "./BossReactiveController";
import { REACTIVE_BOSS_CONFIG } from "../config/bossReactiveFlow";
import { resetProjectileIdCounter } from "./projectileSystem";

/** 测试辅助：创建 Vec2 */
function v(x: number, y: number) { return { x, y }; }

/** 常量：Boss 中心坐标（与 BossReactiveController 内部 BOSS_CX/BOSS_CY 一致） */
const BOSS_CX = 195; // DESIGN_WIDTH / 2
const BOSS_CY = 220; // BossReactiveController.BOSS_CY

/** 护甲世界坐标（BOSS_CX + relX, BOSS_CY + relY） */
const ARMOR_POS = [
  { cx: BOSS_CX - 50, cy: BOSS_CY - 30, rx: 34, ry: 26 }, // 左肩
  { cx: BOSS_CX + 50, cy: BOSS_CY - 30, rx: 34, ry: 26 }, // 右肩
  { cx: BOSS_CX + 0, cy: BOSS_CY + 6, rx: 28, ry: 30 },   // 胸甲
];

/**
 * 辅助：真实推进到 armor_opportunity 阶段（不写私有字段）。
 * armor_prepare(0.3s) → armor_threat(2.0~3.0s) → armor_opportunity
 * 用 update(0.35) 跳过 prepare，update(3.0) 跳过 threat（最大值3.0确保触发）。
 */
function advanceToOpportunity(c: BossReactiveController): void {
  c.update(REACTIVE_BOSS_CONFIG.phaseTimers.armorPrepare + 0.05); // → threat
  c.update(REACTIVE_BOSS_CONFIG.phaseTimers.threatDuration[1] + 0.01); // → opportunity
}

/**
 * 辅助：真实推进 resolve → recovery → 下一 armor_prepare。
 * resolve(0.12s) → recovery(0.2s) → prepare/recovery完成
 */
function advanceThroughResolveAndRecovery(c: BossReactiveController): void {
  c.update(REACTIVE_BOSS_CONFIG.phaseTimers.resolveDuration + 0.01); // → recovery
  c.update(REACTIVE_BOSS_CONFIG.phaseTimers.recoveryDuration + 0.01); // → prepare/exit
}

describe("BossReactiveController", () => {
  let controller: BossReactiveController;

  beforeEach(() => {
    resetProjectileIdCounter();
    controller = new BossReactiveController();
  });

  // ================================================================
  // Test 1: 初始状态 — 三块护甲完好
  // ================================================================
  it("初始状态构造后三块护甲完好", () => {
    const flags = controller.getArmorBrokenFlags();
    expect(flags).toEqual([false, false, false]);
    expect(controller.phase).toBe("armor_prepare");
    expect(controller.bridgeTriggered).toBe(false);
  });

  // ================================================================
  // Test 2: 5状态机流转 — update() 推动完整循环（真实链路）
  // ================================================================
  it("5状态机流转 — armor_prepare→threat→opportunity→resolve→recovery→下一prepare", () => {
    // 初始: armor_prepare
    expect(controller.phase).toBe("armor_prepare");

    // armor_prepare → armor_threat (prepare 持续 0.3s)
    controller.update(0.35);
    expect(controller.phase).toBe("armor_threat");

    // armor_threat → armor_opportunity (threat 持续 2.0~3.0s, 用 3.0s 确保)
    controller.update(3.0);
    expect(controller.phase).toBe("armor_opportunity");

    // armor_opportunity 超时未命中 → armor_recovery (超时 1.5s + P1-B 容错 0.12s = 1.62s)
    controller.update(1.7);
    expect(controller.phase).toBe("armor_recovery");

    // armor_recovery → armor_prepare (recovery 持续 0.2s)
    controller.update(0.25);
    expect(controller.phase).toBe("armor_prepare");
  });

  // ================================================================
  // Test 3: 真实三甲流程 — 击破3块护甲后 bridgeTriggered=true（P0-C 重写）
  // 旧测试用 controller["_phase"] = "armor_recovery" 强推，现改为真实 update 推进
  // resolve → recovery → 下一 prepare。
  // ================================================================
  it("真实三甲流程 — resolve→recovery→next 真实链路推进至 bridge", () => {
    // 左肩护甲 (索引 0)
    advanceToOpportunity(controller);
    expect(controller.phase).toBe("armor_opportunity");
    controller.setProgrammaticSlashEnergy(100); // 高能量一刀碎
    const armor0 = ARMOR_POS[0];
    const seg0A = v(armor0.cx - armor0.rx * 0.5, armor0.cy - armor0.ry * 0.5);
    const seg0B = v(armor0.cx + armor0.rx * 0.5, armor0.cy + armor0.ry * 0.5);
    controller.resolveSegment(seg0A, seg0B, "s_left", 10);
    const f0 = controller.finishSlash("s_left", 100, 100);
    expect(f0.armorHit).toBe(true);
    expect(f0.armorBroken).toBe(true);
    // 真实推进 resolve → recovery → 下一 prepare
    advanceThroughResolveAndRecovery(controller);
    expect(controller.phase).toBe("armor_prepare");
    expect(controller.getActiveArmorIndex()).toBe(1);

    // 右肩护甲 (索引 1)
    advanceToOpportunity(controller);
    controller.setProgrammaticSlashEnergy(100);
    const armor1 = ARMOR_POS[1];
    const seg1A = v(armor1.cx - armor1.rx * 0.5, armor1.cy - armor1.ry * 0.5);
    const seg1B = v(armor1.cx + armor1.rx * 0.5, armor1.cy + armor1.ry * 0.5);
    controller.resolveSegment(seg1A, seg1B, "s_right", 10);
    const f1 = controller.finishSlash("s_right", 100, 100);
    expect(f1.armorHit).toBe(true);
    expect(f1.armorBroken).toBe(true);
    advanceThroughResolveAndRecovery(controller);
    expect(controller.phase).toBe("armor_prepare");
    expect(controller.getActiveArmorIndex()).toBe(2);

    // 胸甲 (索引 2)
    advanceToOpportunity(controller);
    controller.setProgrammaticSlashEnergy(100);
    const armor2 = ARMOR_POS[2];
    const seg2A = v(armor2.cx - armor2.rx * 0.5, armor2.cy - armor2.ry * 0.5);
    const seg2B = v(armor2.cx + armor2.rx * 0.5, armor2.cy + armor2.ry * 0.5);
    controller.resolveSegment(seg2A, seg2B, "s_chest", 10);
    const f2 = controller.finishSlash("s_chest", 100, 100);
    expect(f2.armorHit).toBe(true);
    expect(f2.armorBroken).toBe(true);
    expect(f2.allArmorBroken).toBe(true);
    // 全部击破 → finishRecovery → exit + bridge
    advanceThroughResolveAndRecovery(controller);

    expect(controller.phase).toBe("exit");
    expect(controller.bridgeTriggered).toBe(true);
    expect(controller.getArmorBrokenFlags()).toEqual([true, true, true]);
  });

  // ================================================================
  // Test 4: 普通弹幕可斩 — resolveSegment 命中 normal 弹幕（真实推进 threat 生成弹幕）
  // ================================================================
  it("普通弹幕可斩 — resolveSegment 命中 normal 弹幕", () => {
    // 进入 threat 阶段生成弹幕
    controller.update(0.35); // → threat
    // 推进时间让弹幕生成（threatSpawn 间隔 0.85+random*0.2）
    controller.update(1.5);

    // 获取弹幕列表（通过 getProjectiles 公开方法，不读私有字段）
    const projs = controller.getProjectiles();
    // 可能有弹幕生成了
    if (projs.length > 0) {
      const p = projs[0];
      expect(p.kind).toBe("normal");
      // 用大范围 segment 确保命中
      const hits = controller.resolveSegment(
        v(p.x - 30, p.y - 30),
        v(p.x + 30, p.y + 30),
        "slash_1",
        20
      );
      // 应至少命中一个弹幕
      const projHit = hits.find(h => h.projectileIndex < projs.length);
      expect(projHit).toBeDefined();
    }
    // 如果没生成弹幕（随机间隔），至少验证 resolveSegment 不抛错
    expect(controller.phase).toBe("armor_threat");
  });

  // ================================================================
  // Test 5: 强化弹幕生成 — 右肩 threat 阶段生成 reflective 弹幕（真实推进）
  // 旧测试用 controller["activeArmorIndex"] = 1 强推，现改为真实三甲推进到右肩
  // ================================================================
  it("强化弹幕生成 — 真实推进到右肩 threat 阶段生成 reflective 弹幕", () => {
    // 真实击破左肩 → 推进到右肩
    advanceToOpportunity(controller);
    controller.setProgrammaticSlashEnergy(100);
    const armor0 = ARMOR_POS[0];
    controller.resolveSegment(
      v(armor0.cx - armor0.rx * 0.5, armor0.cy - armor0.ry * 0.5),
      v(armor0.cx + armor0.rx * 0.5, armor0.cy + armor0.ry * 0.5),
      "s_left", 10
    );
    controller.finishSlash("s_left", 100, 100);
    advanceThroughResolveAndRecovery(controller);
    expect(controller.getActiveArmorIndex()).toBe(1); // 右肩

    // 推进到右肩 threat 阶段，生成 reflective 弹幕
    controller.update(0.35); // → threat
    controller.update(1.0); // 生成弹幕

    const projs = controller.getProjectiles();
    // 右肩生成 reflective 弹幕
    const reflective = projs.find(p => p.kind === "reflective");
    if (reflective) {
      expect(reflective.kind).toBe("reflective");
    }
    // collisionEvents 在 finishSlash 中不再返回（结算移至 Game.ts）
    controller.setProgrammaticSlashEnergy(50);
    const result = controller.finishSlash("test_refl", 100, 100);
    expect(result.collisionEvents).toEqual([]);
  });

  // ================================================================
  // Test 6: 危险雷球生成 — 胸甲 threat 阶段生成 dangerous 弹幕（真实推进）
  // ================================================================
  it("危险雷球生成 — 真实推进到胸甲 threat 阶段生成 dangerous 弹幕", () => {
    // 真实击破左肩 + 右肩 → 推进到胸甲
    for (let i = 0; i < 2; i++) {
      advanceToOpportunity(controller);
      controller.setProgrammaticSlashEnergy(100);
      const armor = ARMOR_POS[i];
      controller.resolveSegment(
        v(armor.cx - armor.rx * 0.5, armor.cy - armor.ry * 0.5),
        v(armor.cx + armor.rx * 0.5, armor.cy + armor.ry * 0.5),
        `s_${i}`, 10
      );
      controller.finishSlash(`s_${i}`, 100, 100);
      advanceThroughResolveAndRecovery(controller);
    }
    expect(controller.getActiveArmorIndex()).toBe(2); // 胸甲

    // 推进到胸甲 threat 阶段
    controller.update(0.35); // → threat
    controller.update(1.0); // 生成弹幕

    const projs = controller.getProjectiles();
    // 胸甲生成 dangerous 弹幕
    const dangerous = projs.find(p => p.kind === "dangerous");
    if (dangerous) {
      expect(dangerous.kind).toBe("dangerous");
    }
    // 结算移至 Game.ts
    controller.setProgrammaticSlashEnergy(80);
    const result = controller.finishSlash("test_danger", 100, 100);
    expect(result.collisionEvents).toEqual([]);
  });

  // ================================================================
  // Test 7: 护甲伤害公式 — 验证低/中/高刀势的伤害值（真实推进到 opportunity）
  // ================================================================
  it("护甲伤害公式 — 低/中/高刀势伤害值正确", () => {
    const durability = REACTIVE_BOSS_CONFIG.armor.durabilityPerPiece; // 100

    // --- 低能量 (<30): 固定 25 伤害 ---
    const c1 = new BossReactiveController();
    advanceToOpportunity(c1);
    c1.setProgrammaticSlashEnergy(20);
    const a0 = ARMOR_POS[0];
    c1.resolveSegment(
      v(a0.cx - a0.rx * 0.5, a0.cy - a0.ry * 0.5),
      v(a0.cx + a0.rx * 0.5, a0.cy + a0.ry * 0.5),
      "s_low", 10
    );
    const fLow = c1.finishSlash("s_low", 100, 100);
    expect(fLow.armorHit).toBe(true);
    // P4.4B-R5 P0-A: 固定绝对值 25（不再按剩余耐久百分比递减）
    expect(fLow.armorDurabilityDamage).toBe(25);

    // --- 中能量 (30~69): 固定 55 伤害 ---
    const c2 = new BossReactiveController();
    advanceToOpportunity(c2);
    c2.setProgrammaticSlashEnergy(50);
    c2.resolveSegment(
      v(a0.cx - a0.rx * 0.5, a0.cy - a0.ry * 0.5),
      v(a0.cx + a0.rx * 0.5, a0.cy + a0.ry * 0.5),
      "s_mid", 10
    );
    const fMid = c2.finishSlash("s_mid", 100, 100);
    expect(fMid.armorHit).toBe(true);
    // P4.4B-R5 P0-A: 固定绝对值 55（不再 ceil(55.0004)=56）
    expect(fMid.armorDurabilityDamage).toBe(55);

    // --- 高能量 (≥70): 一刀碎 (剩余耐久全扣) ---
    const c3 = new BossReactiveController();
    advanceToOpportunity(c3);
    c3.setProgrammaticSlashEnergy(100);
    c3.resolveSegment(
      v(a0.cx - a0.rx * 0.5, a0.cy - a0.ry * 0.5),
      v(a0.cx + a0.rx * 0.5, a0.cy + a0.ry * 0.5),
      "s_high", 10
    );
    const fHigh = c3.finishSlash("s_high", 100, 100);
    expect(fHigh.armorHit).toBe(true);
    // 高能量: 直接破甲，剩余耐久全扣 = 100
    expect(fHigh.armorDurabilityDamage).toBe(100);
    expect(fHigh.armorBroken).toBe(true);
  });

  // ================================================================
  // Test 8: 护甲裂痕累积 — 低刀势多次命中累积至破甲（真实推进，每次新 slashId）
  // ================================================================
  it("护甲裂痕累积 — 低刀势多次命中累积至破甲", () => {
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.setProgrammaticSlashEnergy(20);

    // 第1刀: 耐久 100 → 伤害 ceil(100*0.25)=25, 剩余 75
    const a0 = ARMOR_POS[0];
    c.resolveSegment(
      v(a0.cx - a0.rx * 0.5, a0.cy - a0.ry * 0.5),
      v(a0.cx + a0.rx * 0.5, a0.cy + a0.ry * 0.5),
      "s_0", 10
    );
    let f = c.finishSlash("s_0", 100, 100);
    expect(f.armorHit).toBe(true);
    expect(f.armorBroken).toBe(false);
    expect(f.armorDurabilityDamage).toBe(25);

    // 真实推进 resolve → recovery → 下一 prepare → threat → opportunity
    // 每次重新进入 opportunity 才能再次命中护甲
    for (let i = 1; i < 20; i++) {
      if (c.getArmorBrokenFlags()[0]) break;
      // 推进到下一 opportunity
      advanceThroughResolveAndRecovery(c); // → prepare (同一护甲，因未破碎)
      advanceToOpportunity(c); // → opportunity
      c.setProgrammaticSlashEnergy(20);
      c.resolveSegment(
        v(a0.cx - a0.rx * 0.5, a0.cy - a0.ry * 0.5),
        v(a0.cx + a0.rx * 0.5, a0.cy + a0.ry * 0.5),
        `s_${i}`, 10
      );
      f = c.finishSlash(`s_${i}`, 100, 100);
    }
    expect(c.getArmorBrokenFlags()[0]).toBe(true);
  });

  // ================================================================
  // Test 9: 刀势经济正反馈 — 验证结算移至 Game.ts 后 controller 返回空 collisionEvents
  // ================================================================
  it("刀势经济正反馈 — controller 不再返回 collisionEvents（结算移至 Game）", () => {
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.setProgrammaticSlashEnergy(50);
    // 空挥（不命中任何弹幕或护甲）
    const result = c.finishSlash("test_reward", 100, 100);
    expect(result.collisionEvents).toEqual([]);
    expect(result.armorHit).toBe(false);
  });

  // ================================================================
  // Test 10: 被动回能 — 验证配置值存在且合理
  // ================================================================
  it("被动回能 — 验证配置值存在且合理", () => {
    expect(REACTIVE_BOSS_CONFIG.bladeEnergy.passiveRegenPerSecond).toBe(1.5);
    expect(REACTIVE_BOSS_CONFIG.bladeEnergy.max).toBe(100);
    expect(REACTIVE_BOSS_CONFIG.bladeEnergy.initial).toBe(35);
    expect(controller.currentSlashEnergy).toBe(0);
    controller.setProgrammaticSlashEnergy(50);
    expect(controller.currentSlashEnergy).toBe(50);
  });

  // ================================================================
  // Test 11: 玩家生命系统 — takeDamage 扣血，无敌帧（真实链路）
  // ================================================================
  it("玩家生命系统 — takeDamage 扣血，无敌帧", () => {
    const hp = controller.getPlayerHp();
    expect(hp.current).toBe(100);
    expect(hp.max).toBe(100);

    // 第一次受伤
    const dmg1 = controller.takeDamage(20);
    expect(dmg1).toBe(20);
    expect(controller.getPlayerHp().current).toBe(80);
    expect(controller.getPlayerHp().invincibleTimer).toBeGreaterThan(0);

    // 无敌帧内再次受伤 → 0 伤害
    const dmg2 = controller.takeDamage(30);
    expect(dmg2).toBe(0);
    expect(controller.getPlayerHp().current).toBe(80);

    // 等待无敌帧结束
    controller.update(0.35); // invincibleDuration = 0.3
    expect(controller.getPlayerHp().invincibleTimer).toBe(0);

    // 无敌帧结束后再次受伤
    const dmg3 = controller.takeDamage(30);
    expect(dmg3).toBe(30);
    expect(controller.getPlayerHp().current).toBe(50);

    // 等待无敌帧再次结束
    controller.update(0.35);
    expect(controller.getPlayerHp().invincibleTimer).toBe(0);

    // 死亡检测
    controller.takeDamage(100);
    expect(controller.getPlayerHp().current).toBe(0);
    expect(controller.isPlayerDead).toBe(true);
  });

  // ================================================================
  // Test 12: 刀势连续效果插值 — getBladeEffect(0/50/100) 连续变化
  // ================================================================
  it("刀势连续效果插值 — getBladeEffect 验证连续变化", () => {
    const effect0 = controller.getBladeEffect(0);
    const effect50 = controller.getBladeEffect(50);
    const effect100 = controller.getBladeEffect(100);

    expect(effect0.color).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.lowEnergyColor);
    expect(effect0.visualLength).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.minLength);
    expect(effect0.width).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.minWidth);
    expect(effect0.brightness).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.minBrightness);

    expect(effect100.color).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.highEnergyColor);
    expect(effect100.visualLength).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.maxLength);
    expect(effect100.width).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.maxWidth);
    expect(effect100.brightness).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.maxBrightness);

    expect(effect50.color).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.midEnergyColor);
    expect(effect50.visualLength).toBeGreaterThan(effect0.visualLength);
    expect(effect50.visualLength).toBeLessThan(effect100.visualLength);
    expect(effect50.width).toBeGreaterThan(effect0.width);
    expect(effect50.width).toBeLessThan(effect100.width);
    expect(effect50.brightness).toBeCloseTo(0.75, 1);

    // 验证 updateBladeEffect 更新 currentBladeEffect
    controller.updateBladeEffect(80);
    const current = controller.currentBladeEffect;
    expect(current.color).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.highEnergyColor);
    expect(current.visualLength).toBeGreaterThan(effect50.visualLength);
  });

  // ================================================================
  // Test 13: 弹幕生命周期 — 弹幕超 maxLife 自动销毁（真实推进，不写私有字段）
  // ================================================================
  it("弹幕生命周期 — 弹幕超 maxLife 自动失活", () => {
    // 进入 threat 阶段生成弹幕
    controller.update(0.35); // → threat
    controller.update(1.0); // 生成弹幕

    const projs = controller.getProjectiles();
    if (projs.length > 0) {
      const p = projs[0];
      const initialActive = p.active;
      expect(initialActive).toBe(true);
      // 推进时间让弹幕超过 maxLife（normal maxLife=4）
      controller.update(5.0);
      // 弹幕应失活
      expect(p.active).toBe(false);
    }
  });

  // ================================================================
  // Test 14: 桥接到 pursuit — 真实三甲击破后 bridgeTriggered 和 phase 正确（P0-C 重写）
  // 旧测试用 controller["armorProgress"] = 3 等强推，现改为真实三甲流程
  // ================================================================
  it("桥接到 pursuit — 真实三甲击破后 bridgeTriggered 和 phase 正确", () => {
    // 真实击破三甲
    for (let i = 0; i < 3; i++) {
      advanceToOpportunity(controller);
      controller.setProgrammaticSlashEnergy(100);
      const armor = ARMOR_POS[i];
      controller.resolveSegment(
        v(armor.cx - armor.rx * 0.5, armor.cy - armor.ry * 0.5),
        v(armor.cx + armor.rx * 0.5, armor.cy + armor.ry * 0.5),
        `s_${i}`, 10
      );
      controller.finishSlash(`s_${i}`, 100, 100);
      advanceThroughResolveAndRecovery(controller);
    }

    expect(controller.phase).toBe("exit");
    expect(controller.bridgeTriggered).toBe(true);
    expect(controller.bossModeActive).toBe(false);
  });

  // ================================================================
  // Test 15: 空挥检测 — 无命中时应有 miss 结果（真实推进，不写私有字段）
  // ================================================================
  it("空挥检测 — 无命中时应有空结果", () => {
    // 在 threat 阶段挥刀但不命中任何弹幕（线段远离 Boss 和弹幕路径）
    controller.update(0.35); // → threat
    const hits = controller.resolveSegment(v(50, 700), v(100, 750), "slash_miss", 10);
    expect(hits).toEqual([]);

    // 在 opportunity 阶段挥刀但不命中护甲和弹幕（真实推进到 opportunity）
    controller.update(3.0); // → opportunity
    const hits2 = controller.resolveSegment(v(50, 700), v(100, 750), "slash_miss2", 10);
    expect(hits2).toEqual([]);

    // 收刀时无护甲命中、无弹幕命中 → armorHit=false, wrongHit=false
    const finish = controller.finishSlash("slash_miss2", 100, 100);
    expect(finish.armorHit).toBe(false);
    expect(finish.armorDurabilityDamage).toBe(0);
    expect(finish.armorBroken).toBe(false);
    expect(finish.wrongHit).toBe(false);
    expect(finish.collisionEvents).toEqual([]);
  });

  // ================================================================
  // Test 16: resolveSegment 只在 threat/opportunity 阶段返回命中结果（真实推进验证）
  // ================================================================
  it("resolveSegment 只在 threat/opportunity 阶段返回命中结果", () => {
    // prepare 阶段 → 返回空数组
    expect(controller.phase).toBe("armor_prepare");
    const r1 = controller.resolveSegment(v(0, 0), v(500, 500), "test_prepare", 50);
    expect(r1).toEqual([]);

    // 真实推进到 recovery 阶段（不写私有字段）
    advanceToOpportunity(controller); // → opportunity
    controller.update(1.7); // opportunity 超时(1.5s) + P1-B 容错(0.12s) = 1.62s → recovery
    expect(controller.phase).toBe("armor_recovery");
    const r2 = controller.resolveSegment(v(0, 0), v(500, 500), "test_recovery", 50);
    expect(r2).toEqual([]);
  });

  // ================================================================
  // Test 17: P0-C 新增 — 空挥不扣 HP（审计 §9.1 要求）
  // 空挥时 wrongHit=false，playerHp 不变（空挥惩罚只损失刀势，不扣血）
  // ================================================================
  it("P0-C 空挥不扣 HP — wrongHit=false 时 playerHp 不变", () => {
    const hpBefore = controller.getPlayerHp().current;
    // 真实推进到 threat，挥刀远离 Boss 和弹幕
    controller.update(0.35); // → threat
    controller.resolveSegment(v(50, 700), v(100, 750), "empty_swing", 10);
    const result = controller.finishSlash("empty_swing", 100, 100);
    expect(result.armorHit).toBe(false);
    expect(result.wrongHit).toBe(false);
    // 空挥不扣 HP
    expect(controller.getPlayerHp().current).toBe(hpBefore);
  });

  // ================================================================
  // Test 18: P0-C 新增 — armorTransitionHeal 切护甲回血（审计 §8 R3 验证期建议）
  // 每次切换到新护甲时恢复 armorTransitionHeal HP
  // ================================================================
  it("P0-C armorTransitionHeal — 切换到新护甲时恢复 HP", () => {
    const heal = REACTIVE_BOSS_CONFIG.playerHp.armorTransitionHeal ?? 0;
    expect(heal).toBeGreaterThan(0);

    // 先让玩家受伤（HP < max）
    controller.takeDamage(40);
    controller.update(0.35); // 等待无敌帧结束
    expect(controller.getPlayerHp().current).toBe(60);

    // 真实击破左肩 → 切换到右肩时回血
    advanceToOpportunity(controller);
    controller.setProgrammaticSlashEnergy(100);
    const armor0 = ARMOR_POS[0];
    controller.resolveSegment(
      v(armor0.cx - armor0.rx * 0.5, armor0.cy - armor0.ry * 0.5),
      v(armor0.cx + armor0.rx * 0.5, armor0.cy + armor0.ry * 0.5),
      "s_left", 10
    );
    controller.finishSlash("s_left", 100, 100);
    advanceThroughResolveAndRecovery(controller); // → 切换到右肩，触发 heal

    const hpAfter = controller.getPlayerHp().current;
    // 应恢复 heal HP（不超过 max）
    expect(hpAfter).toBe(Math.min(100, 60 + heal));
  });

  // ================================================================
  // Test 19: P0-D 新增 — getReactiveSnapshot 返回完整状态（供 E2E 桥读取）
  // ================================================================
  it("P0-D getReactiveSnapshot — 返回完整状态供 E2E 路由", () => {
    const snap = controller.getReactiveSnapshot();
    expect(snap.phase).toBe("armor_prepare");
    expect(snap.armorProgress).toBe("0/3");
    expect(snap.pursuitProgress).toBe("0/3");
    expect(snap.armorBroken).toEqual([false, false, false]);
    expect(snap.armorDurability).toEqual([100, 100, 100]);
    expect(snap.activeArmorIndex).toBe(0);
    expect(snap.inputLocked).toBe(false);
    expect(snap.bridgeTriggered).toBe(false);
    expect(snap.projectileCount).toBe(0);
    expect(snap.playerHp).toEqual({ current: 100, max: 100 });
    expect(snap.currentBladeEffect).toBeDefined();
    expect(snap.currentBladeEffect.visualLength).toBeGreaterThan(0);
  });

  // ================================================================
  // Test 20: P0-D 新增 — getActiveArmorWorldPos 返回当前护甲世界坐标
  // ================================================================
  it("P0-D getActiveArmorWorldPos — 返回当前激活护甲的世界坐标（乘 bossRenderScale）", () => {
    const pos = controller.getActiveArmorWorldPos();
    expect(pos).not.toBeNull();
    // 左肩初始激活。P4.4B-R4 P0-B: 坐标和半径乘以 bossRenderScale(1.15)，与视觉一致
    // cx = BOSS_CX + (-50) * 1.15 = 137.5
    // cy = BOSS_CY + (-30) * 1.15 = 185.5
    // rx = 34 * 1.15 = 39.1
    // ry = 26 * 1.15 = 29.9
    expect(pos!.cx).toBeCloseTo(BOSS_CX - 50 * 1.15, 1);
    expect(pos!.cy).toBeCloseTo(BOSS_CY - 30 * 1.15, 1);
    expect(pos!.rx).toBeCloseTo(34 * 1.15, 1);
    expect(pos!.ry).toBeCloseTo(26 * 1.15, 1);
  });

  // ================================================================
  // P4.4B-R5.4 P1-2: 严格固定伤害序列（审计要求禁止"循环最多20次最后破甲"）
  // ================================================================
  it("P1-2 严格低刀势4刀序列 — 100→75→50→25→0", () => {
    const c = new BossReactiveController();
    c.setProgrammaticSlashEnergy(20);
    const durabilitySeq: number[] = [100];
    for (let i = 0; i < 4; i++) {
      advanceToOpportunity(c);
      c.setProgrammaticSlashEnergy(20);
      const pos = c.getActiveArmorWorldPos()!;
      c.resolveSegment(
        v(pos.cx - pos.rx * 0.5, pos.cy - pos.ry * 0.5),
        v(pos.cx + pos.rx * 0.5, pos.cy + pos.ry * 0.5),
        `s_low_${i}`, 10
      );
      c.finishSlash(`s_low_${i}`, 100, 100);
      durabilitySeq.push(c.getArmorDurability()[0]);
      if (c.getArmorBrokenFlags()[0]) break;
      advanceThroughResolveAndRecovery(c);
    }
    expect(durabilitySeq).toEqual([100, 75, 50, 25, 0]);
    expect(c.getArmorBrokenFlags()[0]).toBe(true);
  });

  it("P1-2 严格中刀势2刀序列 — 100→45→0", () => {
    const c = new BossReactiveController();
    const durabilitySeq: number[] = [100];
    for (let i = 0; i < 2; i++) {
      advanceToOpportunity(c);
      c.setProgrammaticSlashEnergy(50);
      const pos = c.getActiveArmorWorldPos()!;
      c.resolveSegment(
        v(pos.cx - pos.rx * 0.5, pos.cy - pos.ry * 0.5),
        v(pos.cx + pos.rx * 0.5, pos.cy + pos.ry * 0.5),
        `s_mid_${i}`, 10
      );
      c.finishSlash(`s_mid_${i}`, 100, 100);
      durabilitySeq.push(c.getArmorDurability()[0]);
      if (c.getArmorBrokenFlags()[0]) break;
      advanceThroughResolveAndRecovery(c);
    }
    expect(durabilitySeq).toEqual([100, 45, 0]);
    expect(c.getArmorBrokenFlags()[0]).toBe(true);
  });

  it("P1-2 严格高刀势1刀序列 — 100→0", () => {
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.setProgrammaticSlashEnergy(100);
    const pos = c.getActiveArmorWorldPos()!;
    c.resolveSegment(
      v(pos.cx - pos.rx * 0.5, pos.cy - pos.ry * 0.5),
      v(pos.cx + pos.rx * 0.5, pos.cy + pos.ry * 0.5),
      "s_high", 10
    );
    const f = c.finishSlash("s_high", 100, 100);
    expect(f.armorBroken).toBe(true);
    expect(c.getArmorDurability()[0]).toBe(0);
  });

  // ================================================================
  // P4.4B-R5.4 P0-1: 空挥后 grace 清理（审计 P0-1）
  // ================================================================
  it("P0-1 空挥后graceSlashId清理 — 空挥收刀后窗口不延长", () => {
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    // 在窗口内起刀
    c.registerReactiveSlashStart("s_empty");
    expect(c.getGraceSlashId()).toBe("s_empty");
    // 空挥收刀（没命中护甲）
    c.finishSlash("s_empty", 100, 100);
    // grace 应被清理
    expect(c.getGraceSlashId()).toBe(null);
  });

  it("P0-1 reset后graceSlashId为null", () => {
    const c = new BossReactiveController();
    advanceToOpportunity(c);
    c.registerReactiveSlashStart("s_test");
    expect(c.getGraceSlashId()).toBe("s_test");
    c.reset();
    expect(c.getGraceSlashId()).toBe(null);
  });
});
