// ========================================================================
// Boss V1: BossChaseHUD — 渲染
// ========================================================================
import { CHASE_CONFIG, type BarrageProjectile, type MomentumTier } from "../config/bossChase";
import type { ChaseSnapshot } from "./BossChaseController";
import { DESIGN_WIDTH } from "../config/constants";

const D_W = CHASE_CONFIG.designWidth;
const D_H = CHASE_CONFIG.designHeight;

// ---- 弹幕命中碎片池 ----
export interface BarrageHitVfx {
  x: number; y: number; t: number;
  angle: number;     // 挥刀角度（切割方向）
  life: number;      // 剩余寿命 0-1
}
let _barrageHitVfx: BarrageHitVfx[] = [];
export function pushBarrageHitVfx(x: number, y: number, angle: number): void {
  _barrageHitVfx.push({ x, y, t: performance.now() / 1000, angle, life: 1 });
}
export function clearBarrageHitVfx(): void { _barrageHitVfx = []; }
export function updateBarrageVfx(dt: number): void {
  for (const v of _barrageHitVfx) v.life -= dt / 0.4;
  _barrageHitVfx = _barrageHitVfx.filter(v => v.life > 0);
}

export function drawChaseMode(ctx: CanvasRenderingContext2D, snap: ChaseSnapshot, t: number, prevPositions: {x:number;y:number}[]): void {
  drawBackground(ctx, snap);
  if (!snap.showUI) drawIntro(ctx, snap, t);
  else drawBattle(ctx, snap, t, prevPositions);
}

// ======== 背景 ========
function drawBackground(ctx: CanvasRenderingContext2D, snap: ChaseSnapshot): void {
  const bg = ctx.createLinearGradient(0,0,0,D_H);
  if (snap.phase2Active) { bg.addColorStop(0,"#0a0212"); bg.addColorStop(0.4,"#140820"); bg.addColorStop(0.7,"#0c0c18"); bg.addColorStop(1,"#080818"); }
  else { bg.addColorStop(0,"#0a0612"); bg.addColorStop(0.4,"#100b1e"); bg.addColorStop(0.7,"#0e0c16"); bg.addColorStop(1,"#08080e"); }
  ctx.fillStyle=bg; ctx.fillRect(0,0,D_W,D_H);
  if (snap.phase2Active && Math.sin(snap.elapsed*3)>0.5) { ctx.fillStyle="rgba(60,10,10,0.06)"; ctx.fillRect(0,0,D_W,D_H); }
}

// ======== 开场 ========
function drawIntro(ctx: CanvasRenderingContext2D, snap: ChaseSnapshot, t: number): void {
  const s=snap.state, x=snap.bossX, y=snap.bossY;
  if (s==="intro_drop") drawBossBody(ctx,x,y,t,false,true);
  else if (s==="intro_breathe") {
    const sc=1+0.06*Math.sin(t*8); ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc); ctx.translate(-x,-y);
    drawBossBody(ctx,x,y,t,false,false); ctx.restore();
    ctx.save(); ctx.globalAlpha=0.25; ctx.translate(x,y); ctx.scale(1.1,1.1); ctx.translate(-x,-y);
    drawBossBody(ctx,x,y,t,false,false); ctx.globalAlpha=1; ctx.restore();
  } else if (s==="intro_skill_demo") {
    for (let i=1;i<=3;i++) { ctx.save(); ctx.globalAlpha=0.15/i; drawBossBody(ctx,x+Math.sin(t*3)*10*i,y+i*3,t,false,false); ctx.restore(); }
    drawBossBody(ctx,x,y,t,false,false);
  } else drawBossBody(ctx,x,y,t,false,false);
  if (s==="intro_stamp_title"&&snap.showTitle) drawStampTitle(ctx,snap);

  // 降落特效
  if (s==="intro_drop"&&snap.introDropProgress>=0.9) {
    for (let i=0;i<8;i++) { const a=Math.random()*Math.PI*2,d=15+Math.random()*40;
      ctx.fillStyle=`rgba(80,20,120,${0.3*(1-snap.introDropProgress)})`;
      ctx.beginPath(); ctx.arc(195+Math.cos(a)*d,CHASE_CONFIG.intro.dropEndY+Math.sin(a)*d,3+Math.random()*5,0,Math.PI*2); ctx.fill(); }
  }
}

