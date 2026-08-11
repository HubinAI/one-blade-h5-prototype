/** 0814 IdleService — 配置全文 IDLE_CONFIG, 纯计算 + claim + debug */
import { readProgress, writeProgress, grantBladeInstances } from "../services/ProgressionService";
import { getIdleConfig } from "../config/bladeGrowth";

let _cfg: ReturnType<typeof getIdleConfig> | null = null;
function cfg() { return _cfg ?? (_cfg = getIdleConfig()); }

export interface IdleSnapshot {
  unlocked: boolean; currentFloor: number; accumulatedSeconds: number;
  capSeconds: number; progressRatio: number; dropQuality: string;
  dropPerHour: number; pendingBladeCount: number; timeStr: string;
  fastIdleEnabled: boolean; fastIdleUsed: number; fastIdleLimit: number;
}

export function isIdleUnlocked(progress?: ReturnType<typeof readProgress>): boolean {
  return ((progress ?? readProgress()).highestFloor ?? 1) >= cfg().unlockedFloor;
}

export function getIdleSnapshot(): IdleSnapshot {
  const progress = readProgress();
  const c = cfg();
  if (!isIdleUnlocked(progress)) {
    return { unlocked: false, currentFloor: progress.highestFloor ?? 1, accumulatedSeconds: 0, capSeconds: c.capHours * 3600, progressRatio: 0, dropQuality: c.dropQuality, dropPerHour: c.baseDropPerHour, pendingBladeCount: 0, timeStr: "00:00:00", fastIdleEnabled: c.fastIdleEnabled, fastIdleUsed: 0, fastIdleLimit: c.fastIdleLimit };
  }
  const storedSec = progress.idleAccumulatedSeconds ?? 0;
  const elapsed = Math.max(0, (Date.now() - (progress.lastIdleCollectAt ?? Date.now())) / 1000);
  const effSec = Math.min(c.capHours * 3600, storedSec + elapsed);
  const pending = Math.floor((effSec / 3600) * c.baseDropPerHour * c.quantityMultiplier);
  const h = Math.floor(effSec / 3600), m = Math.floor((effSec % 3600) / 60), s = Math.floor(effSec % 60);
  return { unlocked: true, currentFloor: progress.highestFloor ?? 1, accumulatedSeconds: effSec, capSeconds: c.capHours * 3600, progressRatio: Math.min(100, Math.round((effSec / (c.capHours * 3600)) * 100)), dropQuality: c.dropQuality, dropPerHour: c.baseDropPerHour, pendingBladeCount: pending, timeStr: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, fastIdleEnabled: c.fastIdleEnabled, fastIdleUsed: 0, fastIdleLimit: c.fastIdleLimit };
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
  const c = cfg();
  const progress = readProgress();
  progress.idleAccumulatedSeconds = Math.min(c.capHours * 3600, (progress.idleAccumulatedSeconds ?? 0) + hours * 3600);
  progress.lastIdleCollectAt = Date.now();
  writeProgress(progress);
}

export function debugResetIdle(): void {
  const progress = readProgress();
  progress.idleAccumulatedSeconds = 0;
  progress.lastIdleCollectAt = Date.now();
  writeProgress(progress);
}
