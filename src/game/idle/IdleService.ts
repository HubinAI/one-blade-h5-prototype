/** 0814 IdleService — 品质概率池 + per-blade Roll + claim */
import { readProgress, writeProgress, grantBladeInstances, hasClearedFloor } from "../services/ProgressionService";
import { getIdleRatePerHour, getIdleQualityPool, rollIdleQuality, IDLE_CONFIG_COMMON } from "../config/idleProduction";

export interface IdleSnapshot {
  unlocked: boolean; currentFloor: number; accumulatedSeconds: number;
  capSeconds: number; progressRatio: number;
  dropPerHour: number; pendingBladeCount: number; timeStr: string;
  fastIdleEnabled: boolean; fastIdleUsed: number; fastIdleLimit: number;
  pools: { quality: string; weight: number }[];
}

export function isIdleUnlocked(progress?: ReturnType<typeof readProgress>): boolean {
  if (progress) return hasClearedFloor(2);
  return hasClearedFloor(2);
}

function bestFloor(): number {
  const p = readProgress();
  return p.clearedFloors.length > 0 ? Math.max(...p.clearedFloors) : 1;
}

export function getIdleSnapshot(): IdleSnapshot {
  const progress = readProgress();
  const unlocked = hasClearedFloor(2);
  const c = IDLE_CONFIG_COMMON;
  const floor = bestFloor();
  if (!unlocked) {
    return { unlocked: false, currentFloor: floor, accumulatedSeconds: 0, capSeconds: c.capHours * 3600, progressRatio: 0, dropPerHour: 0, pendingBladeCount: 0, timeStr: "00:00:00", fastIdleEnabled: false, fastIdleUsed: 0, fastIdleLimit: c.fastIdleLimit, pools: [] };
  }
  const rate = getIdleRatePerHour(floor);
  const storedSec = progress.idleAccumulatedSeconds ?? 0;
  const elapsed = Math.max(0, (Date.now() - (progress.lastIdleCollectAt ?? Date.now())) / 1000);
  const effSec = Math.min(c.capHours * 3600, storedSec + elapsed);
  const pending = Math.floor((effSec / 3600) * rate);
  const h = Math.floor(effSec / 3600), m = Math.floor((effSec % 3600) / 60), s = Math.floor(effSec % 60);
  return { unlocked: true, currentFloor: floor, accumulatedSeconds: effSec, capSeconds: c.capHours * 3600, progressRatio: Math.min(100, Math.round((effSec / (c.capHours * 3600)) * 100)), dropPerHour: rate, pendingBladeCount: pending, timeStr: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, fastIdleEnabled: false, fastIdleUsed: 0, fastIdleLimit: c.fastIdleLimit, pools: getIdleQualityPool(floor) };
}

export function claimIdleReward(): { ok: boolean; quality?: string; count?: number; items?: { quality: string; count: number }[]; reason?: string } {
  const snap = getIdleSnapshot();
  if (!snap.unlocked) return { ok: false, reason: "挂机未解锁" };
  if (snap.pendingBladeCount <= 0) return { ok: false, reason: "暂无奖励" };
  const floor = bestFloor();
  const byQuality: Record<string, number> = {};
  for (let i = 0; i < snap.pendingBladeCount; i++) {
    const q = rollIdleQuality(floor);
    byQuality[q] = (byQuality[q] ?? 0) + 1;
  }
  const items: { quality: string; count: number }[] = [];
  for (const [q, n] of Object.entries(byQuality)) {
    grantBladeInstances(q, n, "idle");
    items.push({ quality: q, count: n });
  }
  const progress = readProgress();
  progress.idleAccumulatedSeconds = 0;
  progress.lastIdleCollectAt = Date.now();
  writeProgress(progress);
  return { ok: true, count: snap.pendingBladeCount, items };
}

export function debugSimulateIdleHours(hours: number): void {
  const progress = readProgress();
  progress.idleAccumulatedSeconds = Math.min(IDLE_CONFIG_COMMON.capHours * 3600, (progress.idleAccumulatedSeconds ?? 0) + hours * 3600);
  progress.lastIdleCollectAt = Date.now();
  writeProgress(progress);
}

export function debugResetIdle(): void {
  const progress = readProgress();
  progress.idleAccumulatedSeconds = 0;
  progress.lastIdleCollectAt = Date.now();
  writeProgress(progress);
}
