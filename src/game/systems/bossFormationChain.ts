// ========================================================================
// S4: 断链破阵 — 核心类型与配置
// 树/图结构，非扁平节点数组
// ========================================================================

export interface Vec2 { x: number; y: number; }

// ---- 节点类型（3类） ----
export type ChainNodeType = "core" | "joint" | "threat";

export interface ChainNodeDef {
  id: string;
  type: ChainNodeType;
  /** 相对阵型原点的偏移 */
  position: Vec2;
  radius?: number; // 覆盖默认值
}

// ---- 边（连接）类型 ----
export type EdgeKind = "normal" | "energy" | "armor" | "boss_tether";

export interface EdgeDef {
  id: string;
  from: string;   // 父节点 ID
  to: string;     // 子节点 ID
  kind: EdgeKind;
}

// ---- 阵型模板（静态定义） ----
export interface ChainTemplate {
  id: string;
  name: string;
  /** 描边顶点（顺时针），用于绘制外轮廓 */
  hull: Vec2[];
  nodes: ChainNodeDef[];
  edges: EdgeDef[];
  /** 属于哪个教学阶段 */
  phase: 1 | 2 | 3;
}

// ---- 运行时节点 ----
export interface ChainRuntimeNode {
  id: string;
  type: ChainNodeType;
  worldX: number;
  worldY: number;
  radius: number;
  active: boolean;
  /** 距离防线的接近度 0-1，用于脉冲动画 */
  proximity: number;
}

// ---- 运行时边 ----
export interface ChainRuntimeEdge {
  id: string;
  fromId: string;
  toId: string;
  kind: EdgeKind;
  active: boolean;
}

// ---- 运行时阵型 ----
export interface FormationChainRuntime {
  id: string;
  templateId: string;
  originX: number;
  originY: number;
  velocityY: number;
  spawnedAt: number;
  hull: Vec2[];             // 描边顶点（已转为世界坐标）
  nodes: ChainRuntimeNode[];
  edges: ChainRuntimeEdge[];
  /** 父→子对高速查找 */
  nodeMap: Map<string, ChainRuntimeNode>;
  edgeMap: Map<string, ChainRuntimeEdge>;
  /** 下游关系树（父→子边列表），用于断链遍历 */
  childrenOf: Map<string, string[]>; // 父节点ID → 子节点ID[]
}

// ---- 交互事件 ----
export type ChainEventKind =
  | "threat_reached_defense"
  | "threat_destroyed"
  | "joint_broken"       // 蓝关节被斩 → 整条下游失效
  | "joint_casacde"       // 下游单个红刃失效（级联，无额外粒子）
  | "energy_gained"
  | "core_hit"
  | "core_reflected"
  | "armor_bounce"        // 甲链弹刀
  | "branch_detached"     // 整条分支脱落（视觉事件）

export interface ChainCollisionEvent {
  kind: ChainEventKind;
  nodeId: string;
  position: Vec2;
  /** 断链时被级联失效的节点ID列表 */
  cascadeIds?: string[];
}

// ---- 预览结果 ----
export interface ChainSlashPreview {
  /** 命中的节点 ID 列表 */
  hitNodeIds: string[];
  /** 预计将被级联失效的节点 ID 列表 */
  cascadeNodeIds: string[];
  /** 是否穿过甲链 */
  hitArmor: boolean;
  /** 一刀清几枚红刃（含级联） */
  totalThreatsCleared: number;
  /** 是否命中命核 */
  hitCore: boolean;
  /** 命核是否可反卷 */
  coreReady: boolean;
}

// ---- 快照 ----
export interface FormationChainSnapshot {
  elapsed: number;
  chains: FormationChainRuntime[];
  energy: number;
  hp: number;
  coreReady: boolean;
  windowType: "none" | "small" | "large";
  windowTimer: number;
  phase: 1 | 2 | 3;
}

// ================================================================
// 配置常量
// ================================================================

export const CHAIN_CONFIG = {
  designWidth: 390,
  designHeight: 844,

  // Boss 区域
  bossPos: { x: 195, y: 155 },

  // 阵型出生线
  spawnLineY: 290,

  // 防线
  defenseLineY: 690,

  // 玩家位置
  playerPos: { x: 195, y: 745 },

  // 节点半径（默认）
  nodeRadius: {
    core: 22,
    joint: 18,
    threat: 20,
  },

  // 刀势经济
  bladeEconomy: {
    initial: 35,
    slashCost: 8,
    threatDirectKill: 4,
    jointBreakGain: 20,
    multiThreatBonus: 8,
    coreThreshold: 70,
    postCoreEnergy: 25,
    armorBouncePenalty: 15,
    emptySwingPenalty: 8,
  },

  // HP
  playerMaxHp: 100,
  threatReachDamage: 8,
  armorBounceDamage: 0, // 甲链不直接扣HP，只扣刀势

  // 阵型时间
  chainInterval: 5.5,
  chainSpeed: 70,  // px/s
  maxChains: 2,
  totalDuration: 25,

  // 破绽
  windowSmallDuration: 0.7,
  windowLargeDuration: 1.4,

  // 阶段时间
  phase1End: 6,
  phase2End: 13,

  // 视觉
  hullColor: "rgba(60, 20, 80, 0.15)",
  hullBorderColor: "rgba(100, 60, 130, 0.35)",
  threatChainColor: "rgba(255, 60, 40, 0.5)",
  energyChainColor: "rgba(80, 160, 240, 0.55)",
  armorChainColor: "rgba(180, 20, 20, 0.6)",
  bossTetherColor: "rgba(255, 211, 90, 0.45)",
  bossTetherActiveColor: "rgba(255, 211, 90, 0.75)",
};
