/** 水墨敌人颜色映射 & 宣纸白底对比度 */
const MAP: Record<string, string> = {
  "#d8b46e": "#3D2A14", "#c58d4d": "#1A1816", "#9f3a24": "#C4282D",
  "#5d4a8f": "#1A1816", "#d48c2a": "#8B1A1A", "#b03a2e": "#C4282D",
  "#e67e22": "#1A1816", "#5dade2": "#1A1816",
};
export function toInkWashEnemyColor(c: string): string { return MAP[c] || c; }
