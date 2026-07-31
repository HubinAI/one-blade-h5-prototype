/**
 * 国风水墨写意 颜色映射
 * V0805-ink-wash.p3 | feature/v0805-ink-wash
 *
 * 原版敌人颜色为暗色背景设计（暗棕/暗红/金黄），
 * 宣纸白底上对比度不足。本模块提供水墨适配映射。
 */

/** 敌人主色 → 水墨适配色（全部加深，保证 WCAG AA） */
const ENEMY_COLOR_MAP: Record<string, string> = {
  /** 步兵 #d8b46e → 暗檀木 #3D2A14 (contrast ~15:1 on paper) */
  "#d8b46e": "#3D2A14",
  /** 盾兵 #c58d4d → 墨 #1A1816 (contrast ~18:1) */
  "#c58d4d": "#1A1816",
  /** 火药兵 #9f3a24 → 朱红 #C4282D */
  "#9f3a24": "#C4282D",
  /** 阵眼兵 #5d4a8f → 墨 #1A1816 */
  "#5d4a8f": "#1A1816",
  /** 精英 #d48c2a → 朱红深 #8B1A1A */
  "#d48c2a": "#8B1A1A",
  /** Boss #b03a2e → 朱红 #C4282D */
  "#b03a2e": "#C4282D",
  /** 裂 #e67e22 → 墨 #1A1816 */
  "#e67e22": "#1A1816",
  /** 引 #5dade2 → 墨 #1A1816 */
  "#5dade2": "#1A1816",
};

export function toInkWashEnemyColor(baseColor: string): string {
  return ENEMY_COLOR_MAP[baseColor] || baseColor;
}

/** 宣纸白底的敌人文字阴影增强参数 */
export const INK_WASH_ENEMY_SHADOW = {
  color: "rgba(247, 243, 234, 0.92)",  /* 宣纸色描边（非暗影） */
  blur: 0,
  outlineWidth: 3,   /* Canvas stroke-based outline */
  outlineColor: "rgba(247, 243, 234, 0.88)",
} as const;
