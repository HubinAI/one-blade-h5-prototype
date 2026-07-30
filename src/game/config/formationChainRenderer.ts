// ========================================================================
// S4: formationChainRenderer — 断链破阵渲染
// ========================================================================
import { CHAIN_CONFIG, type FormationChainRuntime, type ChainRuntimeNode, type ChainRuntimeEdge } from "../config/bossFormationChain";

const D_W = CHAIN_CONFIG.designWidth;
const D_H = CHAIN_CONFIG.designHeight;

// ---- Boss 主体 ----
export function drawChainBoss(ctx: CanvasRenderingContext2D, t: number, isWindup: boolean): void {
  const bx = CHAIN_CONFIG.bossPos.x, by = CHAIN_CONFIG.bossPos.y;
  ctx.save();
  ctx.translate(bx, by);

  // 剪影
  ctx.save();
  ctx.shadowColor = "rgba(60, 20, 80, 0.4)";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#0d0515";
  ctx.beginPath();
  ctx.roundRect(-35, -55, 70, 85, 8);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // 右肩
  const swing = isWindup ? Math.sin(t * 10) * 3 : 0;
  ctx.save();
  ctx.translate(30, -20 + swing);
  ctx.fillStyle = "#2a1040";
  ctx.beginPath();
  ctx.roundRect(-10, -18, 24, 40, 5);
  ctx.fill();
  ctx.fillStyle = isWindup ? "rgba(255,180,40,0.5)" : "rgba(140,80,200,0.4)";
  ctx.beginPath();
  ctx.arc(8, -22, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();

  // Boss 区下边界
  ctx.strokeStyle = "rgba(100,60,130,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 210); ctx.lineTo(D_W, 210);
  ctx.stroke();
}

// ---- 防线 ----
export function drawChainDefenseLine(ctx: CanvasRenderingContext2D, t: number, danger: boolean): void {
  const dy = CHAIN_CONFIG.defenseLineY;
  ctx.strokeStyle = danger ? "rgba(255,50,30,0.45)" : "rgba(100,100,120,0.22)";
  ctx.lineWidth = danger ? 2 : 1;
  ctx.setLineDash(danger ? [8, 4] : [12, 8]);
  ctx.beginPath();
  ctx.moveTo(30, dy); ctx.lineTo(D_W - 30, dy);
  ctx.stroke();
  ctx.setLineDash([]);
  if (danger && Math.sin(t * 6) > 0) {
    ctx.fillStyle = "rgba(255,40,20,0.06)";
    ctx.fillRect(0, dy - 8, D_W, 16);
  }
}

// ---- 阵型外轮廓 ----
export function drawChainHull(ctx: CanvasRenderingContext2D, hull: { x: number; y: number }[], alpha: number): void {
  if (!hull || hull.length < 3) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(hull[0].x, hull[0].y);
  for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
  ctx.closePath();
  ctx.fillStyle = `rgba(60, 20, 80, ${0.12 * alpha})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(100, 60, 130, ${0.28 * alpha})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ---- 节点 ----
function drawChainNode(
  ctx: CanvasRenderingContext2D,
  node: ChainRuntimeNode,
  t: number,
  highlight: "none" | "hit" | "cascade" | "urgent",
): void {
  const { worldX: x, worldY: y, radius: r, type, proximity } = node;
  ctx.save();
  ctx.translate(x, y);

  const isUrgent = highlight === "urgent" || proximity > 0.7;

  switch (type) {
    case "core": {
      const pulse = 1 + 0.08 * Math.sin(t * 4);
      const s = r * pulse;
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, 0);
      ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, 0);
      ctx.closePath();
      ctx.fillStyle = highlight === "hit" ? "#ffe060" : "rgba(255,200,40,0.7)";
      ctx.fill();
      ctx.strokeStyle = "#ffd35a"; ctx.lineWidth = 2; ctx.stroke();
      ctx.shadowColor = "#ffd35a"; ctx.shadowBlur = highlight === "hit" ? 16 : 8;
      ctx.stroke(); ctx.shadowBlur = 0;
      break;
    }
    case "joint": {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = highlight === "hit" ? "#60c0ff" : "rgba(80,160,240,0.65)";
      ctx.fill();
      ctx.strokeStyle = highlight === "hit" ? "#a0e0ff" : "rgba(120,200,255,0.7)";
      ctx.lineWidth = 2; ctx.stroke();
      // 十字
      ctx.strokeStyle = "rgba(180,220,255,0.45)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-r * 0.4, 0); ctx.lineTo(r * 0.4, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -r * 0.4); ctx.lineTo(0, r * 0.4); ctx.stroke();
      break;
    }
    case "threat": {
      const pulse = 1 + proximity * 0.25 * Math.sin(t * 5);
      const s = r * pulse;
      ctx.rotate(Math.PI);
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.lineTo(-s * 0.75, s * 0.5); ctx.lineTo(s * 0.75, s * 0.5);
      ctx.closePath();
      ctx.fillStyle = isUrgent ? "rgba(255,30,15,0.9)" : "rgba(200,40,25,0.7)";
      ctx.fill();
      ctx.strokeStyle = isUrgent ? "#ff2020" : "#ff4040";
      ctx.lineWidth = urgencyWidth(proximity);
      ctx.stroke();
      if (isUrgent) {
        ctx.shadowColor = "#ff2020"; ctx.shadowBlur = 10 * proximity;
        ctx.fill(); ctx.shadowBlur = 0;
      }
      if (highlight === "cascade") {
        // 级联失效标记：白框
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 3; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
        ctx.stroke(); ctx.setLineDash([]);
      }
      break;
    }
  }

  ctx.restore();
}

function urgencyWidth(proximity: number): number {
  if (proximity > 0.85) return 3;
  if (proximity > 0.5) return 2.5;
  return 1.5;
}

// ---- 边 ----
function drawChainEdge(
  ctx: CanvasRenderingContext2D,
  edge: ChainRuntimeEdge,
  fromNode: ChainRuntimeNode | undefined,
  toNode: ChainRuntimeNode | undefined,
  coreReady: boolean,
  previewCrossing: boolean,
): void {
  if (!fromNode || !toNode || !fromNode.active || !toNode.active) return;
  const fx = fromNode.worldX, fy = fromNode.worldY;
  const tx = toNode.worldX, ty = toNode.worldY;

  ctx.save();
  let color: string, width: number, dashed: boolean;

  switch (edge.kind) {
    case "boss_tether":
      color = coreReady ? CHAIN_CONFIG.bossTetherActiveColor : CHAIN_CONFIG.bossTetherColor;
      width = coreReady ? 4 : 2;
      dashed = !coreReady;
      break;
    case "energy":
      color = CHAIN_CONFIG.energyChainColor;
      width = 3;
      dashed = false;
      break;
    case "armor":
      color = CHAIN_CONFIG.armorChainColor;
      width = previewCrossing ? 6 : 4;
      dashed = false;
      ctx.shadowColor = "rgba(255,20,20,0.3)";
      ctx.shadowBlur = previewCrossing ? 10 : 4;
      break;
    default: // normal
      color = CHAIN_CONFIG.threatChainColor;
      width = 2;
      dashed = false;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dashed) ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ================================================================
// 主绘制函数
// ================================================================

export function drawAllFormationChains(
  ctx: CanvasRenderingContext2D,
  chains: FormationChainRuntime[],
  t: number,
  coreReady: boolean,
  previewInfo: { hitNodeIds: Set<string>; cascadeIds: Set<string>; hitArmor: boolean; hitCore: boolean },
): void {
  // 第一遍：外轮廓 + 边
  for (let ci = 0; ci < chains.length; ci++) {
    const chain = chains[ci];
    const alpha = ci === 0 ? 1.0 : 0.65; // 旧阵略透明
    drawChainHull(ctx, chain.hull, alpha);

    for (const edge of chain.edges) {
      if (!edge.active) continue;
      const fromN = chain.nodeMap.get(edge.fromId);
      const toN = chain.nodeMap.get(edge.toId);
      const crossing = previewInfo.hitArmor && edge.kind === "armor";
      drawChainEdge(ctx, edge, fromN, toN, coreReady, crossing);
    }
  }

  // 第二遍：节点（按紧急度排序——红刃优先）
  for (const chain of chains) {
    const sorted = [...chain.nodes].sort((a, b) => {
      if (a.type === "threat" && b.type !== "threat") return -1;
      if (a.type !== "threat" && b.type === "threat") return 1;
      return b.proximity - a.proximity;
    });

    for (const node of sorted) {
      if (!node.active) continue;
      let hl: "none" | "hit" | "cascade" | "urgent" = "none";
      if (previewInfo.cascadeIds.has(node.id)) hl = "cascade";
      else if (previewInfo.hitNodeIds.has(node.id)) hl = "hit";
      else if (node.type === "threat" && node.proximity > 0.7) hl = "urgent";
      drawChainNode(ctx, node, t, hl);
    }
  }
}

// ---- 挥刀预览（下游高亮） ----
export function drawChainSlashPreview(
  ctx: CanvasRenderingContext2D,
  a: Vec2, b: Vec2,
  preview: { hitNodeIds: Set<string>; cascadeIds: Set<string>; hitArmor: boolean; hitCore: boolean },
): void {
  ctx.save();
  const color = preview.hitArmor ? "rgba(255,40,40,0.55)" : "rgba(255,255,255,0.3)";
  ctx.strokeStyle = color;
  ctx.lineWidth = preview.hitArmor ? 2 : 1;
  ctx.setLineDash(preview.hitArmor ? [4, 3] : [6, 4]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

type Vec2 = { x: number; y: number };
