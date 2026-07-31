/**
 * V0731005: 进度宝箱单元测试
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  PROGRESS_CHEST_CONFIG,
  getUnlockedChestCount,
  type ProgressChestStatus,
} from "../../game/config/progressChest";

describe("PROGRESS_CHEST_CONFIG", () => {
  it("thresholds should be [30, 60, 100]", () => {
    expect(PROGRESS_CHEST_CONFIG.thresholds).toEqual([30, 60, 100]);
  });

  it("secondChestUnlockMainline should be 6", () => {
    expect(PROGRESS_CHEST_CONFIG.secondChestUnlockMainline).toBe(6);
  });
});

describe("getUnlockedChestCount", () => {
  it("主线1~5只解锁1个宝箱", () => {
    for (let i = 1; i <= 5; i++) {
      expect(getUnlockedChestCount(i)).toBe(1);
    }
  });

  it("主线6及以上解锁2个宝箱", () => {
    for (let i = 6; i <= 10; i++) {
      expect(getUnlockedChestCount(i)).toBe(2);
    }
  });
});

describe("ProgressChestRuntime simulation", () => {
  type Runtime = {
    stageIndex: number;
    progress: number;
    threshold: number;
    status: ProgressChestStatus;
    maxChestCount: number;
    lastCountedEnemyId: string;
    lastKillSource: string;
  };

  function createRuntime(threshold = 30, maxChest = 1): Runtime {
    return {
      stageIndex: 0,
      progress: 0,
      threshold,
      status: "charging",
      maxChestCount: maxChest,
      lastCountedEnemyId: "",
      lastKillSource: "",
    };
  }

  function registerKill(rt: Runtime, enemyId: string, source: string) {
    if (rt.status !== "charging") return;
    if (rt.progress >= rt.threshold) return;
    if (enemyId === rt.lastCountedEnemyId) return;
    rt.progress = Math.min(rt.progress + 1, rt.threshold);
    rt.lastCountedEnemyId = enemyId;
    rt.lastKillSource = source;
    if (rt.progress >= rt.threshold) {
      rt.status = "ready";
    }
  }

  function resolveAndAdvance(rt: Runtime) {
    const nextIndex = rt.stageIndex + 1;
    const thresholds = PROGRESS_CHEST_CONFIG.thresholds;
    if (nextIndex < thresholds.length && nextIndex < rt.maxChestCount) {
      rt.stageIndex = nextIndex;
      rt.progress = 0;
      rt.threshold = thresholds[nextIndex];
      rt.status = "charging";
    } else {
      rt.status = nextIndex >= rt.maxChestCount ? "complete" : "locked";
    }
  }

  it("初始状态为stage0, 0/30, charging", () => {
    const rt = createRuntime();
    expect(rt.stageIndex).toBe(0);
    expect(rt.progress).toBe(0);
    expect(rt.threshold).toBe(30);
    expect(rt.status).toBe("charging");
  });

  it("普通敌人真实死亡后+1", () => {
    const rt = createRuntime();
    registerKill(rt, "e1", "slash");
    expect(rt.progress).toBe(1);
  });

  it("同一enemyId重复死亡只计1次", () => {
    const rt = createRuntime();
    registerKill(rt, "e1", "slash");
    registerKill(rt, "e1", "slash");
    expect(rt.progress).toBe(1);
  });

  it("同帧多个敌人死亡按人数计数", () => {
    const rt = createRuntime();
    registerKill(rt, "e1", "slash");
    registerKill(rt, "e2", "sub_momentum");
    registerKill(rt, "e3", "chain");
    expect(rt.progress).toBe(3);
  });

  it("29/30同帧死亡3人后clamp为30", () => {
    const rt = createRuntime();
    rt.progress = 29;
    registerKill(rt, "e30", "slash");
    registerKill(rt, "e31", "slash");
    registerKill(rt, "e32", "slash");
    expect(rt.progress).toBe(30);
  });

  it("达到30后status=ready", () => {
    const rt = createRuntime();
    rt.progress = 29;
    registerKill(rt, "e30", "slash");
    expect(rt.status).toBe("ready");
  });

  it("ready后额外击杀不累计", () => {
    const rt = createRuntime();
    rt.progress = 30;
    rt.status = "ready";
    registerKill(rt, "e31", "slash");
    expect(rt.progress).toBe(30);
  });

  it("overflow不结转", () => {
    const rt = createRuntime();
    resolveAndAdvance(rt);
    expect(rt.progress).toBe(0);
  });

  it("重试重置为0/30", () => {
    let rt = createRuntime();
    rt.progress = 15;
    rt = createRuntime(30, 1);
    expect(rt.progress).toBe(0);
    expect(rt.threshold).toBe(30);
  });

  it("阶段推进后为0/60", () => {
    const rt = createRuntime(30, 2);
    rt.progress = 30;
    rt.status = "ready";
    resolveAndAdvance(rt);
    expect(rt.stageIndex).toBe(1);
    expect(rt.progress).toBe(0);
    expect(rt.threshold).toBe(60);
    expect(rt.status).toBe("charging");
  });

  it("单宝箱推进后变为complete", () => {
    const rt = createRuntime(30, 1);
    rt.progress = 30;
    rt.status = "ready";
    resolveAndAdvance(rt);
    expect(rt.status).toBe("complete");
  });

  it("配置阈值为30/60/100", () => {
    expect(PROGRESS_CHEST_CONFIG.thresholds).toEqual([30, 60, 100]);
  });

  it("Boss模式不累计（charging状态检查）", () => {
    const rt = createRuntime(30, 0);
    rt.status = "complete";
    registerKill(rt, "e1", "slash");
    expect(rt.progress).toBe(0);
  });

  it("activeEdicts初始为空", () => {
    const activeEdicts: { id: string; level: number }[] = [];
    expect(activeEdicts).toEqual([]);
  });
});
