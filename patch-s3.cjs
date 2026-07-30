// S3 patch: insert formation mode into Game.ts
const fs = require("fs");
const path = require("path");
const f = path.join(__dirname, "src/game/Game.ts");
let s = fs.readFileSync(f, "utf8");

// 1. gameMode type union — add "bossFormation"
s = s.replace(
  'private gameMode: "normal" | "boss" | "bossReactive" | "strategySlice" = "normal";',
  'private gameMode: "normal" | "boss" | "bossReactive" | "strategySlice" | "bossFormation" = "normal";'
);

// 2. Import FormationDirector
s = s.replace(
  'import { BossStrategySliceController, type SliceCollisionEvent } from "./systems/BossStrategySliceController";',
  'import { BossStrategySliceController, type SliceCollisionEvent } from "./systems/BossStrategySliceController";\nimport { BossFormationDirector } from "./systems/BossFormationDirector";'
);

// 3. Field
s = s.replace(
  'private strategySliceController: BossStrategySliceController | null = null;',
  'private strategySliceController: BossStrategySliceController | null = null;\n  private formationDirector: BossFormationDirector | null = null;'
);

// 4. Constructor: add bossFormation routing
s = s.replace(
  'if (bossFlow === "strategySlice") {\n        this.gameMode = "strategySlice";\n      } else {',
  'if (bossFlow === "strategySlice") {\n        this.gameMode = "strategySlice";\n      } else if (bossFlow === "bossFormation") {\n        this.gameMode = "bossFormation";\n      } else {'
);

