import type { BossId } from "../types";

// ════════════════════════════════════════════
// 品质阶梯
// ════════════════════════════════════════════
export type Quality = "white" | "green" | "blue" | "purple" | "gold" | "darkGold" | "spirit" | "immortal" | "god";

export const QUALITY_ORDER: Quality[] = ["white", "green", "blue", "purple", "gold", "darkGold", "spirit", "immortal", "god"];

export const QUALITY_META: Record<Quality, {
  label: string;
  color: string;
  next: Quality | null;
  /** 刀名池（合成时随机抽取） */
  namePool: string[];
}> = {
  white: { label: "凡品", color: "#b4b2a9", next: "green", namePool: ["铁刃", "青锋", "钢骨", "霜铁", "黑曜"] },
  green: { label: "精炼", color: "#85B7EB", next: "blue", namePool: ["灵霜", "赤焰", "紫电", "玄铁", "寒铁"] },
  blue: { label: "玄品", color: "#534AB7", next: "purple", namePool: ["寒月", "烈阳", "天罡", "地煞", "飞鸿"] },
  purple: { label: "灵品", color: "#7F77DD", next: "gold", namePool: ["碧血", "青虹", "紫郢", "霜华", "星陨"] },
  gold: { label: "法宝", color: "#FAC775", next: "darkGold", namePool: ["干将", "莫邪", "太阿", "龙渊", "工布"] },
  darkGold: { label: "仙器", color: "#D85A30", next: "spirit", namePool: ["斩天", "破虚", "灭世", "无极", "混沌"] },
  spirit: { label: "灵器", color: "#A32D2D", next: "immortal", namePool: ["九霄", "苍穹", "太初", "归墟", "鸿蒙"] },
  immortal: { label: "仙品", color: "#E24B4A", next: "god", namePool: ["天道", "轮回", "创世", "永恒", "虚无"] },
  god: { label: "神器", color: "#FFD700", next: null, namePool: ["开天", "辟地", "造化", "无极"] },
};

// ════════════════════════════════════════════
// 合成概率（参考宗师之上）
// ════════════════════════════════════════════
export type SynthesisRule = {
  baseChance: number;       // 基础成功率 %
  increment: number;        // 每次失败递增 %
  maxAttempts: number;      // 保底次数
};

export const SYNTHESIS_RULES: Partial<Record<Quality, SynthesisRule>> = {
  white:  { baseChance: 100, increment: 0,   maxAttempts: 1 },  // 白→绿 100%
  green:  { baseChance: 100, increment: 0,   maxAttempts: 1 },  // 绿→蓝 100%
  blue:   { baseChance: 20,  increment: 20,  maxAttempts: 5 },  // 蓝→紫 20%递增 5次保底
  purple: { baseChance: 15,  increment: 15,  maxAttempts: 7 },  // 紫→金 15%递增 7次保底
  gold:   { baseChance: 15,  increment: 15,  maxAttempts: 7 },
  darkGold: { baseChance: 15, increment: 15, maxAttempts: 7 },
  spirit: { baseChance: 15,  increment: 15,  maxAttempts: 7 },
  immortal: { baseChance: 15, increment: 15, maxAttempts: 7 },
};

// ════════════════════════════════════════════
// 刀经验等级
// ════════════════════════════════════════════
export const BLADE_MAX_LEVEL = 40;

/** 等级消耗经验倍率区间 */
export const BLADE_EXP_COST_TABLE = [
  { from: 1,  to: 15, expPerLevel: 1, label: "初期" },
  { from: 16, to: 30, expPerLevel: 2, label: "中期" },
  { from: 31, to: 40, expPerLevel: 3, label: "后期" },
] as const;

export function getExpCostForLevel(level: number): number {
  for (const tier of BLADE_EXP_COST_TABLE) {
    if (level >= tier.from && level <= tier.to) return tier.expPerLevel;
  }
  return 3;
}

// ════════════════════════════════════════════
// 词缀系统（机制效果）
// ════════════════════════════════════════════
export type AffixId = "frost" | "flame" | "thunder" | "armorBreak" | "vampire" | "phantom";

export type AffixConfig = {
  id: AffixId;
  name: string;
  description: string;
  minQuality: Quality;  // 最低出现品质
  maxQuality: Quality;  // 最高出现品质
  /** 主刀效果 */
  primaryEffect: string;
  /** 副刀效果 */
  subEffect: string;
};

