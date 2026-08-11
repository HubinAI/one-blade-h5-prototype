import { describe, it, expect } from "vitest";
import { FORMATIONS, RHYTHMS, MODES, ENVS, getEncounterPreset } from "./mainlineEncounter";

describe("Encounter Presets", () => {
  it("FORMATIONS x6", () => expect(Object.keys(FORMATIONS)).toEqual(["WIDE","CENTER","WINGS","COLUMN","STAGGER","WALL"]));
  it("RHYTHMS x5", () => expect(Object.keys(RHYTHMS).length).toBe(5));
  it("MODES x5", () => expect(Object.keys(MODES)).toEqual(["STANDARD","SWARM","BREACH","RUSH","FLANK"]));
  it("ENVS x5", () => expect(Object.keys(ENVS)).toEqual(["NONE","TIDE","GALE","HEAVY","GATHER"]));

  it("WALL countMul=1.5 speedMul=0.7", () => {
    const p = FORMATIONS.WALL;
    expect(p.countMul).toBe(1.5);
    expect(p.speedMul).toBe(0.7);
  });
  it("BREACH speedMul=1.4", () => expect(MODES.BREACH.speedMul).toBe(1.4));
  it("GALE speedMul=1.3", () => expect(ENVS.GALE.speedMul).toBe(1.3));

  it("getEncounterPreset cross-category", () => {
    expect(getEncounterPreset("FORMATION","CENTER")!.spacing).toBe(18);
    expect(getEncounterPreset("RHYTHM","PULSE")!.waveTiming).toBe(0.7);
    expect(getEncounterPreset("MODE","SWARM")!.countMul).toBe(1.6);
    expect(getEncounterPreset("ENV","HEAVY")!.countMul).toBe(1.3);
  });

  it("all presets valid", () => {
    for (const p of Object.values(FORMATIONS)) { expect(p.id).toBeDefined(); expect(p.countMul).toBeGreaterThan(0); }
    for (const p of Object.values(RHYTHMS)) { expect(p.id).toBeDefined(); expect(p.countMul).toBeGreaterThan(0); }
    for (const p of Object.values(MODES)) { expect(p.id).toBeDefined(); expect(p.countMul).toBeGreaterThan(0); }
    for (const p of Object.values(ENVS)) { expect(p.id).toBeDefined(); expect(p.countMul).toBeGreaterThan(0); }
  });
});
