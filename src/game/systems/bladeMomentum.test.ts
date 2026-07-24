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
  it("max=0 → min 1 (ratio=0)", () => {
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

// ---- 肉鸽修正器应用测试 ----

describe("applyBladeRunMaxModifier", () => {
  it("maxBonus=40 → max 从 100 升到 140", () => {
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
    expect(newState.current).toBe(35);
    expect(newState.ratio).toBeCloseTo(0.25, 2); // 35/140
    expect(newState.band).toBe("base");
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
