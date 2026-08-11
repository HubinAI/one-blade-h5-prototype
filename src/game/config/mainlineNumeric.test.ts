import { describe, it, expect } from "vitest";
import {
  MAINLINE_GROWTH_CONFIG, BLADE_ATTACK_GROWTH_CONFIG,
  mainlineGrowthCurve, bladeGrowthIndexAttack, getBladeAttack,
  getBaseAttack, getSpeedMultiplier, getDensityMultiplier,
  ENEMY_TYPE_HP_MULTIPLIER, getEnemyFinalHp, REALM_ZONES, QUALITY_INDEX_RANGE,
  postEdictTotal, phaseEnemyCount, edictTriggerKills, phaseSpeedMul, genericEliteHp
} from "./mainlineNumeric";

// ═══════════════════════════════════════
// 解耦
// ═══════════════════════════════════════
describe("主线/装备配置解耦", () => {
  it("主线 a=1.05", () => expect(MAINLINE_GROWTH_CONFIG.a).toBe(1.05));
  it("主线 b=8", () => expect(MAINLINE_GROWTH_CONFIG.b).toBe(8));
  it("主线 c=100", () => expect(MAINLINE_GROWTH_CONFIG.c).toBe(100));
  it("装备 a=1.04", () => expect(BLADE_ATTACK_GROWTH_CONFIG.a).toBe(1.04));
  it("装备 b=7", () => expect(BLADE_ATTACK_GROWTH_CONFIG.b).toBe(7));
  it("装备 c=100", () => expect(BLADE_ATTACK_GROWTH_CONFIG.c).toBe(100));
});

// ═══════════════════════════════════════
// 主线回归值
// ═══════════════════════════════════════
describe("主线GrowthCurve回归值", () => {
  it("F1=100", () => expect(mainlineGrowthCurve(1)).toBe(100));
  it("F2=109", () => expect(mainlineGrowthCurve(2)).toBe(109));
  it("F5=149", () => expect(mainlineGrowthCurve(5)).toBe(149));
  it("F15=418", () => expect(mainlineGrowthCurve(15)).toBe(418));
  it("F30=1215", () => expect(mainlineGrowthCurve(30)).toBe(1215));
  it("F50=3013", () => expect(mainlineGrowthCurve(50)).toBe(3013));
  it("F75=6442", () => expect(mainlineGrowthCurve(75)).toBe(6442));
  it("F105=12289", () => expect(mainlineGrowthCurve(105)).toBe(12289));
  it("F140=21499", () => expect(mainlineGrowthCurve(140)).toBe(21499));
  it("F180=35175", () => expect(mainlineGrowthCurve(180)).toBe(35175));
});

// ═══════════════════════════════════════
// 装备攻击 Lv1 / Lv40
// ═══════════════════════════════════════
describe("装备攻击Lv1/Lv40端点", () => {
  it("green   Lv1=100",  () => expect(getBladeAttack("green",1)).toBe(100));
  it("green   Lv40=145", () => expect(getBladeAttack("green",40)).toBe(145));
  it("blue    Lv1=161",  () => expect(getBladeAttack("blue",1)).toBe(161));
  it("blue    Lv40=402", () => expect(getBladeAttack("blue",40)).toBe(402));
  it("purple  Lv1=439",  () => expect(getBladeAttack("purple",1)).toBe(439));
  it("purple  Lv40=1178",() => expect(getBladeAttack("purple",40)).toBe(1178));
  it("orange  Lv1=1246", () => expect(getBladeAttack("orange",1)).toBe(1246));
  it("orange  Lv40=2940",() => expect(getBladeAttack("orange",40)).toBe(2940));
  it("red     Lv1=3050", () => expect(getBladeAttack("red",1)).toBe(3050));
  it("red     Lv40=6313",() => expect(getBladeAttack("red",40)).toBe(6313));
  it("gold    Lv1=6475", () => expect(getBladeAttack("gold",1)).toBe(6475));
  it("gold    Lv40=12077",()=> expect(getBladeAttack("gold",40)).toBe(12077));
  it("pink    Lv1=12301",() => expect(getBladeAttack("pink",1)).toBe(12301));
  it("pink    Lv40=21167",()=> expect(getBladeAttack("pink",40)).toBe(21167));
  it("rainbow Lv1=21464",() => expect(getBladeAttack("rainbow",1)).toBe(21464));
  it("rainbow Lv40=34676",()=> expect(getBladeAttack("rainbow",40)).toBe(34676));
});

// ═══════════════════════════════════════
// 旧测试更新
// ═══════════════════════════════════════
describe("第2关正式HP", () => {
  it("infantry HP>50", () => expect(getEnemyFinalHp(2,"infantry",1.0)).toBeGreaterThan(50));
  it("shield > infantry", () => {
    expect(getEnemyFinalHp(2,"shield",1.0))
      .toBeGreaterThan(getEnemyFinalHp(2,"infantry",1.0));
  });
});

describe("敌种倍率(floor5 base=149)", () => {
  it("infantry 149×0.75=112", () => expect(getEnemyFinalHp(5,"infantry",1.0)).toBe(112));
  it("shield 149×1.20=179", () => expect(getEnemyFinalHp(5,"shield",1.0)).toBe(179));
  it("powder 149×0.80=119", () => expect(getEnemyFinalHp(5,"powder",1.0)).toBe(119));
  it("core 149×0.95=142", () => expect(getEnemyFinalHp(5,"core",1.0)).toBe(142));
});

const keyFloors = [1,2,5,15,30,50,75,105,140,180];
describe("关键关", () => {
  for (const f of keyFloors) it(`F${f}>0`, () => expect(mainlineGrowthCurve(f)).toBeGreaterThan(0));
});

describe("配置完整性", () => {
  it("境界1~180", () => { let t=0; for(const z of REALM_ZONES) t+=z.end-z.start+1; expect(t).toBe(180); });
  it("倍率表全", () => { for(const t of ["infantry","shield","powder","core","splitter","tractor"]) expect(ENEMY_TYPE_HP_MULTIPLIER[t]).toBeDefined(); });
});

describe("军令模板", () => {
  it("F1 total=90", () => expect(postEdictTotal(1)).toBe(90));
  it("F1 P1=24", () => expect(phaseEnemyCount(1,"P1")).toBe(24));
  it("F1 P2=30", () => expect(phaseEnemyCount(1,"P2")).toBe(30));
  it("F1 P3=36", () => expect(phaseEnemyCount(1,"P3")).toBe(36));
  it("F1 eliteHp=800", () => expect(genericEliteHp(1)).toBe(800));
});
