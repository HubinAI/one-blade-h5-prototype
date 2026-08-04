import re
text = open("src/game/Game.ts","r",encoding="utf-8").read()

# 1. Delete _tripleCenterVisualTrail from resetRunState
text = text.replace("this._activeEdicts = []; this._scorchTrails = []; this._tripleCenterVisualTrail = null; this._tripleLeftTrail = null; this._tripleRightTrail = null; this._tripleSlashHitEnemyIds.clear();",
    "this._activeEdicts = []; this._scorchTrails = []; this._tripleLeftTrail = null; this._tripleRightTrail = null; this._tripleSlashHitEnemyIds.clear();")

# 2. Simplify update: remove old _updateTripleTrails + life calls
old_update = """    // 副刀时间推进 + 碰撞 (center 纯视觉跳过)
    this._updateTripleTrails(scaledDt);
    if (this._tripleCenterVisualTrail?.active) this._updateTripleTrailLife(this._tripleCenterVisualTrail);
    if (this._tripleLeftTrail?.active) this._updateTripleTrailLife(this._tripleLeftTrail);
    if (this._tripleRightTrail?.active) this._updateTripleTrailLife(this._tripleRightTrail);"""
new_update = ""
text = text.replace(old_update, new_update)

# 3. Delete endSlash old code
old_end = """      this._startTripleSlashSequence(trail);
    }"""
new_end = """      // 实时副刀：松手后停止增长，快速消退
      for (const t of [this._tripleLeftTrail, this._tripleRightTrail]) {
        if (t) (t as any)._tripleSlowingFade = this.elapsed;
      }
    }"""
text = text.replace(old_end, new_end)

# 4. Delete old _tripleCenterVisualTrail from resolveChest
text = text.replace("this._tripleCenterVisualTrail = null; this._tripleLeftTrail = null; this._tripleRightTrail = null; // V0731010: 清空副刀",
    "this._tripleLeftTrail = null; this._tripleRightTrail = null; // V0731010: 清空副刀")

# 5. Delete center from drawTripleSlashTrails
text = text.replace("""    if (this._tripleCenterVisualTrail?.active) this._drawTripleTrail(ctx, this._tripleCenterVisualTrail, 1);
    if (this._tripleLeftTrail?.active) this._drawTripleTrail(ctx, this._tripleLeftTrail, 1);
    if (this._tripleRightTrail?.active) this._drawTripleTrail(ctx, this._tripleRightTrail, 1);""",
    """    if (this._tripleLeftTrail?.active) this._drawTripleTrail(ctx, this._tripleLeftTrail, 1);
    if (this._tripleRightTrail?.active) this._drawTripleTrail(ctx, this._tripleRightTrail, 1);""")

open("src/game/Game.ts","w",encoding="utf-8").write(text)
print("OK")
