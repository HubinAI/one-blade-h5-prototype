/**
 * 0807-11B-1: 统一伤害与真实HP系统
 *
 * 核心技术原则：
 * - 最终伤害 = currentAttack × skillCoefficient × (1 + bladeDamageBonus + conditionDamageBonus)
 *              × (1 + finalDamageBonus) × (1 - targetFinalDamageReduction)
 * - 计算过程保留小数，最终 Math.round
 * - 最低有效伤害为1（对正常可受伤目标）
 * - 攻击快照：同一次挥刀的所有派生伤害共享同一快照
 */

import type { Vec2 } from "../types";

// ═══════════════════════════════════════════════════════
// 伤害来源类型
// ═══════════════════════════════════════════════════════

export type DamageSourceType =
  | "MAIN_SLASH"
  | "SUB_BLADE_LEFT"    // 左刀横扫
  | "SUB_BLADE_RIGHT"   // 右刀破点
  | "TRIPLE_DERIVED_1"  // 三刀流副刀1
  | "TRIPLE_DERIVED_2"  // 三刀流副刀2
  | "SCORCH_TICK"       // 燎原跳伤
  | "SCORCH_EXPLOSION"  // 燎原收刀爆炸
  | "FROST";            // 凝霜（无直接伤害）

export type TargetCategory = "ENEMY" | "THREAT" | "BOSS";

// ═══════════════════════════════════════════════════════
// 伤害来源配置（挂载到每个伤害来源的静态描述）
// ═══════════════════════════════════════════════════════

export interface DamageSourceConfig {
  sourceType: DamageSourceType;
  skillCoefficient: number;
  resolveOrder: number;
  tags: string[];
  canDamageEnemy: boolean;
  canDamageThreat: boolean;
  canTriggerOnHit: boolean;
  canTriggerOnKill: boolean;
  /** 预留：表现层缩放 */
  presentationScale?: number;
  /** 预留：表现层优先级 */
  presentationPriority?: number;
  /** 预留：聚合模式 */
  aggregationMode?: "none" | "sum" | "max";
  /** 预留：聚合窗口(秒) */
  aggregationWindow?: number;
}

// ═══════════════════════════════════════════════════════
// 玩家单局属性快照
// ═══════════════════════════════════════════════════════

export interface PlayerRunStats {
  entryAttack: number;
  runAttackBonus: number;
  bladeDamageBonus: number;
  conditionDamageBonus: number;
  finalDamageBonus: number;
}

export function createDefaultPlayerStats(entryAttack = 100): PlayerRunStats {
  return {
    entryAttack,
    runAttackBonus: 0,
    bladeDamageBonus: 0,
    conditionDamageBonus: 0,
    finalDamageBonus: 0,
  };
}

/** 获取当前攻击力 */
export function getCurrentAttack(stats: PlayerRunStats): number {
  return stats.entryAttack * (1 + stats.runAttackBonus);
}

// ═══════════════════════════════════════════════════════
// 伤害请求
// ═══════════════════════════════════════════════════════

export interface DamageRequest {
  actionId: string;
  parentActionId: string;
  sourceType: DamageSourceType;
  sourceConfig: DamageSourceConfig;
  /** 攻击方ID */
  attackerId: string;
  /** 目标ID */
  targetId: string;
  /** 目标类别 */
  targetCategory: TargetCategory;
  /** 技能系数 */
  skillCoefficient: number;
  /** 本次攻击属性快照 */
  stats: PlayerRunStats;
  /** 刀势档位 */
  bladeBand: "low" | "mid" | "high";
  /** 来源标签 */
  tags: string[];
  /** 命中位置 */
  hitPos: Vec2;
  /** 时间戳 */
  timestamp: number;
}

// ═══════════════════════════════════════════════════════
// 伤害结算结果
// ═══════════════════════════════════════════════════════

