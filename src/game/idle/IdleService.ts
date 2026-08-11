/** 0814 IdleService — 纯计算Snapshot + claim写入 + debug */
import { readProgress, writeProgress, grantBladeInstances } from "../services/ProgressionService";
import { getIdleConfig } from "../config/bladeGrowth";

export interface IdleSnapshot {
  unlocked: boolean;
  currentFloor: number;
  accumulatedSeconds: number;
  capSeconds: number;
  progressRatio: number;
  dropQuality: string;
  dropPerHour: number;
  pendingBladeCount: number;
  timeStr: string;
  fastIdleEnabled: boolean;
  fastIdleUsed: number;
  fastIdleLimit: number;
}

function getIdleParams(){const c=getIdleConfig();return{dropQuality:c.dropQuality??"white",baseDropPerHour:c.baseDropPerHour??2,capHours:c.capHours??24,quantityMultiplier:1.0};}

export function isIdleUnlocked(progress?: ReturnType<typeof readProgress>): boolean {
  const p = progress ?? readProgress();
  return (p.highestFloor ?? 1) >= 2;
}

/** Pure computation. Does NOT write progress. */
export function getIdleSnapshot(): IdleSnapshot {
  const progress = readProgress();
  const p = getIdleParams();
  if (!isIdleUnlocked(progress)) {
    return { unlocked: false, currentFloor: progress.highestFloor ?? 1, accumulatedSeconds: 0, capSeconds: p.capHours * 3600, progressRatio: 0, dropQuality: p.dropQuality, dropPerHour: p.baseDropPerHour, pendingBladeCount: 0, timeStr: "00:00:00", fastIdleEnabled: false, fastIdleUsed: 0, fastIdleLimit: 4 };
  }
  const storedSec = progress.idleAccumulatedSeconds ?? 0;
  const elapsed = Math.max(0, (Date.now() - (progress.lastIdleCollectAt ?? Date.now())) / 1000);
  const effSec = Math.min(p.capHours * 3600, storedSec + elapsed);
  const pending = Math.floor((effSec / 3600) * p.baseDropPerHour * p.quantityMultiplier);
  const h = Math.floor(effSec / 3600), m = Math.floor((effSec % 3600) / 60), s = Math.floor(effSec % 60);
  return { unlocked: true, currentFloor: progress.highestFloor ?? 1, accumulatedSeconds: effSec, capSeconds: p.capHours * 3600, progressRatio: Math.min(100, Math.round((effSec / (p.capHours * 3600)) * 100)), dropQuality: p.dropQuality, dropPerHour: p.baseDropPerHour, pendingBladeCount: pending, timeStr: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, fastIdleEnabled: false, fastIdleUsed: 0, fastIdleLimit: 4 };
}

export function claimIdleReward(): { ok: boolean; quality?: string; count?: number; createdBladeIds?: string[]; reason?: string } {
  const snap = getIdleSnapshot();
  if (!snap.unlocked) return { ok: false, reason: "挂机未解锁" };
  if (snap.pendingBladeCount <= 0) return { ok: false, reason: "暂无奖励" };
  const result = grantBladeInstances(snap.dropQuality, snap.pendingBladeCount, "idle");
  const progress = readProgress();
  progress.idleAccumulatedSeconds = 0;
  progress.lastIdleCollectAt = Date.now();
  writeProgress(progress);
  return { ok: true, quality: snap.dropQuality, count: snap.pendingBladeCount, createdBladeIds: result.instanceIds };
}

export function debugSimulateIdleHours(hours: number): void {
  const p = getIdleParams();
  const progress = readProgress();
  progress.idleAccumulatedSeconds = Math.min(p.capHours * 3600, (progress.idleAccumulatedSeconds ?? 0) + hours * 3600);
  progress.lastIdleCollectAt = Date.now();
  writeProgress(progress);
}

export function debugResetIdle(): void {
  const progress = readProgress();
  progress.idleAccumulatedSeconds = 0;
  progress.lastIdleCollectAt = Date.now();
  writeProgress(progress);
}
