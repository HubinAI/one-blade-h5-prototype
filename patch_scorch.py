import re
text = open("src/game/Game.ts","r",encoding="utf-8").read()

# 1. Delete old _scorchGlobalTick field
text = text.replace(
    "private _scorchGlobalTick = 0;",
    "")

# 2. Replace _updateScorchTrails with new enemy-centric version
old_update = '''  // V0731011: 燎原百斩 — 火痕更新 + 敌人伤害
  private _updateScorchTrails(dt: number) {
    const tickInterval = 0.25, validDist = 36; // 有效宽度 ≈ 40px
    for (const t of this._scorchTrails) {
      t.life -= dt; t.tickTimer += dt;
      // 首次进入可立即触发：tickTimer 初始为0，第一帧累积dt后可能<interval，但若敌人已经在范围内应立即触发
      // 使用一个布尔标记首次触发
      if ((t as any)._tickedOnce && t.tickTimer < tickInterval) continue;
      if (!(t as any)._tickedOnce) (t as any)._tickedOnce = true;
      else t.tickTimer -= tickInterval;
      this._scorchGlobalTick++;
      const gTick = this._scorchGlobalTick;
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        if ((enemy as any)._scorchTickG === gTick) continue;
        if (!this._enemyInScorchRange(t, enemy, validDist)) continue;
        (enemy as any)._scorchTickG = gTick;
        const r = resolveDamage({
          actionId: this.nextId("scorch"), parentActionId: t.parentId || "scorch",
          sourceType: "SCORCH_BURN", sourceConfig: DAMAGE_SOURCE_REGISTRY.SCORCH_BURN,
          attackerId: "player", targetId: enemy.id, targetCategory: "ENEMY",
          skillCoefficient: 0.15, stats: t.damageSnapshot,
          bladeBand: "mid", tags: ["scorch", "burn"],
          hitPos: { x: enemy.x, y: enemy.y }, timestamp: this.elapsed,
        }, enemy.hp, enemy.maxHp, enemy.alive, !!enemy.eliteKind);
        if (r?.isAccepted && r.resolvedDamage > 0) {
          const ktTrail = t.parentTrail;
          this.damageEnemy(enemy, r.resolvedDamage, ktTrail, false, "scorch");
          this.aggregateAndMaybeFlush(`scorch_${enemy.id}_${gTick}`, r.resolvedDamage, { x: enemy.x, y: enemy.y }, 'SCORCH_BURN', 'ENEMY', 600, t.damageSnapshot.entryAttack, false, true);
        }
        (enemy as any)._scorchBurning = 0.5;
      }
    }
    for (let i = this._scorchTrails.length - 1; i >= 0; i--) {
      if (this._scorchTrails[i].life <= 0) this._scorchTrails.splice(i, 1);
    }
  }

  private _enemyInScorchRange(t: typeof this._scorchTrails[0], enemy: Enemy, dist: number): boolean {
    let minDist = Infinity;
    for (let i = 0; i < t.points.length - 1; i++) {
      const a = t.points[i], b = t.points[i+1], abx = b.x-a.x, aby = b.y-a.y, eax = a.x-enemy.x, eay = a.y-enemy.y;
      const dot = abx*abx+aby*aby, tt = dot>1e-6 ? clamp(-(eax*abx+eay*aby)/dot,0,1) : 0;
      minDist = Math.min(minDist, Math.hypot(a.x+abx*tt-enemy.x, a.y+aby*tt-enemy.y));
      if (minDist <= dist + enemy.radius) return true;
    }
    return minDist <= dist + enemy.radius;
  }'''

