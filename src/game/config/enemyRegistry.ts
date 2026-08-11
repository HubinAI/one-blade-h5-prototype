/**
 * V0811059: Enemy Registry — 统一ID + Proxy回退
 * 新ID未实现机制时自动代理到已有类型
 */

// ══════════════════ 普通怪 ══════════════════

export const NORMAL_IMPLEMENTED = ["infantry","powder","tractor","splitter","core","shield"] as const;
export const NORMAL_RESERVED    = ["charger","flanker","linker"] as const;

export const NORMAL_PROXY: Record<string, string> = {
  charger: "tractor",
  flanker: "infantry",
  linker:  "shield",
};

// ══════════════════ 精英 ══════════════════

export const ELITE_IMPLEMENTED = ["fireRing","heal","aura"] as const;
export const ELITE_RESERVED    = ["chargeElite","bannerElite"] as const;

export const ELITE_PROXY: Record<string, string> = {
  chargeElite: "fireRing",
  bannerElite: "aura",
};

// ══════════════════ 统一入口 ══════════════════

/** 返回 runtimeType (real behavior), 保留 logicalId 在返回元数据中 */
export function resolveEnemyType(logicalId: string): {
  logicalType: string; runtimeType: string; isProxy: boolean;
} {
  const normalProxy = NORMAL_PROXY[logicalId];
  if (normalProxy) return { logicalType: logicalId, runtimeType: normalProxy, isProxy: true };
  const eliteProxy = ELITE_PROXY[logicalId];
  if (eliteProxy) return { logicalType: logicalId, runtimeType: eliteProxy, isProxy: true };
  return { logicalType: logicalId, runtimeType: logicalId, isProxy: false };
}
