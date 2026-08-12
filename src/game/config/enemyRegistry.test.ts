import { describe, it, expect } from "vitest";
import { resolveEnemyType, NORMAL_IMPLEMENTED, NORMAL_RESERVED, ELITE_IMPLEMENTED, ELITE_RESERVED } from "./enemyRegistry";

describe("EnemyRegistry", () => {
  // Normal: implemented pass through
  it("infantry→infantry", () => { const r=resolveEnemyType("infantry"); expect(r.runtimeType).toBe("infantry"); expect(r.isProxy).toBe(false); });
  it("powder→powder", () => expect(resolveEnemyType("powder").isProxy).toBe(false));
  it("tractor→tractor", () => expect(resolveEnemyType("tractor").isProxy).toBe(false));
  it("splitter→splitter", () => expect(resolveEnemyType("splitter").isProxy).toBe(false));
  it("core→core", () => expect(resolveEnemyType("core").isProxy).toBe(false));
  it("shield→shield", () => expect(resolveEnemyType("shield").isProxy).toBe(false));

  // Normal: reserved → proxy
  it("charger→tractor", () => { const r=resolveEnemyType("charger"); expect(r.runtimeType).toBe("tractor"); expect(r.isProxy).toBe(true); expect(r.logicalType).toBe("charger"); });
  it("mover→infantry", () => { const r=resolveEnemyType("mover"); expect(r.runtimeType).toBe("infantry"); expect(r.isProxy).toBe(true); });
  it("shooter→shield", () => { const r=resolveEnemyType("shooter"); expect(r.runtimeType).toBe("shield"); expect(r.isProxy).toBe(true); });

  // Elite: implemented pass through
  it("fireRing→fireRing", () => expect(resolveEnemyType("fireRing").isProxy).toBe(false));
  it("heal→heal", () => expect(resolveEnemyType("heal").isProxy).toBe(false));
  it("aura→aura", () => expect(resolveEnemyType("aura").isProxy).toBe(false));

  // Elite: reserved → proxy
  it("chargeElite→fireRing", () => { const r=resolveEnemyType("chargeElite"); expect(r.runtimeType).toBe("fireRing"); expect(r.isProxy).toBe(true); });
  it("bannerElite→aura", () => { const r=resolveEnemyType("bannerElite"); expect(r.runtimeType).toBe("aura"); expect(r.isProxy).toBe(true); });

  // Unknown
  it("unknown→unknown", () => { const r=resolveEnemyType("unknown"); expect(r.runtimeType).toBe("unknown"); expect(r.isProxy).toBe(false); });

  // Counts
  it("6 normal implemented", () => expect(NORMAL_IMPLEMENTED.length).toBe(6));
  it("3 normal reserved", () => expect(NORMAL_RESERVED.length).toBe(3));
  it("3 elite implemented", () => expect(ELITE_IMPLEMENTED.length).toBe(3));
  it("2 elite reserved", () => expect(ELITE_RESERVED.length).toBe(2));
});
