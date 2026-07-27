import type { EliteKind } from "../game/types";

export type EliteVisualDef = {
  kind: EliteKind;
  name: string;
  hint: string;
  color: string;
  accent: string;
};

export const ELITE_VISUAL_DEFS: Record<EliteKind, EliteVisualDef> = {
  fireRing: {
    kind: "fireRing",
    name: "火环将",
    hint: "周围三团烈焰旋转，触碰即损刀势。",
    color: "#e67e22",
    accent: "#f39c12"
  },
  heal: {
    kind: "heal",
    name: "回血将",
    hint: "每3秒给周围敌军回血，优先集火。",
    color: "#27ae60",
    accent: "#a9dfbf"
  },
  aura: {
    kind: "aura",
    name: "氛围将",
    hint: "周围敌军越多护盾越高，清兵后再打。",
    color: "#8e44ad",
    accent: "#d7bde2"
  }
};
