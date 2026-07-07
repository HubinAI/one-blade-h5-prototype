import type { PickupKind } from "../game/types";

export type PickupDefinition = {
  kind: PickupKind;
  name: string;
  hint: string;
  color: string;
};

export const PICKUP_DEFS: Record<PickupKind, PickupDefinition> = {
  drum: {
    kind: "drum",
    name: "战鼓",
    hint: "短时间加快刀势恢复。",
    color: "#d45a32"
  },
  soul: {
    kind: "soul",
    name: "刀魂",
    hint: "下一刀刀芒更长。",
    color: "#e9eef8"
  },
  oil: {
    kind: "oil",
    name: "火油",
    hint: "下一刀命中附带小范围爆炸。",
    color: "#f0a235"
  }
};
