import type { BladeTier, EnemyKind, PickupKind } from "../types";
import { BALANCE, ENEMY_BALANCE, PICKUP_BALANCE, SWORD_STAGE_BY_ID } from "./balance";

export type TierConfig = {
  tier: BladeTier;
  label: string;
  range: [number, number];
  power: number;
  width: number;
  brightness: number;
  visualLength: number;
  canBreakShield: boolean;
  scoreName: string;
  color: string;
};

export const TIER_CONFIGS: Record<BladeTier, TierConfig> = {
  weak: stageToTierConfig("weak"),
  normal: stageToTierConfig("normal"),
  strong: stageToTierConfig("strong"),
  burst: stageToTierConfig("burst")
};

function stageToTierConfig(tier: BladeTier): TierConfig {
  const stage = SWORD_STAGE_BY_ID[tier];
  return {
    tier,
    label: stage.name,
    range: [stage.minEnergy, stage.maxEnergy],
    power: stage.maxPathLength,
    width: stage.width,
    brightness: stage.brightness,
    visualLength: stage.visualLength,
    canBreakShield: stage.canBreakShield,
    scoreName: stage.scoreName,
    color: stage.color
  };
}

export const TUNING = {
  energyMax: BALANCE.swordEnergy.max,
  energyRecoverPerSecond: BALANCE.swordEnergy.passiveRegenPerSecond,
  energyRecoverKillBonus: 0,
  energyRecoverChainBonus: 0,
  drumRecoverMultiplier: PICKUP_BALANCE.drum.regenMultiplier ?? 1,
  drumDuration: PICKUP_BALANCE.drum.duration === "next_slash" ? 5 : PICKUP_BALANCE.drum.duration,
  slash: {
    timeCostPerSecond: 0,
    distanceCostPerPx: 1,
    sharpTurnExtraCost: BALANCE.slash.sharpTurnExtraCost,
    sharpTurnRadians: (BALANCE.slash.sharpTurnAngle * Math.PI) / 180,
    minMoveDistance: BALANCE.slash.minMoveDistance,
    touchHitPadding: BALANCE.slash.touchHitPadding
  },
  explosion: {
    powderRadius: ENEMY_BALANCE.powder.explosionRadius ?? 85,
    oilRadius: PICKUP_BALANCE.oil.extraExplosionRadius ?? 60,
    coreRadius: ENEMY_BALANCE.core.collapseRadius ?? 130,
    strongBonusRadius: 0
  },
  warrior: {
    drawSeconds: 0.18,
    sheathSeconds: 0.35
  },
  pickup: {
    radius: 15,
    energyGain: 0
  }
};

export const ENEMY_TUNING: Record<EnemyKind, { radius: number; hpDamage: number; score: number; energy: number }> = {
  infantry: {
    radius: ENEMY_BALANCE.infantry.radius,
    hpDamage: ENEMY_BALANCE.infantry.defenseDamage,
    score: ENEMY_BALANCE.infantry.score,
    energy: ENEMY_BALANCE.infantry.energyReward
  },
  shield: {
    radius: ENEMY_BALANCE.shield.radius,
    hpDamage: ENEMY_BALANCE.shield.defenseDamage,
    score: ENEMY_BALANCE.shield.score,
    energy: ENEMY_BALANCE.shield.energyReward
  },
  powder: {
    radius: ENEMY_BALANCE.powder.radius,
    hpDamage: ENEMY_BALANCE.powder.defenseDamage,
    score: ENEMY_BALANCE.powder.score,
    energy: ENEMY_BALANCE.powder.energyReward
  },
  core: {
    radius: ENEMY_BALANCE.core.radius,
    hpDamage: ENEMY_BALANCE.core.defenseDamage,
    score: ENEMY_BALANCE.core.score,
    energy: ENEMY_BALANCE.core.energyReward
  }
};

export const PICKUP_LABELS: Record<PickupKind, string> = {
  drum: PICKUP_BALANCE.drum.name,
  soul: PICKUP_BALANCE.soul.name,
  oil: PICKUP_BALANCE.oil.name
};