new_update = '''  // V0731011: 燎原百斩 — 敌人维度灼烧更新
  private _updateScorchTrails(dt: number) {
    const tickInterval = 0.25, halfWidth = 52;

    // Step 1: 递减火痕生命
    for (const t of this._scorchTrails) { t.life -= dt; }

    // Step 2: 为每个敌人判断是否处于任意火痕中
    for (const enemy of this.enemies) {
      if (!enemy.alive) { (enemy as any)._scorchInside = false; continue; }
      let insideAny = false;
      for (const t of this._scorchTrails) {
        if (t.life <= 0) continue;
        if (this._enemyInScorchRange(t, enemy, halfWidth)) { insideAny = true; break; }
      }
      (enemy as any)._scorchInside = insideAny;
    }

    // Step 3: 对处于火痕中的敌人按统一节奏跳伤
    for (const enemy of this.enemies) {
      if (!enemy.alive || !(enemy as any)._scorchInside) {
        // 离开火痕：重置首跳权限，保留燃烧挂载衰减
        (enemy as any)._scorchEntered = false;
        continue;
      }

      const entered = !(enemy as any)._scorchEntered;
      (enemy as any)._scorchEntered = true;

      // 首次进入或到达跳伤时间
      const canTick = entered || this.elapsed >= ((enemy as any)._scorchNextTickAt || 0);
      if (!canTick) continue;
      (enemy as any)._scorchNextTickAt = this.elapsed + tickInterval;

      // 找到最新有效火痕的快照用于伤害计算
      let bestSnap = this._scorchTrails[0]?.damageSnapshot;
      let bestTrail = this._scorchTrails[0]?.parentTrail;
      for (const t of this._scorchTrails) {
        if (t.life > 0) { bestSnap = t.damageSnapshot; bestTrail = t.parentTrail; break; }
      }
      if (!bestSnap || !bestTrail) continue;

      const r = resolveDamage({
        actionId: this.nextId("scorch"), parentActionId: "scorch",
        sourceType: "SCORCH_BURN", sourceConfig: DAMAGE_SOURCE_REGISTRY.SCORCH_BURN,
        attackerId: "player", targetId: enemy.id, targetCategory: "ENEMY",
        skillCoefficient: 0.12, stats: bestSnap,
        bladeBand: "mid", tags: ["scorch", "burn", "dot"],
        hitPos: { x: enemy.x, y: enemy.y }, timestamp: this.elapsed,
      }, enemy.hp, enemy.maxHp, enemy.alive, !!enemy.eliteKind);
      if (r?.isAccepted && r.resolvedDamage > 0) {
        this.damageEnemy(enemy, r.resolvedDamage, bestTrail, false, "scorch");
        this.aggregateAndMaybeFlush(`scorch_${enemy.id}`, r.resolvedDamage, { x: enemy.x, y: enemy.y }, 'SCORCH_BURN', 'ENEMY', 600, bestSnap.entryAttack, false, true);
        // 跳伤脉冲
        (enemy as any)._scorchPulse = 0.15;
        (enemy as any)._scorchBurning = 0.45;
      }
    }

    // Step 4: 清理过期火痕
    for (let i = this._scorchTrails.length - 1; i >= 0; i--) {
      if (this._scorchTrails[i].life <= 0) this._scorchTrails.splice(i, 1);
    }
  }

  private _enemyInScorchRange(t: typeof this._scorchTrails[0], enemy: Enemy, dist: number): boolean {
    for (let i = 0; i < t.points.length - 1; i++) {
      const a = t.points[i], b = t.points[i+1];
      const abx = b.x-a.x, aby = b.y-a.y, eax = a.x-enemy.x, eay = a.y-enemy.y;
      const dot = abx*abx+aby*aby, tt = dot>1e-6 ? clamp(-(eax*abx+eay*aby)/dot,0,1) : 0;
      if (Math.hypot(a.x+abx*tt-enemy.x, a.y+aby*tt-enemy.y) <= dist + enemy.radius) return true;
    }
    return false;
  }'''

text = text.replace(old_update, new_update)

# 3. Replace _drawScorchTrails for visual redesign
old_draw = '''  private _drawScorchTrails(ctx: CanvasRenderingContext2D) {
    for (const t of this._scorchTrails) {
      if (t.points.length < 2) continue;
      const a = clamp(t.life / t.maxLife, 0, 1);
      ctx.save(); ctx.globalAlpha = a * 0.6; ctx.lineCap = "round";
      // 外焰 — 深红底色
      ctx.strokeStyle = "#992200"; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.moveTo(t.points[0].x, t.points[0].y);
      for (let i = 1; i < t.points.length; i++) ctx.lineTo(t.points[i].x, t.points[i].y); ctx.stroke();
      // 中层 — 橙红热痕
      ctx.globalAlpha = a * 0.7; ctx.strokeStyle = "#e04400"; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(t.points[0].x, t.points[0].y);
      for (let i = 1; i < t.points.length; i++) ctx.lineTo(t.points[i].x, t.points[i].y); ctx.stroke();
      // 内层 — 金色火核 + 余烬粒子
      ctx.globalAlpha = a * 0.5; ctx.strokeStyle = "#ffaa33"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(t.points[0].x, t.points[0].y);
      for (let i = 1; i < t.points.length; i++) ctx.lineTo(t.points[i].x, t.points[i].y); ctx.stroke();
      // 余烬火星
      if (a > 0.15) {
        ctx.globalAlpha = a * 0.3; ctx.fillStyle = "#ff6644";
        for (let i = 0; i < t.points.length; i += 3) {
          const p = t.points[i]; const ox = (Math.sin(t.life*8+i)*8), oy = Math.cos(t.life*7+i)*8 - t.life*12;
          ctx.beginPath(); ctx.arc(p.x+ox, p.y+oy, Math.max(1, 2*a), 0, Math.PI*2); ctx.fill();
        }
      }
      ctx.restore();
    }
  }'''