function drawStampTitle(ctx: CanvasRenderingContext2D, snap: ChaseSnapshot): void {
  const text=snap.showTitle;
  const chars=Math.min(Math.floor(snap.titleProgress*text.length)+1,text.length);
  const totalW=chars*36, startX=D_W/2-totalW/2, y=200;
  for (let i=0;i<chars;i++) {
    const x=startX+i*36, cp=snap.titleProgress*text.length-i;
    const scale=cp<0.2?1.8-(cp/0.2)*0.8:1.0, alpha=Math.min(1,cp*5);
    ctx.save(); ctx.translate(x+18,y); ctx.scale(scale,scale);
    ctx.fillStyle=`rgba(255,211,90,${alpha})`; ctx.font='bold 32px "Microsoft YaHei",sans-serif';
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.shadowColor="rgba(255,211,90,0.5)"; ctx.shadowBlur=12; ctx.fillText(text[i],0,0); ctx.restore();
  }
}

// ======== 战斗 ========
function drawBattle(ctx: CanvasRenderingContext2D, snap: ChaseSnapshot, t: number, prevPositions: {x:number;y:number}[]): void {
  const bx=snap.bossX, by=snap.bossY;

  // 闪现前摇—目的地预告（在 teleport_hidden/windup 状态显示残影轮廓）
  if (snap.action==="teleport_hidden"||snap.action==="teleport_windup") drawTeleportPreview(ctx,bx,by,t);

  // 残影轨迹（最淡，避免多 Boss 形象误读）
  for (let i=prevPositions.length-1;i>=0;i--) {
    const pp=prevPositions[i];
    ctx.save(); ctx.globalAlpha=0.025+0.015*(i/Math.max(1,prevPositions.length));
    drawBossBody(ctx,pp.x,pp.y,t,false,false); ctx.restore();
  }

  // Boss 主体（转场期呼吸缩放）
  if (snap.trans30Phase >= 1 && snap.trans30Phase <= 2) {
    const sc = snap.trans30Phase === 1 ? (1 + 0.25 * Math.sin(snap.elapsed * 18)) : (0.88 + 0.28 * Math.sin((snap.elapsed - 0.16) * 14));
    ctx.save(); ctx.translate(bx, by); ctx.scale(sc, sc); ctx.translate(-bx, -by);
    drawBossBody(ctx, bx, by, t, snap.coreExposed, snap.invincible, snap.coreHitInWindow);
    ctx.restore();
  } else {
    drawBossBody(ctx, bx, by, t, snap.coreExposed, snap.invincible, snap.coreHitInWindow);
  }

  // 弹幕
  for (const p of snap.barrages) drawBarrageProjectile(ctx,p,t);

  // 弹幕破坏特效
  drawBarrageDestructionVfx(ctx, t);

  // 防线已统一至 drawDefenseAndWarrior（Game.ts），不在此重复绘制
  // 弹幕碰撞判定仍使用 CHASE_CONFIG.playerDefenseLineY

  // Boss HP 条
  drawBossHpBar(ctx,snap);

  // FSM 诊断面板（debug=1 时显示）
  drawFsmDiagnostics(ctx, snap, t);
}

