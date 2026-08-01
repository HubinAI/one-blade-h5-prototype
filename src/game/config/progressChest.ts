/**
 * V0731005: 进度宝箱通用配置
 * 
 * 阈值含义：
 * - thresholds[0]=30: 第1个宝箱本阶段需击杀30名
 * - thresholds[1]=60: 第2个宝箱本阶段需击杀60名
 * - thresholds[2]=100: 第3个宝箱本阶段需击杀100名
 * 
 * 每个宝箱独立重新累计，不结转。
 * 整局累计节点：30 → 90 → 190
 */
export const PROGRESS_CHEST_CONFIG = {
  /** 每个宝箱阶段的独立击杀要求 */
  thresholds: [30, 60, 100],
  /** 主线达到多少级解锁第2个宝箱 */
  secondChestUnlockMainline: 6,
  /** V0801007: 宝箱解锁阶梯（第2/第3/第4箱分别在哪个主线等级解锁） */
  chestUnlockLevels: [6, 16, 41],
  /** 第3宝箱暂不设主线解锁节点 */
} as const;

/** 宝箱状态 */
export type ProgressChestStatus =
  | "charging"   // 正在累计
  | "ready"      // 已达阈值，等待开奖
  | "opening"    // 正在开奖
  | "resolved"   // 已开奖
  | "locked"     // 下一宝箱未解锁
  | "complete";  // 全场宝箱已用完

/** 进度宝箱运行时状态 */
export interface ProgressChestRuntime {
  stageIndex: number;     // 当前宝箱序号（0=第1箱）
  progress: number;        // 当前阶段已击杀数
  threshold: number;       // 当前阶段要求
  status: ProgressChestStatus;
  maxChestCount: number;   // 本关最多几个宝箱
  /** 防重复：最后一次计数的 enemyId */
  lastCountedEnemyId: string;
  /** 最后一次计数的来源 */
  lastKillSource: string;
}

/** 军令ID */
export type EdictId = "triple_slash" | "scorch" | "frost";

/** 军令实例 */
export interface EdictInstance {
  id: EdictId;
  level: number;
}

/** 根据主线等级获取已解锁宝箱数 */
export function getUnlockedChestCount(mainlineLevel: number): number {
  return mainlineLevel >= PROGRESS_CHEST_CONFIG.secondChestUnlockMainline ? 2 : 1;
}
