import type { BossId } from "../game/types";

export type BossVisualDef = {
  id: BossId;
  name: string;
  title: string;
  hint: string;
  color: string;
  accent: string;
};

export const BOSS_VISUAL_DEFS: Record<BossId, BossVisualDef> = {
  yaoWang: {
    id: "yaoWang",
    name: "练气大妖",
    title: "荒野妖兽",
    hint: "妖兽咆哮，破阵锋方能斩服。",
    color: "#c0392b",
    accent: "#f5b7b1"
  },
  moXiu: {
    id: "moXiu",
    name: "筑基魔修",
    title: "魔道散人",
    hint: "魔修隐遁，瞬移无敌，需耐心应对。",
    color: "#7d3c98",
    accent: "#d2b4de"
  },
  huaYao: {
    id: "huaYao",
    name: "灵月圣女",
    title: "月下花仙",
    hint: "花葬如雨，裙下谁能不败？需一刀破阵。",
    color: "#e74c3c",
    accent: "#fadbd8"
  }
};
