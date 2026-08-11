/**
 * V0811045: 1~180首通奖励全量配置
 * 规则: 每5关循环数量[2,2,4,2,4], 境界决定品质
 */

export type BladeQualityId = string;

export interface FirstClearRewardStage {
  floorStart: number; floorEnd: number;
  quality: BladeQualityId;
}

export interface FirstClearRewardConfig {
  countPattern: number[];
  stages: FirstClearRewardStage[];
}

export const FIRST_CLEAR_REWARD_CONFIG: FirstClearRewardConfig = {
  countPattern: [2, 2, 4, 2, 4],
  stages: [
    { floorStart: 1,   floorEnd: 15,  quality: "white" },
    { floorStart: 16,  floorEnd: 30,  quality: "white" },
    { floorStart: 31,  floorEnd: 50,  quality: "green" },
    { floorStart: 51,  floorEnd: 75,  quality: "blue" },
    { floorStart: 76,  floorEnd: 105, quality: "purple" },
    { floorStart: 106, floorEnd: 140, quality: "orange" },
    { floorStart: 141, floorEnd: 180, quality: "red" },
  ],
};

export interface FloorReward {
  floor: number;
  quality: BladeQualityId;
  count: number;
}

export function getFloorRewardConfig(floor: number): FloorReward {
  const cfg = FIRST_CLEAR_REWARD_CONFIG;
  const count = cfg.countPattern[(floor - 1) % 5];
  const stage = cfg.stages.find(s => floor >= s.floorStart && floor <= s.floorEnd)!;
  return { floor, quality: stage.quality, count };
}
