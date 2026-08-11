import { describe, it, expect, beforeEach } from "vitest";
import { readProgress, writeProgress, hasClearedFloor, debugResetToNewPlayer } from "../services/ProgressionService";
import { getIdleSnapshot, claimIdleReward, debugSimulateIdleHours } from "../idle/IdleService";
import { getIdleQualityPool, rollIdleQuality } from "./idleProduction";

function recordClear(floor: number) {
  const p = readProgress();
  if (!p.clearedFloors.includes(floor)) { p.clearedFloors.push(floor); p.highestFloor = Math.max(p.highestFloor??1, floor); }
  writeProgress(p);
}

beforeEach(() => { debugResetToNewPlayer(); for (let f=1; f<=30; f++) recordClear(f); });

describe("品质概率池配置", () => {
  it("2-30纯白", () => expect(getIdleQualityPool(10)).toEqual([{quality:"white",weight:100}]));
  it("31-50白70绿30", () => {
    const p = getIdleQualityPool(31);
    expect(p).toContainEqual({quality:"white",weight:70});
    expect(p).toContainEqual({quality:"green",weight:30});
  });
  it("51-75绿80蓝20", () => expect(getIdleQualityPool(60).find(e=>e.quality==="green")!.weight).toBe(80));
  it("76-105蓝85紫15", () => expect(getIdleQualityPool(90).find(e=>e.quality==="purple")!.weight).toBe(15));
  it("106-140紫90橙10", () => expect(getIdleQualityPool(120).find(e=>e.quality==="orange")!.weight).toBe(10));
  it("141-180橙95红5", () => expect(getIdleQualityPool(160).find(e=>e.quality==="red")!.weight).toBe(5));
});

describe("概率模拟", () => {
  it("F31 10000次 white≈70% green≈30%", () => {
    let w=0, g=0;
    for(let i=0;i<10000;i++){ const q=rollIdleQuality(31); if(q==="white")w++; else g++; }
    expect(w/10000).toBeGreaterThan(0.60); expect(w/10000).toBeLessThan(0.80);
    expect(g/10000).toBeGreaterThan(0.20); expect(g/10000).toBeLessThan(0.40);
  });
  it("F141 10000次 orange≈95% red≈5%", () => {
    let o=0, r=0;
    for(let i=0;i<10000;i++){ const q=rollIdleQuality(150); if(q==="orange")o++; else r++; }
    expect(o/10000).toBeGreaterThan(0.90); expect(o/10000).toBeLessThan(0.99);
    expect(r/10000).toBeGreaterThan(0.01); expect(r/10000).toBeLessThan(0.10);
  });
});

describe("IdleService集成", () => {
  it("F31 claim返回多品质", () => {
    recordClear(31);
    debugSimulateIdleHours(24);
    const r = claimIdleReward();
    expect(r.ok).toBe(true);
    expect(r.items!.length).toBeGreaterThanOrEqual(1);
    expect(r.items!.reduce((s,i)=>s+i.count,0)).toBeGreaterThan(0);
    // verify items in backpack
    const p = readProgress();
    const total = r.items!.reduce((s,i)=>s+i.count,0);
    const inBag = p.blades.length;
    expect(inBag).toBeGreaterThanOrEqual(total);
  });
  it("F31预览显示概率", () => {
    recordClear(31);
    const snap = getIdleSnapshot();
    expect(snap.pools.length).toBe(2);
  });
});