new_draw = '''  private _drawScorchTrails(ctx: CanvasRenderingContext2D) {
    for (const t of this._scorchTrails) {
      if (t.points.length < 2) continue;
      const fade = clamp(t.life / t.maxLife, 0, 1), pts = t.points;
      ctx.save(); ctx.globalAlpha = fade * 0.65; ctx.lineCap = "round";
      // 暗红焦痕底带 (56-64px)
      ctx.strokeStyle = "#5a1500"; ctx.lineWidth = 60;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
      // 橙红燃烧主体 (38-46px)
      ctx.globalAlpha = fade * 0.75; ctx.strokeStyle = "#cc3300"; ctx.lineWidth = 42;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
      // 金色高温核心 (10-14px)
      ctx.globalAlpha = fade * 0.55; ctx.strokeStyle = "#ff7722"; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
      // 火苗 (每隔18-26px)
      if (fade > 0.1) {
        ctx.globalAlpha = fade * 0.4;
        for (let i = 0; i < pts.length; i += 3) {
          const p = pts[i], seed = i * 0.73;
          const h = (12 + Math.sin(this.elapsed*5+seed)*6 + Math.cos(this.elapsed*7+seed*1.3)*5) * fade;
          const ox = Math.sin(this.elapsed*8+seed)*3, oy = -h;
          ctx.fillStyle = `rgba(255,${100+Math.floor(Math.sin(this.elapsed*9+seed)*40)},0,0.7)`;
          ctx.beginPath(); ctx.moveTo(p.x-3, p.y); ctx.lineTo(p.x, p.y - h*1.1); ctx.lineTo(p.x+3, p.y); ctx.fill();
        }
      }
      // 余烬
      if (fade > 0.12) {
        ctx.globalAlpha = fade * 0.25; ctx.fillStyle = "#ff8844";
        for (let i = 0; i < pts.length; i += 5) {
          const p = pts[i], r = 1.5 * fade;
          ctx.beginPath();
          ctx.arc(p.x + Math.sin(this.elapsed*6+i)*6, p.y - 8 - i%3*4 - this.elapsed*15%12, r, 0, Math.PI*2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    // 敌人燃烧挂载
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const burned = (enemy as any)._scorchInside;
      let burnAlpha = (enemy as any)._scorchBurning ?? 0;
      if (!burned && burnAlpha <= 0) continue;
      if (!burned) burnAlpha = Math.max(0, burnAlpha - 0.02); else burnAlpha = Math.min(burnAlpha + 0.08, 0.55);
      (enemy as any)._scorchBurning = burnAlpha;
      if (burnAlpha <= 0) continue;
      const pulse = (enemy as any)._scorchPulse ?? 0;
      if (pulse > 0) (enemy as any)._scorchPulse = Math.max(0, pulse - 0.008);
      ctx.save();
      const r = enemy.radius, scale = enemy.eliteKind ? 1.3 : 1;
      // 外轮廓橙红热光
      ctx.globalAlpha = burnAlpha * 0.5 + pulse * 0.3;
      ctx.strokeStyle = "#ff5500"; ctx.lineWidth = 4 * scale;
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, r + 4 * scale, 0, Math.PI*2); ctx.stroke();
      // 下半部火焰
      ctx.globalAlpha = burnAlpha * 0.55 + pulse * 0.25;
      ctx.fillStyle = "#ff4400";
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y + r*0.15, r*0.85, 0, Math.PI); ctx.fill();
      // 内核
      ctx.globalAlpha = burnAlpha * 0.4 + pulse * 0.3;
      ctx.fillStyle = "#ffaa33";
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y + r*0.1, r*0.55, 0.2, Math.PI-0.2); ctx.fill();
      // 火星
      if (burnAlpha > 0.2) {
        ctx.globalAlpha = burnAlpha * 0.35; ctx.fillStyle = "#ffcc66";
        for (let j = 0; j < 3; j++) {
          const a = this.elapsed*6 + j*2.1;
          ctx.beginPath();
          ctx.arc(enemy.x + Math.sin(a)*r*0.7, enemy.y - r*0.6 - Math.abs(Math.sin(a*1.5))*6, 1.8, 0, Math.PI*2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }'''

text = text.replace(old_draw, new_draw)

open("src/game/Game.ts","w",encoding="utf-8").write(text)
print("OK")