export const AFFIX_CONFIG: Record<AffixId, AffixConfig> = {
  frost: {
    id: "frost", name: "冰霜", description: "寒冰之力冻结敌人",
    minQuality: "white", maxQuality: "purple",
    primaryEffect: "挥刀路径留冰痕，敌人减速30%持续1.5秒",
    subEffect: "副刀攻击附带冰霜减速"
  },
  flame: {
    id: "flame", name: "烈火", description: "烈焰灼烧持续伤害",
    minQuality: "green", maxQuality: "gold",
    primaryEffect: "斩中敌人持续燃烧，2秒额外30%伤害",
    subEffect: "副刀攻击附带燃烧"
  },
  thunder: {
    id: "thunder", name: "雷暴", description: "雷霆万钧闪电链",
    minQuality: "purple", maxQuality: "god",
    primaryEffect: "收刀时召唤3道闪电链自动追踪",
    subEffect: "副刀每3秒自动释放1道闪电"
  },
  armorBreak: {
    id: "armorBreak", name: "破甲", description: "斩破敌军防御",
    minQuality: "white", maxQuality: "blue",
    primaryEffect: "斩中敌人防御降低50%持续2秒",
    subEffect: "副刀攻击附带破甲"
  },
  vampire: {
    id: "vampire", name: "回春", description: "击杀回春",
    minQuality: "green", maxQuality: "purple",
    primaryEffect: "每击杀1个敌人回复2%刀势",
    subEffect: "副刀击杀回复主刀1%刀势"
  },
  phantom: {
    id: "phantom", name: "幻影", description: "残影连击",
    minQuality: "purple", maxQuality: "gold",
    primaryEffect: "挥刀路径留下残影，0.5秒后二次伤害",
    subEffect: "副刀攻击20%概率双倍"
  }
};

