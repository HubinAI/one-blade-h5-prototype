import type { EnemyKind } from "../game/types";

export type EnemyDefinition = {
  kind: EnemyKind;
  name: string;
  hint: string;
  color: string;
  accent: string;
};

export const ENEMY_DEFS: Record<EnemyKind, EnemyDefinition> = {
  infantry: {
    kind: "infantry",
    name: "步兵",
    hint: "基础纸片兵，一刀即碎。",
    color: "#d8b46e",
    accent: "#402416"
  },
  shield: {
    kind: "shield",
    name: "盾兵",
    hint: "前排盾牌兵，强锋以上可直接破盾。",
    color: "#c58d4d",
    accent: "#5b2519"
  },
  powder: {
    kind: "powder",
    name: "火药兵",
    hint: "切中后点燃，收刀时爆炸连锁。",
    color: "#9f3a24",
    accent: "#ffd67c"
  },
  core: {
    kind: "core",
    name: "阵眼兵",
    hint: "切中后标记，收刀时带动阵型崩散。",
    color: "#5d4a8f",
    accent: "#e8d7ff"
  }
};
