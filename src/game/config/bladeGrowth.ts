// ========================================================================
// 0814-01B: 主副刀成长最小配置底座
// 所有数值独立可配，禁止业务逻辑硬编码
// ========================================================================

// ---- 品质类型 ----

/** 刀品质 ID（9 档，本轮仅白/绿正式配置） */
export type BladeQualityId =
  | "white"    // 凡品 — 纯炼器材料
  | "green"    // 精炼 — 第一档正式装备
  | "blue"     // 玄品（预留）
  | "purple"   // 灵品（预留）
  | "orange"   // 法宝（预留）
  | "red"      // 仙器（预留）
  | "gold"     // 灵器（预留）
  | "pink"     // 仙品（预留）
  | "rainbow"; // 神器（预留）

/** 品质显示名 */
export const QUALITY_DISPLAY_NAMES: Record<BladeQualityId, string> = {
  white: "凡品",
  green: "精炼",
  blue: "玄品",
  purple: "灵品",
  orange: "法宝",
  red: "仙器",
  gold: "灵器",
  pink: "仙品",
  rainbow: "神器",
};

// ---- 品质配置 ----

export interface BladeQualityConfig {
  qualityId: BladeQualityId;
  qualityName: string;        // 显示名（如"凡品"、"精炼"）
  bladeName: string;          // 该品质刀名（如"凡铁刀胚"、"青锋刀"）
  equipable: boolean;         // 是否可装备（白=false, 绿+ =true）
  baseAttack: number;         // Lv1基础攻击（最终攻击 = baseAttack × level.attackMultiplier）
  mainMomentumEfficiency: number; // 主槽刀势获取效率
  subCooldown: number;        // 副槽御刀CD（秒），仅 equipable=true 时生效
  appearanceId: string;       // 外观资源ID（预留，暂空）
}

export const BLADE_QUALITY_CONFIG: Record<BladeQualityId, BladeQualityConfig | null> = {
  // ══ 本轮正式配置 ══
  white: {
    qualityId: "white",
    qualityName: "凡品",
    bladeName: "凡铁刀胚",
    equipable: false,
    baseAttack: 70,           // 不可装备，占位值
    mainMomentumEfficiency: 1.0,
    subCooldown: 99,          // 不可装备，占位值
    appearanceId: "",
  },
  green: {
    qualityId: "green",
    qualityName: "精炼",
    bladeName: "青锋刀",
    equipable: true,
    baseAttack: 100,          // 绿Lv1 = 100
    mainMomentumEfficiency: 1.0,
    subCooldown: 5.0,         // 绿副刀CD 5.0s
    appearanceId: "",
  },
  // ══ 后续品质预留占位 ══
  blue: null,
  purple: null,
  orange: null,
  red: null,
  gold: null,
  pink: null,
  rainbow: null,
};

// ---- 等级配置 ----

export interface BladeLevelConfig {
  level: number;              // 1~40
  attackMultiplier: number;   // 攻击倍率
  expCostToNextLevel: number; // 升下一级所需经验球数（Lv40=0）
  visualStage: number;        // 外观档位（1-5）
}

