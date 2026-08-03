/**
 * 0807-11B-1: 统一伤害与真实HP — 单元测试
 *
 * 覆盖：
 * 1. 伤害公式计算
 * 2. 步兵75HP断点
 * 3. 105HP测试目标断点
 * 4. 攻击快照
 * 5. 死亡保护
 * 6. 溢出伤害
 * 7. 威胁物销毁
 */
import { describe, it, expect } from "vitest";
import {
  createDefaultPlayerStats,
  getCurrentAttack,
  computeRawDamage,
  resolveDamage,
  resolveThreatDamage,
  DAMAGE_SOURCE_REGISTRY,
  FINAL_DAMAGE_REDUCTION_CAP,
  type DamageRequest,
  type PlayerRunStats,
  type DamageResult,
} from "./damageSystem";

function makeRequest(overrides: Partial<DamageRequest> = {}): DamageRequest {
  return {
    actionId: "test-1",
    parentActionId: "slash-1",
    sourceType: "MAIN_SLASH",
    sourceConfig: DAMAGE_SOURCE_REGISTRY.MAIN_SLASH,
    attackerId: "player",
    targetId: "enemy-1",
    targetCategory: "ENEMY",
    skillCoefficient: 1.00,
    stats: createDefaultPlayerStats(100),
    bladeBand: "low",
    tags: ["main"],
    hitPos: { x: 100, y: 400 },
    timestamp: 0,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════
// 伤害公式
// ═══════════════════════════════════════════════════════

describe("DamageSystem - 公式", () => {
  it("基础攻击100，主刀1.00，低刀势 → 100伤害", () => {
    const req = makeRequest();
    const raw = computeRawDamage(req);
    expect(Math.round(raw)).toBe(100);
  });

  it("中刀势（+10%）→ 110伤害", () => {
    const stats = createDefaultPlayerStats(100);
    stats.bladeDamageBonus = 0.10;
    const req = makeRequest({ stats, bladeBand: "mid" });
    const raw = computeRawDamage(req);
    expect(Math.round(raw)).toBe(110);
  });

  it("高刀势（+25%）→ 125伤害", () => {
    const stats = createDefaultPlayerStats(100);
    stats.bladeDamageBonus = 0.25;
    const req = makeRequest({ stats, bladeBand: "high" });
    const raw = computeRawDamage(req);
    expect(Math.round(raw)).toBe(125);
  });

  it("局内攻击提升（runAttackBonus=0.2）→ currentAttack=120", () => {
    const stats = createDefaultPlayerStats(100);
    stats.runAttackBonus = 0.20;
    expect(getCurrentAttack(stats)).toBe(120);
    const req = makeRequest({ stats });
    const raw = computeRawDamage(req);
    expect(Math.round(raw)).toBe(120);
  });

  it("条件增伤进入普通增伤区（+10%）→ 120伤害", () => {
    const stats = createDefaultPlayerStats(100);
    stats.bladeDamageBonus = 0.10;
    stats.conditionDamageBonus = 0.10;
    const req = makeRequest({ stats });
    // 100 * 1.0 * (1 + 0.10 + 0.10) = 120
    const raw = computeRawDamage(req);
    expect(Math.round(raw)).toBe(120);
  });

  it("最终增伤默认0时不改变结果", () => {
    const req = makeRequest();
    const raw = computeRawDamage(req);
    expect(Math.round(raw)).toBe(100);
  });

  it("最终减伤默认0时不改变结果", () => {
    const req = makeRequest();
    const raw = computeRawDamage(req, 0);
    expect(Math.round(raw)).toBe(100);
  });

  it("最终减伤上限保护有效（不超0.8）", () => {
    const req = makeRequest();
    // 即使传入1.0（100%减伤），也只应用0.8
    const raw = computeRawDamage(req, 1.0);
    // 100 * (1 - 0.8) = 20
    expect(Math.round(raw)).toBe(20);
  });

  it("计算过程保留小数，最终Math.round", () => {
    const stats = createDefaultPlayerStats(100);
    stats.bladeDamageBonus = 0.10;
    const req = makeRequest({ stats, skillCoefficient: 0.75 });
    // 100 * 0.75 * 1.10 = 82.5 → round → 83
    const raw = computeRawDamage(req);
    expect(raw).toBeCloseTo(82.5, 1);
    expect(Math.round(raw)).toBe(83);
  });

  it("无敌目标不受最低1点伤害穿透", () => {
    const req = makeRequest();
    const result = resolveDamage(req, 100, 100, true, true); // alive + immune
    expect(result).not.toBeNull();
    expect(result!.isAccepted).toBe(false);
    expect(result!.isImmune).toBe(true);
    expect(result!.effectiveHpLoss).toBe(0);
    expect(result!.resolvedDamage).toBe(0);
  });

  it("已死亡目标拒绝伤害", () => {
    const req = makeRequest();
    const result = resolveDamage(req, 0, 100, false, false); // not alive
    expect(result).not.toBeNull();
    expect(result!.isAccepted).toBe(false);
    expect(result!.effectiveHpLoss).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// 步兵75HP断点
// ═══════════════════════════════════════════════════════

describe("DamageSystem - 75HP 基础兵断点", () => {
  const enemyHp = 75;
  const enemyMaxHp = 75;

  it("低刀势主刀100 → 75HP敌人 → 一刀击杀", () => {
    const req = makeRequest();
    const result = resolveDamage(req, enemyHp, enemyMaxHp, true, false);
    expect(result!.isAccepted).toBe(true);
    expect(result!.isKill).toBe(true);
    expect(result!.hpAfter).toBe(0);
    expect(result!.effectiveHpLoss).toBe(75); // 只扣除75，溢出25
    expect(result!.resolvedDamage).toBe(100);
  });

  it("中刀势主刀110 → 75HP敌人 → 一刀击杀", () => {
    const stats = createDefaultPlayerStats(100);
    stats.bladeDamageBonus = 0.10;
    const req = makeRequest({ stats, bladeBand: "mid" });
    const result = resolveDamage(req, enemyHp, enemyMaxHp, true, false);
    expect(result!.isKill).toBe(true);
    expect(result!.hpAfter).toBe(0);
  });

  it("高刀势主刀125 → 75HP敌人 → 一刀击杀", () => {
    const stats = createDefaultPlayerStats(100);
    stats.bladeDamageBonus = 0.25;
    const req = makeRequest({ stats, bladeBand: "high" });
    const result = resolveDamage(req, enemyHp, enemyMaxHp, true, false);
    expect(result!.isKill).toBe(true);
    expect(result!.hpAfter).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// 105HP 测试目标断点
// ═══════════════════════════════════════════════════════

describe("DamageSystem - 105HP Debug目标断点", () => {
  const targetHp = 105;

  it("低刀势主刀100 → 剩5HP", () => {
    const req = makeRequest();
    const result = resolveDamage(req, targetHp, targetHp, true, false);
    expect(result!.isKill).toBe(false);
    expect(result!.hpAfter).toBe(5);
    expect(result!.effectiveHpLoss).toBe(100);
  });

  it("中刀势主刀110 → 一刀击杀", () => {
    const stats = createDefaultPlayerStats(100);
    stats.bladeDamageBonus = 0.10;
    const req = makeRequest({ stats, bladeBand: "mid" });
    const result = resolveDamage(req, targetHp, targetHp, true, false);
    expect(result!.isKill).toBe(true);
    expect(result!.hpAfter).toBe(0);
    expect(result!.effectiveHpLoss).toBe(105);
  });

  it("高刀势主刀125 → 一刀击杀", () => {
    const stats = createDefaultPlayerStats(100);
    stats.bladeDamageBonus = 0.25;
    const req = makeRequest({ stats, bladeBand: "high" });
    const result = resolveDamage(req, targetHp, targetHp, true, false);
    expect(result!.isKill).toBe(true);
    expect(result!.hpAfter).toBe(0);
  });

  it("105HP目标第二次低刀势攻击：补刀5HP → 击杀", () => {
    const req = makeRequest();
    const result = resolveDamage(req, 5, targetHp, true, false); // 剩余5HP
    expect(result!.isKill).toBe(true);
    expect(result!.hpAfter).toBe(0);
    expect(result!.effectiveHpLoss).toBe(5);
    expect(result!.isOverkill).toBe(true); // 100伤害打在5HP上
    expect(result!.resolvedDamage).toBe(100); // 飘字显示100
  });
});

// ═══════════════════════════════════════════════════════
// 溢出伤害 + death protection
// ═══════════════════════════════════════════════════════

describe("DamageSystem - 溢出伤害与死亡保护", () => {
  it("resolvedDamage 和 effectiveHpLoss 正确区分", () => {
    const req = makeRequest();
    const result = resolveDamage(req, 20, 100, true, false); // 剩余20HP
    expect(result!.resolvedDamage).toBe(100);   // 飘字显示100
    expect(result!.effectiveHpLoss).toBe(20);   // 实际只扣20
    expect(result!.isOverkill).toBe(true);
  });

  it("目标死亡后后续伤害段被拒绝", () => {
    const req = makeRequest({ actionId: "dmg-2" });
    const result = resolveDamage(req, 0, 100, false, false); // 已死亡
    expect(result!.isAccepted).toBe(false);
    expect(result!.effectiveHpLoss).toBe(0);
  });

  it("hpAfter ≤ 0 时 isKill = true", () => {
    const req = makeRequest();
    const result = resolveDamage(req, 80, 80, true, false);
    expect(result!.isKill).toBe(true);
    expect(result!.hpAfter).toBe(0);
    expect(result!.killCreditSource).toBe("MAIN_SLASH");
  });
});

// ═══════════════════════════════════════════════════════
// 威胁物销毁
// ═══════════════════════════════════════════════════════

describe("DamageSystem - 威胁物销毁", () => {
  it("火环销毁：isDestroy=true, isKill=false", () => {
    const req = makeRequest({ targetCategory: "THREAT" });
    const result = resolveThreatDamage(req, 80, 80, true, false);
    expect(result!.isAccepted).toBe(true);
    expect(result!.isDestroy).toBe(true);
    expect(result!.isKill).toBe(false);  // 不计普通击杀
  });

  it("火环不会被最低1点伤害秒杀（必须有足够伤害）", () => {
    // 副刀系数0.80 → 80伤害，火环80HP → 刚好销毁
    const req = makeRequest({
      sourceType: "SUB_BLADE_LEFT",
      sourceConfig: DAMAGE_SOURCE_REGISTRY.SUB_BLADE_LEFT,
      skillCoefficient: 0.80,
    });
    const result = resolveThreatDamage(req, 80, 80, true, false);
    expect(result!.isDestroy).toBe(true);
    expect(result!.effectiveHpLoss).toBe(80);
  });
});

// ═══════════════════════════════════════════════════════
// 玩家属性快照
// ═══════════════════════════════════════════════════════

describe("DamageSystem - 快照", () => {
  it("createDefaultPlayerStats 默认 entryAttack=100", () => {
    const stats = createDefaultPlayerStats();
    expect(stats.entryAttack).toBe(100);
    expect(stats.runAttackBonus).toBe(0);
    expect(stats.bladeDamageBonus).toBe(0);
    expect(stats.conditionDamageBonus).toBe(0);
    expect(stats.finalDamageBonus).toBe(0);
  });

  it("快照独立副本不互相影响", () => {
    const stats1 = createDefaultPlayerStats(100);
    stats1.bladeDamageBonus = 0.10;
    const stats2 = createDefaultPlayerStats(100);
    expect(stats2.bladeDamageBonus).toBe(0); // 不受stats1影响
  });

  it("同一快照用于多个请求时伤害一致", () => {
    const stats = createDefaultPlayerStats(100);
    stats.bladeDamageBonus = 0.10;
    const req1 = makeRequest({ stats, actionId: "dmg-1" });
    const req2 = makeRequest({ stats, actionId: "dmg-2" });
    expect(Math.round(computeRawDamage(req1))).toBe(110);
    expect(Math.round(computeRawDamage(req2))).toBe(110);
  });
});

// ═══════════════════════════════════════════════════════
// 伤害来源配置
// ═══════════════════════════════════════════════════════

describe("DamageSystem - 来源配置", () => {
  it("MAIN_SLASH 系数1.00，顺序100，可伤害敌人和威胁物", () => {
    const cfg = DAMAGE_SOURCE_REGISTRY.MAIN_SLASH;
    expect(cfg.skillCoefficient).toBe(1.00);
    expect(cfg.resolveOrder).toBe(100);
    expect(cfg.canDamageEnemy).toBe(true);
    expect(cfg.canDamageThreat).toBe(true);
  });

  it("SCORCH_TICK 系数0.04，不触发击杀", () => {
    const cfg = DAMAGE_SOURCE_REGISTRY.SCORCH_TICK;
    expect(cfg.skillCoefficient).toBe(0.04);
    expect(cfg.canTriggerOnKill).toBe(false);
  });

  it("FROST 系数0，不伤害", () => {
    const cfg = DAMAGE_SOURCE_REGISTRY.FROST;
    expect(cfg.skillCoefficient).toBe(0);
    expect(cfg.canDamageEnemy).toBe(false);
  });

  it("FINAL_DAMAGE_REDUCTION_CAP = 0.8", () => {
    expect(FINAL_DAMAGE_REDUCTION_CAP).toBe(0.8);
  });
});
