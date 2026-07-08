import type { BuffId, TacticalRoute } from "../types";

export type RunBuffConfig = {
  id: BuffId;
  name: string;
  shortName: string;
  description: string;
  feedback: string;
  route: TacticalRoute;
  tier: number; // 1=铺垫, 2=进化, 3=爆发
  color: string;  // 路线标识色
};

// 燎原路线：红橙 #ff6a33
// 贯阵路线：金紫 #9b6dff
// 鐵壁路线：蓝灰 #5b8db8

export const ROUTE_COLORS: Record<TacticalRoute, string> = {
  scorch: "#ff6a33",
  pierce: "#9b6dff",
  ironWall: "#5b8db8"
};

export const ROUTE_NAMES: Record<TacticalRoute, string> = {
  scorch: "燎原",
  pierce: "贯阵",
  ironWall: "铁壁"
};

export const ROUTE_ICONS: Record<TacticalRoute, string> = {
  scorch: "🔥",
  pierce: "⚡",
  ironWall: "🛡"
};

export const ROUTE_BUFFS: Record<TacticalRoute, BuffId[]> = {
  scorch: ["oilSoak", "chainFuse", "scorch"],
  pierce: ["pierceShield", "shatterCore", "shatterArmy"],
  ironWall: ["fortress", "warDrum", "soulReturn"]
};

export const RUN_BUFFS: RunBuffConfig[] = [
  // ---- 燎原路线：连锁爆炸 ----
  {
    id: "oilSoak",
    name: "火油浸润",
    shortName: "火油",
    description: "火药兵被击中时，附近生成可引爆的火药残渣",
    feedback: "已获得：火油浸润，击中火药兵留下残渣",
    route: "scorch",
    tier: 1,
    color: ROUTE_COLORS.scorch
  },
  {
    id: "chainFuse",
    name: "连锁引信",
    shortName: "引信",
    description: "爆炸范围+25%，爆炸自动点燃相邻火药兵",
    feedback: "已获得：连锁引信，连锁引爆更猛",
    route: "scorch",
    tier: 2,
    color: ROUTE_COLORS.scorch
  },
  {
    id: "scorch",
    name: "燎原",
    shortName: "燎原",
    description: "收刀时，所有点燃状态敌军额外触发爆炸",
    feedback: "已获得：燎原，收刀即全场引爆",
    route: "scorch",
    tier: 3,
    color: ROUTE_COLORS.scorch
  },

  // ---- 贯阵路线：精准破阵 ----
  {
    id: "pierceShield",
    name: "穿盾",
    shortName: "穿盾",
    description: "常锋可破盾，且破盾后刀芒不衰减",
    feedback: "已获得：穿盾，常锋亦破盾，刀芒不减",
    route: "pierce",
    tier: 1,
    color: ROUTE_COLORS.pierce
  },
  {
    id: "shatterCore",
    name: "碎阵",
    shortName: "碎阵",
    description: "阵眼崩塌范围+25%，崩塌可连锁触发相邻阵眼",
    feedback: "已获得：碎阵，阵眼崩塌更猛且可连锁",
    route: "pierce",
    tier: 2,
    color: ROUTE_COLORS.pierce
  },
  {
    id: "shatterArmy",
    name: "破军",
    shortName: "破军",
    description: "破阵锋阶段，刀芒经过的阵眼无需刀触即崩塌",
    feedback: "已获得：破军，刀芒扫过阵眼自崩",
    route: "pierce",
    tier: 3,
    color: ROUTE_COLORS.pierce
  },

  // ---- 鐵壁路线：容错续航 ----
  {
    id: "fortress",
    name: "坚城",
    shortName: "坚城",
    description: "防线HP+1，敌军触线后1秒内移速-40%",
    feedback: "已获得：堅城，防线加固且敌军触线减速",
    route: "ironWall",
    tier: 1,
    color: ROUTE_COLORS.ironWall
  },
  {
    id: "warDrum",
    name: "鼓阵",
    shortName: "鼓阵",
    description: "刀势恢复+20%，击杀后1秒刀势不衰减",
    feedback: "已获得：鼓阵，恢复更快，斩后不衰减",
    route: "ironWall",
    tier: 2,
    color: ROUTE_COLORS.ironWall
  },
  {
    id: "soulReturn",
    name: "魂返",
    shortName: "魂返",
    description: "首次HP归零时自动复活1HP，清退最近6名敌军",
    feedback: "已获得：魂返，死而复生，自动清退敌军",
    route: "ironWall",
    tier: 3,
    color: ROUTE_COLORS.ironWall
  }
];

export const RUN_BUFF_BY_ID = Object.fromEntries(RUN_BUFFS.map((buff) => [buff.id, buff])) as Record<
  BuffId,
  RunBuffConfig
>;

/** 获取某个buff所属路线 */
export function getBuffRoute(id: BuffId): TacticalRoute {
  return RUN_BUFF_BY_ID[id].route;
}

/** 获取某路线中玩家尚未拥有的下一个buff */
export function getNextBuffInRoute(route: TacticalRoute, owned: Set<BuffId>): BuffId | undefined {
  const routeBuffs = ROUTE_BUFFS[route];
  return routeBuffs.find((id) => !owned.has(id));
}
