import re
text = open("src/game/Game.ts","r",encoding="utf-8").read()

# 1. Extend scorch trail struct with visual nodes
old_struct = "{ points: { x: number; y: number }[]; life: number; maxLife: number; tickTimer: number; damageSnapshot: PlayerRunStats; parentId: string; parentTrail: SlashTrail }[]"
new_struct = '''{ points: { x: number; y: number }[]; life: number; maxLife: number;
    damageSnapshot: PlayerRunStats; parentId: string; parentTrail: SlashTrail;
    igniteEnd: number; stableEnd: number; visualNodes: VisualNode[] }[]'''
text = text.replace(old_struct, new_struct)

# 2. Add VisualNode type import — inject after existing imports
# Already have SlashPoint etc. VisualNode is local
# Add VisualNode interface before scorch fields
old_vn_marker = "  /** V0731011: 燎原百斩 — 火痕留场 */"
vn_def = '''type VisualNode = { x: number; y: number; seed: number; h: number; w: number; gap: number; lean: number };

  /** V0731011: 燎原百斩 — 火痕留场 */'''
text = text.replace(old_vn_marker, vn_def)

# 3. Update endSlash scorch push to include visualNodes
old_push = '''points: trail.points.map(p => ({ x: p.x, y: p.y })),
        life: 1.8, maxLife: 1.8, tickTimer: 0,
        damageSnapshot: trail._damageSnapshot ?? this.captureDamageSnapshot(),
        parentId: trail.id, parentTrail: trail,'''

new_push = '''points: trail.points.map(p => ({ x: p.x, y: p.y })),
        life: 1.8, maxLife: 1.8,
        igniteEnd: 0.12 + this.elapsed,
        stableEnd: 1.35 + this.elapsed,
        damageSnapshot: trail._damageSnapshot ?? this.captureDamageSnapshot(),
        parentId: trail.id, parentTrail: trail,
        visualNodes: this._buildScorchVisualNodes(trail.points),'''

text = text.replace(old_push, new_push)

# 4. Delete old _drawScorchTrails and replace with new 4-layer version + enemy visuals
old_draw_start = "  private _drawScorchTrails(ctx: CanvasRenderingContext2D) {"
old_draw_end = '''      }
      ctx.restore();
    }
  }'''
old_section = text[text.find(old_draw_start):text.find(old_draw_end, text.find(old_draw_start))]
old_end_pos = text.find(old_draw_end, text.find(old_draw_start)) + len(old_draw_end)

# Find the real end of drawScorchTrails (includes enemy burning section)
# Need to delete everything until next function or class member
next_marker = "\n  // V0731012: 冰霜效果绘制"
next_pos = text.find(next_marker, old_end_pos)
if next_pos < 0:
    next_marker = "\n  private _drawFrostEffects"
    next_pos = text.find(next_marker, old_end_pos)

old_block_end = next_pos