export const BLADE_LEVEL_CONFIG: BladeLevelConfig[] = [
  // Lv1-15: 前段，约1颗/级，attackMultiplier 线性插值 1.00→1.17
  { level: 1,  attackMultiplier: 1.000, expCostToNextLevel: 1, visualStage: 1 },
  { level: 2,  attackMultiplier: 1.012, expCostToNextLevel: 1, visualStage: 1 },
  { level: 3,  attackMultiplier: 1.025, expCostToNextLevel: 1, visualStage: 1 },
  { level: 4,  attackMultiplier: 1.038, expCostToNextLevel: 1, visualStage: 1 },
  { level: 5,  attackMultiplier: 1.050, expCostToNextLevel: 1, visualStage: 1 },
  { level: 6,  attackMultiplier: 1.062, expCostToNextLevel: 1, visualStage: 1 },
  { level: 7,  attackMultiplier: 1.074, expCostToNextLevel: 1, visualStage: 1 },
  { level: 8,  attackMultiplier: 1.086, expCostToNextLevel: 1, visualStage: 1 },
  { level: 9,  attackMultiplier: 1.098, expCostToNextLevel: 1, visualStage: 1 },
  { level: 10, attackMultiplier: 1.110, expCostToNextLevel: 1, visualStage: 2 },
  { level: 11, attackMultiplier: 1.122, expCostToNextLevel: 1, visualStage: 2 },
  { level: 12, attackMultiplier: 1.134, expCostToNextLevel: 1, visualStage: 2 },
  { level: 13, attackMultiplier: 1.146, expCostToNextLevel: 1, visualStage: 2 },
  { level: 14, attackMultiplier: 1.158, expCostToNextLevel: 1, visualStage: 2 },
  { level: 15, attackMultiplier: 1.170, expCostToNextLevel: 1, visualStage: 2 },
  // Lv16-30: 中段，约2颗/级，1.17→1.325
  { level: 16, attackMultiplier: 1.182, expCostToNextLevel: 2, visualStage: 2 },
  { level: 17, attackMultiplier: 1.194, expCostToNextLevel: 2, visualStage: 2 },
  { level: 18, attackMultiplier: 1.206, expCostToNextLevel: 2, visualStage: 2 },
  { level: 19, attackMultiplier: 1.218, expCostToNextLevel: 2, visualStage: 2 },
  { level: 20, attackMultiplier: 1.225, expCostToNextLevel: 2, visualStage: 3 },
  { level: 21, attackMultiplier: 1.237, expCostToNextLevel: 2, visualStage: 3 },
  { level: 22, attackMultiplier: 1.249, expCostToNextLevel: 2, visualStage: 3 },
  { level: 23, attackMultiplier: 1.261, expCostToNextLevel: 2, visualStage: 3 },
  { level: 24, attackMultiplier: 1.273, expCostToNextLevel: 2, visualStage: 3 },
  { level: 25, attackMultiplier: 1.275, expCostToNextLevel: 2, visualStage: 3 },
  { level: 26, attackMultiplier: 1.287, expCostToNextLevel: 2, visualStage: 3 },
  { level: 27, attackMultiplier: 1.299, expCostToNextLevel: 2, visualStage: 3 },
  { level: 28, attackMultiplier: 1.311, expCostToNextLevel: 2, visualStage: 3 },
  { level: 29, attackMultiplier: 1.323, expCostToNextLevel: 2, visualStage: 3 },
  { level: 30, attackMultiplier: 1.325, expCostToNextLevel: 2, visualStage: 4 },
  // Lv31-40: 后段，约3颗/级，1.325→1.400
  { level: 31, attackMultiplier: 1.338, expCostToNextLevel: 3, visualStage: 4 },
  { level: 32, attackMultiplier: 1.346, expCostToNextLevel: 3, visualStage: 4 },
  { level: 33, attackMultiplier: 1.354, expCostToNextLevel: 3, visualStage: 4 },
  { level: 34, attackMultiplier: 1.362, expCostToNextLevel: 3, visualStage: 4 },
  { level: 35, attackMultiplier: 1.365, expCostToNextLevel: 3, visualStage: 4 },
  { level: 36, attackMultiplier: 1.373, expCostToNextLevel: 3, visualStage: 4 },
  { level: 37, attackMultiplier: 1.381, expCostToNextLevel: 3, visualStage: 4 },
  { level: 38, attackMultiplier: 1.389, expCostToNextLevel: 3, visualStage: 4 },
  { level: 39, attackMultiplier: 1.397, expCostToNextLevel: 3, visualStage: 4 },
  { level: 40, attackMultiplier: 1.400, expCostToNextLevel: 0, visualStage: 5 },
];

// ---- 槽位配置 ----

export type BladeSlotId = "MAIN" | "SUB_1" | "SUB_2";

export interface SlotConfig {
  slotId: BladeSlotId;
  damageCoeff: number;     // 伤害系数（主刀=1.0，副刀=0.28）
  unlockFloor: number;     // 解锁所需关卡（0=初始解锁）
}

export const SLOT_CONFIG: Record<BladeSlotId, SlotConfig> = {
  MAIN: {
    slotId: "MAIN",
    damageCoeff: 1.0,
    unlockFloor: 0,        // 初始即解锁
  },
  SUB_1: {
    slotId: "SUB_1",
    damageCoeff: 0.28,
    unlockFloor: 3,        // 第3关解锁（首测）
  },
  SUB_2: {
    slotId: "SUB_2",
    damageCoeff: 0.28,
    unlockFloor: 999,      // 暂未开放（练气前段开放）
  },
};

