import re
text = open("src/game/Game.ts","r",encoding="utf-8").read()

# ─── 1. Replace scorch trail struct + add draft ───
old_struct = '''  /** V0731011: 燎原百斩 — 火痕留场 */
  private _scorchTrails: { points: { x: number; y: number }[]; life: number; maxLife: number;
    damageSnapshot: PlayerRunStats; parentId: string; parentTrail: SlashTrail;
    igniteEnd: number; stableEnd: number; visualNodes: { x: number; y: number; seed: number; h: number; w: number; gap: number; lean: number }[] }[] = [];
  '''.rstrip() + '\n'

new_struct = '''  /** V0731011: 燎原百斩 — 火痕段式留场 + 草稿 */
  private _scorchTrails: { points: {x:number;y:number}[]; life: number; maxLife: number;
    damageSnapshot: PlayerRunStats; parentId: string; parentTrail: SlashTrail }[] = [];
  private _scorchDraft: { points: {x:number;y:number}[]; damageSnapshot: PlayerRunStats;
    parentTrail: SlashTrail; active: boolean } | null = null;
  '''.rstrip() + '\n'

text = text.replace(old_struct, new_struct)

# ─── 2. Delete endSlash scorch push ───
old_end = '''    // V0731011: 燎原百斩 — 刀路留下火痕
    if (this._activeEdicts.some(e => e.id === "scorch") && trail.points.length >= 2) {
      this._scorchTrails.push({
        points: trail.points.map(p => ({ x: p.x, y: p.y })),
        life: 1.8, maxLife: 1.8,
        igniteEnd: 0.12 + this.elapsed,
        stableEnd: 1.35 + this.elapsed,
        damageSnapshot: trail._damageSnapshot ?? this.captureDamageSnapshot(),
        parentId: trail.id, parentTrail: trail,
        visualNodes: this._buildScorchanys(trail.points),
      });
      while (this._scorchTrails.length > 6) this._scorchTrails.shift();
    }'''

new_end = '''    // V0731011: 燎原百斩 — 完成当前草稿
    if (this._activeEdicts.some(e => e.id === "scorch") && this._scorchDraft?.active) {
      this._scorchDraft.active = false;
    }'''

text = text.replace(old_end, new_end)

# ─── 3. Add beginSlash init ───
old_begin = '''    // 三刀流：同步初始化左右副刀
    this._initTripleSubTrails(this.currentSlash!);'''

new_begin = '''    // 三刀流：同步初始化左右副刀
    this._initTripleSubTrails(this.currentSlash!);
    // 燎原百斩：初始化草稿
    if (this._activeEdicts.some(e => e.id === "scorch")) {
      this._scorchDraft = {
        points: [this.currentSlash!.points[0] ? { x: this.currentSlash!.points[0].x, y: this.currentSlash!.points[0].y } : { x: this.currentSlash!.points[0]?.x ?? 0, y: this.currentSlash!.points[0]?.y ?? 0 }],
        damageSnapshot: this.currentSlash!._damageSnapshot ?? this.captureDamageSnapshot(),
        parentTrail: this.currentSlash!, active: true,
      };
    }'''

text = text.replace(old_begin, new_begin)

# ─── 4. Add addSlashPoint scorch draft append ───
old_add = '''    this.lastSlashAngle = Math.atan2(pos.y - last.y, pos.x - last.x);
    this.checkSegmentHits(last, point, trail);'''

new_add = '''    this.lastSlashAngle = Math.atan2(pos.y - last.y, pos.x - last.x);
    // 燎原百斩：实时追加草稿点
    if (this._scorchDraft?.active) {
      this._scorchDraft.points.push({ x: pos.x, y: pos.y });
      if (this._scorchDraft.points.length > 120) this._scorchDraft.points.shift();
      // 新segment超过2点后，孵化为新火痕
      if (this._scorchDraft.points.length >= 2) {
        this._scorchTrails.push({
          points: this._scorchDraft.points.map(p => ({ x: p.x, y: p.y })),
          life: 1.8, maxLife: 1.8,
          damageSnapshot: this._scorchDraft.damageSnapshot,
          parentId: this._scorchDraft.parentTrail.id,
          parentTrail: this._scorchDraft.parentTrail,
        });
        while (this._scorchTrails.length > 8) this._scorchTrails.shift();
      }
    }
    this.checkSegmentHits(last, point, trail);'''

