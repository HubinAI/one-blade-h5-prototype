import type { BuffId } from "../types";

export type RunBuffConfig = {
  id: BuffId;
  name: string;
  shortName: string;
  description: string;
  feedback: string;
};

export const RUN_BUFFS: RunBuffConfig[] = [
  {
    id: "longBlade",
    name: "长锋",
    shortName: "长锋",
    description: "后续所有刀芒路径长度 +18%",
    feedback: "已获得：长锋，本局刀芒更长"
  },
  {
    id: "burstLine",
    name: "爆裂",
    shortName: "爆裂",
    description: "本刀击杀 >=5 时，收刀终点产生小爆炸",
    feedback: "已获得：爆裂，连斩后收刀爆发"
  },
  {
    id: "breath",
    name: "回气",
    shortName: "回气",
    description: "击杀回刀势 +30%",
    feedback: "已获得：回气，斩杀更快蓄势"
  },
  {
    id: "shieldBreaker",
    name: "破盾",
    shortName: "破盾",
    description: "常锋也可以直接破盾",
    feedback: "已获得：破盾，常锋亦可破盾"
  },
  {
    id: "fireOil",
    name: "火油",
    shortName: "火油",
    description: "火药兵爆炸范围 +25%",
    feedback: "已获得：火油，火药连爆更广"
  },
  {
    id: "coreBreak",
    name: "阵破",
    shortName: "阵破",
    description: "阵眼崩散范围 +25%",
    feedback: "已获得：阵破，阵眼崩散更大"
  },
  {
    id: "warDrum",
    name: "战鼓",
    shortName: "战鼓",
    description: "刀势被动恢复 +20%",
    feedback: "已获得：战鼓，刀势恢复加快"
  },
  {
    id: "fortify",
    name: "护城",
    shortName: "护城",
    description: "防线生命 +1，最多超过初始值 1 点",
    feedback: "已获得：护城，防线生命提升"
  },
  {
    id: "doubleBlade",
    name: "双刃",
    shortName: "双刃",
    description: "破阵锋挥出时生成一条短副刀芒",
    feedback: "已获得：双刃，破阵锋带副刀芒"
  },
  {
    id: "paperSplash",
    name: "碎纸",
    shortName: "碎纸",
    description: "步兵死亡时 20% 概率震碎附近步兵",
    feedback: "已获得：碎纸，步兵碎裂可波及周围"
  }
];

export const RUN_BUFF_BY_ID = Object.fromEntries(RUN_BUFFS.map((buff) => [buff.id, buff])) as Record<
  BuffId,
  RunBuffConfig
>;