export interface DamageResult {
  actionId: string;
  sourceType: DamageSourceType;
  targetId: string;
  /** 公式完整伤害 */
  rawDamage: number;
  /** 取整后伤害 */
  resolvedDamage: number;
  /** 实际扣除HP */
  effectiveHpLoss: number;
  /** 扣除前HP */
  hpBefore: number;
  /** 扣除后HP */
  hpAfter: number;
  /** 伤害是否被接受（未被免疫/死亡拦截） */
  isAccepted: boolean;
  /** 目标是否免疫 */
  isImmune: boolean;
  /** 是否造成击杀 */
  isKill: boolean;
  /** 是否造成威胁物销毁 */
  isDestroy: boolean;
  /** 是否溢出伤害 */
  isOverkill: boolean;
  /** 击杀归属来源 */
  killCreditSource: DamageSourceType | null;
}

// ═══════════════════════════════════════════════════════
// 统一伤害公式
// ═══════════════════════════════════════════════════════

export const FINAL_DAMAGE_REDUCTION_CAP = 0.8;

/**
 * 计算最终伤害
 *
 * finalDamage = currentAttack × skillCoefficient
 *   × (1 + bladeDamageBonus + conditionDamageBonus)
 *   × (1 + finalDamageBonus)
 *   × (1 - clamp(targetFinalDamageReduction, 0, CAP))
 */
export function computeRawDamage(
  request: DamageRequest,
  targetFinalDamageReduction = 0,
): number {
  const currentAttack = getCurrentAttack(request.stats);
  const reduction = Math.min(targetFinalDamageReduction, FINAL_DAMAGE_REDUCTION_CAP);

  const raw =
    currentAttack *
    request.skillCoefficient *
    (1 + request.stats.bladeDamageBonus + request.stats.conditionDamageBonus) *
    (1 + request.stats.finalDamageBonus) *
    (1 - reduction);

  return raw;
}

/**
 * 统一伤害结算：计算 → 取整 → 扣HP → 判断死亡
 *
 * @returns DamageResult 或 null（目标已死亡/免疫）
 */
export function resolveDamage(
  request: DamageRequest,
  targetHp: number,
  targetMaxHp: number,
  targetIsAlive: boolean,
  targetIsImmune: boolean,
  targetFinalDamageReduction = 0,
): DamageResult | null {
  // Step 2-3: 检查目标状态
  if (!targetIsAlive) {
    return {
      actionId: request.actionId,
      sourceType: request.sourceType,
      targetId: request.targetId,
      rawDamage: 0,
      resolvedDamage: 0,
      effectiveHpLoss: 0,
      hpBefore: targetHp,
      hpAfter: targetHp,
      isAccepted: false,
      isImmune: false,
      isKill: false,
      isDestroy: false,
      isOverkill: false,
      killCreditSource: null,
    };
  }

  // Step 3b: 检查免疫
  if (targetIsImmune) {
    return {
      actionId: request.actionId,
      sourceType: request.sourceType,
      targetId: request.targetId,
      rawDamage: 0,
      resolvedDamage: 0,
      effectiveHpLoss: 0,
      hpBefore: targetHp,
      hpAfter: targetHp,
      isAccepted: false,
      isImmune: true,
      isKill: false,
      isDestroy: false,
      isOverkill: false,
      killCreditSource: null,
    };
  }

  // Step 6-10: 计算伤害
  const rawDamage = computeRawDamage(request, targetFinalDamageReduction);
  const resolvedDamage = Math.max(1, Math.round(rawDamage)); // 最低有效伤害为1

  // Step 11: 扣除真实HP
  const effectiveHpLoss = Math.min(resolvedDamage, targetHp);
  const hpAfter = targetHp - effectiveHpLoss;

  // Step 12: 判断死亡
  const isDead = hpAfter <= 0;
  const isOverkill = resolvedDamage > targetHp;

  return {
    actionId: request.actionId,
    sourceType: request.sourceType,
    targetId: request.targetId,
    rawDamage,
    resolvedDamage,
    effectiveHpLoss,
    hpBefore: targetHp,
    hpAfter: Math.max(0, hpAfter),
    isAccepted: true,
    isImmune: false,
    isKill: isDead,
    isDestroy: false,
    isOverkill,
    killCreditSource: isDead ? request.sourceType : null,
  };
}

