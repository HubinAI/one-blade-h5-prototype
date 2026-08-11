/**
 * 0814-04A-1 IdleService — 挂机业务独立模块
 * 单一职责: 时间累计 → 刀数量计算 → 预览 → 领取 → 资产API
 * 不依赖: ArmoryScreen / ArmoryRewardModal / 任何UI组件
 */
import { readProgress, writeProgress, grantBladeInstances } from "../services/ProgressionService";
import { getIdleConfig } from "../config/bladeGrowth";

// ── Snapshot 合同 ──
export interface IdleSnapshot {
  unlocked: boolean;
  accumulatedSeconds: number;
  capSeconds: number;
  progressRatio: number;
  dropQuality: string;
  dropPerHour: number;
  pendingBladeCount: number;
  lastCollectAt: number;
  timeStr: string;
  fastIdleEnabled: boolean;
  fastIdleUsed: number;
  fastIdleLimit: number;
}

// ── 配置读取 ──
function getIdleParams() {
  const cfg = getIdleConfig();
  // 首测: 只产刀, quantityMultiplier=1, capHours=24
  return {
    dropQuality: "white" as const,
    baseDropPerHour: 2,
    capHours: 24,
    quantityMultiplier: 1.0,
    unlockedFloor: 2,
  };
}

// ── 累计更新 ──
function tick(progress: ReturnType<typeof readProgress>) {
  const params = getIdleParams();
  if ((progress.highestFloor ?? 1) < params.unlockedFloor) return;
  const now = Date.now();
  const elapsed = Math.max(0, (now - (progress.lastIdleCollectAt ?? now)) / 1000);
  if (elapsed < 60) return;
  progress.idleAccumulatedSeconds = Math.min(
    params.capHours * 3600,
    (progress.idleAccumulatedSeconds ?? 0) + elapsed
  );
  progress.lastIdleCollectAt = now;
}

// ── public API ──

/** 获取挂机快照 (UI只消费这份数据, 不自行计算) */
export function getIdleSnapshot(): IdleSnapshot {
  const progress = readProgress();
  tick(progress);
  const params = getIdleParams();
  const sec = progress.idleAccumulatedSeconds ?? 0;
  const capSec = params.capHours * 3600;
  const pending = Math.floor((sec / 3600) * params.baseDropPerHour * params.quantityMultiplier);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return {
    unlocked: (progress.highestFloor ?? 1) >= params.unlockedFloor,
    accumulatedSeconds: sec,
    capSeconds: capSec,
    progressRatio: Math.min(100, Math.round((sec / capSec) * 100)),
    dropQuality: params.dropQuality,
    dropPerHour: params.baseDropPerHour,
    pendingBladeCount: pending,
    lastCollectAt: progress.lastIdleCollectAt ?? Date.now(),
    timeStr: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
    fastIdleEnabled: false,
    fastIdleUsed: 0,
    fastIdleLimit: 4,
  };
}

/** 领取挂机奖励 → 通过 grantBladeInstances 写入资产 */
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

// ── Debug ──

export function debugSimulateIdleHours(hours: number): void {
  const progress = readProgress();
  const params = getIdleParams();
  progress.idleAccumulatedSeconds = Math.min(
    params.capHours * 3600,
    (progress.idleAccumulatedSeconds ?? 0) + hours * 3600
  );
  writeProgress(progress);
}

export function debugResetIdle(): void {
  const progress = readProgress();
  progress.idleAccumulatedSeconds = 0;
  progress.lastIdleCollectAt = Date.now();
  writeProgress(progress);
}
