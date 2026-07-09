import type { EliteKind } from "../types";

export type EliteConfig = {
  kind: EliteKind;
  name: string;
  maxHp: number;
  speed: number;
  radius: number;
  defenseDamage: number;
  score: number;
  energyGain: number;
  color: string;
  accentColor: string;
  /** 出场播报文字 */
  introText: string;
  /** 技能名称 */
  skillName: string;
  /** 技能冷却时间（秒） */
  skillCooldown: number;
  /** 技能描述 */
  skillDescription: string;
};

export const ELITE_CONFIG: Record<EliteKind, EliteConfig> = {
  fireRing: {
    kind: "fireRing",
    name: "火环将",
    maxHp: 8,
    speed: 22,
    radius: 28,
    defenseDamage: 2,
    score: 120,
    energyGain: 15,
    color: "#e67e22",
    accentColor: "#f39c12",
    introText: "火环将 现身 — 烈焰三环！",
    skillName: "烈焰三环",
    skillCooldown: 0,
    skillDescription: "自身40px半径三团火焰旋转，触碰刀芒损耗50%刀势"
  },
  heal: {
    kind: "heal",
    name: "回血将",
    maxHp: 10,
    speed: 18,
    radius: 30,
    defenseDamage: 1,
    score: 140,
    energyGain: 16,
    color: "#27ae60",
    accentColor: "#a9dfbf",
    introText: "回血将 现身 — 阵中续命！",
    skillName: "续命波纹",
    skillCooldown: 3,
    skillDescription: "每3秒释放120px波纹，范围内敌军回1HP"
  },
  aura: {
    kind: "aura",
    name: "氛围将",
    maxHp: 8,
    speed: 20,
    radius: 26,
    defenseDamage: 1,
    score: 120,
    energyGain: 14,
    color: "#8e44ad",
    accentColor: "#d7bde2",
    introText: "氛围将 现身 — 众兵护体！",
    skillName: "众兵护体",
    skillCooldown: 0,
    skillDescription: "场上每存在1个其他敌军，护盾+1（上限6）"
  }
};

export const ELITE_KINDS: EliteKind[] = ["fireRing", "heal", "aura"];
