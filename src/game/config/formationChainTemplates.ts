// ========================================================================
// S4: 断链破阵 — 阵型模板库
// ========================================================================
import type { ChainTemplate } from "../config/bossFormationChain";

/** 模板 A：双枝压阵（教学阵） */
const doubleBranch: ChainTemplate = {
  id: "double_branch",
  name: "双枝压阵",
  phase: 1,
  hull: [
    { x: -110, y: -20 }, { x: 110, y: -20 },
    { x: 110, y: 250 }, { x: -110, y: 250 },
  ],
  nodes: [
    { id: "joint_0", type: "joint", position: { x: -60, y: 60 } },
    { id: "threat_a", type: "threat", position: { x: -60, y: 180 } },
    { id: "threat_b", type: "threat", position: { x: 30, y: 160 } },
  ],
  edges: [
    { id: "e_jt_a", from: "joint_0", to: "threat_a", kind: "energy" },
    { id: "e_jt_b", from: "joint_0", to: "threat_b", kind: "normal" },
  ],
};

/** 模板 B：交叉锁阵（双分支 + 甲链阻断） */
const crossLock: ChainTemplate = {
  id: "cross_lock",
  name: "交叉锁阵",
  phase: 2,
  hull: [
    { x: -130, y: -20 }, { x: 130, y: -20 },
    { x: 130, y: 260 }, { x: -130, y: 260 },
  ],
  nodes: [
    // 左分支：蓝关节 → 红刃
    { id: "joint_l", type: "joint", position: { x: -90, y: 50 } },
    { id: "threat_l", type: "threat", position: { x: -90, y: 170 } },
    // 右分支：普通连接 → 红刃（甲链保护）
    { id: "joint_r", type: "joint", position: { x: 90, y: 70 } },
    { id: "threat_r", type: "threat", position: { x: 90, y: 180 } },
    // 甲链：横跨中间，阻挡直线路径
    { id: "threat_m", type: "threat", position: { x: 0, y: 200 } },
  ],
  edges: [
    // 左分支（可切）
    { id: "e_jl_tl", from: "joint_l", to: "threat_l", kind: "energy" },
    // 右分支
    { id: "e_jr_tr", from: "joint_r", to: "threat_r", kind: "normal" },
    // 甲链（不可切）：从右关节到中路威胁，横跨
    { id: "e_armor_0", from: "joint_r", to: "threat_m", kind: "armor" },
    { id: "e_armor_1", from: "threat_m", to: "threat_l", kind: "armor" },
  ],
};

/** 模板 C：重压全阵（命核 + 双分支 + 甲链 + 完整结构） */
const fullAssault: ChainTemplate = {
  id: "full_assault",
  name: "重压全阵",
  phase: 3,
  hull: [
    { x: -140, y: -40 }, { x: 140, y: -40 },
    { x: 140, y: 280 }, { x: -140, y: 280 },
  ],
  nodes: [
    // 命核（顶部中心）
    { id: "core_0", type: "core", position: { x: 0, y: 0 }, radius: 24 },
    // 左分支
    { id: "joint_l", type: "joint", position: { x: -80, y: 70 } },
    { id: "threat_la", type: "threat", position: { x: -100, y: 180 } },
    { id: "threat_lb", type: "threat", position: { x: -55, y: 190 } },
    // 右分支
    { id: "joint_r", type: "joint", position: { x: 80, y: 75 } },
    { id: "threat_ra", type: "threat", position: { x: 90, y: 180 } },
    // 甲链段：横跨
    { id: "threat_m", type: "threat", position: { x: 0, y: 150 } },
  ],
  edges: [
    // 命核 → 左/右关节
    { id: "e_c_jl", from: "core_0", to: "joint_l", kind: "boss_tether" },
    { id: "e_c_jr", from: "core_0", to: "joint_r", kind: "boss_tether" },
    // 左分支
    { id: "e_jl_la", from: "joint_l", to: "threat_la", kind: "energy" },
    { id: "e_jl_lb", from: "joint_l", to: "threat_lb", kind: "normal" },
    // 右分支
    { id: "e_jr_ra", from: "joint_r", to: "threat_ra", kind: "normal" },
    // 甲链
    { id: "e_armor_a", from: "joint_r", to: "threat_m", kind: "armor" },
    { id: "e_armor_b", from: "threat_m", to: "threat_lb", kind: "armor" },
  ],
};

// ================================================================
// 阶段映射
// ================================================================

export const PHASE_TEMPLATES: Record<number, ChainTemplate[]> = {
  1: [doubleBranch],
  2: [crossLock],
  3: [fullAssault],
};

/** 根据模板ID获取 */
export function getChainTemplateById(id: string): ChainTemplate | undefined {
  for (const phase of Object.values(PHASE_TEMPLATES)) {
    const found = phase.find(t => t.id === id);
    if (found) return found;
  }
  return undefined;
}

/** 根据阶段获取下一个模板 */
export function getChainTemplateByPhase(phase: number, seq: number): ChainTemplate | undefined {
  const templates = PHASE_TEMPLATES[phase];
  if (!templates || templates.length === 0) return undefined;
  return templates[seq % templates.length];
}
