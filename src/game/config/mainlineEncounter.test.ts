import { describe, it, expect } from "vitest";
import { FORMATIONS, RHYTHMS, MODES, ENVIRONMENTS, getFormation, getRhythm, getMode, getEnvironment } from "./mainlineEncounter";

describe("Encounter Presets — V0812017 职责拆分", () => {
  it("FORMATIONS x6", () => expect(Object.keys(FORMATIONS)).toEqual(["WIDE","CENTER","WINGS","COLUMN","STAGGER","WALL"]));
  it("RHYTHMS x5", () => expect(Object.keys(RHYTHMS).length).toBe(5));
  it("MODES x5", () => expect(Object.keys(MODES)).toEqual(["STANDARD","SWARM","BREACH","RUSH","FLANK"]));
  it("ENVS x5", () => expect(Object.keys(ENVIRONMENTS)).toEqual(["NONE","TIDE","GALE","HEAVY","GATHER"]));

  it("WALL formation: spawnZone宽", () => {
    const p = FORMATIONS.WALL;
    expect(p.spawnZone[0]).toBe(20);
    expect(p.spawnZone[1]).toBe(350);
    expect(p.mirror).toBe(true);
  });

  it("BREACH mode: baseBias<1 (少base多special)", () => {
    expect(MODES.BREACH.baseBias).toBe(0.7);
    expect(MODES.BREACH.hardBias).toBe(1.3);
  });

  it("GALE environment: speed +10%", () => {
    expect(ENVIRONMENTS.GALE.effect).toBe("gale");
    expect(ENVIRONMENTS.GALE.magnitude).toBe(0.10);
  });

  it("STEADY rhythm: 均匀分布", () => {
    const p = RHYTHMS.STEADY;
    expect(p.waveWeights.length).toBe(6);
    expect(p.waveGapMul).toBe(1.0);
  });

  it("PULSE rhythm: 大-小交替", () => {
    const p = RHYTHMS.PULSE;
    expect(p.waveWeights[0]).toBeGreaterThan(0.2);
    expect(p.waveWeights[1]).toBeLessThan(0.15);
  });

  it("SWARM mode: baseBias>1", () => expect(MODES.SWARM.baseBias).toBe(1.25));
  it("FLANK mode: movementBias>1", () => expect(MODES.FLANK.movementBias).toBe(1.25));

  it("all presets valid", () => {
    for (const p of Object.values(FORMATIONS)) { expect(p.id).toBeDefined(); expect(p.spawnZone[1] - p.spawnZone[0]).toBeGreaterThan(0); }
    for (const p of Object.values(RHYTHMS)) { expect(p.id).toBeDefined(); expect(p.waveWeights.length).toBe(6); }
    for (const p of Object.values(MODES)) { expect(p.id).toBeDefined(); expect(p.baseBias).toBeGreaterThan(0); }
    for (const p of Object.values(ENVIRONMENTS)) { expect(p.id).toBeDefined(); expect(["none","tide","gale","heavy","gather"]).toContain(p.effect); }
  });

  it("cross-category query", () => {
    expect(getFormation("CENTER")!.columnStyle).toBe("v");
    expect(getRhythm("PULSE")!.waveGapMul).toBe(0.85);
    expect(getMode("SWARM")!.baseBias).toBe(1.25);
    expect(getEnvironment("HEAVY")!.magnitude).toBe(1.3);
  });
});
