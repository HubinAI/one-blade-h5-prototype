import type { BossId } from "../types";

export type BossPhaseConfig = {
  /** 血量阈值：低于此值进入该阶段 (hpRatio) */
  hpRatioTrigger: number;
  /** 阶段名称 */
  name: string;
  /** 触发时的屏幕播报文字 */
  announce: string;
  /** P4.2A.2: 播报标题（短行） */
  noticeTitle?: string;
  /** P4.2A.2: 播报副标题（可选） */
  noticeSubtitle?: string;
  /** 移速倍率 */
  speedMultiplier: number;
  /** 触线伤害 */
  defenseDamage: number;
  /** 被破阵锋时的伤害倍率 */
  burstDamageMultiplier: number;
};

export type BossConfig = {
  id: BossId;
  name: string;
  title: string;
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
  /** P4.2A.2: 播报标题（短行，不超过8字） */
  noticeTitle?: string;
  /** P4.2A.2: 播报副标题（可选，不超过14字） */
  noticeSubtitle?: string;
  /** Boss阶段配置 */
  phases: BossPhaseConfig[];
  /** 专属技能 */
  skill: {
    name: string;
    cooldown: number;
    description: string;
  };
};

export const BOSS_CONFIG: Record<BossId, BossConfig> = {
  yaoWang: {
    id: "yaoWang",
    name: "练气大妖",
    title: "荒野妖兽·练气",
    maxHp: 16,
    speed: 20,
    radius: 36,
    defenseDamage: 2,
    score: 200,
    energyGain: 30,
    color: "#c0392b",
    accentColor: "#f5b7b1",
    introText: "吼——区区散修，也敢犯我领地？",
    noticeTitle: "妖王·现身",
    noticeSubtitle: "区区散修，也敢犯我领地",
    phases: [
      {
        hpRatioTrigger: 0.5,
        name: "暴怒",
        announce: "大妖·暴怒 — 刀势不足寸步难行",
        noticeTitle: "大妖·暴怒",
        noticeSubtitle: "刀势不足寸步难行",
        speedMultiplier: 1,
        defenseDamage: 2,
        burstDamageMultiplier: 1
      },
      {
        hpRatioTrigger: 0,
        name: "狂化",
        announce: "大妖·狂化 — 破阵锋方能斩之！",
        noticeTitle: "大妖·狂化",
        noticeSubtitle: "破阵锋方能斩之",
        speedMultiplier: 1.2,
        defenseDamage: 4,
        burstDamageMultiplier: 2
      }
    ],
    skill: {
      name: "妖吼",
      cooldown: 7,
      description: "妖兽咆哮，令80px内敌军/玩家晕眩0.3s"
    }
  },
  moXiu: {
    id: "moXiu",
    name: "筑基魔修",
    title: "魔道散人·筑基",
    maxHp: 20,
    speed: 24,
    radius: 34,
    defenseDamage: 1,
    score: 280,
    energyGain: 40,
    color: "#7d3c98",
    accentColor: "#d2b4de",
    introText: "区区凡人，也配与魔修争锋？",
    phases: [
      {
        hpRatioTrigger: 0.7,
        name: "诡步",
        announce: "魔修·诡步 — 瞬步无影",
        speedMultiplier: 1,
        defenseDamage: 1,
        burstDamageMultiplier: 1
      },
      {
        hpRatioTrigger: 0.35,
        name: "乱序",
        announce: "魔修·乱序 — 分身匿迹",
        speedMultiplier: 1.1,
        defenseDamage: 1,
        burstDamageMultiplier: 1.2
      },
      {
        hpRatioTrigger: 0,
        name: "绝命",
        announce: "魔修·绝命 — 暗影弹横飞",
        speedMultiplier: 0.9,
        defenseDamage: 1,
        burstDamageMultiplier: 1.5
      }
    ],
    skill: {
      name: "隐遁",
      cooldown: 6,
      description: "瞬移到随机位置，绝命前无敌2秒"
    }
  },
  huaYao: {
    id: "huaYao",
    name: "元婴仙子",
    title: "灵月圣女·元婴",
    maxHp: 26,
    speed: 26,
    radius: 32,
    defenseDamage: 1,
    score: 360,
    energyGain: 50,
    color: "#e74c3c",
    accentColor: "#fadbd8",
    introText: "裙下之臣，谁能不败？",
    phases: [
      {
        hpRatioTrigger: 0.62,
        name: "花之舞",
        announce: "仙子·花之舞 — 花瓣飘散",
        speedMultiplier: 1,
        defenseDamage: 1,
        burstDamageMultiplier: 1
      },
      {
        hpRatioTrigger: 0.31,
        name: "花之怒",
        announce: "仙子·花之怒 — 花刺暗藏",
        speedMultiplier: 1.08,
        defenseDamage: 1,
        burstDamageMultiplier: 1.2
      },
      {
        hpRatioTrigger: 0,
        name: "花之殇",
        announce: "仙子·花之殇 — 百花葬！",
        speedMultiplier: 0.85,
        defenseDamage: 2,
        burstDamageMultiplier: 1.8
      }
    ],
    skill: {
      name: "花葬",
      cooldown: 6,
      description: "释放花瓣小兵，不给能量"
    }
  }
};

/** 获取Boss当前阶段索引 */
export function getBossPhase(bossConfig: BossConfig, currentHp: number): number {
  const hpRatio = currentHp / bossConfig.maxHp;
  for (let i = 0; i < bossConfig.phases.length; i++) {
    if (hpRatio > bossConfig.phases[i].hpRatioTrigger) {
      return i;
    }
  }
  return bossConfig.phases.length - 1;
}
