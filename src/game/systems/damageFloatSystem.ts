/**
 * 0807-11B-2: 统一伤害飘字 — D0～D6 分层 + P0～P3 优先级配置
 */
import { Vec2 } from '../types';

// ══════════════════════════════════════════════
// D0～D6 伤害分层配置
// ══════════════════════════════════════════════

export interface DamageTierConfig {
  tier: string;
  rMin: number;
  rMax: number;
  fontSize: number;
  baseColor: string;
  duration: number;
  scale: number;
  bounce: boolean;
  label: string;
}

export const DAMAGE_TIERS: DamageTierConfig[] = [
  { tier: 'D0', rMin: 0, rMax: 0.35, fontSize: 14, baseColor: '#c0c0c0', duration: 0.45, scale: 1.0, bounce: false, label: '灰白·轻微' },
  { tier: 'D1', rMin: 0.35, rMax: 0.75, fontSize: 16, baseColor: '#e8e0d0', duration: 0.55, scale: 1.0, bounce: false, label: '米白·小幅' },
  { tier: 'D2', rMin: 0.75, rMax: 1.15, fontSize: 20, baseColor: '#ffffff', duration: 0.65, scale: 1.0, bounce: false, label: '亮白·常规' },
  { tier: 'D3', rMin: 1.15, rMax: 1.50, fontSize: 23, baseColor: '#ffd35a', duration: 0.75, scale: 1.2, bounce: true, label: '金黄·强化' },
  { tier: 'D4', rMin: 1.50, rMax: 2.00, fontSize: 27, baseColor: '#f39c12', duration: 0.90, scale: 1.3, bounce: true, label: '橙色·暴击' },
  { tier: 'D5', rMin: 2.00, rMax: 3.00, fontSize: 32, baseColor: '#e74c3c', duration: 1.05, scale: 1.4, bounce: true, label: '赤红·重击' },
  { tier: 'D6', rMin: 3.00, rMax: Infinity, fontSize: 38, baseColor: '#ff4500', duration: 1.20, scale: 1.5, bounce: true, label: '赤金·绝杀' },
];

/** 根据 ratioR 查找所在层级 */
export function resolveDamageTier(ratioR: number): DamageTierConfig {
  for (const t of DAMAGE_TIERS) {
    if (ratioR >= t.rMin && ratioR < t.rMax) return t;
  }
  return DAMAGE_TIERS[DAMAGE_TIERS.length - 1]; // D6
}

// ══════════════════════════════════════════════
// P0～P3 显示优先级
// ══════════════════════════════════════════════

export enum FloatPriority {
  P0 = 'P0', // 绝对保留
  P1 = 'P1', // 高
  P2 = 'P2', // 普通
  P3 = 'P3', // 低
}

export const FLOAT_PRIORITY_ORDER: readonly FloatPriority[] = [FloatPriority.P0, FloatPriority.P1, FloatPriority.P2, FloatPriority.P3];

// ══════════════════════════════════════════════
// 同屏上限配置
// ══════════════════════════════════════════════

export const FLOAT_LIMITS = {
  maxOnScreen: 9,
  maxP3: 4,
  maxPerTarget: 2,
  maxPerSlash: 5,
  maxScorch: 3,
  maxSubBlade: 3,
  maxSystemNotice: 1,
} as const;

// ══════════════════════════════════════════════
// 聚合配置
// ══════════════════════════════════════════════

export const AGGREGATION = {
  mainSlashWindow: 120,   // ms
  scorchWindow: 600,       // ms
  scorchTickCount: 3,      // 累计3跳聚合
  mergeWindow: 100,        // ms
} as const;

// ══════════════════════════════════════════════
// 空间避让槽位
// ══════════════════════════════════════════════

export const CANDIDATE_SLOTS = [
  { dx: 0, dy: 0 },       // 命中点上方
  { dx: 0, dy: -22 },     // 上移22px
  { dx: 0, dy: -44 },     // 上移44px
  { dx: 22, dy: 0 },      // 右移22px
  { dx: 0, dy: -66 },     // 上移66px
] as const;

export const SPATIAL_CONSTRAINTS = {
  minHorizontalGap: 48,
  minVerticalGap: 20,
  hudBottomY: 460,         // 不进入底部 HUD
  screenMarginX: 20,       // 不越出左右边界
} as const;

// ══════════════════════════════════════════════
// 统一伤害飘字事件
// ══════════════════════════════════════════════

export type DamageSourceType = 'MAIN_SLASH' | 'SUB_BLADE' | 'TRIPLE_SIDE' | 'SCORCH' | 'FROST' | 'FIRE_RING' | 'PLAYER_DAMAGE' | 'PLAYER_HEAL';

export interface DamageFloatEvent {
  actionId: string;
  parentActionId: string;
  sourceType: DamageSourceType;
  targetId: string;
  targetType: 'NORMAL' | 'ELITE' | 'BOSS' | 'MECHANIC';
  resolvedDamage: number;
  effectiveHpLoss: number;
  referenceAttack: number;
  ratioR: number;
  hitPosition: Vec2;
  timestamp: number;
  isKill: boolean;
  isWeakPoint: boolean;
  isDot: boolean;
  isDerived: boolean;
  priority: FloatPriority;
  displayPolicy: 'FULL';
}
