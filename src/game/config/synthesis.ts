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
  white: { label: "凡品", color: "#FFFFFF", next: "green", namePool: ["铁刃", "青锋", "钢骨", "霜铁", "黑曜"] },
  green: { label: "精炼", color: "#22C55E", next: "blue", namePool: ["灵霜", "赤焰", "紫电", "玄铁", "寒铁"] },
  blue: { label: "玄品", color: "#3B82F6", next: "purple", namePool: ["寒月", "烈阳", "天罡", "地煞", "飞鸿"] },
  purple: { label: "灵品", color: "#A855F7", next: "gold", namePool: ["碧血", "青虹", "紫郢", "霜华", "星陨"] },
  gold: { label: "法宝", color: "#F97316", next: "darkGold", namePool: ["干将", "莫邪", "太阿", "龙渊", "工布"] },
  darkGold: { label: "仙器", color: "#EF4444", next: "spirit", namePool: ["斩天", "破虚", "灭世", "无极", "混沌"] },
  spirit: { label: "灵器", color: "#EAB308", next: "immortal", namePool: ["九霄", "苍穹", "太初", "归墟", "鸿蒙"] },
  immortal: { label: "仙品", color: "#EC4899", next: "god", namePool: ["天道", "轮回", "创世", "永恒", "虚无"] },
  god: { label: "神器", color: "rainbow-1", next: null, namePool: ["开天", "辟地", "造化", "无极"] },
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
  white:  { baseChance: 80,  increment: 0,   maxAttempts: 1 },  // 白→绿 80%
  green:  { baseChance: 80,  increment: 0,   maxAttempts: 1 },  // 绿→蓝 80%
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

/** 算出该品质刀当前合成成功率（考虑失败递增） */
export function getSynthesisChance(quality: Quality, failCount: number = 0): number {
  const rule = SYNTHESIS_RULES[quality];
  if (!rule) return 0;
  return Math.min(100, rule.baseChance + failCount * rule.increment);
}

// ════════════════════════════════════════════
// 词缀系统（机制效果）
// ════════════════════════════════════════════
export type AffixId = "frost" | "flame" | "thunder" | "armorBreak" | "vampire" | "phantom";

export type AffixConfig = {
  id: AffixId;
  name: string;
  description: string;
  minQuality: Quality;
  maxQuality: Quality;
  /** 主刀效果 */
  primaryEffect: string;
  /** 副刀通用效果（旧字段） */
  subEffect: string;
  /** 装入蓄势横扫槽效果 */
  momentumEffect: string;
  /** 装入破点追击槽效果 */
  weakpointEffect: string;
  /** 推荐槽位 */
  recommendedSlot: 'momentum_sweep' | 'weakpoint_chase' | 'universal';
};

export const AFFIX_CONFIG: Record<AffixId, AffixConfig> = {
  frost: {
    id: "frost", name: "冰霜", description: "寒冰之力冻结敌人",
    minQuality: "white", maxQuality: "purple",
    primaryEffect: "挥刀路径留冰痕，敌人减速30%持续1.5秒",
    subEffect: "副刀攻击附带冰霜减速",
    momentumEffect: "横扫命中区域减速1.5秒",
    weakpointEffect: "锁定目标冻结1秒，周围小范围减速",
    recommendedSlot: 'momentum_sweep'
  },
  flame: {
    id: "flame", name: "烈火", description: "烈焰灼烧持续伤害",
    minQuality: "green", maxQuality: "gold",
    primaryEffect: "斩中敌人持续燃烧，2秒额外30%伤害",
    subEffect: "副刀攻击附带燃烧",
    momentumEffect: "横扫路径点燃敌人，范围广",
    weakpointEffect: "点燃高血量目标，持续伤害更高",
    recommendedSlot: 'weakpoint_chase'
  },
  thunder: {
    id: "thunder", name: "雷暴", description: "雷霆万钧闪电链",
    minQuality: "purple", maxQuality: "god",
    primaryEffect: "收刀时召唤3道闪电链自动追踪",
    subEffect: "副刀每3秒自动释放1道闪电",
    momentumEffect: "横扫后30%概率触发链雷",
    weakpointEffect: "追击后30%概率雷击周围2个敌人",
    recommendedSlot: 'universal'
  },
  armorBreak: {
    id: "armorBreak", name: "破甲", description: "斩破敌军防御",
    minQuality: "white", maxQuality: "blue",
    primaryEffect: "斩中敌人防御降低50%持续2秒",
    subEffect: "副刀攻击附带破甲",
    momentumEffect: "横扫命中敌人防御-30%持续2秒",
    weakpointEffect: "对精英/盾兵/Boss防御-50%持续2秒",
    recommendedSlot: 'weakpoint_chase'
  },
  vampire: {
    id: "vampire", name: "回春", description: "击杀回春",
    minQuality: "green", maxQuality: "purple",
    primaryEffect: "每击杀1个敌人回复2%刀势",
    subEffect: "副刀击杀回复主刀1%刀势",
    momentumEffect: "横扫击杀每个敌人额外+1%刀势",
    weakpointEffect: "击杀高价值目标额外+8%刀势",
    recommendedSlot: 'momentum_sweep'
  },
  phantom: {
    id: "phantom", name: "幻影", description: "残影连击",
    minQuality: "purple", maxQuality: "gold",
    primaryEffect: "挥刀路径留下残影，0.5秒后二次伤害",
    subEffect: "副刀攻击20%概率双倍",
    momentumEffect: "25%概率追加一次较弱横扫",
    weakpointEffect: "25%概率追加一次追击",
    recommendedSlot: 'universal'
  }
};

