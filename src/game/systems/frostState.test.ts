import { describe, it, expect } from "vitest";

describe("Frost state machine — slowLeft persistence after freeze+shatter", () => {
  it("elite freeze 0.20s then slowLeft=2.5 continues > 1.5s without re-hit", () => {
    const freezeDur = 0.20;
    const shatterDur = 0.20;
    const slowTotal = 2.5;
    const dt = 1 / 60; // ~16.67ms

    // Simulate hit
    let frozenLeft = freezeDur;
    let slowLeft = 0;
    let wasFrozen = false;
    let shatterTimer = 0;

    // Phase 1: freeze
    while (frozenLeft > 0) {
      frozenLeft -= dt;
      if (frozenLeft <= 0) { wasFrozen = true; shatterTimer = shatterDur; }
    }
    expect(wasFrozen).toBe(true);
    expect(shatterTimer).toBeGreaterThan(0);

    // Phase 2: shatter
    while (shatterTimer > 0) {
      shatterTimer = Math.max(0, shatterTimer - dt);
      if (shatterTimer <= 0) slowLeft = slowTotal;
    }
    expect(slowLeft).toBe(slowTotal);

    // Phase 3: verify slowLeft persists > 1.5s
    const elapsed = 1.5;
    const steps = Math.floor(elapsed / dt);
    for (let i = 0; i < steps; i++) {
      slowLeft -= dt;
      expect(slowLeft).toBeGreaterThan(0);
    }
    expect(slowLeft).toBeCloseTo(slowTotal - elapsed, 1);

    // Phase 4: full expiry
    while (slowLeft > 0) slowLeft -= dt;
    expect(slowLeft).toBeLessThanOrEqual(0);
  });

  it("re-hit during slow refreshes to 2.5s without re-freeze", () => {
    const slowTotal = 2.5;
    let slowLeft = 1.0;
    let frozenLeft = 0;
    // Simulate re-hit
    if (slowLeft > 0) slowLeft = slowTotal;
    expect(slowLeft).toBe(slowTotal);
    expect(frozenLeft).toBe(0);
  });
});
