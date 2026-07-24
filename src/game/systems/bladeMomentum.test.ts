// ========================================================================
// V0723014: 三档刀势模型 — 单元测试
// ========================================================================
import { describe, it, expect } from "vitest";
import {
  resolveBladeMomentumRatio,
  resolveBladeMomentumBand,
  resolveEffectiveNodeThresholds,
  resolveActiveBladeNodes,
  createBladeMomentumState,
  applyBladeMaxChangePreserveRatio,
  applyBladeRunMaxModifier,
} from "./bladeMomentum";
import { recoverEnergy } from "./bladeEnergySystem";
import type { BladeRunModifiers, BladeAbilityNodeId } from "../config/bladeMomentum";

// ---- ratio 边界测试 ----

describe("resolveBladeMomentumRatio", () => {
  it("0 / 100 → 0%", () => {
    expect(resolveBladeMomentumRatio(0, 100)).toBe(0);
  });

  it("29 / 100 → 29%", () => {
    expect(resolveBladeMomentumRatio(29, 100)).toBeCloseTo(0.29, 2);
  });

  it("30 / 100 → 30%", () => {
    expect(resolveBladeMomentumRatio(30, 100)).toBeCloseTo(0.30, 2);
  });

  it("69 / 100 → 69%", () => {
    expect(resolveBladeMomentumRatio(69, 100)).toBeCloseTo(0.69, 2);
  });

  it("70 / 100 → 70%", () => {
    expect(resolveBladeMomentumRatio(70, 100)).toBeCloseTo(0.70, 2);
  });

  it("100 / 100 → 100%", () => {
    expect(resolveBladeMomentumRatio(100, 100)).toBe(1);
  });

  // max=140 / max=180 场景
  it("42 / 140 → 30%", () => {
    expect(resolveBladeMomentumRatio(42, 140)).toBeCloseTo(0.30, 2);
  });

  it("98 / 140 → 70%", () => {
    expect(resolveBladeMomentumRatio(98, 140)).toBeCloseTo(0.70, 2);
  });

  it("54 / 180 → 30%", () => {
    expect(resolveBladeMomentumRatio(54, 180)).toBeCloseTo(0.30, 2);
  });

  it("126 / 180 → 70%", () => {
    expect(resolveBladeMomentumRatio(126, 180)).toBeCloseTo(0.70, 2);
  });

  // 非法输入
  it("max=0 → min 1 (current clamp to max=1, ratio=1)", () => {
    expect(resolveBladeMomentumRatio(50, 0)).toBe(1);
  });

  it("current<0 → clamp 0", () => {
    expect(resolveBladeMomentumRatio(-10, 100)).toBe(0);
  });

  it("current>max → clamp max", () => {
    expect(resolveBladeMomentumRatio(150, 100)).toBe(1);
  });

  it("NaN current → 0", () => {
    expect(resolveBladeMomentumRatio(NaN, 100)).toBe(0);
  });

  it("Infinity max → safe 0 (non-finite max → 0)", () => {
    expect(resolveBladeMomentumRatio(50, Infinity)).toBe(0);
  });

  it("NaN max → 0", () => {
    expect(resolveBladeMomentumRatio(50, NaN)).toBe(0);
  });
});

// ---- band 判定测试 ----

describe("resolveBladeMomentumBand", () => {
  it("0% → base", () => {
    expect(resolveBladeMomentumBand(0)).toBe("base");
  });

  it("29% → base", () => {
    expect(resolveBladeMomentumBand(0.29)).toBe("base");
  });

  it("30% → enhanced", () => {
    expect(resolveBladeMomentumBand(0.30)).toBe("enhanced");
  });

  it("69% → enhanced", () => {
    expect(resolveBladeMomentumBand(0.69)).toBe("enhanced");
  });

  it("70% → burst", () => {
    expect(resolveBladeMomentumBand(0.70)).toBe("burst");
  });

  it("100% → burst", () => {
    expect(resolveBladeMomentumBand(1.0)).toBe("burst");
  });

  it("NaN → base (safe)", () => {
    expect(resolveBladeMomentumBand(NaN)).toBe("base");
  });

  it("Infinity → base (non-finite ratio → safe base)", () => {
    expect(resolveBladeMomentumBand(Infinity)).toBe("base");
  });

  it("negative → base (safe clamp)", () => {
    expect(resolveBladeMomentumBand(-0.5)).toBe("base");
  });
});