/** 获取词缀装入各槽位的效果描述 */
export function getAffixSlotEffect(affixId: AffixId, slotIndex: number): string {
  const affix = AFFIX_CONFIG[affixId];
  if (!affix) return '';
  return slotIndex === 0 ? affix.momentumEffect : affix.weakpointEffect;
}

/** 获取推荐槽位名称 */
export function getRecommendedSlotLabel(affixId: AffixId | null): string {
  if (!affixId) return '通用';
  const affix = AFFIX_CONFIG[affixId];
  if (!affix || affix.recommendedSlot === 'universal') return '通用';
  return affix.recommendedSlot === 'momentum_sweep' ? '蓄势副刀' : '破点副刀';
}

/** 获取推荐槽位原因 */
export function getRecommendedSlotReason(affixId: AffixId | null): string {
  if (!affixId || affixId === 'thunder' || affixId === 'phantom') return '两个槽位均可发挥效果';
  if (affixId === 'frost' || affixId === 'vampire') return '横扫命中多，范围收益高';
  if (affixId === 'armorBreak' || affixId === 'flame') return '点杀高价值目标收益更高';
  return '';
}

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
  qiRefining:       { id: "qiRefining",       name: "练气", unlockQuality: "green",  bossId: "yaoWang" },
  foundation:       { id: "foundation",       name: "筑基", unlockQuality: "blue",   bossId: "yaoWang" },
  coreFormation:    { id: "coreFormation",    name: "结丹", unlockQuality: "purple", bossId: "moXiu" },
  nascentSoul:      { id: "nascentSoul",      name: "元婴", unlockQuality: "gold",   bossId: "huaYao" },
  divineTransformation: { id: "divineTransformation", name: "化神", unlockQuality: "darkGold", bossId: "huaYao" },
  greatVehicle:     { id: "greatVehicle",     name: "大乘", unlockQuality: "spirit", bossId: "huaYao" },
  tribulation:      { id: "tribulation",      name: "渡劫", unlockQuality: "immortal", bossId: "huaYao" },
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
  { id: "splitter_intro", name: "裂变初现", unlockFloor: 4, enemies: [{ kind: "infantry", count: 3 }, { kind: "splitter", count: 1 }] },
  { id: "splitter_mix", name: "裂变混阵", unlockFloor: 5, enemies: [{ kind: "infantry", count: 4 }, { kind: "splitter", count: 1 }, { kind: "powder", count: 1 }] },
  { id: "tractor_intro", name: "牵引初现", unlockFloor: 7, enemies: [{ kind: "infantry", count: 5 }, { kind: "tractor", count: 1 }] },
  { id: "core_21",    name: "阵法波", unlockFloor: 50, enemies: [{ kind: "shield", count: 4 }, { kind: "core", count: 2 }] },
  { id: "elite_21",   name: "精英波", unlockFloor: 100,enemies: [{ kind: "elite", count: 2 }, { kind: "infantry", count: 4 }] },
];

