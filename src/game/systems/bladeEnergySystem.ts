import type { BladeTier } from "../types";
import { BALANCE, PICKUP_BALANCE, SWORD_STAGE_BY_ID, SWORD_STAGES } from "../config/balance";
import { TIER_CONFIGS } from "../config/tuning";
import { clamp } from "../../utils/math";

export function getBladeTier(energy: number): BladeTier {
  const stage = SWORD_STAGES.find((item) => energy >= item.minEnergy && energy <= item.maxEnergy) ?? SWORD_STAGE_BY_ID.weak;
  return stage.id;
}

export function getTierConfig(tier: BladeTier) {
  return TIER_CONFIGS[tier];
}

export function recoverEnergy(current: number, dt: number, drumTimer: number) {
  const multiplier = drumTimer > 0 ? PICKUP_BALANCE.drum.regenMultiplier ?? 1 : 1;
  return clamp(current + BALANCE.swordEnergy.passiveRegenPerSecond * multiplier * dt, 0, BALANCE.swordEnergy.max);
}

export function consumeEnergyForSlash(current: number) {
  if (BALANCE.swordEnergy.consumeAllOnSlashStart) return 0;
  return clamp(current - Math.max(12, current * 0.92), 0, BALANCE.swordEnergy.max);
}
