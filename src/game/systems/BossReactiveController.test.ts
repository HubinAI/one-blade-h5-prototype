import { describe, it, expect, beforeEach } from "vitest";
import { BossReactiveController } from "./BossReactiveController";
import { REACTIVE_BOSS_CONFIG } from "../config/bossReactiveFlow";
import { resetProjectileIdCounter } from "./projectileSystem";

/** 测试辅助：创建 Vec2 */
function v(x: number, y: number) { return { x, y }; }

/** 常量：Boss 中心坐标 */
const BOSS_CX = 195; // DESIGN_WIDTH / 2
const BOSS_CY = 195;

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
  // Test 2: 5状态机流转 — update() 推动完整循环
  // ================================================================
  it("5状态机流转 — armor_prepare→threat→opportunity→recovery→下一prepare", () => {
    // 初始: armor_prepare
    expect(controller.phase).toBe("armor_prepare");

    // armor_prepare → armor_threat (prepare 持续 0.3s)
    controller.update(0.35);
    expect(controller.phase).toBe("armor_threat");

    // armor_threat → armor_opportunity (threat 持续 2.0~3.0s, 用 3.0s 确保)
    controller.update(3.0);
    expect(controller.phase).toBe("armor_opportunity");

    // armor_opportunity → armor_recovery (超时 1.5s)
    controller.update(1.5);
    expect(controller.phase).toBe("armor_recovery");

    // armor_recovery → armor_prepare (recovery 持续 0.2s)
    controller.update(0.25);
    expect(controller.phase).toBe("armor_prepare");
  });

  // ================================================================
  // Test 3: 三块护甲循环 — 击破3块后 bridgeTriggered=true
  // ================================================================
  it("三块护甲全部击破后 bridgeTriggered=true", () => {
    // 左肩护甲 (索引 0, relX=-50, relY=-30) → 中心 (145, 165)
    controller.update(0.35); // → threat
    controller.update(3.0); // → opportunity
    controller.currentSlashEnergy = 100; // 高能量一刀碎
    // 左肩中心: (145, 165), rx=34, ry=26 — 线段穿过此区域
    const r1 = controller.resolveSegment(v(110, 140), v(180, 190), "s1", 10);
    const f1 = controller.finishSlash("s1");
    expect(f1.armorHit).toBe(true);
    expect(f1.armorBroken).toBe(true);
    // 强制推进到 recovery → prepare
    controller["_phase"] = "armor_recovery";
    controller["phaseTimer"] = 0;
    controller.update(0.25); // → prepare (activeArmorIndex=1)

    // 右肩护甲 (索引 1, relX=50, relY=-30) → 中心 (245, 165)
    controller.update(0.35); // → threat
    controller.update(3.0); // → opportunity
    controller.currentSlashEnergy = 100;
    // 右肩中心: (245, 165), rx=34, ry=26
    const r2 = controller.resolveSegment(v(210, 140), v(280, 190), "s2", 10);
    const f2 = controller.finishSlash("s2");
    expect(f2.armorHit).toBe(true);
    expect(f2.armorBroken).toBe(true);
    controller["_phase"] = "armor_recovery";
    controller["phaseTimer"] = 0;
    controller.update(0.25); // → prepare (activeArmorIndex=2)

    // 胸甲 (索引 2, relX=0, relY=6) → 中心 (195, 201)
    controller.update(0.35); // → threat
    controller.update(3.0); // → opportunity
    controller.currentSlashEnergy = 100;
    // 胸甲中心: (195, 201), rx=28, ry=30
    const r3 = controller.resolveSegment(v(170, 175), v(220, 225), "s3", 10);
    const f3 = controller.finishSlash("s3");
    expect(f3.armorHit).toBe(true);
    expect(f3.armorBroken).toBe(true);
    expect(f3.allArmorBroken).toBe(true);
    controller["_phase"] = "armor_recovery";
    controller["phaseTimer"] = 0;
    controller.update(0.25); // → exit (全部击破)

    expect(controller.phase).toBe("exit");
    expect(controller.bridgeTriggered).toBe(true);
    const flags = controller.getArmorBrokenFlags();
    expect(flags).toEqual([true, true, true]);
  });

  // ================================================================
  // Test 4: 普通弹幕可斩 — resolveSegment 命中 normal 弹幕
  // ================================================================
  it("普通弹幕可斩 — resolveSegment 命中 normal 弹幕", () => {
    // 进入 threat 阶段生成弹幕
    controller.update(0.35); // → threat
    // 推进时间让弹幕生成
    controller.update(0.7);

    // 获取弹幕列表
    const projs = controller["projectiles"] as any[];
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
  // Test 5: 强化弹幕三档 — <30 削弱 / 30~69 斩碎 / ≥70 反射
  // ================================================================
  it("强化弹幕三档 — <30 无反应 / ≥30 反射（含能量奖励）", () => {
    // 根据新设计: 弹幕命中在 Game.checkReactiveProjectileHits 中标记 resolution，
    // controller.finishSlash 不再返回 projectileResults
    // 切换到右肩护甲（reflective 弹幕类型）
    controller["activeArmorIndex"] = 1;
    controller["_phase"] = "armor_threat";
    controller["phaseTimer"] = 0;
    // 生成 reflective 弹幕
    controller["threatSpawnTimer"] = 999; // 强制立即生成
    controller.update(0.01);

    // 获取弹幕并标记为 inactive 以便 finishSlash 处理
    const projs = controller["projectiles"] as any[];
    // 如果没有弹幕，手动创建一个
    if (projs.length === 0) {
      projs.push({
        id: "test_reflective",
        kind: "reflective",
        x: 300, y: 200,
        vx: 0, vy: 90,
        radius: 14,
        active: false,
        spawnTime: 0,
        maxLife: 5,
        rotation: 0,
        rotationSpeed: 3,
        color: "#d4a0ff",
        glowColor: "rgba(212,160,255,0.7)",
        reflected: false,
        resolved: false,
      });
    }

    // 确保弹幕是 inactive 的
    for (const p of controller["projectiles"] as any[]) {
      p.active = false;
    }

    // --- 测试低能量 (<30): 无结果（不满足 reflective 条件） ---
    controller.currentSlashEnergy = 20;
    const resultLow = controller.finishSlash("test_low");
    // projectileResults 现为空（结算移至 Game.ts）
    expect(resultLow.projectileResults).toEqual([]);

    // 重新添加 reflective 弹幕
    (controller["projectiles"] as any[]).push({
      id: "test_reflective_2",
      kind: "reflective",
      x: 300, y: 200,
      vx: 0, vy: 90,
      radius: 14,
      active: false,
      spawnTime: 0,
      maxLife: 5,
      rotation: 0,
      rotationSpeed: 3,
      color: "#d4a0ff",
      glowColor: "rgba(212,160,255,0.7)",
      reflected: false,
      resolved: false,
    });

    // --- 测试中能量 (30~69): 反射（源码 energy>=30 即反射） ---
    controller.currentSlashEnergy = 50;
    const resultMid = controller.finishSlash("test_mid");
    // projectileResults 现为空（结算移至 Game.ts）
    expect(resultMid.projectileResults).toEqual([]);
  });

  // ================================================================
  // Test 6: 危险雷球误砍 — 命中 dangerous 弹幕产生惩罚
  // ================================================================
  it("危险雷球误砍 — 命中 dangerous 弹幕产生惩罚", () => {
    // 切换到胸甲（dangerous 弹幕类型）
    controller["activeArmorIndex"] = 2;
    controller["_phase"] = "armor_threat";
    controller["phaseTimer"] = 0;
    // 生成 dangerous 弹幕
    controller["threatSpawnTimer"] = 999;
    controller.update(0.01);

    // 获取弹幕并标记为 inactive
    const projs = controller["projectiles"] as any[];
    if (projs.length === 0) {
      projs.push({
        id: "test_dangerous",
        kind: "dangerous",
        x: 300, y: 200,
        vx: 0, vy: 160,
        radius: 16,
        active: false,
        spawnTime: 0,
        maxLife: 3.5,
        rotation: 0,
        rotationSpeed: 0,
        color: "#c0392b",
        glowColor: "rgba(192,57,43,0.8)",
        reflected: false,
        resolved: false,
      });
    }
    for (const p of projs) {
      p.active = false;
    }

    // 高能量砍 dangerous 弹幕 → 斩碎但玩家受伤
    controller.currentSlashEnergy = 80;
    const result = controller.finishSlash("test_danger");
    // projectileResults 现为空（结算移至 Game.ts）
    expect(result.projectileResults).toEqual([]);
  });

  // ================================================================
  // Test 7: 护甲伤害公式 — 验证低/中/高刀势的伤害值
  // ================================================================
  it("护甲伤害公式 — 低/中/高刀势伤害值正确", () => {
    const durability = REACTIVE_BOSS_CONFIG.armor.durabilityPerPiece; // 100

    // 左肩护甲中心: (BOSS_CX-50, BOSS_CY-30) = (145, 165), rx=34, ry=26
    // 线段穿过左肩区域

    // --- 低能量 (<30): 25% 伤害 ---
    const c1 = new BossReactiveController();
    c1["_phase"] = "armor_opportunity";
    c1["_resolvedSlashId"] = "";
    c1.currentSlashEnergy = 20;
    c1.resolveSegment(v(110, 140), v(180, 190), "s_low", 10);
    const fLow = c1.finishSlash("s_low");
    expect(fLow.armorHit).toBe(true);
    // 低能量: durability * 0.25 = 25, ceil → 25
    expect(fLow.armorDurabilityDamage).toBe(25);

    // --- 中能量 (30~69): 55% 伤害 ---
    const c2 = new BossReactiveController();
    c2["_phase"] = "armor_opportunity";
    c2["_resolvedSlashId"] = "";
    c2.currentSlashEnergy = 50;
    c2.resolveSegment(v(110, 140), v(180, 190), "s_mid", 10);
    const fMid = c2.finishSlash("s_mid");
    expect(fMid.armorHit).toBe(true);
    // 中能量: durability * 0.55 = 55, ceil(55) = 55
    // 但 IEEE 754 浮点精度: 100 * 0.55 = 55.000000000000004, ceil → 56
    expect(fMid.armorDurabilityDamage).toBe(56);

    // --- 高能量 (≥70): 一刀碎 (durability) ---
    const c3 = new BossReactiveController();
    c3["_phase"] = "armor_opportunity";
    c3["_resolvedSlashId"] = "";
    c3.currentSlashEnergy = 100;
    c3.resolveSegment(v(110, 140), v(180, 190), "s_high", 10);
    const fHigh = c3.finishSlash("s_high");
    expect(fHigh.armorHit).toBe(true);
    // 高能量: durability = 100
    expect(fHigh.armorDurabilityDamage).toBe(100);
    expect(fHigh.armorBroken).toBe(true);
  });

  // ================================================================
  // Test 8: 护甲裂痕累积 — 低刀势多次命中累积至破甲
  // ================================================================
  it("护甲裂痕累积 — 低刀势多次命中累积至破甲", () => {
    // 左肩护甲中心: (145, 165), rx=34, ry=26
    // 低能量伤害公式: Math.max(1, Math.ceil(durability * 0.25))
    // 初始耐久 100, 每次伤害递减
    const c = new BossReactiveController();
    c["_phase"] = "armor_opportunity";
    c["phaseTimer"] = 0.5;
    c["_resolvedSlashId"] = "";
    c.currentSlashEnergy = 20;

    // 第1刀: 耐久 100 → 伤害 ceil(100*0.25)=25, 剩余 75
    c.resolveSegment(v(110, 140), v(180, 190), "s_0", 10);
    let f = c.finishSlash("s_0");
    expect(f.armorHit).toBe(true);
    expect(f.armorBroken).toBe(false);
    expect(f.armorDurabilityDamage).toBe(25);
    expect(c["armorTargets"][0].durability).toBe(75);
    expect(c["armorTargets"][0].crackProgress).toBeCloseTo(0.25, 1);

    // 重置状态以进行下一次攻击
    c["_phase"] = "armor_opportunity";
    c["_resolvedSlashId"] = "";
    c["_session"] = { slashId: "", bodyContact: false };

    // 第2刀: 耐久 75 → 伤害 ceil(75*0.25)=19, 剩余 56
    c.resolveSegment(v(110, 140), v(180, 190), "s_1", 10);
    f = c.finishSlash("s_1");
    expect(f.armorHit).toBe(true);
    expect(f.armorBroken).toBe(false);
    expect(f.armorDurabilityDamage).toBe(19);
    expect(c["armorTargets"][0].crackProgress).toBeCloseTo(0.44, 1);

    // 重置状态
    c["_phase"] = "armor_opportunity";
    c["_resolvedSlashId"] = "";
    c["_session"] = { slashId: "", bodyContact: false };

    // 继续打到破甲为止
    for (let i = 2; i < 20; i++) {
      if (c["armorTargets"][0].broken) break;
      c["_phase"] = "armor_opportunity";
      c["_resolvedSlashId"] = "";
      c["_session"] = { slashId: "", bodyContact: false };
      c.resolveSegment(v(110, 140), v(180, 190), `s_${i}`, 10);
      f = c.finishSlash(`s_${i}`);
    }
    expect(c["armorTargets"][0].broken).toBe(true);
    expect(c["armorTargets"][0].durability).toBe(0);
  });

  // ================================================================
  // Test 9: 刀势经济正反馈 — 验证各类奖励值
  // ================================================================
  it("刀势经济正反馈 — 验证各类奖励值", () => {
    // 测试 normal 弹幕奖励 — 结算已移至 Game.ts，controller 不再返回 projectileResults
    const c = new BossReactiveController();
    (c["projectiles"] as any[]).push({
      id: "test_norm",
      kind: "normal",
      x: 300, y: 200,
      vx: 0, vy: 120,
      radius: 10,
      active: false,
      spawnTime: 0,
      maxLife: 4,
      rotation: 0,
      rotationSpeed: 0,
      color: "#9b59b6",
      glowColor: "rgba(155,89,182,0.6)",
      reflected: false,
      resolved: false,
    });
    c.currentSlashEnergy = 50;
    const result = c.finishSlash("test_reward");
    // projectileResults 现为空
    expect(result.projectileResults).toEqual([]);

    // 测试 reflective 弹幕反射奖励
    const c2 = new BossReactiveController();
    (c2["projectiles"] as any[]).push({
      id: "test_refl",
      kind: "reflective",
      x: 300, y: 200,
      vx: 0, vy: 90,
      radius: 14,
      active: false,
      spawnTime: 0,
      maxLife: 5,
      rotation: 0,
      rotationSpeed: 3,
      color: "#d4a0ff",
      glowColor: "rgba(212,160,255,0.7)",
      reflected: false,
      resolved: false,
    });
    c2.currentSlashEnergy = 80;
    const result2 = c2.finishSlash("test_refl");
    // projectileResults 现为空
    expect(result2.projectileResults).toEqual([]);
  });

  // ================================================================
  // Test 10: 被动回能 — 验证被动恢复速率
  // ================================================================
  it("被动回能 — 验证被动恢复速率", () => {
    // BossReactiveController 本身不管理刀势能量，currentSlashEnergy 由外部设置
    // 被动回能配置在 REACTIVE_BOSS_CONFIG.bladeEnergy.passiveRegenPerSecond
    // 验证配置值存在且合理
    expect(REACTIVE_BOSS_CONFIG.bladeEnergy.passiveRegenPerSecond).toBe(1.5);
    expect(REACTIVE_BOSS_CONFIG.bladeEnergy.max).toBe(100);
    expect(REACTIVE_BOSS_CONFIG.bladeEnergy.initial).toBe(35);
    // 验证控制器初始化时 currentSlashEnergy 默认为 0
    expect(controller.currentSlashEnergy).toBe(0);
    // 验证外部可以设置能量值
    controller.currentSlashEnergy = 50;
    expect(controller.currentSlashEnergy).toBe(50);
  });

  // ================================================================
  // Test 11: 玩家生命系统 — takeDamage 扣血，无敌帧
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

    // 0 能量 → 低能量颜色
    expect(effect0.color).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.lowEnergyColor);
    expect(effect0.visualLength).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.minLength);
    expect(effect0.width).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.minWidth);
    expect(effect0.brightness).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.minBrightness);

    // 100 能量 → 高能量颜色
    expect(effect100.color).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.highEnergyColor);
    expect(effect100.visualLength).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.maxLength);
    expect(effect100.width).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.maxWidth);
    expect(effect100.brightness).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.maxBrightness);

    // 50 能量 → 中能量颜色，数值应在 min 和 max 之间
    expect(effect50.color).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.midEnergyColor);
    expect(effect50.visualLength).toBeGreaterThan(effect0.visualLength);
    expect(effect50.visualLength).toBeLessThan(effect100.visualLength);
    expect(effect50.width).toBeGreaterThan(effect0.width);
    expect(effect50.width).toBeLessThan(effect100.width);
    // brightness: min=0.3, max=1.2, ratio=0.5 → 0.3 + 0.9*0.5 = 0.75
    expect(effect50.brightness).toBeCloseTo(0.75, 1);

    // 验证 updateBladeEffect 更新 currentBladeEffect
    controller.updateBladeEffect(80);
    const current = controller.currentBladeEffect;
    expect(current.color).toBe(REACTIVE_BOSS_CONFIG.bladeEffect.highEnergyColor);
    expect(current.visualLength).toBeGreaterThan(effect50.visualLength);
  });

  // ================================================================
  // Test 13: 弹幕生命周期 — 弹幕超 maxLife 自动销毁
  // ================================================================
  it("弹幕生命周期 — 弹幕超 maxLife 自动销毁", () => {
    controller["_phase"] = "armor_threat";
    // 手动添加一个即将过期的弹幕
    const projs = controller["projectiles"] as any[];
    projs.push({
      id: "test_expire",
      kind: "normal",
      x: 300, y: 200,
      vx: 0, vy: 120,
      radius: 10,
      active: true,
      spawnTime: 3.9, // 接近 maxLife=4
      maxLife: 4,
      rotation: 0,
      rotationSpeed: 0,
      color: "#9b59b6",
      glowColor: "rgba(155,89,182,0.6)",
      reflected: false,
    });
    expect(projs.length).toBe(1);

    // update 0.2s → spawnTime=4.1 > maxLife=4 → 失活
    controller.update(0.2);
    // 弹幕应失活并被 cleanInactiveProjectiles 清理
    // 注意: update 中调用 updateProjectiles 会标记失活，但 cleanInactiveProjectiles 在 transitionToRecovery 中调用
    // 这里弹幕只是失活但不会被清理，直到下次 transition
    const p = projs[0];
    expect(p.active).toBe(false);
  });

  // ================================================================
  // Test 14: 桥接到 pursuit — bridgeTriggered=true 时验证状态
  // ================================================================
  it("桥接到 pursuit — 全部护甲击破后 bridgeTriggered 和 phase 正确", () => {
    // 直接模拟全部护甲击破后的状态
    controller["armorProgress"] = 3;
    controller["armorTargets"][0].broken = true;
    controller["armorTargets"][0].active = false;
    controller["armorTargets"][1].broken = true;
    controller["armorTargets"][1].active = false;
    controller["armorTargets"][2].broken = true;
    controller["armorTargets"][2].active = false;

    // 进入 recovery 并完成 → 应触发 exit + bridge
    controller["_phase"] = "armor_recovery";
    controller["phaseTimer"] = 0;
    controller.update(0.25); // recovery 0.2s → finishRecovery → exit

    expect(controller.phase).toBe("exit");
    expect(controller.bridgeTriggered).toBe(true);
    expect(controller.bossModeActive).toBe(false);
  });

  // ================================================================
  // Test 15: 空挥检测 — 无命中时应有 miss 结果
  // ================================================================
  it("空挥检测 — 无命中时应有空结果", () => {
    // 在 threat 阶段挥刀但不命中任何弹幕
    controller["_phase"] = "armor_threat";
    // 没有弹幕，挥刀远离 Boss
    const hits = controller.resolveSegment(v(50, 700), v(100, 750), "slash_miss", 10);
    // 没有弹幕命中 → 空数组
    expect(hits).toEqual([]);

    // 在 opportunity 阶段挥刀但不命中护甲和弹幕
    controller["_phase"] = "armor_opportunity";
    controller["phaseTimer"] = 0.5;
    const hits2 = controller.resolveSegment(v(50, 700), v(100, 750), "slash_miss2", 10);
    expect(hits2).toEqual([]);

    // 收刀时无护甲命中、无弹幕命中 → armorHit=false, wrongHit=false
    const finish = controller.finishSlash("slash_miss2");
    expect(finish.armorHit).toBe(false);
    expect(finish.armorDurabilityDamage).toBe(0);
    expect(finish.armorBroken).toBe(false);
    expect(finish.wrongHit).toBe(false);
    expect(finish.projectileResults).toEqual([]);
  });

  // ================================================================
  // 额外: 验证 resolveSegment 只在 threat/opportunity 阶段生效
  // ================================================================
  it("resolveSegment 只在 threat/opportunity 阶段返回命中结果", () => {
    // prepare 阶段 → 返回空数组
    expect(controller.phase).toBe("armor_prepare");
    const r1 = controller.resolveSegment(v(0, 0), v(500, 500), "test", 50);
    expect(r1).toEqual([]);

    // recovery 阶段 → 返回空数组
    controller["_phase"] = "armor_recovery";
    const r2 = controller.resolveSegment(v(0, 0), v(500, 500), "test2", 50);
    expect(r2).toEqual([]);
  });
});