// ---- 能力节点测试 ----

describe("resolveEffectiveNodeThresholds", () => {
  const defaultModifiers: BladeRunModifiers = {
    maxBonus: 0,
    floorBonus: 0,
    gainMultiplier: 1,
    costMultiplier: 1,
    nodeThresholdShift: {},
  };

  it("默认 modifier → 原始阈值", () => {
    const t = resolveEffectiveNodeThresholds(defaultModifiers);
    expect(t.blade_reach).toBeCloseTo(0.30, 2);
    expect(t.armor_break).toBeCloseTo(0.60, 2);
    expect(t.precision_reflect).toBeCloseTo(0.90, 2);
  });

  it("precision_reflect shift=-0.12 → threshold=0.78", () => {
    const mods: BladeRunModifiers = {
      ...defaultModifiers,
      nodeThresholdShift: { precision_reflect: -0.12 },
    };
    const t = resolveEffectiveNodeThresholds(mods);
    expect(t.precision_reflect).toBeCloseTo(0.78, 2);
  });

  it("shift 不能低于 5%", () => {
    const mods: BladeRunModifiers = {
      ...defaultModifiers,
      nodeThresholdShift: { blade_reach: -0.50 },
    };
    const t = resolveEffectiveNodeThresholds(mods);
    expect(t.blade_reach).toBe(0.05);
  });

  it("shift 不能超过 100%", () => {
    const mods: BladeRunModifiers = {
      ...defaultModifiers,
      nodeThresholdShift: { blade_reach: 1.0 },
    };
    const t = resolveEffectiveNodeThresholds(mods);
    expect(t.blade_reach).toBe(1.00);
  });
});

describe("resolveActiveBladeNodes", () => {
  const defaultThresholds: Record<BladeAbilityNodeId, number> = {
    blade_reach: 0.30,
    armor_break: 0.60,
    precision_reflect: 0.90,
  };

  it("29% → []", () => {
    expect(resolveActiveBladeNodes(0.29, defaultThresholds)).toEqual([]);
  });

  it("30% → [blade_reach]", () => {
    expect(resolveActiveBladeNodes(0.30, defaultThresholds)).toEqual(["blade_reach"]);
  });

  it("59% → [blade_reach]", () => {
    expect(resolveActiveBladeNodes(0.59, defaultThresholds)).toEqual(["blade_reach"]);
  });

  it("60% → [blade_reach, armor_break]", () => {
    expect(resolveActiveBladeNodes(0.60, defaultThresholds)).toEqual(["blade_reach", "armor_break"]);
  });

  it("89% → [blade_reach, armor_break]", () => {
    expect(resolveActiveBladeNodes(0.89, defaultThresholds)).toEqual(["blade_reach", "armor_break"]);
  });

  it("90% → 全部三个", () => {
    expect(resolveActiveBladeNodes(0.90, defaultThresholds)).toEqual([
      "blade_reach",
      "armor_break",
      "precision_reflect",
    ]);
  });

  it("100% → 全部三个", () => {
    expect(resolveActiveBladeNodes(1.0, defaultThresholds)).toEqual([
      "blade_reach",
      "armor_break",
      "precision_reflect",
    ]);
  });

  // 阈值提前场景
  it("precision_reflect shift=-0.12 → 77% 未激活, 78% 激活", () => {
    const thresholds: Record<BladeAbilityNodeId, number> = {
      blade_reach: 0.30,
      armor_break: 0.60,
      precision_reflect: 0.78,
    };
    expect(resolveActiveBladeNodes(0.77, thresholds)).toEqual(["blade_reach", "armor_break"]);
    expect(resolveActiveBladeNodes(0.78, thresholds)).toEqual([
      "blade_reach",
      "armor_break",
      "precision_reflect",
    ]);
  });
});

// ---- 完整快照测试 ----

