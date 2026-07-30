// ========================================================================
// V0730001: 统一刀势模型 — 单元测试
// ========================================================================
import { describe, it, expect } from "vitest";
import {
  resolveBladeMomentumRatio,
  resolveBladeMomentumBand,
  createBladeMomentumState,
  applyBladeMaxChangePreserveRatio,
  resolveBladeMomentumEffect,
  resolveBladeGainMultiplier,
  resolveBladePassiveRecovery,
  resolveBladeMomentumAfterSlash,
  spendBladeMomentum,
  gainBladeMomentum,
  changeBladeMomentumMaxPreserveRatio,
  resolveMultiSlashBonus,
} from "./bladeMomentum";

// ---- ratio 边界测试 ----

describe("resolveBladeMomentumRatio", () => {
  it("0 / 100 → 0%", () => {
    expect(resolveBladeMomentumRatio(0, 100)).toBe(0);
  });

  it("39 / 100 → 39%", () => {
    expect(resolveBladeMomentumRatio(39, 100)).toBeCloseTo(0.39, 2);
  });

  it("40 / 100 → 40%", () => {
    expect(resolveBladeMomentumRatio(40, 100)).toBeCloseTo(0.40, 2);
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
  it("56 / 140 → 40%", () => {
    expect(resolveBladeMomentumRatio(56, 140)).toBeCloseTo(0.40, 2);
  });

  it("98 / 140 → 70%", () => {
    expect(resolveBladeMomentumRatio(98, 140)).toBeCloseTo(0.70, 2);
  });

  it("72 / 180 → 40%", () => {
    expect(resolveBladeMomentumRatio(72, 180)).toBeCloseTo(0.40, 2);
  });

  it("126 / 180 → 70%", () => {
    expect(resolveBladeMomentumRatio(126, 180)).toBeCloseTo(0.70, 2);
  });

  // 非法输入
  it("max=0 → safe 1", () => {
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

  it("Infinity max → 0", () => {
    expect(resolveBladeMomentumRatio(50, Infinity)).toBe(0);
  });

  it("NaN max → 0", () => {
    expect(resolveBladeMomentumRatio(50, NaN)).toBe(0);
  });
});

// ---- band 判定测试（40%/70% 分界） ----

describe("resolveBladeMomentumBand", () => {
  it("0% → low", () => {
    expect(resolveBladeMomentumBand(0)).toBe("low");
  });

  it("39% → low", () => {
    expect(resolveBladeMomentumBand(0.39)).toBe("low");
  });

  it("40% → mid", () => {
    expect(resolveBladeMomentumBand(0.40)).toBe("mid");
  });

  it("69% → mid", () => {
    expect(resolveBladeMomentumBand(0.69)).toBe("mid");
  });

  it("70% → high", () => {
    expect(resolveBladeMomentumBand(0.70)).toBe("high");
  });

  it("100% → high", () => {
    expect(resolveBladeMomentumBand(1.0)).toBe("high");
  });

  it("NaN → low (safe)", () => {
    expect(resolveBladeMomentumBand(NaN)).toBe("low");
  });

  it("Infinity → low (non-finite)", () => {
    expect(resolveBladeMomentumBand(Infinity)).toBe("low");
  });

  it("negative → low (safe clamp)", () => {
    expect(resolveBladeMomentumBand(-0.5)).toBe("low");
  });
});

// ---- 完整快照测试 ----

describe("createBladeMomentumState", () => {
  it("40/100 → low→mid 边界 → mid", () => {
    const state = createBladeMomentumState(40, 100);
    expect(state.current).toBe(40);
    expect(state.max).toBe(100);
    expect(state.ratio).toBeCloseTo(0.40, 2);
    expect(state.band).toBe("mid");
  });

  it("39/100 → low", () => {
    const state = createBladeMomentumState(39, 100);
    expect(state.band).toBe("low");
  });

  it("0/100 → low", () => {
    const state = createBladeMomentumState(0, 100);
    expect(state.band).toBe("low");
  });

  it("70/100 → high", () => {
    const state = createBladeMomentumState(70, 100);
    expect(state.band).toBe("high");
  });

  it("100/100 → high", () => {
    const state = createBladeMomentumState(100, 100);
    expect(state.band).toBe("high");
  });

  it("max=0 → safe 1", () => {
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

  it("max=140: 56/140 → mid, 98/140 → high", () => {
    const s1 = createBladeMomentumState(56, 140);
    expect(s1.ratio).toBeCloseTo(0.40, 2);
    expect(s1.band).toBe("mid");

    const s2 = createBladeMomentumState(98, 140);
    expect(s2.ratio).toBeCloseTo(0.70, 2);
    expect(s2.band).toBe("high");
  });

  it("max=180: 72/180 → mid, 126/180 → high", () => {
    const s1 = createBladeMomentumState(72, 180);
    expect(s1.ratio).toBeCloseTo(0.40, 2);
    expect(s1.band).toBe("mid");

    const s2 = createBladeMomentumState(126, 180);
    expect(s2.ratio).toBeCloseTo(0.70, 2);
    expect(s2.band).toBe("high");
  });
});

// ---- NaN/Infinity 安全测试 ----

describe("NaN/Infinity 安全", () => {
  it("NaN current → safe 0, band=low", () => {
    const s = createBladeMomentumState(NaN, 100);
    expect(Number.isFinite(s.current)).toBe(true);
    expect(s.current).toBe(0);
    expect(s.band).toBe("low");
  });

  it("NaN max → safe 1", () => {
    const s = createBladeMomentumState(50, NaN);
    expect(s.max).toBe(1);
    expect(Number.isFinite(s.ratio)).toBe(true);
  });

  it("Infinity max → safe 1", () => {
    const s = createBladeMomentumState(50, Infinity);
    expect(s.max).toBe(1);
  });

  it("Infinity current → safe 0", () => {
    const s = createBladeMomentumState(Infinity, 100);
    expect(s.current).toBe(0);
  });

  it("max <= 0 → safe 1", () => {
    const s = createBladeMomentumState(5, 0);
    expect(s.max).toBe(1);
  });
});

// ---- 上限成长保持比例测试 ----

describe("changeBladeMomentumMaxPreserveRatio", () => {
  it("60/100 → 84/140 (ratio 0.6)", () => {
    const result = changeBladeMomentumMaxPreserveRatio(60, 100, 140);
    expect(result.current).toBe(84);
    expect(result.max).toBe(140);
  });

  it("40/100 → 56/140 (ratio 0.4, mid)", () => {
    const result = changeBladeMomentumMaxPreserveRatio(40, 100, 140);
    expect(result.current).toBe(56);
    expect(result.max).toBe(140);
  });

  it("20/100 → 36/180 (ratio 0.2, low)", () => {
    const result = changeBladeMomentumMaxPreserveRatio(20, 100, 180);
    expect(result.current).toBe(36);
    expect(result.max).toBe(180);
  });

  it("oldMax=0 → safe 1", () => {
    const result = changeBladeMomentumMaxPreserveRatio(50, 0, 100);
    expect(result.current).toBe(100);
    expect(result.max).toBe(100);
  });

  // 多次变化无漂移
  it("39.99% → 100→137→181→140 后 ratio ~40%", () => {
    const r1 = changeBladeMomentumMaxPreserveRatio(39.99, 100, 137);
    const r2 = changeBladeMomentumMaxPreserveRatio(r1.current, 137, 181);
    const r3 = changeBladeMomentumMaxPreserveRatio(r2.current, 181, 140);
    expect(resolveBladeMomentumRatio(r3.current, 140)).toBeCloseTo(0.40, 2);
  });
});

// ---- 旧版兼容函数 applyBladeMaxChangePreserveRatio ----

describe("applyBladeMaxChangePreserveRatio (deprecated)", () => {
  it("80/100 → 112/140 (ratio 0.8)", () => {
    const result = applyBladeMaxChangePreserveRatio(80, 100, 140);
    expect(result.current).toBe(112);
    expect(result.max).toBe(140);
    expect(result.ratio).toBeCloseTo(0.80, 2);
  });

  it("NaN oldMax → safe 1", () => {
    const result = applyBladeMaxChangePreserveRatio(50, NaN, 100);
    expect(Number.isFinite(result.current)).toBe(true);
    expect(result.max).toBe(100);
  });
});

// ---- 刀势效果测试 ----

describe("resolveBladeMomentumEffect", () => {
  it("low band → power=1, width×1.0", () => {
    const state = createBladeMomentumState(20, 100);
    const eff = resolveBladeMomentumEffect(state);
    expect(eff.bladePower).toBe(1);
    expect(eff.widthMultiplier).toBe(1.0);
    expect(eff.visualLengthMultiplier).toBe(1.0);
  });

  it("mid band → power=2, width×1.4", () => {
    const state = createBladeMomentumState(50, 100);
    const eff = resolveBladeMomentumEffect(state);
    expect(eff.bladePower).toBe(2);
    expect(eff.widthMultiplier).toBe(1.4);
  });

  it("high band → power=3, width×2.0", () => {
    const state = createBladeMomentumState(80, 100);
    const eff = resolveBladeMomentumEffect(state);
    expect(eff.bladePower).toBe(3);
    expect(eff.widthMultiplier).toBe(2.0);
  });
});

// ---- 收益倍率测试 ----

describe("resolveBladeGainMultiplier", () => {
  it("max=100 → 1.0", () => {
    expect(resolveBladeGainMultiplier(100)).toBe(1.0);
  });

  it("max=120 → 1.1", () => {
    expect(resolveBladeGainMultiplier(120)).toBeCloseTo(1.1, 2);
  });

  it("max=140 → 1.2", () => {
    expect(resolveBladeGainMultiplier(140)).toBeCloseTo(1.2, 2);
  });

  it("max=160 → 1.3", () => {
    expect(resolveBladeGainMultiplier(160)).toBeCloseTo(1.3, 2);
  });

  it("max=180 → 1.4", () => {
    expect(resolveBladeGainMultiplier(180)).toBeCloseTo(1.4, 2);
  });

  it("max=200 → 1.4 (cap)", () => {
    expect(resolveBladeGainMultiplier(200)).toBe(1.4);
  });

  it("max=0 → 1.0 (safe)", () => {
    expect(resolveBladeGainMultiplier(0)).toBe(1.0);
  });

  it("NaN → 1.0", () => {
    expect(resolveBladeGainMultiplier(NaN)).toBe(1.0);
  });
});

// ---- 被动恢复测试 ----

describe("resolveBladePassiveRecovery", () => {
  it("current=10, max=100: 恢复至最多 20", () => {
    const result = resolveBladePassiveRecovery(10, 100, 1.0);
    expect(result.newCurrent).toBeGreaterThan(10);
    expect(result.newCurrent).toBeLessThanOrEqual(20);
  });

  it("current=20, max=100: 不恢复（已达 20% 上限）", () => {
    const result = resolveBladePassiveRecovery(20, 100, 1.0);
    expect(result.gain).toBe(0);
    expect(result.newCurrent).toBe(20);
  });

  it("current=30, max=100: 不恢复（超过 20% 上限）", () => {
    const result = resolveBladePassiveRecovery(30, 100, 1.0);
    expect(result.gain).toBe(0);
  });

  it("max=140: 恢复上限=28", () => {
    const result = resolveBladePassiveRecovery(10, 140, 1.0);
    expect(result.newCurrent).toBeLessThanOrEqual(28);
  });

  it("max=180: 恢复上限=36", () => {
    const result = resolveBladePassiveRecovery(10, 180, 1.0);
    expect(result.newCurrent).toBeLessThanOrEqual(36);
  });

  it("恢复速度 = 2%/秒", () => {
    // 100 * 0.02 = 2/秒
    const result = resolveBladePassiveRecovery(0, 100, 1.0);
    expect(result.gain).toBeCloseTo(2, 1);
  });

  it("0.5 秒恢复 1 点", () => {
    const result = resolveBladePassiveRecovery(0, 100, 0.5);
    expect(result.gain).toBeCloseTo(1, 1);
  });

  it("NaN/Infinity 输入安全", () => {
    const r1 = resolveBladePassiveRecovery(NaN, 100, 1);
    const r2 = resolveBladePassiveRecovery(10, NaN, 1);
    const r3 = resolveBladePassiveRecovery(10, 100, NaN);
    expect(Number.isFinite(r1.newCurrent)).toBe(true);
    expect(Number.isFinite(r2.newCurrent)).toBe(true);
    expect(Number.isFinite(r3.newCurrent)).toBe(true);
  });
});

// ---- 统一刀势结算测试 ----

describe("resolveBladeMomentumAfterSlash", () => {
  it("40/100, cost=8, gain=4, penalty=0: 40-8+4=36", () => {
    const mb = createBladeMomentumState(40, 100);
    const result = resolveBladeMomentumAfterSlash({
      momentumBefore: mb, baseCost: 8, activeGain: 4, penalty: 0, gainMultiplier: 1,
    });
    expect(result.current).toBe(36);
    expect(result.netChange).toBe(-4);
  });

  it("40/100, cost=8, gain=14 (3杀): 40-8+14=46", () => {
    const mb = createBladeMomentumState(40, 100);
    const result = resolveBladeMomentumAfterSlash({
      momentumBefore: mb, baseCost: 8, activeGain: 14, penalty: 0, gainMultiplier: 1,
    });
    expect(result.current).toBe(46);
    expect(result.netChange).toBe(6);
  });

  it("40/100, cost=8, gain=25 (5杀): 40-8+25=57", () => {
    const mb = createBladeMomentumState(40, 100);
    const result = resolveBladeMomentumAfterSlash({
      momentumBefore: mb, baseCost: 8, activeGain: 25, penalty: 0, gainMultiplier: 1,
    });
    expect(result.current).toBe(57);
    expect(result.netChange).toBe(17);
  });

  it("40/100, cost=8, gain=42 (8杀): 40-8+42=74", () => {
    const mb = createBladeMomentumState(40, 100);
    const result = resolveBladeMomentumAfterSlash({
      momentumBefore: mb, baseCost: 8, activeGain: 42, penalty: 0, gainMultiplier: 1,
    });
    expect(result.current).toBe(74);
  });

  it("结算后不低于 0", () => {
    const mb = createBladeMomentumState(5, 100);
    const result = resolveBladeMomentumAfterSlash({
      momentumBefore: mb, baseCost: 8, activeGain: 0, penalty: 10, gainMultiplier: 1,
    });
    expect(result.current).toBe(0);
  });

  it("结算后不超过 max", () => {
    const mb = createBladeMomentumState(95, 100);
    const result = resolveBladeMomentumAfterSlash({
      momentumBefore: mb, baseCost: 0, activeGain: 50, penalty: 0, gainMultiplier: 1,
    });
    expect(result.current).toBe(100);
  });

  it("gainMultiplier=1.2: gain×1.2", () => {
    const mb = createBladeMomentumState(40, 100);
    const result = resolveBladeMomentumAfterSlash({
      momentumBefore: mb, baseCost: 8, activeGain: 4, penalty: 0, gainMultiplier: 1.2,
    });
    // 40 - 8 + 4 * 1.2 = 40 - 8 + 4.8 = 36.8
    expect(result.current).toBeCloseTo(36.8, 1);
  });

  it("NaN/Infinity 输入安全", () => {
    const mb = createBladeMomentumState(40, 100);
    const result = resolveBladeMomentumAfterSlash({
      momentumBefore: mb, baseCost: NaN, activeGain: Infinity, penalty: -5, gainMultiplier: NaN,
    });
    expect(Number.isFinite(result.current)).toBe(true);
    expect(result.current).toBeGreaterThanOrEqual(0);
    expect(result.current).toBeLessThanOrEqual(100);
  });
});

// ---- 刀势收支测试 ----

describe("spendBladeMomentum", () => {
  it("40 - 8 = 32", () => {
    expect(spendBladeMomentum(40, 100, 8)).toBe(32);
  });

  it("5 - 8 = 0 (下限保护)", () => {
    expect(spendBladeMomentum(5, 100, 8)).toBe(0);
  });

  it("NaN/Infinity 安全", () => {
    expect(spendBladeMomentum(40, 100, NaN)).toBe(40);
    expect(spendBladeMomentum(40, 100, -5)).toBe(40);
  });
});

describe("gainBladeMomentum", () => {
  it("40 + 10 = 50", () => {
    expect(gainBladeMomentum(40, 100, 10)).toBe(50);
  });

  it("95 + 10 = 100 (上限保护)", () => {
    expect(gainBladeMomentum(95, 100, 10)).toBe(100);
  });

  it("NaN/Infinity 安全", () => {
    expect(gainBladeMomentum(40, 100, NaN)).toBe(40);
  });
});

// ---- 多斩奖励测试 ----

describe("resolveMultiSlashBonus", () => {
  it("0 杀 → 0", () => expect(resolveMultiSlashBonus(0)).toBe(0));
  it("1 杀 → 0", () => expect(resolveMultiSlashBonus(1)).toBe(0));
  it("2 杀 → 0", () => expect(resolveMultiSlashBonus(2)).toBe(0));
  it("3 杀 → +2", () => expect(resolveMultiSlashBonus(3)).toBe(2));
  it("4 杀 → +2", () => expect(resolveMultiSlashBonus(4)).toBe(2));
  it("5 杀 → +5", () => expect(resolveMultiSlashBonus(5)).toBe(5));
  it("7 杀 → +5", () => expect(resolveMultiSlashBonus(7)).toBe(5));
  it("8 杀 → +10", () => expect(resolveMultiSlashBonus(8)).toBe(10));
  it("12 杀 → +10 (只取最高档)", () => expect(resolveMultiSlashBonus(12)).toBe(10));
});

// ---- 收益倍率集成（Level 1 场景） ----

describe("收益倍率集成", () => {
  it("max=100: 4基础+5多斩, 总收益×1.0, 净=46", () => {
    const mb = createBladeMomentumState(40, 100);
    const hitGain = 1 * 2; // 命中 1 基础兵
    const killGain = 1 * 2; // 击杀 1 基础兵
    const multiBonus = resolveMultiSlashBonus(5);
    const totalGain = hitGain + killGain + multiBonus;
    const gm = resolveBladeGainMultiplier(100);
    // 4 + 5 = 9, gm=1.0
    const result = resolveBladeMomentumAfterSlash({
      momentumBefore: mb, baseCost: 0, activeGain: totalGain, penalty: 0, gainMultiplier: gm,
    });
    // 40 + 4 + 5 = 49
    expect(totalGain).toBe(9);
    expect(result.current).toBe(49);
  });

  it("max=140: 4基础+5多斩, 总收益×1.2, 净=50.8", () => {
    const mb = createBladeMomentumState(40, 140);
    const totalGain = 4 + 5; // 1 基本兵命中+击杀+多斩
    const gm = resolveBladeGainMultiplier(140);
    expect(gm).toBeCloseTo(1.2, 1);
    const result = resolveBladeMomentumAfterSlash({
      momentumBefore: mb, baseCost: 0, activeGain: totalGain, penalty: 0, gainMultiplier: gm,
    });
    // 40 + 9 * 1.2 = 40 + 10.8 = 50.8
    expect(result.current).toBeCloseTo(50.8, 1);
  });
});
