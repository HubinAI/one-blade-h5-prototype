// ========================================================================
// S3: 阵势压境 — 阵列配置
// ========================================================================
export type FormationNodeType = "threat" | "energy" | "counter" | "forbidden";

export interface Vec2 { x: number; y: number; }

export interface FormationNodeDef {
  id: string;
  type: FormationNodeType;
  /** 相对阵列原点的偏移 */
  offset: Vec2;
}

export interface FormationLinkDef {
  fromId: string;
  toId: string;
  kind: "threat_chain" | "boss_counter_link";
}

export interface FormationTemplate {
  id: string;
  name: string;
  nodes: FormationNodeDef[];
  links: FormationLinkDef[];
}

export interface FormationRuntimeNode {
  id: string;
  type: FormationNodeType;
  radius: number;
  worldX: number;
  worldY: number;
  active: boolean;
  /** 0-1 接近防线的程度，用于脉冲动画 */
  proximity: number;
}

export interface FormationRuntime {
  id: string;
  templateId: string;
  nodes: FormationRuntimeNode[];
  links: FormationLinkDef[];
  originY: number;    // 阵列顶部 y
  velocityY: number;
  spawnedAt: number;
  active: boolean;
}

export type FormationPhase = "intro" | "active" | "complete";

export const FORMATION_CONFIG = {
  /** 屏幕宽度（设计坐标） */
  designWidth: 390,
  designHeight: 844,

  /** Boss 区域 */
  bossZone: { yMin: 0, yMax: 230 },

  /** 阵列出生线 */
  spawnLine: 280,

  /** 玩家防线 */
  defenseLine: 690,

  /** 玩家位置 */
  playerPos: { x: 195, y: 745 },

  // ---- 节点视觉规范 ----
  nodeRadius: {
    threat: 22,
    energy: 16,
    counter: 20,
    forbidden: 24,
  },

  // ---- 刀势经济 ----
  bladeEconomy: {
    initial: 40,
    slashCost: 8,
    energyNodeGain: 20,
    multiHitBonus: [0, 5, 8],  // 第2/3枚额外加成
    counterThreshold: 70,
    postCounterEnergy: 25,
    forbiddenPenaltyHp: 0.08,
    forbiddenPenaltyEnergy: 20,
    threatReachHp: 0.08,
  },

  // ---- 阵列时间 ----
  formationInterval: 4.0,        // 新阵列生成间隔
  formationSpeed: 75,             // px/s 整体下压速度
  maxFormations: 2,
  totalDuration: 25,              // 原型总时长

  // ---- 破绽 ----
  windowSmallDuration: 0.7,
  windowLargeDuration: 1.4,

  // ---- 视觉 ----
  threatChainColor: "rgba(255,60,40,0.55)",
  counterLinkColor: "rgba(255,211,90,0.6)",
  forbiddenRingColor: "rgba(200,30,30,0.7)",
};