text = text.replace(old_add, new_add)

# ─── 5. Delete old _buildScorchVisualNodes and _drawScorchTrails ───
# Find the old draw function marker
old_draw_marker = "  private _buildScorchanys"
old_draw_end_marker = "  // V0731012: 冰霜效果绘制"
idx_s = text.find(old_draw_marker)
idx_e = text.find(old_draw_end_marker, idx_s)
if idx_s < 0: print("ERROR: _buildScorchVisualNodes not found"); exit(1)

# ─── 6. Replace draw calls + add new 3-layer rendering ───
new_draw_code = '''  // V0731011 火路地面层（焦痕＋灼边，敌人之前）
  private _drawScorchGround(ctx: CanvasRenderingContext2D) {
    for (const t of this._scorchTrails) {
      if (t.points.length < 2) continue;
      const life = t.life, age = t.maxLife - life;
      const isIgnite = life > 1.68; // first 0.12s
      const fadeT = clamp(life / 0.45, 0, 1);
      const pts = t.points, n = pts.length;
      if (isIgnite && pts.length >= 2) {
        // 金白灼线
        ctx.save(); ctx.globalAlpha = 0.45; ctx.lineCap = "round";
        ctx.strokeStyle = "#ffcc44"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
        ctx.restore();
      }
      // 焦痕基底 94px — 低透明，不规则边缘
      ctx.save(); ctx.globalAlpha = fadeT * 0.12; ctx.lineCap = "round";
      ctx.strokeStyle = "#1a0800"; ctx.lineWidth = 94;
      ctx.setLineDash([12 + Math.sin(age*3)*3, 16 + Math.cos(age*2.3)*5]);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const frac = i / (n - 1), w = 84 + Math.sin(i*0.37)*6 + Math.cos(i*0.53+age)*4;
        const tIn = clamp(frac / 0.12, 0, 1), tOut = clamp((1-frac) / 0.12, 0, 1);
        const edgeScale = tIn * tOut * (0.6 + Math.sin(i*0.3)*0.4);
        const alpha = fadeT * 0.12 * edgeScale;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = w;
        if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
        else ctx.lineTo(pts[i].x, pts[i].y);
        if (i > 0 && (i % 2 === 0 || i === n - 1)) { ctx.stroke(); ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); }
      }
      ctx.setLineDash([]); ctx.restore();
      // 暗红灼边 68px — 断续
      if (fadeT > 0.15) {
        ctx.save(); ctx.globalAlpha = fadeT * 0.2; ctx.lineCap = "round";
        ctx.strokeStyle = "#3a0500"; ctx.lineWidth = 68;
        ctx.setLineDash([18 + Math.sin(age*5)*4, 22 + Math.cos(age*3.5)*6]);
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
      }
    }
  }

  // V0731011 火路火焰层（火焰＋火舌，敌人附近但不遮挡名称HP）
  private _drawScorchFlames(ctx: CanvasRenderingContext2D) {
    for (const t of this._scorchTrails) {
      if (t.points.length < 2) continue;
      const life = t.life, age = t.maxLife - life, pts = t.points, n = pts.length;
      const isIgnite = life > 1.68, isDying = life <= 0.45;
      const fadeT = isDying ? clamp(life/0.45,0,1) : 1;
      // 橙红燃烧区 48px — 光泽叠加
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
      ctx.globalAlpha = fadeT * 0.22;
      ctx.strokeStyle = "#772200"; ctx.lineWidth = 48;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
      ctx.globalAlpha = fadeT * 0.15;
      ctx.strokeStyle = "#aa3300"; ctx.lineWidth = 34;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
      ctx.restore();
      // 金白裂缝 10px 断续
      if (!isDying || fadeT > 0.4) {
        ctx.save(); ctx.globalAlpha = fadeT * 0.28; ctx.lineCap = "round";
        ctx.strokeStyle = "#ff9944"; ctx.lineWidth = 10;
        for (let i = 0; i < n - 1; i += 15 + Math.floor(Math.abs(Math.sin(i*0.5+age))*10)) {
          const end = Math.min(i+3, n-1);
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y);
          for (let j = i+1; j <= end; j++) ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
        }
        ctx.globalAlpha = fadeT * 0.18;
        ctx.strokeStyle = "#ffcc66"; ctx.lineWidth = 3;
        for (let i = 2; i < n - 1; i += 20 + Math.floor(Math.abs(Math.cos(i*0.7+age))*8)) {
          const end = Math.min(i+2, n-1);
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y);
          for (let j = i+1; j <= end; j++) ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
        }
        ctx.restore();
      }
      // 剪纸火舌（路径两侧边缘）
      if ((!isDying || fadeT > 0.2) && n > 3) {
        ctx.save();
        for (let i = 0; i < n - 1; i += 6) {
          const a = pts[i], b = pts[Math.min(i+1, n-1)];
          const segIdx = i / (n-1);
          const tin = clamp(segIdx/0.12, 0, 1), tout = clamp((1-segIdx)/0.12, 0, 1);
          const edgeFade = tin * tout;
          if (edgeFade < 0.15) continue;
          const dx = b.x-a.x, dy = b.y-a.y, len = Math.sqrt(dx*dx+dy*dy)||1;
          const nx = -dy/len, ny = dx/len;
          const seed = i * 0.73 + t.maxLife * 1000;
          const phase = (age*2.5 + seed*1.3) % (Math.PI*2);
          const breath = 0.5 + Math.sin(phase)*0.5;
          const hBase = 16 + (Math.sin(seed)*0.5+0.5)*14;
          const h = hBase * breath * fadeT * edgeFade;
          if (h < 4) continue;
          const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
          // 左右各一组火舌
          for (let side = -1; side <= 1; side += 2) {
            const sx = mx + nx * side * 14, sy = my + ny * side * 6;
            const lean = (Math.sin(seed*2.1+side)*0.3) * side;
            ctx.globalAlpha = fadeT * edgeFade * 0.35;
            ctx.fillStyle = "#cc3300";
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx+nx*side*6, sy-h*0.6);
            ctx.lineTo(sx+nx*side*lean*4, sy-h*0.95);
            ctx.lineTo(sx-nx*side*3, sy-h*0.5);
            ctx.fill();
            ctx.globalAlpha = fadeT * edgeFade * 0.25;
            ctx.fillStyle = "#ff7722";
            ctx.beginPath();
            ctx.moveTo(sx, sy-h*0.3);
            ctx.lineTo(sx+nx*side*3, sy-h*0.7);
            ctx.lineTo(sx-nx*side*2, sy-h*0.85);
            ctx.fill();
          }
        }
        ctx.restore();
      }
      // 余烬
      if (!isDying || fadeT > 0.1) {
        ctx.save(); ctx.globalAlpha = fadeT * 0.18;
        ctx.fillStyle = "#ff8844";
        for (let i = 0; i < n; i += 8) {
          const p = pts[i], seed = i*0.6;
          ctx.beginPath();
          ctx.arc(p.x+Math.sin(age*7+seed)*5, p.y-6-(age*7+seed)%14, 1.8, 0, Math.PI*2);
          ctx.fill();
        }
        ctx.restore();
      }
      // 焦烟
      if (!isIgnite && fadeT > 0.1) {
        ctx.save(); ctx.globalAlpha = fadeT * 0.03;
        ctx.strokeStyle = "rgba(12,6,0,0.3)"; ctx.lineWidth = 24;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y-3);
        for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y-3); ctx.stroke();
        ctx.restore();
      }
    }
  }

  // V0731011 敌人燃烧挂载
  private _drawEnemyScorchAttachments(ctx: CanvasRenderingContext2D) {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const burned = (enemy as any)._scorchInside;
      let burnAlpha = (enemy as any)._scorchBurning ?? 0;
      if (!burned && burnAlpha <= 0) continue;
      const pulse = (enemy as any)._scorchPulse ?? 0;
      if (!burned) { burnAlpha = Math.max(0, burnAlpha-0.02); }
      else { burnAlpha = Math.min(burnAlpha+0.06, 0.5); }
      (enemy as any)._scorchBurning = burnAlpha;
      if (burnAlpha <= 0) continue;

      ctx.save();
      const r = enemy.radius, s = enemy.eliteKind ? 1.35 : 1;
      const seed = enemy.id.charCodeAt(0) + (enemy.id.charCodeAt(1)||0);

      // 轮廓赤金
      ctx.globalAlpha = burnAlpha*0.35 + pulse*0.2;
      ctx.strokeStyle = "#ff3300"; ctx.lineWidth = 3*s;
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, r+3, 0, Math.PI*2); ctx.stroke();

      // 下半火焰
      ctx.globalAlpha = burnAlpha*0.45 + pulse*0.2;
      ctx.fillStyle = "#cc2200";
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y+r*0.1, r*0.75, 0, Math.PI); ctx.fill();

      // 火舌 x3
      for (let j=0; j<3; j++) {
        const sx = enemy.x+Math.sin(seed+j*2.1)*(r*0.35);
        const sy = enemy.y+r*0.15;
        const fh = (7+j*3.5)*s*(0.7+pulse*2);
        ctx.globalAlpha = (burnAlpha*0.35+pulse*0.25)*(1-j*0.12);
        ctx.fillStyle = j===0?"#bb2000":"#ff5522";
        ctx.beginPath();
        ctx.moveTo(sx-2.5*s,sy); ctx.lineTo(sx,sy-fh*1.1); ctx.lineTo(sx+2.5*s,sy); ctx.fill();
      }

      // 火星
      if (burnAlpha>0.18||pulse>0.04) {
        ctx.globalAlpha = burnAlpha*0.28 + pulse*0.15;
        ctx.fillStyle = "#ffcc55";
        for (let j=0;j<3;j++) {
          const a = this.elapsed*6+j*2.1+seed*0.1;
          ctx.beginPath();
          ctx.arc(enemy.x+Math.sin(a)*r*0.45, enemy.y-r*0.65-Math.abs(Math.sin(a*1.5))*7, 1.6, 0, Math.PI*2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  // V0731012: 冰霜效果绘制'''

# Replace old draw code with new 3-layer code
text = text[:idx_s] + new_draw_code + text[idx_e + len(old_draw_end_marker):]

# ─── 7. Update draw call in render loop ───
old_render = "this._drawScorchTrails(ctx); // V0731011"
new_render = '''this._drawScorchGround(ctx);
    this._drawScorchFlames(ctx);'''

text = text.replace(old_render, new_render)

# ─── 8. Add enemy attachment after enemy draw ───
# Find where enemies are drawn and add attachment after
old_enemy_draw = "this._drawFrostEffects(ctx); // V0731012"
new_enemy_draw = '''this._drawFrostEffects(ctx); // V0731012
    this._drawEnemyScorchAttachments(ctx);'''

text = text.replace(old_enemy_draw, new_enemy_draw)

# ─── 9. Clean up resetRunState ───
text = text.replace("this._scorchTrails = []", "this._scorchTrails = []; this._scorchDraft = null")

open("src/game/Game.ts","w",encoding="utf-8").write(text)
print("OK")