const _fsmDiagFont = "10px monospace";
function drawFsmDiagnostics(ctx: CanvasRenderingContext2D, snap: ChaseSnapshot, _t: number): void {
  const usp = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  if (!usp || usp.get("debug") !== "1") return;
  const x = DESIGN_WIDTH / 2 - 90, y0 = 38;
  ctx.save(); ctx.font = _fsmDiagFont; ctx.fillStyle = "rgba(255,255,255,0.85)";
  const lines = [
    `state:${snap.state} sub:${snap.phase2Sub || "-"}`,
    `timer:${snap.actionTimer.toFixed(2)} hp:${snap.bossHp}/${snap.bossMaxHp}`,
    `inv:${snap.invincible} core:${snap.coreExposed} tSeq:${snap.teleportSeq}`,
    `cyId:${snap.phase2CycleId} cyRun:${snap.phase2CycleRunning}`,
    `wDog:${snap.watchdogTimeoutCount} bars:${snap.barrages.length}`,
    `dsLine:${snap.defenseLineY}`,
    `anchor:${snap.selectedAnchorId || "-"} target:${snap.recoveryTarget.x.toFixed(0)},${snap.recoveryTarget.y.toFixed(0)}`,
  ];
  lines.forEach((l, i) => ctx.fillText(l, x, y0 + i * 13));
  ctx.restore();
}