new_draw = '''

  private _buildScorchVisualNodes(pts: {x:number;y:number}[]): VisualNode[] {
    const nodes: VisualNode[] = [];
    const gap = 22 + Math.random() * 6;
    let accum = 0;
    // seed based on elapsed for determinism within session
    const baseSeed = this.elapsed * 7919;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) accum += Math.hypot(pts[i].x-pts[i-1].x, pts[i].y-pts[i-1].y);
      if (accum < gap && i < pts.length - 1) continue;
      accum = 0;
      const seed = baseSeed + i * 0.37;
      nodes.push({
        x: pts[i].x, y: pts[i].y,
        seed,
        h: 14 + (Math.sin(seed)*0.5+0.5) * 12,
        w: 6 + (Math.cos(seed*1.3)*0.5+0.5) * 7,
        gap: gap + (Math.cos(seed*0.7)*0.5+0.5) * 8 - 4,
        lean: (Math.sin(seed*2.1) * 0.4),
      });
    }
    return nodes;
  }

  // V0731011 火路绘制（四层焦纸火路 + 敌人挂载）
  private _drawScorchTrails(ctx: CanvasRenderingContext2D) {
    for (const t of this._scorchTrails) {
      if (t.points.length < 2) continue;
      const life = t.life, maxLife = t.maxLife;
      const age = maxLife - life;
      const igniteEnd = t.igniteEnd - (this.elapsed - age);
      const stableEnd = t.stableEnd - (this.elapsed - age);
      const isIgnite = life > (maxLife - 0.12);
      const isStable = !isIgnite && life > (maxLife - 1.35);
      const isDying = !isIgnite && !isStable;
      const igniteT = isIgnite ? clamp(age / 0.12, 0, 1) : 1;
      const fadeT = isDying ? clamp(life / (maxLife - 1.35), 0, 1) : 1;

      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";

      // 点燃灼线 (ignite)
      if (isIgnite && igniteT < 1) {
        ctx.globalAlpha = (1 - igniteT) * 0.6;
        ctx.strokeStyle = "#ffcc44"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(t.points[0].x, t.points[0].y);
        for (let i = 1; i < t.points.length; i++) ctx.lineTo(t.points[i].x, t.points[i].y); ctx.stroke();
      }

      // Layer 1: 焦黑底带 104px
      const l1Alpha = isDying ? fadeT * 0.7 : 0.55;
      ctx.globalAlpha = l1Alpha;
      ctx.strokeStyle = "#1a0800"; ctx.lineWidth = 104;
      ctx.beginPath(); ctx.moveTo(t.points[0].x, t.points[0].y);
      for (let i = 1; i < t.points.length; i++) ctx.lineTo(t.points[i].x, t.points[i].y); ctx.stroke();
      // 烧蚀不规则边缘
      ctx.globalAlpha = l1Alpha * 0.45;
      ctx.strokeStyle = "#330a00"; ctx.lineWidth = 110;
      ctx.setLineDash([8 + Math.sin(age*3)*3, 14 + Math.cos(age*2.5)*4]);
      ctx.beginPath(); ctx.moveTo(t.points[0].x, t.points[0].y);
      for (let i = 1; i < t.points.length; i++) ctx.lineTo(t.points[i].x, t.points[i].y); ctx.stroke();
      ctx.setLineDash([]);

      // Layer 2: 赤红灼边 86px
      const l2Alpha = isDying ? fadeT * 0.6 : 0.5;
      ctx.globalAlpha = l2Alpha;
      ctx.strokeStyle = "#5a0a00"; ctx.lineWidth = 86;
      ctx.beginPath(); ctx.moveTo(t.points[0].x, t.points[0].y);
      for (let i = 1; i < t.points.length; i++) ctx.lineTo(t.points[i].x, t.points[i].y); ctx.stroke();
      // 宽窄起伏
      for (let i = 3; i < t.points.length - 4; i += 5) {
        const w = 82 + Math.sin(age*4 + i*0.3)*6 + Math.cos(age*6 + i*0.7)*4;
        ctx.globalAlpha = l2Alpha * 0.7;
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(t.points[i].x, t.points[i].y);
        ctx.lineTo(t.points[Math.min(i+1,t.points.length-1)].x, t.points[Math.min(i+1,t.points.length-1)].y);
        ctx.stroke();
      }

      // Layer 3: 橙红燃烧主体 68px
      if (!isDying || fadeT > 0.3) {
        ctx.globalAlpha = isDying ? fadeT * 0.45 : 0.55;
        ctx.strokeStyle = "#993300"; ctx.lineWidth = 68;
        ctx.beginPath(); ctx.moveTo(t.points[0].x, t.points[0].y);
        for (let i = 1; i < t.points.length; i++) ctx.lineTo(t.points[i].x, t.points[i].y); ctx.stroke();
        ctx.globalAlpha = (isDying ? fadeT * 0.3 : 0.35);
        ctx.strokeStyle = "#cc4400"; ctx.lineWidth = 48;
        ctx.beginPath(); ctx.moveTo(t.points[0].x, t.points[0].y);
        for (let i = 1; i < t.points.length; i++) ctx.lineTo(t.points[i].x, t.points[i].y); ctx.stroke();
      }

      // Layer 4: 金白高温裂缝 18px (断续)
      if (!isDying) {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = "#ff8822"; ctx.lineWidth = 18;
        for (let i = 0; i < t.points.length - 2; i += 14 + Math.floor(Math.abs(Math.sin(i*0.43+age))*8)) {
          const end = Math.min(i+3+Math.floor((Math.sin(i*1.7+age)*0.5+0.5)*5), t.points.length-1);
          ctx.beginPath(); ctx.moveTo(t.points[i].x, t.points[i].y);
          for (let j = i+1; j <= end; j++) ctx.lineTo(t.points[j].x, t.points[j].y); ctx.stroke();
        }
        // 金白细核心
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = "#ffcc66"; ctx.lineWidth = 6;
        for (let i = 2; i < t.points.length - 1; i += 18 + Math.floor(Math.abs(Math.cos(i*0.63+age))*6)) {
          const end = Math.min(i+2, t.points.length-1);
          ctx.beginPath(); ctx.moveTo(t.points[i].x, t.points[i].y);
          for (let j = i+1; j <= end; j++) ctx.lineTo(t.points[j].x, t.points[j].y); ctx.stroke();
        }
      }

      // 火舌 (剪纸状三角形)
      if (t.visualNodes && (isStable || isDying) && (isStable || fadeT > 0.2)) {
        for (const vn of t.visualNodes) {
          const baseAlpha = isDying ? fadeT * 0.35 : 0.45;
          if (baseAlpha < 0.05) continue;
          const phase = (age * 3 + vn.seed * 1.7) % (Math.PI * 2);
          const breath = 0.6 + (Math.sin(phase) * 0.4);
          // 法线方向 (简化：用随机lean代替精确法线)
          const ndx = vn.lean;
          const ndy = 0.8;
          const h = vn.h * breath;
          const w = vn.w * breath;
          // 舌1
          ctx.globalAlpha = baseAlpha * 0.6;
          ctx.fillStyle = "#cc3300";
          ctx.beginPath();
          ctx.moveTo(vn.x, vn.y);
          ctx.lineTo(vn.x + ndx*4, vn.y - h*0.5);
          ctx.lineTo(vn.x, vn.y - h*0.8);
          ctx.lineTo(vn.x - ndx*3, vn.y - h*0.4);
          ctx.fill();
          // 舌2 (稍小靠外)
          ctx.beginPath();
          ctx.moveTo(vn.x + ndx*5, vn.y - h*0.15);
          ctx.lineTo(vn.x + ndx*8, vn.y - h*0.55);
          ctx.lineTo(vn.x + ndx*3, vn.y - h*0.65);
          ctx.lineTo(vn.x + ndx*2, vn.y - h*0.2);
          ctx.fill();
          // 舌3 金黄顶
          ctx.globalAlpha = baseAlpha * 0.5;
          ctx.fillStyle = "#ff8833";
          ctx.beginPath();
          ctx.moveTo(vn.x, vn.y - h*0.5);
          ctx.lineTo(vn.x + ndx*1.5, vn.y - h*0.9);
          ctx.lineTo(vn.x - ndx*1.5, vn.y - h*0.85);
          ctx.fill();
          // 舌4
          ctx.beginPath();
          ctx.moveTo(vn.x + ndx*3, vn.y - h*0.3);
          ctx.lineTo(vn.x + ndx*7, vn.y - h*0.7);
          ctx.lineTo(vn.x + ndx*1, vn.y - h*0.75);
          ctx.fill();
        }
      }

      // 余烬 + 火星 (稳定阶段)
      if (isStable && t.visualNodes) {
        ctx.globalAlpha = 0.25;
        for (const vn of t.visualNodes) {
          if (Math.sin(vn.seed + age*9) < 0.3) continue;
          ctx.fillStyle = "#ffaa44";
          const ox = Math.sin(age*6 + vn.seed)*4;
          const oy = -8 - (age*7 + vn.seed*3) % 20;
          ctx.beginPath();
          ctx.arc(vn.x+ox, vn.y+oy, 2, 0, Math.PI*2); ctx.fill();
        }
        // 焦屑
        ctx.fillStyle = "#331100";
        for (let i = 0; i < 4; i++) {
          const p = t.points[Math.floor(i*t.points.length/4)];
          ctx.beginPath();
          ctx.arc(p.x+Math.sin(age*5+i)*6, p.y-6-(age*4+i*2)%14, 1.5, 0, Math.PI*2); ctx.fill();
        }
      }

      // 焦烟
      if (!isIgnite) {
        ctx.globalAlpha = isDying ? fadeT * 0.06 : 0.04;
        ctx.strokeStyle = "rgba(20,10,0,0.3)";
        ctx.lineWidth = 30;
        ctx.beginPath(); ctx.moveTo(t.points[0].x, t.points[0].y-4);
        for (let i = 1; i < t.points.length; i++) ctx.lineTo(t.points[i].x, t.points[i].y-4);
        ctx.stroke();
      }

      ctx.restore();
    }

    // 敌人燃烧挂载
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const burned = (enemy as any)._scorchInside;
      let burnAlpha = (enemy as any)._scorchBurning ?? 0;
      if (!burned && burnAlpha <= 0) continue;
      const pulse = (enemy as any)._scorchPulse ?? 0;
      if (!burned) {
        burnAlpha = Math.max(0, burnAlpha - 0.02);
        if (pulse > 0) (enemy as any)._scorchPulse = Math.max(0, pulse - 0.006);
      } else {
        burnAlpha = Math.min(burnAlpha + 0.06, 0.5);
      }
      (enemy as any)._scorchBurning = burnAlpha;
      if (burnAlpha <= 0) continue;

      ctx.save();
      const r = enemy.radius, scale = enemy.eliteKind ? 1.35 : 1;

      // 进入首帧环状火花
      const justEntered = burnAlpha < 0.08;
      if (justEntered) {
        ctx.globalAlpha = 0.5; ctx.strokeStyle = "#ff8833"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(enemy.x, enemy.y, r+2, 0, Math.PI*2); ctx.stroke();
      }

      // 外轮廓赤金热光
      ctx.globalAlpha = burnAlpha * 0.4 + pulse * 0.25;
      ctx.strokeStyle = "#ff4400"; ctx.lineWidth = 3.5 * scale;
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, r+3, 0, Math.PI*2); ctx.stroke();

      // 下半部基本火焰
      ctx.globalAlpha = burnAlpha * 0.5 + pulse * 0.2;
      ctx.fillStyle = "#dd2200";
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y + r*0.1, r*0.8, 0, Math.PI); ctx.fill();

      // 剪纸火舌 x3 (下半部)
      const seed1 = enemy.id.charCodeAt(0) + enemy.id.charCodeAt(1);
      for (let j = 0; j < 3; j++) {
        const sx = enemy.x + Math.sin(seed1+j*2.1)*(r*0.4);
        const sy = enemy.y + r*0.2;
        const fh = (8 + j*4) * scale * (0.7 + pulse*2);
        ctx.globalAlpha = (burnAlpha*0.4 + pulse*0.3) * (1-j*0.15);
        ctx.fillStyle = j===0 ? "#cc2200" : "#ff6622";
        ctx.beginPath();
        ctx.moveTo(sx-3*scale, sy);
        ctx.lineTo(sx, sy-fh*1.1);
        ctx.lineTo(sx+3*scale, sy);
        ctx.fill();
      }

      // 向上火星
      if (burnAlpha > 0.2 || pulse > 0.05) {
        ctx.globalAlpha = (burnAlpha*0.3 + pulse*0.2);
        ctx.fillStyle = "#ffcc55";
        for (let j = 0; j < 3; j++) {
          const a = this.elapsed*7 + j*2.1 + seed1*0.1;
          ctx.beginPath();
          ctx.arc(enemy.x+Math.sin(a)*r*0.5, enemy.y-r*0.7-Math.abs(Math.sin(a*1.5))*8, 1.8, 0, Math.PI*2);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    // 火路独立击杀反馈 (焦化燃尽)
    for (const enemy of this.enemies) {
      if (enemy.alive) continue;
      const killedByScorch = (enemy as any)._scorchKilled;
      if (!killedByScorch) continue;
      const ka = (enemy as any)._scorchKillAlpha ?? 1;
      if (ka <= 0) continue;
      (enemy as any)._scorchKillAlpha = ka - 0.03;
      ctx.save(); ctx.globalAlpha = ka * 0.4;
      // 焦纸片
      ctx.fillStyle = "#441100";
      ctx.beginPath(); ctx.arc(enemy.x+2, enemy.y+3, enemy.radius*0.6, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#220800";
      ctx.beginPath(); ctx.arc(enemy.x-3, enemy.y-2, enemy.radius*0.4, 0, Math.PI*2); ctx.fill();
      // 金色余烬
      ctx.fillStyle = "#ffaa33";
      const ak = this.elapsed*5 % (Math.PI*2);
      ctx.beginPath();
      ctx.arc(enemy.x+Math.sin(ak)*8, enemy.y-6-ak*0.5, 2, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  // V0731012: 冰霜效果绘制'''