/** 从品质匹配的词缀池中随机抽1个 */
export function getRandomAffixForQuality(quality: Quality): AffixId | null {
  const pool = Object.values(AFFIX_CONFIG).filter(a => {
    const qIdx = QUALITY_ORDER.indexOf(quality);
    const minIdx = QUALITY_ORDER.indexOf(a.minQuality);
    const maxIdx = QUALITY_ORDER.indexOf(a.maxQuality);
    return qIdx >= minIdx && qIdx <= maxIdx;
  });
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

// ════════════════════════════════════════════
// 修仙段位（挑战Boss）
// ════════════════════════════════════════════
export type RankId = "qiRefining" | "foundation" | "coreFormation" | "nascentSoul" | "divineTransformation" | "greatVehicle" | "tribulation";

export type RankConfig = {
  id: RankId;
  name: string;
  /** 升到此段后解锁的品质 */
  unlockQuality: Quality;
  /** BossID（复用现有机制） */
  bossId: BossId;
};

export const RANK_CONFIG: Record<RankId, RankConfig> = {
  qiRefining:       { id: "qiRefining",       name: "练气", unlockQuality: "green",  bossId: "zhangFei" },
  foundation:       { id: "foundation",       name: "筑基", unlockQuality: "blue",   bossId: "zhangFei" },
  coreFormation:    { id: "coreFormation",    name: "结丹", unlockQuality: "purple", bossId: "simaYi" },
  nascentSoul:      { id: "nascentSoul",      name: "元婴", unlockQuality: "gold",   bossId: "zhenJi" },
  divineTransformation: { id: "divineTransformation", name: "化神", unlockQuality: "darkGold", bossId: "zhenJi" },
  greatVehicle:     { id: "greatVehicle",     name: "大乘", unlockQuality: "spirit", bossId: "zhenJi" },
  tribulation:      { id: "tribulation",      name: "渡劫", unlockQuality: "immortal", bossId: "zhenJi" },
};

export const RANK_ORDER: RankId[] = Object.keys(RANK_CONFIG) as RankId[];

/** 根据段位获取该段位对应的品质解锁条件 */
export function getRankForQuality(quality: Quality): RankConfig | null {
  for (const rank of Object.values(RANK_CONFIG)) {
    if (rank.unlockQuality === quality) return rank;
  }
  return null;
}

// ════════════════════════════════════════════
// 刀的基础属性（品质决定）
// ════════════════════════════════════════════
export const BLADE_BASE_STATS: Record<Quality, {
  /** 刀芒长度倍率 */
  bladeMultiplier: number;
  /** 伤害倍率 */
  damageMultiplier: number;
  /** 副刀攻击间隔（秒） */
  subSlashInterval: number;
  /** 评分权重 */
  scoreWeight: number;
}> = {
  white:    { bladeMultiplier: 1.0,  damageMultiplier: 1.0,  subSlashInterval: 5.0, scoreWeight: 1 },
  green:    { bladeMultiplier: 1.1,  damageMultiplier: 1.15, subSlashInterval: 4.5, scoreWeight: 2 },
  blue:     { bladeMultiplier: 1.2,  damageMultiplier: 1.3,  subSlashInterval: 4.0, scoreWeight: 3 },
  purple:   { bladeMultiplier: 1.35, damageMultiplier: 1.5,  subSlashInterval: 3.5, scoreWeight: 6 },
  gold:     { bladeMultiplier: 1.55, damageMultiplier: 1.8,  subSlashInterval: 3.0, scoreWeight: 12 },
  darkGold: { bladeMultiplier: 1.8,  damageMultiplier: 2.2,  subSlashInterval: 2.5, scoreWeight: 24 },
  spirit:   { bladeMultiplier: 2.1,  damageMultiplier: 2.7,  subSlashInterval: 2.0, scoreWeight: 48 },
  immortal: { bladeMultiplier: 2.5,  damageMultiplier: 3.3,  subSlashInterval: 1.5, scoreWeight: 96 },
  god:      { bladeMultiplier: 3.0,  damageMultiplier: 4.0,  subSlashInterval: 1.0, scoreWeight: 192 },
};

// ════════════════════════════════════════════
// 波次模板（用于主线随机生成）
// ════════════════════════════════════════════
export type WaveTemplate = {
  id: string;
  name: string;
  /** 此模板出现的解锁品质（需先解锁对应品质波次池才包含此模板） */
  unlockFloor: number;
  enemies: Array<{ kind: string; count: number }>;
};

export const WAVE_TEMPLATES: WaveTemplate[] = [
  { id: "infantry_3", name: "散修波", unlockFloor: 0,  enemies: [{ kind: "infantry", count: 4 }] },
  { id: "mixed_12",   name: "妖卫波", unlockFloor: 0,  enemies: [{ kind: "infantry", count: 3 }, { kind: "shield", count: 2 }] },
  { id: "powder_12",  name: "火修波", unlockFloor: 0,  enemies: [{ kind: "infantry", count: 2 }, { kind: "powder", count: 2 }] },
  { id: "core_21",    name: "阵法波", unlockFloor: 50, enemies: [{ kind: "shield", count: 4 }, { kind: "core", count: 2 }] },
  { id: "elite_21",   name: "精英波", unlockFloor: 100,enemies: [{ kind: "elite", count: 2 }, { kind: "infantry", count: 4 }] },
];

/** 根据当前层数和可用模板生成一局的波次列表 */
export function generateFloorWaves(floor: number, templateCount: number = 5): WaveTemplate[] {
  const available = WAVE_TEMPLATES.filter(t => floor >= t.unlockFloor);
  if (available.length === 0) return [WAVE_TEMPLATES[0]];
  
  const count = Math.min(templateCount, 4 + Math.floor(floor / 10));
  const waves: WaveTemplate[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * available.length);
    waves.push(available[idx]);
  }
  return waves;
}

/** 主线每层的基础数值公式 */
export function getFloorStats(floor: number) {
  return {
    enemyHp: 1 + Math.floor(floor / 5),
    enemySpeed: 42 + floor * 0.3,
    enemyCount: 4 + Math.floor(floor / 8),
    eliteProbability: Math.min(0.3, floor * 0.005),
    waveCount: 4 + Math.floor(floor / 10),
  };
}

import type { LevelConfig, WaveConfig, EnemySpawn } from "../types";

const LANES = [44, 92, 140, 188, 236, 284, 336];
const ROW_GAP = 42;

// ═════════════════════════════════════════════════════════════════
// 今日Buff系统
// ═════════════════════════════════════════════════════════════════
export type BuffQuality = "white" | "blue" | "purple" | "gold";
export const BUFF_QUALITY_ORDER: BuffQuality[] = ["white", "blue", "purple", "gold"];