/**
 * 威胁物伤害结算（与普通敌人相同逻辑，但标记 isDestroy 而非 isKill）
 */
export function resolveThreatDamage(
  request: DamageRequest,
  targetHp: number,
  targetMaxHp: number,
  targetIsAlive: boolean,
  targetIsImmune: boolean,
  targetFinalDamageReduction = 0,
): DamageResult | null {
  const result = resolveDamage(
    request, targetHp, targetMaxHp, targetIsAlive,
    targetIsImmune, targetFinalDamageReduction,
  );
  if (result && result.isKill) {
    result.isDestroy = true;
    result.isKill = false; // 威胁物不计入普通击杀
  }
  return result;
}

// ═══════════════════════════════════════════════════════
// 伤害来源配置注册表
// ═══════════════════════════════════════════════════════

export const DAMAGE_SOURCE_REGISTRY: Record<DamageSourceType, DamageSourceConfig> = {
  MAIN_SLASH: {
    sourceType: "MAIN_SLASH",
    skillCoefficient: 1.00,
    resolveOrder: 100,
    tags: ["main", "player", "primary"],
    canDamageEnemy: true,
    canDamageThreat: true,
    canTriggerOnHit: true,
    canTriggerOnKill: true,
  },
  SUB_BLADE_LEFT: {
    sourceType: "SUB_BLADE_LEFT",
    skillCoefficient: 0.80,  // 等价迁移：base × 0.8
    resolveOrder: 300,
    tags: ["sub", "player", "sweep"],
    canDamageEnemy: true,
    canDamageThreat: false,
    canTriggerOnHit: true,
    canTriggerOnKill: true,
  },
  SUB_BLADE_RIGHT: {
    sourceType: "SUB_BLADE_RIGHT",
    skillCoefficient: 1.00,  // 等价迁移：base × 1.0
    resolveOrder: 310,
    tags: ["sub", "player", "pierce"],
    canDamageEnemy: true,
    canDamageThreat: false,
    canTriggerOnHit: true,
    canTriggerOnKill: true,
  },
  TRIPLE_DERIVED_1: {
    sourceType: "TRIPLE_DERIVED_1",
    skillCoefficient: 0.15,  // 等价迁移：低刀势15% maxHp → 15
    resolveOrder: 200,
    tags: ["edict", "triple", "derived"],
    canDamageEnemy: true,
    canDamageThreat: false,
    canTriggerOnHit: true,
    canTriggerOnKill: true,
  },
  TRIPLE_DERIVED_2: {
    sourceType: "TRIPLE_DERIVED_2",
    skillCoefficient: 0.15,  // 同上
    resolveOrder: 210,
    tags: ["edict", "triple", "derived"],
    canDamageEnemy: true,
    canDamageThreat: false,
    canTriggerOnHit: true,
    canTriggerOnKill: true,
  },
  SCORCH_TICK: {
    sourceType: "SCORCH_TICK",
    skillCoefficient: 0.04,  // 等价迁移：当前4伤害/tick → 4/100
    resolveOrder: 500,
    tags: ["edict", "scorch", "dot"],
    canDamageEnemy: true,
    canDamageThreat: false,
    canTriggerOnHit: false,
    canTriggerOnKill: false,
  },
  SCORCH_EXPLOSION: {
    sourceType: "SCORCH_EXPLOSION",
    skillCoefficient: 0.01,  // 收刀爆炸：1伤害
    resolveOrder: 510,
    tags: ["edict", "scorch", "explosion"],
    canDamageEnemy: true,
    canDamageThreat: false,
    canTriggerOnHit: false,
    canTriggerOnKill: false,
  },
  FROST: {
    sourceType: "FROST",
    skillCoefficient: 0,     // 无直接伤害
    resolveOrder: 400,
    tags: ["edict", "frost", "control"],
    canDamageEnemy: false,
    canDamageThreat: false,
    canTriggerOnHit: false,
    canTriggerOnKill: false,
  },
};
