# Only replace lines 2793..2930 (0-indexed: 2792..2929)
lines = open("src/game/Game.ts","r",encoding="utf-8").readlines()
s = 2792  # 0-indexed start (line 2794 is "V0731010")
e = 2930  # 0-indexed end (line 2931 is "V0731011")

new_block = r'''  // V0731010
  private _drawTripleTrail(ctx: CanvasRenderingContext2D, trail: SlashTrail, alphaMul: number) {
    if (!trail.active || trail.points.length < 2) return;
    const pts = trail.points, stage = SWORD_STAGE_BY_ID[trail.tier], rEff = trail.reactiveBladeEffect;
    const effColor = rEff?.color ?? stage.color, effWidth = rEff?.width ?? stage.width;
    const baseWidth = effWidth * trail.widthMultiplier;
    const outerWidth = baseWidth * 0.80;
    const coreWidth = baseWidth * 0.42;
    const sFade = (trail as any)._tripleSlowingFade as number | undefined;
    const alpha = sFade ? clamp(1 - (this.elapsed - sFade) / 0.12, 0.02, 1) : 1;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = `rgba(255,213,112,${alpha*0.5})`; ctx.shadowColor = effColor;
    ctx.lineWidth = outerWidth; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,238,${alpha*0.85})`; ctx.shadowBlur = 2;
    ctx.lineWidth = coreWidth; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
    ctx.restore();
    if (sFade && this.elapsed - sFade > 0.14) { trail.active = false; }
  }

  private _initTripleSubTrails(main: SlashTrail) {
    if (!this._activeEdicts.some(e => e.id === "triple_slash")) return;
    this._tripleSlashHitEnemyIds.clear();
    for (const id of main.hitEnemyIds) this._tripleSlashHitEnemyIds.add(id);
    const rEff = main.reactiveBladeEffect;
    const mk = (idSuffix: string): SlashTrail => ({
      id: main.id + idSuffix, tier: main.tier, lockedEnergy: main.lockedEnergy, lockedMomentum: main.lockedMomentum,
      maxPower: main.maxPower, remainingPower: main.maxPower, maxDuration: 0, remainingDuration: 0,
      maxPathLength: main.maxPathLength, remainingPathLength: main.maxPathLength, pathUsed: 0,
      widthMultiplier: main.widthMultiplier, energyBank: 0, explosionCount: 0, coreCollapseCount: 0,
      points: [], hitEnemyIds: this._tripleSlashHitEnemyIds, hitPickupIds: new Set(), pendingExplosionIds: new Set(),
      pendingCoreIds: new Set(), oilTriggeredIds: new Set(), hasOil: false,
      kills: 0, directMainKills: 0, chain: 0, active: true,
      reactiveBladeEffect: rEff ? rEff : undefined,
      _damageSnapshot: main._damageSnapshot ?? this.captureDamageSnapshot(),
    } as SlashTrail);
    this._tripleLeftTrail = mk("_tl"); this._tripleRightTrail = mk("_tr");
  }

'''
new_lines = lines[:s] + [new_block] + lines[e:]
open("src/game/Game.ts","w",encoding="utf-8").writelines(new_lines)
print("OK: replaced",e-s,"lines with",len(new_block.splitlines()),"lines")
