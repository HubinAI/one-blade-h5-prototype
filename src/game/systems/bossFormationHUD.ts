// ========================================================================
// S3: 阵势压境 — HUD 绘制
// ========================================================================
import { FORMATION_CONFIG, type FormationRuntime, type FormationRuntimeNode, type FormationNodeType } from "../config/bossFormation";

const D_W = FORMATION_CONFIG.designWidth;
const D_H = FORMATION_CONFIG.designHeight;

/** 绘制 Boss 主体（上部） */
export function drawFormationBoss(ctx: CanvasRenderingContext2D, t: number, isWindup: boolean): void {
  const bx = 195, by = 155;
  ctx.save();
  ctx.translate(bx, by);

  // 剪影
  ctx.save();
  ctx.shadowColor = "rgba(60, 20, 80, 0.4)";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#0d0515";
  ctx.beginPath();
  ctx.roundRect(-30, -60, 60, 90, 8);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // 右肩/武器
  const swing = isWindup ? Math.sin(t * 12) * 4 : 0;
  ctx.save();
  ctx.translate(28, -30 + swing);
  ctx.fillStyle = "#2a1040";
  ctx.beginPath();
  ctx.roundRect(-8, -15, 22, 35, 5);
  ctx.fill();
  // 核心
  ctx.fillStyle = isWindup ? "rgba(255,180,40,0.6)" : "rgba(140,80,200,0.5)";
  ctx.beginPath();
  ctx.arc(4, -20, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();

  // Boss 区下边界细线
  ctx.strokeStyle = "rgba(100,60,130,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 230); ctx.lineTo(D_W, 230);
  ctx.stroke();
}

/** 绘制防线 */
export function drawDefenseLine(ctx: CanvasRenderingContext2D, t: number, danger: boolean): void {
  const dy = FORMATION_CONFIG.defenseLine;
  // 线
  ctx.strokeStyle = danger ? "rgba(255,50,30,0.5)" : "rgba(100,100,120,0.25)";
  ctx.lineWidth = danger ? 2 : 1;
  ctx.setLineDash(danger ? [8, 4] : [12, 8]);
  ctx.beginPath();
  ctx.moveTo(30, dy); ctx.lineTo(D_W - 30, dy);
  ctx.stroke();
  ctx.setLineDash([]);

  // 危险脉冲
  if (danger && Math.sin(t * 6) > 0) {
    ctx.fillStyle = "rgba(255,40,20,0.08)";
    ctx.fillRect(0, dy - 10, D_W, 20);
  }
}

/** 绘制单个节点 */
export function drawFormationNode(
  ctx: CanvasRenderingContext2D,
  node: FormationRuntimeNode,
  t: number,
  highlight: "none" | "hit" | "forbidden",
): void {
  const { worldX: x, worldY: y, radius: r, type, proximity } = node;
  ctx.save();
  ctx.translate(x, y);

  switch (type) {
    case "threat": {
      // 红色三角 → 向下
      const pulse = 1 + proximity * 0.3 * Math.sin(t * 5);
      const s = r * pulse;
      ctx.rotate(Math.PI);  // 箭头向下
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(-s * 0.75, s * 0.5);
      ctx.lineTo(s * 0.75, s * 0.5);
      ctx.closePath();
      ctx.fillStyle = highlight === "hit" ? "#ff2020" : `rgba(220,50,30,${0.7 + proximity * 0.2})`;
      ctx.fill();
      ctx.strokeStyle = "#ff4040";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 辉光
      if (proximity > 0.5) {
        ctx.shadowColor = "#ff2020";
        ctx.shadowBlur = 10 * (proximity - 0.5) * 2;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      break;
    }
    case "energy": {
      // 蓝色水滴
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = highlight === "hit" ? "#60c0ff" : "rgba(80,160,240,0.7)";
      ctx.fill();
      ctx.strokeStyle = "#80d0ff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 十字闪光
      ctx.strokeStyle = "rgba(180,220,255,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-r * 0.5, 0); ctx.lineTo(r * 0.5, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -r * 0.5); ctx.lineTo(0, r * 0.5); ctx.stroke();
      break;
    }
    case "counter": {
      // 金色菱形
      const pulse = 1 + 0.1 * Math.sin(t * 4);
      const s = r * pulse;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.7, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.7, 0);
      ctx.closePath();
      ctx.fillStyle = highlight === "hit" ? "#ffe060" : "rgba(255,200,40,0.7)";
      ctx.fill();
      ctx.strokeStyle = "#ffd35a";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowColor = "#ffd35a";
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
      break;
    }
    case "forbidden": {
      // 黑红尖刺环
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + t * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.strokeStyle = "rgba(180,20,20,0.7)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = "#1a0000";
      ctx.fill();
      ctx.strokeStyle = "rgba(200,30,30,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
      if (highlight === "forbidden") {
        ctx.beginPath();
        ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "#ff0000";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      break;
    }
  }

  ctx.restore();
}

/** 绘制关系线 */
export function drawFormationLinks(
  ctx: CanvasRenderingContext2D,
  fm: FormationRuntime,
  counterReady: boolean,
): void {
  for (const link of fm.links) {
    const fromN = fm.nodes.find(n => n.id === link.fromId && n.active);
    const toN = fm.nodes.find(n => n.id === link.toId && n.active);
    if (!fromN || !toN) continue;

    ctx.beginPath();
    ctx.moveTo(fromN.worldX, fromN.worldY);
    ctx.lineTo(toN.worldX, toN.worldY);

    if (link.kind === "threat_chain") {
      ctx.strokeStyle = FORMATION_CONFIG.threatChainColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
    } else {
      // counter link: 亮暗取决于刀势
      ctx.strokeStyle = counterReady
        ? "rgba(255,211,90,0.7)"
        : "rgba(180,140,60,0.3)";
      ctx.lineWidth = counterReady ? 2.5 : 1;
      ctx.setLineDash(counterReady ? [] : [4, 6]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** 绘制拖刀预览 */
export function drawSlashPreview(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  hitsForbidden: boolean,
): void {
  ctx.save();
  ctx.strokeStyle = hitsForbidden ? "rgba(255,40,40,0.6)" : "rgba(255,255,255,0.3)";
  ctx.lineWidth = hitsForbidden ? 2 : 1;
  ctx.setLineDash(hitsForbidden ? [4, 3] : [6, 4]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** 绘制所有活跃对象 */
export function drawAllFormations(
  ctx: CanvasRenderingContext2D,
  formations: FormationRuntime[],
  t: number,
  counterReady: boolean,
  previewHits: Set<string>,
  previewForbidden: boolean,
): void {
  // 先画关系线
  for (const fm of formations) {
    drawFormationLinks(ctx, fm, counterReady);
  }
  // 再画节点
  for (const fm of formations) {
    for (const node of fm.nodes) {
      if (!node.active) continue;
      const hl: "none" | "hit" | "forbidden" = previewForbidden && previewHits.has(node.id) && node.type === "forbidden"
        ? "forbidden"
        : previewHits.has(node.id) ? "hit" : "none";
      drawFormationNode(ctx, node, t, hl);
    }
  }
}