describe("createBladeMomentumState", () => {
  it("默认 35/100 → enhanced, blade_reach 激活", () => {
    const state = createBladeMomentumState(35, 100);
    expect(state.current).toBe(35);
    expect(state.max).toBe(100);
    expect(state.ratio).toBeCloseTo(0.35, 2);
    expect(state.band).toBe("enhanced");
    expect(state.activeNodes).toEqual(["blade_reach"]);
  });

  it("0/100 → base, 无节点", () => {
    const state = createBladeMomentumState(0, 100);
    expect(state.band).toBe("base");
    expect(state.activeNodes).toEqual([]);
  });

  it("100/100 → burst, 全部节点", () => {
    const state = createBladeMomentumState(100, 100);
    expect(state.band).toBe("burst");
    expect(state.activeNodes).toEqual(["blade_reach", "armor_break", "precision_reflect"]);
  });

  it("max=0 → safe 1, ratio clamp", () => {
    const state = createBladeMomentumState(5, 0);
    expect(state.max).toBe(1);
  });

  it("current<0 → clamp 0", () => {
    const state = createBladeMomentumState(-10, 100);
    expect(state.current).toBe(0);
  });

  it("current>max → clamp max", () => {
    const state = createBladeMomentumState(150, 100);
    expect(state.current).toBe(100);
  });

  it("max=140: 42/140 → enhanced, 98/140 → burst", () => {
    const s1 = createBladeMomentumState(42, 140);
    expect(s1.ratio).toBeCloseTo(0.30, 2);
    expect(s1.band).toBe("enhanced");

    const s2 = createBladeMomentumState(98, 140);
    expect(s2.ratio).toBeCloseTo(0.70, 2);
    expect(s2.band).toBe("burst");
  });

  it("max=180: 54/180 → enhanced, 126/180 → burst", () => {
    const s1 = createBladeMomentumState(54, 180);
    expect(s1.ratio).toBeCloseTo(0.30, 2);
    expect(s1.band).toBe("enhanced");

    const s2 = createBladeMomentumState(126, 180);
    expect(s2.ratio).toBeCloseTo(0.70, 2);
    expect(s2.band).toBe("burst");
  });

  it("126/140 → precision_reflect 激活", () => {
    const state = createBladeMomentumState(126, 140);
    expect(state.ratio).toBeCloseTo(0.90, 2);
    expect(state.band).toBe("burst");
    expect(state.activeNodes).toContain("precision_reflect");
  });
});

// ---- 上限成长保持比例测试 ----

describe("applyBladeMaxChangePreserveRatio", () => {
  it("80/100 → 112/140 (ratio 0.8, burst)", () => {
    const result = applyBladeMaxChangePreserveRatio(80, 100, 140);
    expect(result.current).toBe(112);
    expect(result.max).toBe(140);
    expect(result.ratio).toBeCloseTo(0.80, 2);
  });

  it("35/100 → 49/140 (ratio 0.35, enhanced)", () => {
    const result = applyBladeMaxChangePreserveRatio(35, 100, 140);
    expect(result.current).toBe(49);
    expect(result.max).toBe(140);
    expect(result.ratio).toBeCloseTo(0.35, 2);
  });

  it("20/100 → 36/180 (ratio 0.2, base)", () => {
    const result = applyBladeMaxChangePreserveRatio(20, 100, 180);
    expect(result.current).toBe(36);
    expect(result.max).toBe(180);
    expect(result.ratio).toBeCloseTo(0.20, 2);
  });

  it("oldMax=0 → safe 1, ratio 1", () => {
    const result = applyBladeMaxChangePreserveRatio(50, 0, 100);
    expect(result.current).toBe(100);
    expect(result.max).toBe(100);
    expect(result.ratio).toBe(1);
  });
});

// ---- P0-7: 多次 max 变化后 ratio 与 band 稳定 ----

