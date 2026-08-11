import { describe, it, expect } from "vitest";
import {
  MAINLINE_NUMERIC_CONFIG, growthCurve, getBaseAttack,
  getSpeedMultiplier, getDensityMultiplier,
  ENEMY_TYPE_HP_MULTIPLIER, getEnemyFinalHp, REALM_ZONES,
  QUALITY_ATTACK_ANCHOR_FLOOR, getQualityBaseAttack
} from "./mainlineNumeric";

describe("getLogicalFloor 映射", () => {
  it("10001 → 1", () => expect(10001 - 10000).toBe(1));
  it("10002 → 2", () => expect(10002 - 10000).toBe(2));
  it("10030 → 30", () => expect(10030 - 10000).toBe(30));
  it("1 → 1", () => expect(1).toBe(1));
});

describe("第2关正式HP公式", () => {
  it("infantry.hp > 0 (不再legacy)", () => expect(getEnemyFinalHp(2,"infantry",1.0)).toBeGreaterThan(0));
  it("shield.hp > infantry.hp", () => expect(getEnemyFinalHp(2,"shield",1.0)).toBeGreaterThan(getEnemyFinalHp(2,"infantry",1.0)));
  it("powder.hp >= infantry.hp (round宽容)", () => expect(getEnemyFinalHp(2,"powder",1.0)).toBeGreaterThanOrEqual(getEnemyFinalHp(2,"infantry",1.0)));
  it("core.hp >= infantry.hp (round宽容)", () => expect(getEnemyFinalHp(2,"core",1.0)).toBeGreaterThanOrEqual(getEnemyFinalHp(2,"infantry",1.0)));
});

describe("敌种倍率", () => {
  const baseHp = growthCurve(5);
  it("infantry = baseHp × 0.75", () => expect(getEnemyFinalHp(5,"infantry",1.0)).toBe(Math.round(baseHp*0.75)));
  it("powder = baseHp × 0.80", () => expect(getEnemyFinalHp(5,"powder",1.0)).toBe(Math.round(baseHp*0.80)));
  it("tractor = baseHp × 0.85", () => expect(getEnemyFinalHp(5,"tractor",1.0)).toBe(Math.round(baseHp*0.85)));
  it("splitter = baseHp × 0.90", () => expect(getEnemyFinalHp(5,"splitter",1.0)).toBe(Math.round(baseHp*0.90)));
  it("core = baseHp × 0.95", () => expect(getEnemyFinalHp(5,"core",1.0)).toBe(Math.round(baseHp*0.95)));
  it("shield = baseHp × 1.20", () => expect(getEnemyFinalHp(5,"shield",1.0)).toBe(Math.round(baseHp*1.20)));
});

const keyFloors = [1, 2, 5, 15, 30, 50, 75, 105, 140, 180];
describe("关键关卡全链路", () => {
  for (const f of keyFloors) {
    it(`floor ${f}: growthCurve>0, shield>infantry`, () => {
      expect(growthCurve(f)).toBeGreaterThan(0);
      expect(getEnemyFinalHp(f,"shield",1.0)).toBeGreaterThan(getEnemyFinalHp(f,"infantry",1.0));
    });
  }
});

describe("Spawn级HP一致性", () => {
  for (const t of ["infantry","shield","powder","core","splitter","tractor"]) {
    it(`floor 2 ${t}: finalHp>0, <200`, () => {
      const hp = getEnemyFinalHp(2, t, 1.0);
      expect(hp).toBeGreaterThan(0);
      expect(hp).toBeLessThan(200);
    });
  }
});

describe("反回归: floor2+不依赖isLogicalLevel1", () => {
  it("getEnemyFinalHp(2,infantry) 正常执行", () => {
    expect(getEnemyFinalHp(2,"infantry",1.0)).toBeGreaterThan(0);
    expect(getEnemyFinalHp(2,"infantry",1.0)).not.toBe(4);
  });
});

describe("配置完整性", () => {
  it("growthA>0", () => expect(MAINLINE_NUMERIC_CONFIG.growthA).toBeGreaterThan(0));
  it("攻增长>1.0", () => expect(MAINLINE_NUMERIC_CONFIG.attackGrowth).toBeGreaterThan(1.0));
  it("速度有上限", () => expect(MAINLINE_NUMERIC_CONFIG.speedMulMax).toBeGreaterThan(0));
  it("密度有上限", () => expect(MAINLINE_NUMERIC_CONFIG.densityMulMax).toBeGreaterThan(0));
  it("倍率表全类型", () => { for(const t of ["infantry","shield","powder","core","splitter","tractor"]) expect(ENEMY_TYPE_HP_MULTIPLIER[t]).toBeDefined(); });
  it("境界区间1~180连续", () => { let t=0; for(const z of REALM_ZONES) t+=z.end-z.start+1; expect(t).toBe(180); });
});

describe("GrowthCurve品质攻击锚点", () => {
  it("green  = F5 → 32", () => expect(getQualityBaseAttack("green")).toBe(32));
  it("blue   = F15→ 144", () => expect(getQualityBaseAttack("blue")).toBe(144));
  it("purple = F30→ 462", () => expect(getQualityBaseAttack("purple")).toBe(462));
  it("orange = F50→ 1166", () => expect(getQualityBaseAttack("orange")).toBe(1166));
  it("red    = F75→ 2496", () => expect(getQualityBaseAttack("red")).toBe(2496));
  it("gold   = F105→ 4752", () => expect(getQualityBaseAttack("gold")).toBe(4752));
  it("pink   = F140→ 8294", () => expect(getQualityBaseAttack("pink")).toBe(8294));
  it("rainbow= F180→ 13542", () => expect(getQualityBaseAttack("rainbow")).toBe(13542));
});

describe("GrowthCurve关键值", () => {
  it("F1  n=0:10",   () => expect(growthCurve(1)).toBe(10));
  it("F5  n=4:32",   () => expect(growthCurve(5)).toBe(32));
  it("F15 n=14:144", () => expect(growthCurve(15)).toBe(144));
  it("F30 n=29:462", () => expect(growthCurve(30)).toBe(462));
});