export const BUFF_QUALITY_META: Record<BuffQuality, { label: string; color: string; weight: number }> = {
  white:  { label: "凡品", color: "#e0e0e0", weight: 60 },
  blue:   { label: "灵品", color: "#7fb1ff", weight: 25 },
  purple: { label: "玄品", color: "#c896ff", weight: 12 },
  gold:   { label: "仙品", color: "#ffd35a", weight: 3 },
};

export type BuffEffectType =
  | "main_sword_path" | "main_sword_damage" | "main_sword_initial"
  | "sub_cooldown" | "sub_damage"
  | "syn_blue_rate" | "syn_purple_rate" | "syn_gold_rate"
  | "coin_gain" | "stamina_cost" | "run_exp";

export type TodayBuff = {
  id: string;
  name: string;
  desc: string;
  quality: BuffQuality;
  price: number;        // 金币直购价
  effectType: BuffEffectType;
  effectValue: number;  // 数值（百分比或绝对值）
};

export const TODAY_BUFF_POOL: TodayBuff[] = [
  // ═══════ 白色 100金 ═══════
  { id: "b_quench",   name: "淬炼符",  desc: "今日合成失败获得经验+1",          quality: "white", price: 100, effectType: "run_exp",         effectValue: 1 },
  { id: "b_march",    name: "疾行符",  desc: "今日主线初始刀势+20",             quality: "white", price: 100, effectType: "main_sword_initial", effectValue: 20 },
  { id: "b_body",     name: "强体符",  desc: "今日主线生命+1",                  quality: "white", price: 100, effectType: "main_sword_initial", effectValue: 0 }, // 用hp字段
  { id: "b_gold1",    name: "聚财符",  desc: "今日每局金币+30",                 quality: "white", price: 100, effectType: "coin_gain",       effectValue: 30 },
  { id: "b_light",    name: "轻身符",  desc: "今日主线体力消耗-1（最低1）",      quality: "white", price: 100, effectType: "stamina_cost",     effectValue: 1 },
  { id: "b_breath",   name: "吐纳符",  desc: "今日刀势恢复速度+15%",            quality: "white", price: 100, effectType: "main_sword_path",  effectValue: 0 }, // 简化

  // ═══════ 蓝色 250金 ═══════
  { id: "b_syn_blue", name: "炼器精通", desc: "今日蓝→紫合成概率×1.5",          quality: "blue",  price: 250, effectType: "syn_blue_rate",   effectValue: 1.5 },
  { id: "b_sword",    name: "刀芒符",  desc: "今日主刀刀芒长度+15%",            quality: "blue",  price: 250, effectType: "main_sword_path", effectValue: 15 },
  { id: "b_iron",     name: "铁壁符",  desc: "今日副刀攻击间隔-15%",            quality: "blue",  price: 250, effectType: "sub_cooldown",   effectValue: 15 },
  { id: "b_aura",     name: "聚灵符",  desc: "今日副刀伤害+20%",                quality: "blue",  price: 250, effectType: "sub_damage",     effectValue: 20 },
  { id: "b_trail",    name: "识途符",  desc: "今日每局经验+1",                  quality: "blue",  price: 250, effectType: "run_exp",        effectValue: 1 },

  // ═══════ 紫色 500金 ═══════
  { id: "b_syn_pur",  name: "大师铸炼", desc: "今日紫→金合成概率×1.5",          quality: "purple", price: 500, effectType: "syn_purple_rate", effectValue: 1.5 },
  { id: "b_flood",    name: "刀势泉涌", desc: "今日刀势恢复速度+30%",            quality: "purple", price: 500, effectType: "main_sword_path", effectValue: 30 },
  { id: "b_gold2",    name: "金币洪流", desc: "今日金币收益×2",                  quality: "purple", price: 500, effectType: "coin_gain",       effectValue: 2 },
  { id: "b_sub_echo", name: "副刀共鸣", desc: "今日副刀伤害+35%",                quality: "purple", price: 500, effectType: "sub_damage",       effectValue: 35 },

  // ═══════ 金色 800金 ═══════
  { id: "b_syn_first", name: "炼器神符", desc: "今日首次合成必成",                quality: "gold", price: 800, effectType: "syn_gold_rate", effectValue: 1 },
  { id: "b_fullblade", name: "无双刀势", desc: "今日初始刀势100（满势）",          quality: "gold", price: 800, effectType: "main_sword_initial", effectValue: 100 },
  { id: "b_gold3",     name: "万金之躯", desc: "今日金币收益×3",                  quality: "gold", price: 800, effectType: "coin_gain", effectValue: 3 },
  { id: "b_tri_sub",   name: "三刀流",  desc: "今日可装备3把副刀",                quality: "gold", price: 800, effectType: "sub_damage", effectValue: 0 }, // 标记特殊
];