describe("P0-7 多次 max 变化比例漂移", () => {
  it("29.99% → 经 100→137→181→140 后 ratio 仍 ~29.99%，band 仍 base", () => {
    const r1 = applyBladeMaxChangePreserveRatio(29.99, 100, 137);
    expect(r1.ratio).toBeCloseTo(0.2999, 3);
    expect(resolveBladeMomentumBand(r1.ratio)).toBe("base");
    const r2 = applyBladeMaxChangePreserveRatio(r1.current, 137, 181);
    expect(r2.ratio).toBeCloseTo(0.2999, 3);
    expect(resolveBladeMomentumBand(r2.ratio)).toBe("base");
    const r3 = applyBladeMaxChangePreserveRatio(r2.current, 181, 140);
    expect(r3.ratio).toBeCloseTo(0.2999, 3);
    expect(resolveBladeMomentumBand(r3.ratio)).toBe("base");
  });

  it("30.00% → 经 100→137→181→140 后 ratio 仍 30.00%，band 仍 enhanced", () => {
    const r1 = applyBladeMaxChangePreserveRatio(30.00, 100, 137);
    expect(r1.ratio).toBeCloseTo(0.30, 2);
    expect(resolveBladeMomentumBand(r1.ratio)).toBe("enhanced");
    const r2 = applyBladeMaxChangePreserveRatio(r1.current, 137, 181);
    expect(r2.ratio).toBeCloseTo(0.30, 2);
    expect(resolveBladeMomentumBand(r2.ratio)).toBe("enhanced");
    const r3 = applyBladeMaxChangePreserveRatio(r2.current, 181, 140);
    expect(r3.ratio).toBeCloseTo(0.30, 2);
    expect(resolveBladeMomentumBand(r3.ratio)).toBe("enhanced");
  });

  it("69.99% → 经 100→137→181→140 后 ratio 仍 ~69.99%，band 仍 enhanced", () => {
    const r1 = applyBladeMaxChangePreserveRatio(69.99, 100, 137);
    expect(r1.ratio).toBeCloseTo(0.6999, 3);
    expect(resolveBladeMomentumBand(r1.ratio)).toBe("enhanced");
    const r2 = applyBladeMaxChangePreserveRatio(r1.current, 137, 181);
    expect(r2.ratio).toBeCloseTo(0.6999, 3);
    expect(resolveBladeMomentumBand(r2.ratio)).toBe("enhanced");
    const r3 = applyBladeMaxChangePreserveRatio(r2.current, 181, 140);
    expect(r3.ratio).toBeCloseTo(0.6999, 3);
    expect(resolveBladeMomentumBand(r3.ratio)).toBe("enhanced");
  });

  it("70.00% → 经 100→137→181→140 后 ratio 仍 70.00%，band 仍 burst", () => {
    const r1 = applyBladeMaxChangePreserveRatio(70.00, 100, 137);
    expect(r1.ratio).toBeCloseTo(0.70, 2);
    expect(resolveBladeMomentumBand(r1.ratio)).toBe("burst");
    const r2 = applyBladeMaxChangePreserveRatio(r1.current, 137, 181);
    expect(r2.ratio).toBeCloseTo(0.70, 2);
    expect(resolveBladeMomentumBand(r2.ratio)).toBe("burst");
    const r3 = applyBladeMaxChangePreserveRatio(r2.current, 181, 140);
    expect(r3.ratio).toBeCloseTo(0.70, 2);
    expect(resolveBladeMomentumBand(r3.ratio)).toBe("burst");
  });

  it("89.99% → 经 100→137→181→140 后 ratio 仍 ~89.99%，band 仍 burst", () => {
    const r1 = applyBladeMaxChangePreserveRatio(89.99, 100, 137);
    expect(r1.ratio).toBeCloseTo(0.8999, 3);
    expect(resolveBladeMomentumBand(r1.ratio)).toBe("burst");
    const r2 = applyBladeMaxChangePreserveRatio(r1.current, 137, 181);
    expect(r2.ratio).toBeCloseTo(0.8999, 3);
    expect(resolveBladeMomentumBand(r2.ratio)).toBe("burst");
    const r3 = applyBladeMaxChangePreserveRatio(r2.current, 181, 140);
    expect(r3.ratio).toBeCloseTo(0.8999, 3);
    expect(resolveBladeMomentumBand(r3.ratio)).toBe("burst");
  });

  it("90.00% → 经 100→137→181→140 后 ratio 仍 90.00%，band 仍 burst", () => {
    const r1 = applyBladeMaxChangePreserveRatio(90.00, 100, 137);
    expect(r1.ratio).toBeCloseTo(0.90, 2);
    expect(resolveBladeMomentumBand(r1.ratio)).toBe("burst");
    const r2 = applyBladeMaxChangePreserveRatio(r1.current, 137, 181);
    expect(r2.ratio).toBeCloseTo(0.90, 2);
    expect(resolveBladeMomentumBand(r2.ratio)).toBe("burst");
    const r3 = applyBladeMaxChangePreserveRatio(r2.current, 181, 140);
    expect(r3.ratio).toBeCloseTo(0.90, 2);
    expect(resolveBladeMomentumBand(r3.ratio)).toBe("burst");
  });
});

