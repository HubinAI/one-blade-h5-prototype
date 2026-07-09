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
  zhangFei: {
    id: "zhangFei",
    name: "张飞",
    title: "燕人张翼德",
    hint: "燕人张翼德在此！破阵锋方能斩服。",
    color: "#c0392b",
    accent: "#f5b7b1"
  },
  simaYi: {
    id: "simaYi",
    name: "司马懿",
    title: "冢虎司马懿",
    hint: "高平陵变，天下归心。瞬移无敌，需耐心应对。",
    color: "#7d3c98",
    accent: "#d2b4de"
  },
  zhenJi: {
    id: "zhenJi",
    name: "甄宓",
    title: "洛神甄宓",
    hint: "裙下之臣，谁能不败？花葬如雨，需一刀破阵。",
    color: "#e74c3c",
    accent: "#fadbd8"
  }
};