// ---- 炼器（二合）配置 ----

export interface ForgeConfig {
  sourceQuality: BladeQualityId;       // 源品质
  targetQuality: BladeQualityId;       // 目标品质
  materialCount: number;               // 所需材料数（2=两把同品质）
  baseSuccessRate: number;             // 基础成功率
  failureRateAdd: number;              // 每次失败累加成功率
  maxSuccessRate: number;              // 成功率上限
  failureExpQuality: BladeQualityId;   // 失败时获得经验球品质
  failureExpCount: number;             // 失败时获得经验球数量
  tutorialFirstGuaranteedSuccess: boolean; // 教学首炼必成
}

/** 炼器配方表（本轮仅白→绿） */
export const FORGE_CONFIG: ForgeConfig[] = [
  {
    sourceQuality: "white",
    targetQuality: "green",
    materialCount: 2,
    baseSuccessRate: 0.80,
    failureRateAdd: 0.20,
    maxSuccessRate: 1.00,
    failureExpQuality: "green",
    failureExpCount: 1,
    tutorialFirstGuaranteedSuccess: true,
  },
];

// ---- 关卡首通奖励配置 ----

export interface FloorRewardItem {
  quality: BladeQualityId;
  count: number;
}

export interface FloorRewardConfig {
  floorId: number;
  firstClearReward: FloorRewardItem[];
}

/** 1~5关首通刀胚奖励（首测值，未接入业务） */
export const FLOOR_REWARD_CONFIG: FloorRewardConfig[] = [
  { floorId: 1, firstClearReward: [{ quality: "white", count: 2 }] },
  { floorId: 2, firstClearReward: [{ quality: "white", count: 2 }] },
  { floorId: 3, firstClearReward: [{ quality: "white", count: 4 }] },
  { floorId: 4, firstClearReward: [{ quality: "white", count: 2 }] },
  { floorId: 5, firstClearReward: [{ quality: "white", count: 4 }] },
];

// ---- 挂机最小配置 ----

export interface IdleDropConfig {
  dropQuality: BladeQualityId;   // 掉落刀品质
  baseDropPerHour: number;       // 每小时基础掉落数（TODO: 正式挂机经济待设计）
  capHours: number;              // 收益封顶小时数（TODO: 正式挂机经济待设计）
}

export const IDLE_CONFIG: IdleDropConfig = {
  dropQuality: "white",
  baseDropPerHour: 2,           // 首测占位值
  capHours: 24,                 // 首测占位值
};

// ---- 配置读取工具函数 ----

/** 根据品质ID获取品质配置（null = 未开放） */
export function getBladeQualityConfig(qualityId: BladeQualityId): BladeQualityConfig | null {
  return BLADE_QUALITY_CONFIG[qualityId] ?? null;
}

/** 根据等级获取等级配置 */
export function getBladeLevelConfig(level: number): BladeLevelConfig {
  const cfg = BLADE_LEVEL_CONFIG.find(l => l.level === level);
  if (!cfg) throw new Error(`[bladeGrowth] Unknown level: ${level}`);
  return cfg;
}

/** 计算指定品质+等级的最终攻击 */
export function computeBladeAttack(qualityId: BladeQualityId, level: number): number {
  const q = getBladeQualityConfig(qualityId);
  if (!q) throw new Error(`[bladeGrowth] Quality not configured: ${qualityId}`);
  const l = getBladeLevelConfig(level);
  return q.baseAttack * l.attackMultiplier;
}

/** 根据槽位ID获取槽位配置 */
export function getSlotConfig(slotId: BladeSlotId): SlotConfig {
  return SLOT_CONFIG[slotId];
}

/** 根据源/目标品质查找炼器配方 */
export function getForgeConfig(sourceQuality: BladeQualityId, targetQuality: BladeQualityId): ForgeConfig | undefined {
  return FORGE_CONFIG.find(f => f.sourceQuality === sourceQuality && f.targetQuality === targetQuality);
}

/** 根据关卡ID获取首通奖励配置 */
export function getFloorRewardConfig(floorId: number): FloorRewardConfig | undefined {
  return FLOOR_REWARD_CONFIG.find(f => f.floorId === floorId);
}

/** 获取挂机配置 */
export function getIdleConfig(): IdleDropConfig {
  return IDLE_CONFIG;
}