// ---- P0-8: NaN/Infinity 输入测试 ----

describe("P0-8 createBladeMomentumState NaN/Infinity 安全", () => {
  it("NaN current → safe 0, band=base", () => {
    const s = createBladeMomentumState(NaN, 100);
    expect(Number.isFinite(s.current)).toBe(true);
    expect(s.current).toBe(0);
    expect(Number.isFinite(s.max)).toBe(true);
    expect(Number.isFinite(s.ratio)).toBe(true);
    expect(s.band).toBe("base");
  });

  it("NaN max → safe 1, current clamp to 1 (50 clamp to max=1)", () => {
    const s = createBladeMomentumState(50, NaN);
    expect(Number.isFinite(s.current)).toBe(true);
    expect(Number.isFinite(s.max)).toBe(true);
    expect(s.max).toBe(1);
    expect(s.current).toBe(1); // 50 clamp to safeMax=1
    expect(Number.isFinite(s.ratio)).toBe(true);
    expect(s.band).toBe("burst"); // 1/1 = ratio 1 >= 70%
  });

  it("Infinity max → safe 1, current clamp to 1 (50 clamp to max=1)", () => {
    const s = createBladeMomentumState(50, Infinity);
    expect(Number.isFinite(s.current)).toBe(true);
    expect(Number.isFinite(s.max)).toBe(true);
    expect(s.max).toBe(1);
    expect(s.current).toBe(1); // 50 clamp to safeMax=1
    expect(Number.isFinite(s.ratio)).toBe(true);
    expect(s.band).toBe("burst"); // 1/1 = ratio 1 >= 70%
  });

  it("Infinity current → safe 0 (non-finite fallback to 0)", () => {
    const s = createBladeMomentumState(Infinity, 100);
    expect(Number.isFinite(s.current)).toBe(true);
    expect(s.current).toBe(0); // Infinity non-finite → fallback 0
    expect(Number.isFinite(s.max)).toBe(true);
    expect(Number.isFinite(s.ratio)).toBe(true);
    expect(s.band).toBe("base"); // 0/100 = ratio 0
  });

  it("-Infinity current → 0", () => {
    const s = createBladeMomentumState(-Infinity, 100);
    expect(Number.isFinite(s.current)).toBe(true);
    expect(s.current).toBe(0);
    expect(Number.isFinite(s.ratio)).toBe(true);
    expect(s.band).toBe("base");
  });

  it("max <= 0 → safe 1", () => {
    const s = createBladeMomentumState(5, 0);
    expect(s.max).toBe(1);
    expect(Number.isFinite(s.current)).toBe(true);
    expect(Number.isFinite(s.ratio)).toBe(true);
    expect(s.band).toBe("burst"); // 5/1 → ratio 1
  });

  it("max negative → safe 1, current clamp to 1 (5 clamp to max=1)", () => {
    const s = createBladeMomentumState(5, -10);
    expect(s.max).toBe(1);
    expect(s.current).toBe(1); // 5 clamp to safeMax=1
    expect(Number.isFinite(s.ratio)).toBe(true);
    expect(s.band).toBe("burst"); // 1/1 = ratio 1 >= 70%
  });

  it("NaN + Infinity combined → all finite", () => {
    const s = createBladeMomentumState(NaN, Infinity);
    expect(Number.isFinite(s.current)).toBe(true);
    expect(Number.isFinite(s.max)).toBe(true);
    expect(Number.isFinite(s.ratio)).toBe(true);
    expect(s.band).toBe("base");
  });
});

