// ========================================================================
// V0730001: 统一刀势系统 — 模式 Profile
// 普通关和 Boss V1 允许目标收益不同，但不得各自实现档位/消耗/恢复/上限成长算法。
// ========================================================================
import { BLADE_MOMENTUM_CONFIG, type BladeMomentumBand } from "./bladeMomentum";

// ---- 共用类型 ----

export interface BladeMomentumProfile {
  /** 初始刀势比例 */
  initialRatio: number;
  /** 初始刀势上限 */
  initialMax: number;
  /** 基础挥刀消耗 */
  baseCost: number;

  /** 主动收益 */
  gains: {
    /** 命中 1 名基础兵 */
    hitBasic: number;
    /** 击杀 1 名基础兵 */
    killBasic: number;

    /** 多斩额外奖励 */
    multiSlashBonus: {
      3: number;
      5: number;
      8: number;
    };
  };

  /** 是否允许在 0 刀势时挥刀（始终为 true，本轮统一） */
  allowZeroEnergy: true;
}

// ========================================================================
// 普通关 Profile
// ========================================================================

export const normalProfile: BladeMomentumProfile = {
  initialRatio: BLADE_MOMENTUM_CONFIG.initialRatio, // 0.40
  initialMax: BLADE_MOMENTUM_CONFIG.baseMax,        // 100
  baseCost: BLADE_MOMENTUM_CONFIG.slash.baseCost,   // 8

  gains: {
    /** 命中 1 名基础兵：+2 */
    hitBasic: 2,
    /** 击杀 1 名基础兵：+2（完整命中并击杀 = +4） */
    killBasic: 2,

    multiSlashBonus: {
      3: 2,   // 达到 3 名：额外 +2
      5: 5,   // 达到 5 名：额外 +5
      8: 10,  // 达到 8 名：额外 +10
    },
  },

  allowZeroEnergy: true,
};

// ========================================================================
// Boss V1 (chaseFlash) Profile — 保持冻结体验
// ========================================================================

export const bossChaseProfile = {
  initialRatio: 0.50,                     // 50/100
  initialMax: BLADE_MOMENTUM_CONFIG.baseMax,
  baseCost: BLADE_MOMENTUM_CONFIG.slash.baseCost, // 8

  /** Boss V1 保持当前收益值 */
  gains: {
    shellHit: 3,
    projectileHit: 6,
    coreBase: 14,
  },

  /** 档位 → 核心伤害（保持不变） */
  coreDamage: {
    low: 48,
    mid: 58,
    high: 68,
  } as Record<BladeMomentumBand, number>,

  /** 多弹幕奖励保持当前实现 */
  multiBarrageBonus: {
    2: 5,   // 命中 2 弹幕：+5
    3: 8,   // 命中 3 弹幕：+8
  },

  allowZeroEnergy: true,
};

// 向后兼容别名
export const bossV1Profile = bossChaseProfile;
