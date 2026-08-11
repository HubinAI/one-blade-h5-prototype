import { describe, it, expect, beforeEach } from "vitest";
import { readProgress, writeProgress, grantBladeInstances, isForgeUnlocked, isSub1Unlocked, isIdleUnlocked, hasClearedFloor, claimFloorFirstReward, debugResetToNewPlayer } from "../services/ProgressionService";
import { getIdleSnapshot, claimIdleReward } from "../idle/IdleService";
import { getBladeAttack } from "./mainlineNumeric";
import { getFloorRewardConfig } from "./firstClearReward";

// Simulate clearing floor N
function recordClear(floor: number) {
  const p = readProgress();
  if (!p.clearedFloors.includes(floor)) {
    p.clearedFloors.push(floor);
    p.highestFloor = Math.max(p.highestFloor ?? 1, floor);
  }
  writeProgress(p);
}

beforeEach(() => { debugResetToNewPlayer(); });

describe("通关→解锁→奖励集成", () => {
  it("新号: 全部未解锁", () => {
    expect(isForgeUnlocked()).toBe(false);
    expect(isSub1Unlocked()).toBe(false);
    expect(isIdleUnlocked()).toBe(false);
  });

  it("通1: 炼器+SUB1解锁, 挂机未解锁", () => {
    recordClear(1);
    expect(isForgeUnlocked()).toBe(true);
    expect(isSub1Unlocked()).toBe(true);
    expect(isIdleUnlocked()).toBe(false);
  });

  it("通2: 挂机解锁", () => {
    recordClear(1); recordClear(2);
    expect(isIdleUnlocked()).toBe(true);
  });

  it("通1自动首通奖励: 2白刀", () => {
    recordClear(1);
    const r = claimFloorFirstReward(1);
    expect(r).not.toBeNull();
    expect(r!.bladeCount).toBe(2);
    const p = readProgress();
    const whites = p.blades.filter(b => b.quality === "white").length;
    expect(whites).toBeGreaterThanOrEqual(2);
  });

  it("首通奖励不会重复发", () => {
    recordClear(1);
    claimFloorFirstReward(1);
    expect(claimFloorFirstReward(1)).toBeNull();
  });

  it("F31首通奖励绿色刀", () => {
    recordClear(31);
    const cfg = getFloorRewardConfig(31);
    expect(cfg.quality).toBe("green");
    const r = claimFloorFirstReward(31);
    expect(r).not.toBeNull();
    expect(r!.bladeCount).toBe(cfg.count);
  });

  it("hasClearedFloor读clearedFloors, 非clearedFloorRewards", () => {
    recordClear(5);
    expect(hasClearedFloor(5)).toBe(true);
    // 即使还没领取奖励, 也算通关
    expect(hasClearedFloor(5)).toBe(true);
  });
});

describe("挂机产出集成", () => {
  it("未通2: 挂机未解锁, rate=0", () => {
    recordClear(1);
    const snap = getIdleSnapshot();
    expect(snap.unlocked).toBe(false);
  });

  it("通2后: 挂机pools有白100%", () => {
    recordClear(1); recordClear(2);
    const snap = getIdleSnapshot();
    expect(snap.unlocked).toBe(true);
    expect(snap.pools.length).toBe(1);
    expect(snap.pools[0].quality).toBe("white");
  });

  it("通31后: pools含白+绿", () => {
    for (let f=1; f<=31; f++) recordClear(f);
    const snap = getIdleSnapshot();
    expect(snap.pools.length).toBe(2);
    expect(snap.pools.map(p=>p.quality)).toContain("green");
  });
});

describe("装备攻击", () => {
  it("绿Lv1=100", () => expect(getBladeAttack("green", 1)).toBe(100));
  it("绿Lv40=145", () => expect(getBladeAttack("green", 40)).toBe(145));
  it("绿Lv40!=203 (不再重复乘attackMultiplier)", () => expect(getBladeAttack("green", 40)).not.toBe(203));
  it("蓝Lv40=402", () => expect(getBladeAttack("blue", 40)).toBe(402));
  it("彩虹Lv40=34676", () => expect(getBladeAttack("rainbow", 40)).toBe(34676));
});