// ---- 肉鸽修正器应用测试 ----

describe("applyBladeRunMaxModifier", () => {
  it("maxBonus=40 → 35/100 升到 49/140，ratio 仍 35%，仍 enhanced", () => {
    const state = createBladeMomentumState(35, 100);
    const mods: BladeRunModifiers = {
      maxBonus: 40,
      floorBonus: 0,
      gainMultiplier: 1,
      costMultiplier: 1,
      nodeThresholdShift: {},
    };
    const newState = applyBladeRunMaxModifier(state, mods);
    expect(newState.max).toBe(140);
    expect(newState.current).toBe(49);
    expect(newState.ratio).toBeCloseTo(0.35, 2);
    expect(newState.band).toBe("enhanced");
  });
});

// ---- T05: max=140/180 肉鸽集成测试 ----

describe("max=140 集成测试（band → 预期伤害/反射行为）", () => {
  it("current=42/max=140 → enhanced → 预期护甲伤害 55", () => {
    const state = createBladeMomentumState(42, 140);
    expect(state.ratio).toBeCloseTo(0.30, 2);
    expect(state.band).toBe("enhanced");
    // enhanced 档：固定 55 伤害，不能反射
    expect(state.activeNodes).toEqual(["blade_reach"]);
  });

  it("current=98/max=140 → burst → 直接破甲 → 可反射", () => {
    const state = createBladeMomentumState(98, 140);
    expect(state.ratio).toBeCloseTo(0.70, 2);
    expect(state.band).toBe("burst");
    // burst 档：一刀破甲（全扣），可反射
    expect(state.activeNodes).toEqual(["blade_reach", "armor_break"]);
  });

  it("current=126/max=140 → precision_reflect 节点激活 → 本轮不额外改变行为", () => {
    const state = createBladeMomentumState(126, 140);
    expect(state.ratio).toBeCloseTo(0.90, 2);
    expect(state.band).toBe("burst");
    expect(state.activeNodes).toContain("precision_reflect");
    // precision_reflect 只建数据不应用行为（V0723014）
  });

  it("current=54/max=180 → enhanced", () => {
    const state = createBladeMomentumState(54, 180);
    expect(state.ratio).toBeCloseTo(0.30, 2);
    expect(state.band).toBe("enhanced");
  });

  it("current=126/max=180 → burst", () => {
    const state = createBladeMomentumState(126, 180);
    expect(state.ratio).toBeCloseTo(0.70, 2);
    expect(state.band).toBe("burst");
  });
});

// ---- V0723014-Final.1 P1-2: NaN/Infinity sanitization for max change functions ----

describe("P1-2 applyBladeMaxChangePreserveRatio NaN/Infinity 安全", () => {
  it("NaN oldMax → safe 1, ratio 基于新 max", () => {
    const result = applyBladeMaxChangePreserveRatio(50, NaN, 100);
    expect(Number.isFinite(result.current)).toBe(true);
    expect(Number.isFinite(result.max)).toBe(true);
    expect(Number.isFinite(result.ratio)).toBe(true);
    expect(result.max).toBe(100);
  });

  it("Infinity oldMax → safe 1, ratio 基于新 max", () => {
    const result = applyBladeMaxChangePreserveRatio(50, Infinity, 100);
    expect(Number.isFinite(result.current)).toBe(true);
    expect(Number.isFinite(result.max)).toBe(true);
    expect(Number.isFinite(result.ratio)).toBe(true);
    expect(result.max).toBe(100);
  });

  it("NaN newMax → safe 1", () => {
    const result = applyBladeMaxChangePreserveRatio(50, 100, NaN);
    expect(Number.isFinite(result.current)).toBe(true);
    expect(Number.isFinite(result.max)).toBe(true);
    expect(Number.isFinite(result.ratio)).toBe(true);
    expect(result.max).toBe(1);
  });

  it("Infinity newMax → safe 1", () => {
    const result = applyBladeMaxChangePreserveRatio(50, 100, Infinity);
    expect(Number.isFinite(result.current)).toBe(true);
    expect(Number.isFinite(result.max)).toBe(true);
    expect(Number.isFinite(result.ratio)).toBe(true);
    expect(result.max).toBe(1);
  });

  it("NaN oldMax + NaN newMax → both safe 1", () => {
    const result = applyBladeMaxChangePreserveRatio(50, NaN, NaN);
    expect(Number.isFinite(result.current)).toBe(true);
    expect(Number.isFinite(result.max)).toBe(true);
    expect(Number.isFinite(result.ratio)).toBe(true);
    expect(result.max).toBe(1);
  });

  it("正常值不受影响: 80/100 → 112/140", () => {
    const result = applyBladeMaxChangePreserveRatio(80, 100, 140);
    expect(result.current).toBe(112);
    expect(result.max).toBe(140);
    expect(result.ratio).toBeCloseTo(0.80, 2);
  });
});