/** 抽3个白(权重60), 2个蓝(25), 1个紫(12) — 总计6个抽奖位 */
export function rollTodayDrawPool(): TodayBuff[] {
  const roll = (qual: BuffQuality): TodayBuff => {
    const arr = TODAY_BUFF_POOL.filter(b => b.quality === qual);
    return arr[Math.floor(Math.random() * arr.length)];
  };
  const whiteCount = 3;
  const blueCount = 2;
  const purpleCount = 1;
  const goldCount = Math.random() < 0.3 ? 1 : 0; // 30%出1金色
  const out: TodayBuff[] = [];
  for (let i = 0; i < whiteCount; i++) out.push(roll("white"));
  for (let i = 0; i < blueCount; i++) out.push(roll("blue"));
  for (let i = 0; i < purpleCount; i++) out.push(roll("purple"));
  for (let i = 0; i < goldCount; i++) out.push(roll("gold"));
  return out;
}

/** 商店页签=3白+2蓝+1紫直购 */
export function rollTodayShopPool(): TodayBuff[] {
  const roll = (qual: BuffQuality): TodayBuff => {
    const arr = TODAY_BUFF_POOL.filter(b => b.quality === qual);
    return arr[Math.floor(Math.random() * arr.length)];
  };
  const out: TodayBuff[] = [];
  out.push(roll("white"));
  out.push(roll("blue"));
  out.push(roll("purple"));
  return out;
}

/** 动态生成一局主线的完整LevelConfig */
export function createFloorLevelConfig(floor: number): LevelConfig {
  const stats = getFloorStats(floor);
  const waveTemplates = generateFloorWaves(floor);

  // 兵数量随层数递增：1层=4-5个起步
  const countMul = 2 + Math.floor(floor / 3);

  const waves: WaveConfig[] = waveTemplates.map((tpl, idx) => {
    const lane = (idx * 3 + 1) % LANES.length;
    const enemies: EnemySpawn[] = tpl.enemies.map((e, ei) => {
      const cnt = Math.max(1, e.count * countMul);
      return {
        kind: e.kind as any,
        count: cnt,
        x: LANES[(lane + ei * 2) % LANES.length],
        yOffset: ei * 6,
      } as any;
    });
    return {
      name: tpl.name,
      delay: idx === 0 ? 0.2 : 0.2,
      spawnAt: idx * 3.5, // 每3.5秒一波（紧凑节奏）
      speedMultiplier: 1 + floor * 0.005,
      enemies,
    };
  });

  // 决定是否有精英（随层数递增）
  if (floor >= 5 && Math.random() < stats.eliteProbability * 1.5) {
    const eliteKinds = ["fireRing", "heal", "aura"];
    const eKind = eliteKinds[floor % eliteKinds.length] as any;
    const eliteWave: WaveConfig = {
      name: "精英督战",
      delay: 0.3,
      spawnAt: waves.length > 0 ? (waves.length * 5) : 0,
      enemies: [{ kind: "elite", count: 1, x: LANES[3], yOffset: 0 } as any],
    };
    (eliteWave.enemies[0] as any).eliteKind = eKind;
    waves.push(eliteWave);
  }

  return {
    id: 10000 + floor,
    title: `第${floor}关`,
    subtitle: `难度 ${Math.floor(floor / 5)} | 敌军HP ${stats.enemyHp}`,
    initialEnergy: Math.min(100, 50 + floor * 0.5),
    hp: 3,
    enemySpeed: Math.min(3.0, 0.85 + floor * 0.012),
    pickupChance: Math.min(0.15, 0.03 + floor * 0.002),
    durationSeconds: Math.min(360, 120 + floor * 0.8),
    buffTimes: [],
    waves,
  };
}
