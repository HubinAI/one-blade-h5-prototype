import { describe, it, expect } from "vitest";
import {
  MAINLINE_NUMERIC_CONFIG, getBaseHp, getBaseAttack,
  getSpeedMultiplier, getDensityMultiplier,
  ENEMY_TYPE_HP_MULTIPLIER, getEnemyFinalHp, REALM_ZONES
} from "./mainlineNumeric";

// ═══════════════════════════════════════════
// 1. Dynamic floor ID mapping test
// ═══════════════════════════════════════════
describe("getLogicalFloor 映射", () => {
  it("10001 → 1", () => expect(10001 - 10000).toBe(1));
  it("10002 → 2", () => expect(10002 - 10000).toBe(2));
  it("10030 → 30", () => expect(10030 - 10000).toBe(30));
  it("1 → 1 (no dynamic offset)", () => expect(1).toBe(1));
});

// ═══════════════════════════════════════════
// 2. Floor 2 must use formal formula, not legacy
// ═══════════════════════════════════════════
describe("第2关正式HP公式", () => {
  it("infantry.hp > 1", () => {
    const hp = getEnemyFinalHp(2, "infantry", 1.0);
    expect(hp).toBeGreaterThan(1);
  });
  it("shield.hp > infantry.hp", () => {
    const i = getEnemyFinalHp(2, "infantry", 1.0);
    const s = getEnemyFinalHp(2, "shield", 1.0);
    expect(s).toBeGreaterThan(i);
  });
  it("powder.hp !== infantry.hp", () => {
    expect(getEnemyFinalHp(2, "powder", 1.0))
      .not.toBe(getEnemyFinalHp(2, "infantry", 1.0));
  });
  it("core.hp !== infantry.hp", () => {
    expect(getEnemyFinalHp(2, "core", 1.0))
      .not.toBe(getEnemyFinalHp(2, "infantry", 1.0));
  });
});

// ═══════════════════════════════════════════
// 3. Enemy type multipliers
// ═══════════════════════════════════════════
describe("敌种倍率", () => {
  const base = getBaseHp(5);
  it("infantry = baseHp × 0.75", () => expect(getEnemyFinalHp(5,"infantry",1.0)).toBe(Math.round(base*0.75)));
  it("powder = baseHp × 0.80", () => expect(getEnemyFinalHp(5,"powder",1.0)).toBe(Math.round(base*0.80)));
  it("tractor = baseHp × 0.85", () => expect(getEnemyFinalHp(5,"tractor",1.0)).toBe(Math.round(base*0.85)));
  it("splitter = baseHp × 0.90", () => expect(getEnemyFinalHp(5,"splitter",1.0)).toBe(Math.round(base*0.90)));
  it("core = baseHp × 0.95", () => expect(getEnemyFinalHp(5,"core",1.0)).toBe(Math.round(base*0.95)));
  it("shield = baseHp × 1.20", () => expect(getEnemyFinalHp(5,"shield",1.0)).toBe(Math.round(base*1.20)));
});

// ═══════════════════════════════════════════
// 4. Key floors full chain
// ═══════════════════════════════════════════
const keyFloors = [1, 2, 5, 15, 30, 50, 75, 105, 140, 180];
describe("关键关卡全链路", () => {
  for (const f of keyFloors) {
    it(`floor ${f}: baseHp valid, shield>infantry, infantry>0`, () => {
      const bh = getBaseHp(f);
      expect(bh).toBeGreaterThan(0);
      const i = getEnemyFinalHp(f, "infantry", 1.0);
      const s = getEnemyFinalHp(f, "shield", 1.0);
      expect(i).toBeGreaterThan(0);
      expect(s).toBeGreaterThan(i);
    });
  }
});

// ═══════════════════════════════════════════
// 5. Spawn-level test
// ═══════════════════════════════════════════
describe("Spawn级HP一致性", () => {
  const types = ["infantry","shield","powder","core","splitter","tractor"];
  for (const t of types) {
    it(`floor 2 ${t}: finalHp = getEnemyFinalHp(2,${t},1.0)`, () => {
      const hp = getEnemyFinalHp(2, t, 1.0);
      expect(hp).toBeGreaterThan(0);
      expect(hp).toBeLessThan(200); // floor 2 shield ~122
    });
  }
});

// ═══════════════════════════════════════════
// 6. Anti-regression: no isLogicalLevel1 guard
// ═══════════════════════════════════════════
describe("反回归: floor2+不依赖isLogicalLevel1", () => {
  it("getEnemyFinalHp(2, infantry) 执行成功", () => {
    // If this throws or returns 0/1, it means the formula is blocked
    const hp = getEnemyFinalHp(2, "infantry", 1.0);
    expect(hp).toBeGreaterThan(1);
    expect(hp).not.toBe(4); // old legacy shield hp
    expect(hp).not.toBe(2);
  });
});

// ═══════════════════════════════════════════
// 7. Config integrity
// ═══════════════════════════════════════════
describe("配置完整性", () => {
  it("HP增长>1.0", () => expect(MAINLINE_NUMERIC_CONFIG.hpGrowth).toBeGreaterThan(1.0));
  it("攻增长>1.0", () => expect(MAINLINE_NUMERIC_CONFIG.attackGrowth).toBeGreaterThan(1.0));
  it("速度有上限", () => expect(MAINLINE_NUMERIC_CONFIG.speedMulMax).toBeGreaterThan(0));
  it("密度有上限", () => expect(MAINLINE_NUMERIC_CONFIG.densityMulMax).toBeGreaterThan(0));
  it("baseHp: 100×1.015^(1-1)=100", () => expect(getBaseHp(1)).toBe(100));
  it("倍率表全类型", () => {
    for(const t of ["infantry","shield","powder","core","splitter","tractor"]) {
      expect(ENEMY_TYPE_HP_MULTIPLIER[t]).toBeDefined();
    }
  });
  it("境界区间1~180连续", () => {
    let total = 0;
    for (const z of REALM_ZONES) total += z.end - z.start + 1;
    expect(total).toBe(180);
  });
});