describe("P1-2 applyBladeRunMaxModifier NaN/Infinity maxBonus 安全", () => {
  it("NaN maxBonus → fallback 0, max 不变", () => {
    const state = createBladeMomentumState(35, 100);
    const mods: BladeRunModifiers = {
      maxBonus: NaN,
      floorBonus: 0,
      gainMultiplier: 1,
      costMultiplier: 1,
      nodeThresholdShift: {},
    };
    const newState = applyBladeRunMaxModifier(state, mods);
    expect(Number.isFinite(newState.max)).toBe(true);
    expect(Number.isFinite(newState.current)).toBe(true);
    expect(newState.max).toBe(100); // maxBonus=0 → max=100
  });

  it("Infinity maxBonus → fallback 0, max 不变", () => {
    const state = createBladeMomentumState(35, 100);
    const mods: BladeRunModifiers = {
      maxBonus: Infinity,
      floorBonus: 0,
      gainMultiplier: 1,
      costMultiplier: 1,
      nodeThresholdShift: {},
    };
    const newState = applyBladeRunMaxModifier(state, mods);
    expect(Number.isFinite(newState.max)).toBe(true);
    expect(Number.isFinite(newState.current)).toBe(true);
    expect(newState.max).toBe(100); // maxBonus=0 → max=100
  });

  it("-Infinity maxBonus → fallback 0, max 不变", () => {
    const state = createBladeMomentumState(35, 100);
    const mods: BladeRunModifiers = {
      maxBonus: -Infinity,
      floorBonus: 0,
      gainMultiplier: 1,
      costMultiplier: 1,
      nodeThresholdShift: {},
    };
    const newState = applyBladeRunMaxModifier(state, mods);
    expect(Number.isFinite(newState.max)).toBe(true);
    expect(Number.isFinite(newState.current)).toBe(true);
    expect(newState.max).toBe(100); // maxBonus=0 → max=100
  });

  it("正常 maxBonus=40 不受影响: 35/100 → 49/140", () => {
    const state = createBladeMomentumState(35, 100);
    const mods: BladeRunModifiers = {
      maxBonus: 40,
      floorBonus: 0,
      gainMultiplier: 1,
      costMultiplier: 1,
      nodeThresholdShift: {},
    };
    const newState = applyBladeRunMaxModifier(state, mods);
    expect(newState.max).toBe(140);
    expect(newState.current).toBe(49);
    expect(newState.ratio).toBeCloseTo(0.35, 2);
  });
});

// ---- V0723014-Final.1 P1-1: max=180 恢复测试 ----

describe("P1-1 recoverEnergy max=180 恢复", () => {
  it("current=100/max=180 → recoverEnergy 后 current>100 → current<=180", () => {
    const recovered = recoverEnergy(100, 1.0, 0, true, 180);
    expect(recovered).toBeGreaterThan(100);
    expect(recovered).toBeLessThanOrEqual(180);
  });

  it("current=179/max=180 → recoverEnergy 不超过 180", () => {
    const recovered = recoverEnergy(179, 1.0, 0, true, 180);
    expect(recovered).toBeLessThanOrEqual(180);
  });

  it("current=180/max=180 → recoverEnergy 保持 180（封顶）", () => {
    const recovered = recoverEnergy(180, 1.0, 0, true, 180);
    expect(recovered).toBe(180);
  });
});