// ======== Boss 身体（V3升级版：碰撞半径75 + 基础1.35x体量 + 呼吸悬浮） ========
function drawBossBody(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, coreExposed: boolean, invincible: boolean, coreHit: boolean = false): void {
  ctx.save(); ctx.translate(x, y);
  const alpha = invincible ? 0.4 : 0.95;
  // 基础体量放大（匹配碰撞半径75）
  ctx.scale(1.35, 1.35);
  // 呼吸/悬浮动画
  const bobY = Math.sin(t * 2.8) * 3;
  const breatheScale = 1 + Math.sin(t * 3.5) * 0.03;
  ctx.translate(0, bobY);
  ctx.scale(breatheScale, breatheScale);

  // === 外围辉光 ===
  ctx.strokeStyle = `rgba(150, 90, 220, ${alpha * 0.45})`;
  ctx.lineWidth = 4;
  ctx.shadowColor = `rgba(100, 40, 180, ${alpha * 0.35})`;
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.roundRect(-52, -75, 104, 118, 14);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // === 主体剪影（深色大块） ===
  ctx.fillStyle = `rgba(18, 5, 32, ${alpha})`;
  ctx.shadowColor = `rgba(40, 12, 60, ${alpha * 0.4})`;
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.roundRect(-48, -72, 96, 112, 12);
  ctx.fill();
  ctx.shadowBlur = 0;

  // === 头部/面部区域 ===
  ctx.fillStyle = `rgba(42, 16, 68, ${alpha})`;
  ctx.beginPath();
  ctx.roundRect(-32, -72, 64, 30, 8);
  ctx.fill();
  // 眼窝
  ctx.fillStyle = `rgba(10, 3, 20, ${alpha})`;
  ctx.beginPath(); ctx.ellipse(-10, -56, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(10, -56, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
  // 眼睛（红光）
  if (!invincible) {
    ctx.fillStyle = coreExposed ? "rgba(255, 100, 40, 0.9)" : "rgba(200, 50, 30, 0.55)";
    ctx.shadowColor = coreExposed ? "rgba(255, 80, 20, 0.6)" : "rgba(0,0,0,0)";
    ctx.shadowBlur = coreExposed ? 6 : 0;
    ctx.beginPath(); ctx.arc(-10, -56, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(10, -56, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  // 角饰（头盔顶部尖角）
  ctx.fillStyle = `rgba(55, 22, 85, ${alpha})`;
  ctx.beginPath(); ctx.moveTo(-6, -72); ctx.lineTo(6, -72); ctx.lineTo(0, -82); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-38, -66); ctx.lineTo(-26, -68); ctx.lineTo(-34, -80); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(38, -66); ctx.lineTo(26, -68); ctx.lineTo(34, -80); ctx.closePath(); ctx.fill();

  // === 肩甲（左右对称 + 轻微非对称细节） ===
  // 左肩
  ctx.fillStyle = `rgba(38, 14, 62, ${alpha})`;
  ctx.beginPath();
  ctx.roundRect(-58, -42, 20, 48, 7);
  ctx.fill();
  ctx.strokeStyle = `rgba(120, 70, 180, ${alpha * 0.4})`;
  ctx.lineWidth = 2;
  ctx.stroke();
  // 右肩（更大/带尖刺）
  ctx.fillStyle = `rgba(42, 16, 68, ${alpha})`;
  ctx.beginPath();
  ctx.roundRect(38, -44, 22, 52, 8);
  ctx.fill();
  ctx.strokeStyle = `rgba(130, 75, 190, ${alpha * 0.45})`;
  ctx.lineWidth = 2;
  ctx.stroke();
  // 右肩尖刺
  ctx.fillStyle = `rgba(60, 20, 90, ${alpha})`;
  ctx.beginPath(); ctx.moveTo(58, -40); ctx.lineTo(68, -50); ctx.lineTo(55, -35); ctx.closePath(); ctx.fill();

  // === 胸部装甲板（核心镶嵌结构） ===
  ctx.fillStyle = `rgba(30, 12, 55, ${alpha})`;
  ctx.beginPath();
  ctx.roundRect(-22, -12, 44, 48, 6);
  ctx.fill();
  ctx.strokeStyle = `rgba(140, 80, 200, ${alpha * 0.55})`;
  ctx.lineWidth = 2;
  ctx.stroke();
  // 装甲板棱线
  ctx.strokeStyle = `rgba(160, 100, 210, ${alpha * 0.3})`;
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(-22, 8); ctx.lineTo(22, 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-12, -12); ctx.lineTo(-12, 36); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(12, -12); ctx.lineTo(12, 36); ctx.stroke();

  // === 核心（胸口中央，嵌入装甲板内） ===
  if (coreExposed) {
    const pulse = 1 + 0.2 * Math.sin(t * 11);
    const hitDim = coreHit ? 0.45 : 1.0;  // 命中后核心变暗
    // 核心外圈
    ctx.strokeStyle = `rgba(200, 160, 40, ${alpha * 0.5 * hitDim})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 8, 17 * pulse, 0, Math.PI * 2); ctx.stroke();
    // 核心本体（命中后变暗）
    ctx.fillStyle = invincible ? "rgba(80, 40, 60, 0.5)" : `rgba(255, 210, 40, ${0.92 * hitDim})`;
    ctx.shadowColor = invincible ? "rgba(0,0,0,0)" : `rgba(255, 200, 40, ${0.8 * hitDim})`;
    ctx.shadowBlur = invincible ? 0 : 18 * pulse * hitDim;
    ctx.beginPath(); ctx.arc(0, 8, 11 * pulse, 0, Math.PI * 2); ctx.fill();
    // 核心内亮点
    if (!invincible && !coreHit) {
      ctx.fillStyle = "rgba(255, 245, 200, 0.8)";
      ctx.beginPath(); ctx.arc(0, 8, 4.5, 0, Math.PI * 2); ctx.fill();
    }
    // 呼吸环
    ctx.strokeStyle = `rgba(255, 200, 40, ${(0.25 + 0.15 * Math.sin(t * 8)) * pulse * hitDim})`;
    ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.arc(0, 8, 21 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  } else {
    // 休眠核心
    ctx.fillStyle = invincible ? "rgba(35, 18, 28, 0.45)" : "rgba(65, 35, 85, 0.55)";
    ctx.beginPath(); ctx.arc(0, 8, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(100, 55, 130, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 8, 10, 0, Math.PI * 2); ctx.stroke();
  }

  // === 裙甲（下半身装甲板） ===
  ctx.fillStyle = `rgba(28, 10, 50, ${alpha})`;
  ctx.beginPath();
  ctx.moveTo(-34, 36);
  ctx.lineTo(-40, 48);
  ctx.lineTo(-28, 44);
  ctx.lineTo(28, 44);
  ctx.lineTo(40, 48);
  ctx.lineTo(34, 36);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawTeleportPreview(ctx: CanvasRenderingContext2D, bx:number,by:number,t:number): void {
  const alpha=0.12+0.1*Math.sin(t*14);
  ctx.save(); ctx.translate(bx, by);
  ctx.scale(1.35, 1.35);  // 匹配 Boss 体量
  ctx.strokeStyle=`rgba(180,140,255,${alpha})`; ctx.lineWidth=2; ctx.setLineDash([6,4]);
  ctx.shadowColor=`rgba(140,100,220,${alpha})`; ctx.shadowBlur=10;
  ctx.beginPath(); ctx.roundRect(-52,-75,104,118,14); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur=0; ctx.restore();
}

// ======== 弹幕（雷核轮廓 + 拖尾 + 脉冲） ========
function drawBarrageProjectile(ctx: CanvasRenderingContext2D, p: BarrageProjectile, t: number): void {
  if (!p.active) return;
  ctx.save(); ctx.translate(p.x, p.y);
  const pulse = 1 + 0.08 * Math.sin(t * 7 + p.x + p.y);

  // 拖尾
  ctx.fillStyle = "rgba(160, 60, 220, 0.15)";
  ctx.beginPath(); ctx.arc(0, 4, p.radius * 1.2, 0, Math.PI * 2); ctx.fill();

  // 外轮廓
  ctx.strokeStyle = "rgba(200, 140, 255, 0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, p.radius * pulse, 0, Math.PI * 2);
  ctx.stroke();

  // 雷核
  const coreR = p.radius * 0.45 * pulse;
  ctx.fillStyle = "rgba(220, 160, 255, 0.8)";
  ctx.shadowColor = "rgba(200, 100, 255, 0.5)";
  ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(0, 0, coreR, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // 表面裂纹
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(-coreR * 0.5, -coreR * 0.3); ctx.lineTo(coreR * 0.2, coreR * 0.4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(coreR * 0.4, -coreR * 0.2); ctx.lineTo(-coreR * 0.1, coreR * 0.3); ctx.stroke();

  ctx.restore();
}

// ======== 弹幕破坏特效 ========
function drawBarrageDestructionVfx(ctx: CanvasRenderingContext2D, t: number): void {
  for (const v of _barrageHitVfx) {
    const life = v.life;
    if (life <= 0) continue;
    ctx.save(); ctx.translate(v.x, v.y);

    // === 0. 起始闪光圆（半径快速收缩） ===
    if (life > 0.7) {
      const flash = (life - 0.7) / 0.3;
      const r = 28 * (1 - flash) + 12;
      ctx.fillStyle = `rgba(255, 230, 150, ${flash * 0.7})`;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    }

    // === 1. 切裂线（沿刀路方向发散） ===
    ctx.strokeStyle = `rgba(255, 240, 180, ${life * 0.85})`;
    ctx.lineWidth = 3 * life;
    ctx.beginPath();
    ctx.moveTo(-Math.cos(v.angle) * 24 * (1 - life), -Math.sin(v.angle) * 24 * (1 - life));
    ctx.lineTo(Math.cos(v.angle) * 28, Math.sin(v.angle) * 28);
    ctx.stroke();

    // === 2. 两半主体碎片（更大 + 拖尾） ===
    const spread = 14 * (1 - life);
    for (let side = -1; side <= 1; side += 2) {
      const sx = Math.cos(v.angle + side * 0.45) * spread;
      const sy = Math.sin(v.angle + side * 0.45) * spread + 10 * (1 - life);
      // 拖尾
      const tx = sx - Math.cos(v.angle + side * 0.45) * 6;
      const ty = sy - Math.sin(v.angle + side * 0.45) * 6;
      ctx.strokeStyle = `rgba(200, 100, 255, ${life * 0.4})`;
      ctx.lineWidth = 7 * life;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(sx, sy); ctx.stroke();
      // 主体
      ctx.fillStyle = `rgba(220, 150, 255, ${life * 0.9})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 9 * life, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 220, 180, ${life * 0.7})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // === 3. 小碎屑（4~8 颗） ===
    for (let i = 0; i < 6; i++) {
      const da = i * Math.PI / 3 + v.angle;
      const d = 18 * (1 - life) + i * 4;
      ctx.fillStyle = `rgba(220, 180, 255, ${life * 0.6})`;
      ctx.beginPath();
      ctx.arc(Math.cos(da) * d, Math.sin(da) * d, 2.5 * life, 0, Math.PI * 2);
      ctx.fill();
    }

    // === 4. 墨粒/电弧（8~15 个，更分散） ===
    for (let i = 0; i < 12; i++) {
      const da = (i / 12) * Math.PI * 2 + v.angle;
      const d = 26 * (1 - life + 0.2 * i);
      ctx.fillStyle = `rgba(180, 80, 255, ${life * 0.45})`;
      ctx.fillRect(Math.cos(da) * d, Math.sin(da) * d, 2.5, 2.5);
    }

    // === 5. 环形冲击波 ===
    if (life > 0.5) {
      const ringR = 40 * (1 - (life - 0.5) / 0.5);
      ctx.strokeStyle = `rgba(255, 200, 100, ${(life - 0.5) * 1.2})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, ringR, 0, Math.PI * 2); ctx.stroke();
    }

    ctx.restore();
  }
}

// ======== 玩家防线（能量壁垒 + 阶段预警） ========
function drawDefenseLine(ctx: CanvasRenderingContext2D, t: number, phase2Active: boolean): void {
  const ly = CHASE_CONFIG.playerDefenseLineY;
  const pulse = 1 + Math.sin(t * 5) * 0.06;
  const warnColor = phase2Active ? "#ff4a3a" : "#5b8def";
  const warnAlpha = phase2Active ? 0.55 : 0.3;
  ctx.save();

  // 外层辉光（阶段预警变色）
  ctx.shadowColor = warnColor;
  ctx.shadowBlur = phase2Active ? 18 * pulse : 10 * pulse;
  ctx.strokeStyle = `rgba(255, 100, 80, ${warnAlpha * 0.6 * pulse})`;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(30, ly); ctx.lineTo(DESIGN_WIDTH - 30, ly);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 主线（能量边界，内实外虚）
  ctx.strokeStyle = `rgba(255, 220, 160, ${warnAlpha * pulse})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([16, 6]);
  ctx.beginPath(); ctx.moveTo(40, ly); ctx.lineTo(DESIGN_WIDTH - 40, ly);
  ctx.stroke();
  ctx.setLineDash([]);

  // 内发光带（电容脉冲）
  const lp = (t * 120) % (DESIGN_WIDTH - 80);
  for (let i = 0; i < 5; i++) {
    const cx = 40 + lp + i * ((DESIGN_WIDTH - 80) / 6);
    const bx = wrapClamp(cx, 40, DESIGN_WIDTH - 40);
    const alpha = 0.12 + 0.06 * Math.sin(t * 8 + i * 1.2);
    ctx.fillStyle = `rgba(${phase2Active ? "255,100,60" : "140,180,255"}, ${alpha})`;
    ctx.beginPath(); ctx.arc(bx, ly, 5, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
}

function wrapClamp(v: number, min: number, max: number): number {
  const r = max - min;
  return min + ((v - min) % r + r) % r;
}

// ======== Boss HP ========
function drawBossHpBar(ctx: CanvasRenderingContext2D, snap: ChaseSnapshot): void {
  const x=60, y=16, w=270, h=14, ratio=snap.bossHp/snap.bossMaxHp;
  ctx.fillStyle="rgba(0,0,0,0.6)"; ctx.beginPath(); ctx.roundRect(x-2,y-2,w+4,h+4,4); ctx.fill();
  const hpColor=snap.phase2Active?"#ff4a3a":"#9b59b6";
  ctx.fillStyle=hpColor; if(ratio>0){ctx.beginPath();ctx.roundRect(x,y,w*Math.max(.01,ratio),h,3);ctx.fill();}
  // 30%节点
  const nx=x+w*0.3;
  ctx.strokeStyle=snap.bossHp<=snap.bossMaxHp*.3?"#ff2020":"rgba(255,80,80,0.4)"; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(nx,y-3); ctx.lineTo(nx,y+h+3); ctx.stroke();
  ctx.fillStyle="#d7bde2"; ctx.font='10px "Microsoft YaHei",sans-serif'; ctx.textAlign="center";
  ctx.fillText(`追影雷将  ${snap.bossHp}/${snap.bossMaxHp}`,x+w/2,y-6);
}

