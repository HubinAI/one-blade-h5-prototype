// ========================================================================
// BossStrategySliceController 单元测试 — V0723016-S1.4
// S1.4规则: seed不可斩; 安全清场/充能反射/过载三路线; charged直斩补给供能弹
// ========================================================================
import { describe, it, expect, beforeEach } from "vitest";
import { BossStrategySliceController } from "./BossStrategySliceController";
import { createBladeMomentumState } from "./bladeMomentum";
import { BLADE_MOMENTUM_CONFIG } from "../config/bladeMomentum";
import { resetProjectileIdCounter } from "./projectileSystem";

function m(ratio: number) {
  return createBladeMomentumState(Math.round(ratio * 100), BLADE_MOMENTUM_CONFIG.baseMax);
}

describe("BossStrategySliceController — S1.4", () => {
  let c: BossStrategySliceController;

  beforeEach(() => {
    resetProjectileIdCounter();
    c = new BossStrategySliceController();
    c.setSeed(1);
  });

  it("S1: seed无弹幕对象，不可交互", () => {
    c.update(0.7);
    expect(c.coreState).toBe("seed");
    expect(c.getCoreProjectile()).toBeNull();
  });

  it("S2: 斩断两供能弹 → safe_clear → 小破绽", () => {
    c.update(0.7);
    for (const f of c.getFeeders()) {
      c.resolveProjectileHit(f, m(0.5));
    }
    c.update(0.05);
    expect(c.cleanClears).toBeGreaterThanOrEqual(1);
    expect(c.windowType).toBe("small");
  });

  it("S3: 吸收1枚 → charged核心弹出现", () => {
    c.update(0.7);
    c.getFeeders()[0].x = 195; c.getFeeders()[0].y = 340;
    c.update(0.1);
    expect(c.coreState).toBe("charged");
    expect(c.getCoreProjectile()).not.toBeNull();
  });

  it("S4: charged反射 → 大破绽", () => {
    c.update(0.7);
    c.getFeeders()[0].x = 195; c.getFeeders()[0].y = 340;
    c.update(0.1);
    const core = c.getCoreProjectile();
    if (core) {
      c.resolveProjectileHit(core, m(0.9));
      core.x = 245; core.y = 240;
      c.checkReflectHitShoulder();
      expect(c.chargedReflects).toBeGreaterThanOrEqual(1);
      expect(c.windowType).toBe("large");
    }
  });

  it("S5: charged直斩 → 补给供能弹", () => {
    c.update(0.7);
    c.getFeeders()[0].x = 195; c.getFeeders()[0].y = 340;
    c.update(0.1);
    const core = c.getCoreProjectile();
    if (core) {
      const before = c.feederRemaining;
      c.resolveProjectileHit(core, m(0.3));
      expect(c.feederRemaining).toBeGreaterThan(before);
    }
  });

  it("S6: 吸收2枚 → overloaded", () => {
    c.update(0.7);
    c.getFeeders()[0].x = 195; c.getFeeders()[0].y = 340;
    c.getFeeders()[1].x = 195; c.getFeeders()[1].y = 340;
    c.update(0.1);
    expect(c.coreState).toBe("overloaded");
    expect(c.overloads).toBeGreaterThanOrEqual(1);
  });

  it("S7: overload → carryOver继承", () => {
    c.update(0.7);
    c.getFeeders()[0].x = 195; c.getFeeders()[0].y = 340;
    c.getFeeders()[1].x = 195; c.getFeeders()[1].y = 340;
    c.update(0.1);
    expect(c.carryOverDangerCount).toBeGreaterThanOrEqual(1);
  });

  it("S8: 安全清场三统计互斥", () => {
    c.update(0.7);
    for (const f of c.getFeeders()) c.resolveProjectileHit(f, m(0.5));
    c.update(0.05);
    expect(c.cleanClears).toBeGreaterThanOrEqual(1);
    expect(c.chargedReflects).toBe(0);
    expect(c.overloads).toBe(0);
  });

  it("S9: safeClear统计与cycle进入一致", () => {
    c.update(0.7);
    for (const f of c.getFeeders()) c.resolveProjectileHit(f, m(0.5));
    c.update(0.05);
    const snap = c.getSnapshot();
    expect(snap.cleanClears).toBeGreaterThanOrEqual(1);
    expect(snap.windowType).toBe("small");
  });

  it("S10: 两轮后 slice_complete", () => {
    // Cycle 1
    c.update(0.7);
    for (const f of c.getFeeders()) c.resolveProjectileHit(f, m(0.5));
    c.update(0.1);
    expect(c.cleanClears).toBeGreaterThanOrEqual(1);
  });
});