/** 根据当前层数和可用模板生成一局的波次列表 */
export function generateFloorWaves(floor: number, templateCount?: number): WaveTemplate[] {
  const available = WAVE_TEMPLATES.filter(t => floor >= t.unlockFloor);
  if (available.length === 0) return [WAVE_TEMPLATES[0]];

  const count = templateCount ?? (5 + Math.floor(floor / 8)); // V0709018: 5+floor/8
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
    waveCount: 5 + Math.floor(floor / 8), // V0709018: 5+floor/8, 第1关5波, 第50关10波
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
  | "coin_gain" | "stamina_cost" | "run_exp"
  // 刀势循环定制Buff
  | "momentum_refund" | "sub_momentum_double" | "break_extra_sub" | "momentum_regen" | "third_sub_slot" | "weakness_bonus";

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
  { id: "b_quench",   name: "淬炼符",  desc: "今日合成失败获得经验+1",              quality: "white", price: 80, effectType: "run_exp",             effectValue: 1 },
  { id: "b_breath",   name: "蓄势加速", desc: "今日自然刀势恢复+25%",               quality: "white", price: 80, effectType: "momentum_regen",     effectValue: 25 },
  { id: "b_march",    name: "疾行符",  desc: "今日主线初始刀势+20",                 quality: "white", price: 80, effectType: "main_sword_initial",  effectValue: 20 },
  { id: "b_gold1",    name: "聚财符",  desc: "今日每局金币+30",                     quality: "white", price: 80, effectType: "coin_gain",          effectValue: 30 },
  { id: "b_light",    name: "轻身符",  desc: "今日主线体力消耗-1（最低1）",         quality: "white", price: 80, effectType: "stamina_cost",        effectValue: 1 },
  { id: "b_body",     name: "强体符",  desc: "今日主线生命+1",                      quality: "white", price: 80, effectType: "main_sword_initial",  effectValue: 0 },

  // ═══════ 蓝色 250金 ═══════
  { id: "b_syn_blue", name: "炼器精通", desc: "今日蓝→紫合成概率×1.5",             quality: "blue",  price: 200, effectType: "syn_blue_rate",    effectValue: 1.5 },
  { id: "b_sword",    name: "刀芒符",  desc: "今日主刀刀芒长度+15%",               quality: "blue",  price: 200, effectType: "main_sword_path",  effectValue: 15 },
  { id: "b_iron",     name: "铁壁符",  desc: "今日副刀攻击间隔-15%",               quality: "blue",  price: 200, effectType: "sub_cooldown",     effectValue: 15 },
  { id: "b_break",    name: "破阵连携", desc: "今日破阵斩后副刀立即各攻击一次",      quality: "blue",  price: 200, effectType: "break_extra_sub",  effectValue: 1 },
  { id: "b_weakup",   name: "破点强化", desc: "今日主刀命中破绽目标返还+10%",        quality: "blue",  price: 200, effectType: "weakness_bonus",   effectValue: 10 },

  // ═══════ 紫色 500金 ═══════
  { id: "b_syn_pur",  name: "大师铸炼", desc: "今日紫→金合成概率×1.5",             quality: "purple", price: 400, effectType: "syn_purple_rate", effectValue: 1.5 },
  { id: "b_flood",    name: "刀势沸腾", desc: "今日主刀击杀返还刀势+30%",           quality: "purple", price: 400, effectType: "momentum_refund",   effectValue: 30 },
  { id: "b_gold2",    name: "金币洪流", desc: "今日金币收益×2",                     quality: "purple", price: 400, effectType: "coin_gain",         effectValue: 2 },
  { id: "b_sub_echo", name: "副刀共鸣", desc: "今日副刀击杀回刀势效果翻倍",        quality: "purple", price: 400, effectType: "sub_momentum_double", effectValue: 1 },

  // ═══════ 金色 800金 ═══════
  { id: "b_syn_first", name: "炼器神符", desc: "今日首次合成必成",                  quality: "gold", price: 800, effectType: "syn_gold_rate",   effectValue: 1 },
  { id: "b_fullblade", name: "无双刀势", desc: "今日初始刀势100（满势）",            quality: "gold", price: 800, effectType: "main_sword_initial", effectValue: 100 },
  { id: "b_tri_sub",   name: "三刀流",  desc: "今日可装备3把副刀",                  quality: "gold", price: 800, effectType: "third_sub_slot",   effectValue: 1 },
  { id: "b_gold3",     name: "万金之躯", desc: "今日金币收益×3",                     quality: "gold", price: 800, effectType: "coin_gain",         effectValue: 3 },
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

/** 主线阶段卡点配置 */
export type StageGate = {
  stageRange: [number, number];
  afterStage: number;
  breakthroughId: string;
  breakthroughName: string;
  rankId: RankId;
  nextUnlockFrom: number | null;
  nextUnlockTo: number | null;
  unlockText: string;
};

export const MAIN_STAGE_GATES: StageGate[] = [
  { stageRange: [1, 5], afterStage: 5, breakthroughId: "breakthrough_lianqi", breakthroughName: "练气突破", rankId: "qiRefining", nextUnlockFrom: 6, nextUnlockTo: 15, unlockText: "解锁主线第6-15关，开启精品刀掉落" },
  { stageRange: [6, 15], afterStage: 15, breakthroughId: "breakthrough_zhuji", breakthroughName: "筑基突破", rankId: "foundation", nextUnlockFrom: 16, nextUnlockTo: 30, unlockText: "解锁主线第16-30关，开启良品刀掉落" },
  { stageRange: [16, 30], afterStage: 30, breakthroughId: "breakthrough_jiedan", breakthroughName: "结丹突破", rankId: "coreFormation", nextUnlockFrom: 31, nextUnlockTo: 60, unlockText: "解锁主线第31-60关，开启上品刀掉落" },
  { stageRange: [31, 60], afterStage: 60, breakthroughId: "breakthrough_yuanying", breakthroughName: "元婴突破", rankId: "nascentSoul", nextUnlockFrom: 61, nextUnlockTo: 120, unlockText: "解锁主线第61-120关，开启极品刀掉落" },
  { stageRange: [61, 120], afterStage: 120, breakthroughId: "breakthrough_huashen", breakthroughName: "化神突破", rankId: "divineTransformation", nextUnlockFrom: 121, nextUnlockTo: 200, unlockText: "解锁主线第121-200关，开启灵器刀掉落" },
  { stageRange: [121, 200], afterStage: 200, breakthroughId: "breakthrough_dacheng", breakthroughName: "大乘突破", rankId: "greatVehicle", nextUnlockFrom: 201, nextUnlockTo: 400, unlockText: "解锁主线第201-400关，开启仙器刀掉落" },
  { stageRange: [201, 400], afterStage: 400, breakthroughId: "breakthrough_dujie", breakthroughName: "渡劫突破", rankId: "tribulation", nextUnlockFrom: 401, nextUnlockTo: 1000, unlockText: "解锁主线第401-1000关，开启神器刀掉落" },
  { stageRange: [401, 1000], afterStage: 1000, breakthroughId: "breakthrough_xianren", breakthroughName: "仙人突破", rankId: "tribulation", nextUnlockFrom: null, nextUnlockTo: null, unlockText: "达成当前版本最高境界" },
];

/** 获取当前是否需要突破 */
export function getCurrentGate(floor: number): StageGate | null {
  for (const gate of MAIN_STAGE_GATES) {
    if (floor === gate.afterStage) return gate;
  }
  return null;
}

/** 获取当前已通过的最高关卡所在阶段名称 */
export function getStageNameByFloor(floor: number): string {
  for (let i = MAIN_STAGE_GATES.length - 1; i >= 0; i--) {
    const g = MAIN_STAGE_GATES[i];
    if (g.stageRange[0] <= floor) return g.breakthroughName.replace("突破", "");
  }
  return "初入刀道";
}

/** 第一关硬编码波次配置（0715割草密度激进调优版） */
function createLevel1Config(): LevelConfig {
  const level1Waves: WaveConfig[] = [
    // Wave 1: 入场横排 (0.5s, 16~20敌) 三次修正：放宽间隔，玩家有反应时间
    {
      name: "散修潮",
      delay: 0.2,
      spawnAt: 0.5,
      enemies: [
        { kind: "infantry", count: 8, x: 44 },
        { kind: "infantry", count: 8, x: 140 },
        { kind: "infantry", count: 4, x: 236 }
      ]
    },
    // Wave 2: 密集小潮 (4.0s, 18~22敌)
    {
      name: "密集阵",
      delay: 0.2,
      spawnAt: 4.0,
      enemies: [
        { kind: "infantry", count: 8, x: 92 },
        { kind: "infantry", count: 6, x: 188 },
        { kind: "infantry", count: 4, x: 140 },
        { kind: "powder", count: 1, x: 236 }
      ]
    },
    // Wave 3: 双排推进 (8.0s, 20~24敌)
    {
      name: "双排队",
      delay: 0.2,
      spawnAt: 8.0,
      enemies: [
        { kind: "infantry", count: 8, x: 44 },
        { kind: "infantry", count: 8, x: 188 },
        { kind: "infantry", count: 4, x: 140 },
        { kind: "shield", count: 2, x: 284 }
      ]
    },
    // Wave 4: 火药爆点波 (13.0s, 22~28敌)
    {
      name: "火药阵",
      delay: 0.2,
      spawnAt: 13.0,
      enemies: [
        { kind: "infantry", count: 10, x: 44 },
        { kind: "infantry", count: 8, x: 140 },
        { kind: "powder", count: 2, x: 236 },
        { kind: "infantry", count: 6, x: 92 },
        { kind: "powder", count: 1, x: 284 }
      ]
    },
    // Wave 5: 精英前压迫波 (19.0s, 22~28敌)
    {
      name: "压迫阵",
      delay: 0.2,
      spawnAt: 19.0,
      enemies: [
        { kind: "infantry", count: 8, x: 44 },
        { kind: "shield", count: 2, x: 140 },
        { kind: "infantry", count: 8, x: 188 },
        { kind: "infantry", count: 6, x: 92 },
        { kind: "powder", count: 1, x: 284 }
      ]
    }
  ];

  // 精英后宝箱后爆发怪潮（3波）
  const level1PostChestWaves: WaveConfig[] = [
    // Post-Wave 1: 宝箱后第一波 (宝箱开启后0.5s, 24~30敌)
    {
      name: "反扑·一",
      delay: 0.2,
      spawnAt: 0.5,
      enemies: [
        { kind: "infantry", count: 10, x: 44 },
        { kind: "infantry", count: 8, x: 140 },
        { kind: "powder", count: 2, x: 236 },
        { kind: "infantry", count: 8, x: 188 }
      ]
    },
    // Post-Wave 2: 宝箱后第二波 (宝箱开启后5.0s, 30~38敌)
    {
      name: "反扑·二",
      delay: 0.2,
      spawnAt: 5.0,
      enemies: [
        { kind: "infantry", count: 10, x: 44 },
        { kind: "shield", count: 2, x: 140 },
        { kind: "infantry", count: 10, x: 188 },
        { kind: "infantry", count: 8, x: 92 },
        { kind: "powder", count: 3, x: 284 }
      ]
    },
    // Post-Wave 3: 最终怪潮 (宝箱开启后10.5s, 38~50敌)
    {
      name: "反扑·终",
      delay: 0.2,
      spawnAt: 10.5,
      enemies: [
        { kind: "infantry", count: 14, x: 44 },
        { kind: "infantry", count: 12, x: 140 },
        { kind: "powder", count: 3, x: 236 },
        { kind: "infantry", count: 8, x: 92 },
        { kind: "shield", count: 2, x: 284 },
        { kind: "infantry", count: 6, x: 188 }
      ]
    }
  ];

  return {
    id: 10001,
    title: "第1关",
    subtitle: "初入刀道 | 敌军HP 1",
    initialEnergy: 45,
    hp: 3,
    enemySpeed: 1.0,
    pickupChance: 0.03,
    durationSeconds: 90,
    buffTimes: [],
    waves: level1Waves,
    eliteSpawnAt: 25, // 三次修正：推迟到 wave 5 之后 (19s + 6s)
    eliteKind: "fireRing" as any,
    chestBuffId: "chest_first_clear",
    postChestWaves: level1PostChestWaves,
    entryOverride: { multiplier: 3.4, endY: 560, maxDuration: 2.0, spawnY: -20 }
  };
}

/** 动态生成一局主线的完整LevelConfig */
export function createFloorLevelConfig(floor: number): LevelConfig {
  // 第1关：使用硬编码激进割草配置
  if (floor === 1) return createLevel1Config();

  const stats = getFloorStats(floor);
  const waveTemplates = generateFloorWaves(floor);

  // 兵数量随层数递增：每sub-spawn 3~5只, 1层起步2倍
  const countMul = 2 + Math.floor(floor / 4);

  const waves: WaveConfig[] = waveTemplates.map((tpl, idx) => {
    const lane = (idx * 3 + 1) % LANES.length;
    const enemies: EnemySpawn[] = tpl.enemies.map((e, ei) => {
      const cnt = Math.max(1, Math.min(5, e.count * Math.max(1, Math.floor(countMul / 2))));
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
      spawnAt: idx * 5.5,
      speedMultiplier: 1 + floor * 0.005,
      enemies,
    };
  });

  // 决定精英出场时机（每关必出1个）
  const eliteKinds = ["fireRing", "heal", "aura"];
  const eKind = eliteKinds[floor % eliteKinds.length] as any;
  const eliteSpawnAt = Math.max(8, waves.length * 1.8);

  // 第2-5关：增加后置波
  let postChestWaves: WaveConfig[] | undefined;
  if (floor >= 2 && floor <= 5) {
    const postCount = floor <= 2 ? 3 : (floor <= 3 ? 4 : 5);
    postChestWaves = [];
    for (let i = 0; i < postCount; i++) {
      const postDelay = i === 0 ? 0.5 : 5.0 + (i - 1) * 5.5;
      const baseCount = 24 + i * 6;
      postChestWaves.push({
        name: `反扑·${['一','二','三','四','五'][i] || String(i+1)}`,
        delay: 0.2,
        spawnAt: postDelay,
        enemies: [
          { kind: "infantry", count: Math.min(12, Math.floor(baseCount * 0.4)), x: 44 },
          { kind: "infantry", count: Math.min(10, Math.floor(baseCount * 0.3)), x: 140 },
          { kind: i % 2 === 0 ? "powder" : "shield", count: 2, x: 236 },
          { kind: "infantry", count: Math.min(8, Math.floor(baseCount * 0.2)), x: 92 }
        ]
      });
    }
  }

  const entryOverride = floor <= 5
    ? { multiplier: 3.4, endY: 560, maxDuration: 2.0, spawnY: -20 }
    : undefined;

  // P3.1：强制插入机制怪教学波次
  if (floor === 4) {
    waves.splice(2, 0, {
      name: "裂变初现", delay: 0.2, spawnAt: 18,
      speedMultiplier: 1 + floor * 0.005,
      enemies: [{ kind: "infantry" as any, count: 4, x: LANES[2], yOffset: 0 }, { kind: "splitter" as any, count: 1, x: LANES[3], yOffset: 12 }, { kind: "infantry" as any, count: 3, x: LANES[4], yOffset: 24 }],
    });
    waves.splice(4, 0, {
      name: "裂变复现", delay: 0.2, spawnAt: 34,
      speedMultiplier: 1 + floor * 0.005,
      enemies: [{ kind: "infantry" as any, count: 4, x: LANES[1], yOffset: 0 }, { kind: "splitter" as any, count: 1, x: LANES[3], yOffset: 12 }, { kind: "powder" as any, count: 1, x: LANES[5], yOffset: 24 }],
    });
  }
  if (floor === 5) {
    waves.splice(2, 0, {
      name: "裂变巩固", delay: 0.2, spawnAt: 20,
      speedMultiplier: 1 + floor * 0.005,
      enemies: [{ kind: "infantry" as any, count: 4, x: LANES[1], yOffset: 0 }, { kind: "splitter" as any, count: 1, x: LANES[2], yOffset: 10 }, { kind: "splitter" as any, count: 1, x: LANES[4], yOffset: 16 }, { kind: "infantry" as any, count: 4, x: LANES[5], yOffset: 26 }],
    });
  }
  if (floor === 6) {
    waves.splice(2, 0, {
      name: "裂变复习", delay: 0.2, spawnAt: 22,
      speedMultiplier: 1 + floor * 0.005,
      enemies: [{ kind: "infantry" as any, count: 5, x: LANES[2], yOffset: 0 }, { kind: "splitter" as any, count: 1, x: LANES[3], yOffset: 12 }, { kind: "infantry" as any, count: 5, x: LANES[4], yOffset: 24 }],
    });
  }
  if (floor === 7) {
    waves.splice(2, 0, {
      name: "牵引初现", delay: 0.2, spawnAt: 22,
      speedMultiplier: 1 + floor * 0.005,
      enemies: [{ kind: "infantry" as any, count: 4, x: LANES[1], yOffset: 0 }, { kind: "tractor" as any, count: 1, x: LANES[3], yOffset: 12 }, { kind: "infantry" as any, count: 4, x: LANES[5], yOffset: 24 }],
    });
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
    eliteSpawnAt,
    eliteKind: eKind,
    postChestWaves,
    entryOverride,
  };
}
