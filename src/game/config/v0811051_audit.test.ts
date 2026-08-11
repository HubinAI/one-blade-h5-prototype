import { describe, it, expect } from "vitest";
import { readProgress, writeProgress, isForgeUnlocked, isSub1Unlocked, isIdleUnlocked, hasClearedFloor, recordMainlineClear, debugResetToNewPlayer, grantBladeInstances, equipBladeToSlot } from "../services/ProgressionService";

// ═══════════════════════════════
// 解锁链验证
// ═══════════════════════════════
describe("SUB_1 解锁→通3", () => {
  it("新号: forge/idle/sub1 全 false", () => {
    debugResetToNewPlayer();
    expect(isForgeUnlocked()).toBe(false);
    expect(isIdleUnlocked()).toBe(false);
    expect(isSub1Unlocked()).toBe(false);
  });
  it("recordMainlineClear(1): forge=true idle=false sub1=false", () => {
    debugResetToNewPlayer();
    recordMainlineClear(1);
    expect(isForgeUnlocked()).toBe(true);
    expect(isIdleUnlocked()).toBe(false);
    expect(isSub1Unlocked()).toBe(false);
  });
  it("recordMainlineClear(2): forge=true idle=true sub1=false", () => {
    debugResetToNewPlayer();
    recordMainlineClear(1); recordMainlineClear(2);
    expect(isIdleUnlocked()).toBe(true);
    expect(isSub1Unlocked()).toBe(false);
  });
  it("recordMainlineClear(3): sub1=true", () => {
    debugResetToNewPlayer();
    recordMainlineClear(1); recordMainlineClear(2); recordMainlineClear(3);
    expect(isSub1Unlocked()).toBe(true);
  });
});

// ═══════════════════════════════
// 首通奖励原子事务
// ═══════════════════════════════
describe("首通奖励原子性", () => {
  it("recordMainlineClear(1): clearedFloors含1 + 2白刀真实入库", () => {
    debugResetToNewPlayer();
    const p = readProgress();
    const preWhite = p.blades.filter(b=>b.quality==="white").length;
    recordMainlineClear(1);
    const p2 = readProgress();
    expect(p2.clearedFloors).toContain(1);
    expect(p2.clearedFloorRewards).toContain(1);
    expect(p2.blades.filter(b=>b.quality==="white").length).toBe(preWhite + 2);
  });
  it("重复调用不再发奖", () => {
    debugResetToNewPlayer();
    recordMainlineClear(1);
    const p = readProgress();
    const count = p.blades.filter(b=>b.quality==="white").length;
    recordMainlineClear(1);
    const p2 = readProgress();
    expect(p2.blades.filter(b=>b.quality==="white").length).toBe(count);
    expect(p2.clearedFloorRewards.length).toBe(1);
  });
});

// ═══════════════════════════════
// SUB_1 业务锁
// ═══════════════════════════════
describe("SUB_1 装备业务锁", () => {
  it("未通3: equipBladeToSlot SUB_1 失败", () => {
    debugResetToNewPlayer();
    recordMainlineClear(1); recordMainlineClear(2);
    const p = readProgress();
    const blade = p.blades.find(b=>b.quality==="green");
    expect(blade).toBeDefined();
    const preSub = p.equippedSubBladeIds?.length ?? 0;
    const result = equipBladeToSlot(blade!.id, "SUB_1");
    expect(result).toBe(false);
    const p2 = readProgress();
    expect(p2.equippedSubBladeIds?.length ?? 0).toBe(preSub);
  });
  it("通3后: equipBladeToSlot SUB_1 成功", () => {
    debugResetToNewPlayer();
    recordMainlineClear(1); recordMainlineClear(2); recordMainlineClear(3);
    const p = readProgress();
    const blade = p.blades.find(b=>b.quality==="green");
    const result = equipBladeToSlot(blade!.id, "SUB_1");
    expect(result).toBe(true);
  });
});

// ═══════════════════════════════
// hasClearedFloor 正确读 clearedFloors
// ═══════════════════════════════
describe("hasClearedFloor 源", () => {
  it("未领奖励也算通关", () => {
    debugResetToNewPlayer();
    const p = readProgress();
    p.clearedFloors = [5];
    // 不写 clearedFloorRewards
    writeProgress(p);
    expect(hasClearedFloor(5)).toBe(true);
  });
});
