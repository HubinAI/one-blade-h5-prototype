// ========================================================================
// S3: 阵势压境 — 阵列模板库
// ========================================================================
import type { FormationTemplate } from "../config/bossFormation";

/** 斜压阵：红色在下、蓝色与禁斩居中、金色在上 */
const diagonalPressure: FormationTemplate = {
  id: "diagonal_pressure",
  name: "斜压阵",
  nodes: [
    { id: "threat_a", type: "threat", offset: { x: -55, y: 120 } },
    { id: "threat_b", type: "threat", offset: { x: 55, y: 130 } },
    { id: "forbidden_0", type: "forbidden", offset: { x: 10, y: 60 } },
    { id: "energy_0", type: "energy", offset: { x: -65, y: 45 } },
    { id: "counter_0", type: "counter", offset: { x: -20, y: -10 } },
  ],
  links: [
    { fromId: "threat_a", toId: "threat_b", kind: "threat_chain" },
    { fromId: "counter_0", toId: "threat_a", kind: "boss_counter_link" },
    { fromId: "counter_0", toId: "threat_b", kind: "boss_counter_link" },
  ],
};

/** 夹击阵：两侧红色夹击中间金色+蓝色 */
const pincer: FormationTemplate = {
  id: "pincer",
  name: "夹击阵",
  nodes: [
    { id: "threat_a", type: "threat", offset: { x: -90, y: 130 } },
    { id: "threat_b", type: "threat", offset: { x: 90, y: 130 } },
    { id: "forbidden_0", type: "forbidden", offset: { x: 0, y: 80 } },
    { id: "counter_0", type: "counter", offset: { x: 0, y: 30 } },
    { id: "energy_0", type: "energy", offset: { x: -30, y: 10 } },
  ],
  links: [
    { fromId: "threat_a", toId: "threat_b", kind: "threat_chain" },
    { fromId: "counter_0", toId: "threat_a", kind: "boss_counter_link" },
    { fromId: "counter_0", toId: "threat_b", kind: "boss_counter_link" },
  ],
};

/** 重压阵：三红一线，高压 */
const heavyPressure: FormationTemplate = {
  id: "heavy_pressure",
  name: "重压阵",
  nodes: [
    { id: "threat_a", type: "threat", offset: { x: -80, y: 140 } },
    { id: "threat_b", type: "threat", offset: { x: 0, y: 150 } },
    { id: "threat_c", type: "threat", offset: { x: 80, y: 140 } },
    { id: "forbidden_0", type: "forbidden", offset: { x: 0, y: 70 } },
    { id: "counter_0", type: "counter", offset: { x: 0, y: 0 } },
    { id: "energy_0", type: "energy", offset: { x: 50, y: 5 } },
  ],
  links: [
    { fromId: "threat_a", toId: "threat_b", kind: "threat_chain" },
    { fromId: "threat_b", toId: "threat_c", kind: "threat_chain" },
    { fromId: "counter_0", toId: "threat_a", kind: "boss_counter_link" },
  ],
};

export const FORMATION_TEMPLATES: FormationTemplate[] = [
  diagonalPressure,
  pincer,
  heavyPressure,
];

export function getTemplateById(id: string): FormationTemplate | undefined {
  return FORMATION_TEMPLATES.find(t => t.id === id);
}
