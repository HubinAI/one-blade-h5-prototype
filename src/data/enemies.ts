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
  },
  elite: {
    kind: "elite",
    name: "精英",
    hint: "精英敌军，拥有特殊技能。",
    color: "#d48c2a",
    accent: "#f5d78a"
  },
  boss: {
    kind: "boss",
    name: "Boss",
    hint: "强力Boss，分阶段战斗。",
    color: "#b03a2e",
    accent: "#f0b0a0"
  },
  splitter: {
    kind: "splitter",
    name: "裂",
    hint: "进入中场后蓄力，不及时击杀会分裂成2个小兵。",
    color: "#e67e22",
    accent: "#ffb85a"
  },
  tractor: {
    kind: "tractor",
    name: "引",
    hint: "进入中场后连接附近敌人，聚拢后形成一刀切团机会。",
    color: "#5dade2",
    accent: "#8fdcff"
  }
};
