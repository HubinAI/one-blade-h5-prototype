/**
 * V0811070: Enemy Registry — 统一ID + 体验身份 + Proxy回退
 */

// ══════════════════ 元数据 ══════════════════

export interface EnemyMeta {
  displayName: string;
  experienceAxis: string;
  unlockFloor: number;
  proxyType: string | null;
  implemented: boolean;
}

export const ENEMY_META: Record<string, EnemyMeta> = {
  infantry: { displayName:"步兵",  experienceAxis:"MASS",      unlockFloor:1,  proxyType:null,      implemented:true },
  powder:   { displayName:"爆炸兵",experienceAxis:"OPPORTUNITY",unlockFloor:2,  proxyType:null,      implemented:true },
  shield:   { displayName:"盾兵",  experienceAxis:"HARD",      unlockFloor:3,  proxyType:null,      implemented:true },
  splitter: { displayName:"分裂兵",experienceAxis:"TIMING",    unlockFloor:7,  proxyType:null,      implemented:true },
  tractor:  { displayName:"牵引兵",experienceAxis:"GATHER",    unlockFloor:12, proxyType:null,      implemented:true },
  charger:  { displayName:"冲锋兵",experienceAxis:"TIMING_THREAT",unlockFloor:17,proxyType:"tractor", implemented:false },
  mover:    { displayName:"游袭兵",experienceAxis:"MOVEMENT",  unlockFloor:22, proxyType:"infantry",implemented:false },
  shooter:  { displayName:"弹幕兵",experienceAxis:"PROJECTILE",unlockFloor:27, proxyType:"powder",  implemented:false },
  core:     { displayName:"核心兵",experienceAxis:"PRIORITY",  unlockFloor:31, proxyType:null,      implemented:true },
};

// ══════════════════ 普通怪 ══════════════════

export const NORMAL_IMPLEMENTED = ["infantry","powder","tractor","splitter","core","shield"] as const;
export const NORMAL_RESERVED    = ["charger","mover","shooter"] as const;

export const NORMAL_PROXY: Record<string, string> = {
  charger: "tractor",
  mover:   "infantry",
  shooter: "powder",
};

// ══════════════════ 精英 ══════════════════

export const ELITE_IMPLEMENTED = ["fireRing","heal","aura"] as const;
export const ELITE_RESERVED    = ["chargeElite","bannerElite"] as const;

export const ELITE_PROXY: Record<string, string> = {
  chargeElite: "fireRing",
  bannerElite: "aura",
};

// ══════════════════ 统一入口 ══════════════════

export function resolveEnemyType(logicalId: string): {
  logicalType: string; runtimeType: string; isProxy: boolean;
} {
  const normalProxy = NORMAL_PROXY[logicalId];
  if (normalProxy) return { logicalType: logicalId, runtimeType: normalProxy, isProxy: true };
  const eliteProxy = ELITE_PROXY[logicalId];
  if (eliteProxy) return { logicalType: logicalId, runtimeType: eliteProxy, isProxy: true };
  return { logicalType: logicalId, runtimeType: logicalId, isProxy: false };
}
