/** 0814 IdleService — 纯计算 + claim + debug, 唯一读idleProduction.ts */
import { readProgress, writeProgress, grantBladeInstances, hasClearedFloor } from "../services/ProgressionService";
import { getIdleQuality, getIdleRatePerHour, IDLE_CONFIG_COMMON } from "../config/idleProduction";

export interface IdleSnapshot {
  unlocked: boolean; currentFloor: number; accumulatedSeconds: number;
  capSeconds: number; progressRatio: number; dropQuality: string;
  dropPerHour: number; pendingBladeCount: number; timeStr: string;
  fastIdleEnabled: boolean; fastIdleUsed: number; fastIdleLimit: number;
}

export function isIdleUnlocked(progress?: ReturnType<typeof readProgress>): boolean {
  if (progress) return hasClearedFloor(2);
  return hasClearedFloor(2);
}

export function getIdleSnapshot(): IdleSnapshot {
  const progress = readProgress();
  const unlocked = hasClearedFloor(2);
  const c = IDLE_CONFIG_COMMON;
  const bestFloor = progress.clearedFloors.length > 0 ? Math.max(...progress.clearedFloors) : 1;
  if (!unlocked) {
    return { unlocked: false, currentFloor: bestFloor, accumulatedSeconds: 0, capSeconds: c.capHours * 3600, progressRatio: 0, dropQuality: "white", dropPerHour: 0, pendingBladeCount: 0, timeStr: "00:00:00", fastIdleEnabled: false, fastIdleUsed: 0, fastIdleLimit: c.fastIdleLimit };
  }
  const rate = getIdleRatePerHour(bestFloor);
  const quality = getIdleQuality(bestFloor);
  const storedSec = progress.idleAccumulatedSeconds ?? 0;
  const elapsed = Math.max(0, (Date.now() - (progress.lastIdleCollectAt ?? Date.now())) / 1000);
  const effSec = Math.min(c.capHours * 3600, storedSec + elapsed);
  const pending = Math.floor((effSec / 3600) * rate);
  const h = Math.floor(effSec / 3600), m = Math.floor((effSec % 3600) / 60), s = Math.floor(effSec % 60);
  return { unlocked: true, currentFloor: bestFloor, accumulatedSeconds: effSec, capSeconds: c.capHours * 3600, progressRatio: Math.min(100, Math.round((effSec / (c.capHours * 3600)) * 100)), dropQuality: quality, dropPerHour: rate, pendingBladeCount: pending, timeStr: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, fastIdleEnabled: false, fastIdleUsed: 0, fastIdleLimit: c.fastIdleLimit };
}

export function claimIdleReward(): { ok: boolean; quality?: string; count?: number; reason?: string } {
  const snap = getIdleSnapshot();
  if (!snap.unlocked) return { ok: false, reason: "挂机未解锁" };
  if (snap.pendingBladeCount <= 0) return { ok: false, reason: "暂无奖励" };
  const result = grantBladeInstances(snap.dropQuality, snap.pendingBladeCount, "idle");
  const progress = readProgress();
  progress.idleAccumulatedSeconds = 0;
  progress.lastIdleCollectAt = Date.now();
  writeProgress(progress);
  return { ok: true, quality: snap.dropQuality, count: snap.pendingBladeCount };
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