// 5. Add bossFormation to reactive energy init
s = s.replace(
  /if \(this\.gameMode === "bossReactive" \|\| this\.gameMode === "strategySlice"\) \{/g,
  'if (this.gameMode === "bossReactive" || this.gameMode === "strategySlice" || this.gameMode === "bossFormation") {'
);

// 6. Update routing: add bossFormation before strategySlice
s = s.replace(
  'this.updateReactiveBossMode(scaledDt, frameDt);\n      return;\n    }\n\n    // V0723016-S1: 策略切片模式主循环',
  'this.updateReactiveBossMode(scaledDt, frameDt);\n      return;\n    }\n\n    // S3: 阵势压境\n    if (this.gameMode === "bossFormation") {\n      this.updateFormationMode(scaledDt);\n      return;\n    }\n\n    // V0723016-S1: 策略切片模式主循环'
);

// 7. Render routing
s = s.replace(
  '// V0723016-S1: 策略切片模式渲染\n    if (this.gameMode === "strategySlice") {',
  '// S3: 阵势压境渲染\n    if (this.gameMode === "bossFormation") {\n      this.renderFormationMode(ctx);\n      return;\n    }\n    // V0723016-S1: 策略切片模式渲染\n    if (this.gameMode === "strategySlice") {'
);

// 8. Slash routing
s = s.replace(
  '// V0723016-S1: 策略切片模式路由\n    if (this.gameMode === "strategySlice" && this.strategySliceController) {',
  '// S3: 阵势压境挥刀\n    if (this.gameMode === "bossFormation" && this.formationDirector) {\n      this.resolveFormationSlash(a, b);\n      return;\n    }\n    // V0723016-S1: 策略切片模式路由\n    if (this.gameMode === "strategySlice" && this.strategySliceController) {'
);

// 9. Passive recovery skip for formation
s = s.replace(
  'if (this.gameMode !== "strategySlice" && !this.currentSlash?.active',
  'if (this.gameMode !== "strategySlice" && this.gameMode !== "bossFormation" && !this.currentSlash?.active'
);

// 10. Formation init in boss init block
s = s.replace(
  'if (urlSeed) this.strategySliceController.setSeed(parseInt(urlSeed, 10) || 1);\n    } else {',
  'if (urlSeed) this.strategySliceController.setSeed(parseInt(urlSeed, 10) || 1);\n    } else if (this.gameMode === "bossFormation") {\n      this.formationDirector = new BossFormationDirector();\n      const urlSf = new URLSearchParams(window.location.search).get("seed");\n      if (urlSf) this.formationDirector.setSeed(parseInt(urlSf, 10) || 1);\n      this.energy = 40;\n    } else {'
);

// 10.5. CRITICAL: initializeThunderGeneralBoss 强制重置 bug
// patch 早期版本漏改这里，导致 bossFormation 在第 8588 行被强制改回 "boss"，
// 进而第 8621 行判 gameMode === "bossFormation" 创建 formationDirector 时已失效，
// 跳到 else 创建 legacy BossController，玩家看到的是 legacy Boss 战。
s = s.replace(
  'if (this.gameMode === "bossReactive") {\n      this.gameMode = "bossReactive";\n    } else if (this.gameMode === "strategySlice") {\n      this.gameMode = "strategySlice";\n    } else {\n      this.gameMode = "boss";\n    }\n    // 清空场上所有敌人',
  'if (this.gameMode === "bossReactive") {\n      this.gameMode = "bossReactive";\n    } else if (this.gameMode === "strategySlice") {\n      this.gameMode = "strategySlice";\n    } else if ((this.gameMode as string) === "bossFormation") {\n      this.gameMode = "bossFormation";\n    } else {\n      this.gameMode = "boss";\n    }\n    // 清空场上所有敌人'
);

// 11. Formation methods — insert before class closing brace
const formMethods = `
  // ================================================================
  // S3: Formation methods
  // ================================================================

  private updateFormationMode(scaledDt: number): void {
    const fd = this.formationDirector;
    if (!fd) return;
    this.elapsed += scaledDt;
    this.updateActiveSlash(scaledDt);
    this.updateParticles(scaledDt);
    fd.update(scaledDt, this.energy, this.hp);
    const defEvents = fd.checkDefenseLine();
    for (const ev of defEvents) {
      if (ev.kind === "threat_reached_defense") {
        this.hp = Math.max(1, this.hp - Math.round(this.maxHp * 0.08));
        this.screenShake = 0.3; this.flash = 0.2;
        this.particles.push(...sparkBurst(ev.position, 6, "#c0392b", 30));
      }
    }
    this.screenShake = Math.max(0, this.screenShake - scaledDt * 2.7);
    this.flash = Math.max(0, this.flash - scaledDt * 2.2);
    if (fd.completed) this.finishBattle();
  }

  private resolveFormationSlash(a: Vec2, b: Vec2): void {
    const fd = this.formationDirector;
    if (!fd) return;
    const events = fd.resolveSlash(a, b);
    let totalGain = 0;
    for (const ev of events) {
      const pos = ev.position;
      if (ev.kind === "threat_destroyed") {
        this.particles.push(...sparkBurst(pos, 4, "#ff4040", 25));
      } else if (ev.kind === "energy_collected") {
        this.particles.push(...sparkBurst(pos, 3, "#5bc0ff", 20));
        totalGain += 20;
      } else if (ev.kind === "counter_hit") {
        this.particles.push(...sparkBurst(pos, 6, "#ffd700", 35));
        if (this.energy >= 70) {
          const reflEvents = fd.reflectCounter();
          this.energy = 25; totalGain = 0;
          for (const re of reflEvents) {
            if (re.kind === "counter_reflected") {
              this.particles.push(...sparkBurst(re.position, 10, "#ffd700", 50));
              this.screenShake = 0.6;
            }
          }
        } else { this.particles.push(...sparkBurst(pos, 4, "#999", 15)); }
      } else if (ev.kind === "forbidden_hit") {
        this.particles.push(...sparkBurst(pos, 8, "#c0392b", 35));
        this.hp = Math.max(1, this.hp - Math.round(this.maxHp * 0.08));
        this.energy = Math.max(0, this.energy - 20);
        this.screenShake = 0.4; this.flash = 0.3;
      }
    }
    this.energy = Math.max(0, this.energy - 8 + totalGain);
    const hitCount = events.filter(e => e.kind === "threat_destroyed" || e.kind === "energy_collected").length;
    if (hitCount >= 2) this.energy = Math.min(100, this.energy + ([0, 5, 8][Math.min(hitCount - 2, 2)] || 0));
  }

  private renderFormationMode(ctx: CanvasRenderingContext2D): void {
    const fd = this.formationDirector;
    if (!fd) return;
    const snap = fd.snapshot;
    const t = this.elapsed;
    const { drawFormationBoss, drawDefenseLine, drawAllFormations, drawSlashPreview } = require("./systems/bossFormationHUD");
    drawFormationBoss(ctx, t, snap.formations.length === 0);
    const previewHits = new Set<string>();
    let previewForbidden = false;
    if (this.currentSlash?.active) {
      const aPos = { x: this.currentSlash.anchor.x, y: this.currentSlash.anchor.y };
      const bPos = { x: this.currentSlash.pointer.x, y: this.currentSlash.pointer.y };
      const preview = fd.previewSlash(aPos, bPos);
      for (const n of preview.hitNodes) previewHits.add(n.id);
      previewForbidden = preview.hitsForbidden;
      drawSlashPreview(ctx, aPos, bPos, previewForbidden);
    }
    drawAllFormations(ctx, snap.formations, t, snap.counterReady, previewHits, previewForbidden);
    const hasClose = snap.formations.some(fm =>
      fm.nodes.some(n => n.type === "threat" && n.active && n.proximity > 0.7)
    );
    drawDefenseLine(ctx, t, hasClose);
    if (snap.windowType !== "none") {
      const lb = snap.windowType === "large" ? "大破绽" : "小破绽";
      const cl = snap.windowType === "large" ? "#ff6a33" : "#5bc0ff";
      ctx.save(); ctx.font = snap.windowType === "large" ? "bold 18px sans-serif" : "bold 13px sans-serif";
      ctx.textAlign = "center"; ctx.fillStyle = cl;
      ctx.shadowColor = cl; ctx.shadowBlur = snap.windowType === "large" ? 14 : 6;
      ctx.fillText(lb, 195, 640); ctx.shadowBlur = 0; ctx.restore();
    }
  }
`

// Find the class closing brace — look for the LAST "  }" before "export function"
const lines = s.split('\n');
let classCloseIdx = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].trim() === 'export function getLevelById') {
    // Find the "}" before it (skip empty lines)
    for (let j = i - 1; j >= 0; j--) {
      if (lines[j].trim() === '}') {
        classCloseIdx = j;
        break;
      }
    }
    break;
  }
}
if (classCloseIdx > 0) {
  const insertAt = classCloseIdx;
  const before = lines.slice(0, insertAt).join('\n');
  const after = lines.slice(insertAt).join('\n');
  const formLines = formMethods.split('\n');
  s = before + formMethods + '\n' + after;
}

fs.writeFileSync(f, s, "utf8");
console.log("Game.ts patched successfully");