# Find the drawScorchTrails section end and replace
old_idx = text.find(old_draw_start)
end_idx = text.find(next_marker, old_idx)
if end_idx < 0: end_idx = text.find("\n  private _drawFrostEffects", old_idx)
text = text[:old_idx] + new_draw + text[end_idx + len(next_marker):]

# 5. Mark scorch kills for visual feedback
old_damage = '''if (r?.isAccepted && r.resolvedDamage > 0) {
        this.damageEnemy(enemy, r.resolvedDamage, bestTrail, false, "scorch");
        this.aggregateAndMaybeFlush(`scorch_${enemy.id}`, r.resolvedDamage, { x: enemy.x, y: enemy.y }, 'SCORCH_BURN', 'ENEMY', 600, bestSnap.entryAttack, false, true);
        // 跳伤脉冲
        (enemy as any)._scorchPulse = 0.15;
        (enemy as any)._scorchBurning = 0.45;
      }'''

new_damage = '''if (r?.isAccepted && r.resolvedDamage > 0) {
        const wasAlive = enemy.alive;
        this.damageEnemy(enemy, r.resolvedDamage, bestTrail, false, "scorch");
        this.aggregateAndMaybeFlush(`scorch_${enemy.id}`, r.resolvedDamage, { x: enemy.x, y: enemy.y }, 'SCORCH_BURN', 'ENEMY', 600, bestSnap.entryAttack, false, true);
        (enemy as any)._scorchPulse = 0.14;
        (enemy as any)._scorchBurning = 0.45;
        if (!enemy.alive && wasAlive) {
          (enemy as any)._scorchKilled = true;
          (enemy as any)._scorchKillAlpha = 1;
        }
      }'''

text = text.replace(old_damage, new_damage)

open("src/game/Game.ts","w",encoding="utf-8").write(text)
print("OK")
