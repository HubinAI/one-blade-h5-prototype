/**
 * V0811071: 1~180 FloorRecipe — 阶段怪物池 + 五关心流
 */

import { ENEMY_META, resolveEnemyType } from "../enemyRegistry";

export interface FloorRecipe {
  floor: number;
  primaryEnemy: string;
  primaryExperienceAxis: string;
  resolvedRuntimeType: string;
  secondaryEnemy: string | null;
  mode: string;
  formation: string;
  rhythm: string;
  environment: string;
  elite: string;
  intensityRole: string;
  scene: string;
  seed: number;
}

const BASE_SEED = 20260811;

const POOL_EARLY   = ["infantry","powder","shield"];
const POOL_MID     = ["infantry","powder","shield","splitter","tractor","core"];
const POOL_LATE    = ["infantry","powder","shield","splitter","tractor","core","charger","mover","shooter"];
const POOL_FULL    = ["infantry","powder","shield","splitter","tractor","core","charger","mover","shooter"];

function floorPool(f: number): string[] {
  if (f <= 5)  return POOL_EARLY;
  if (f <= 15) return POOL_MID;
  if (f <= 30) return POOL_LATE;
  return POOL_FULL;
}

const INTENSITY_CYCLE = ["RELAX","INTRO","MIX","PRESSURE","CHECK"] as const;

function intensityRole(f: number): string { return f === 1 ? "TUTORIAL" : INTENSITY_CYCLE[(f-2)%5]; }

// Priority axes for intensity roles
const RELAX_AXES = ["infantry","powder"];
const INTRO_PRIMARIES = ["infantry","powder","shield","splitter","tractor"];

const MODES = ["STANDARD","SWARM","BREACH","RUSH","FLANK"];
const FORMATIONS = ["WIDE","CENTER","WINGS","COLUMN","STAGGER","WALL"];
const RHYTHMS = ["STEADY","PULSE","FRONT","BACK","ALTERNATE"];
const ENVS = ["NONE","TIDE","GALE","HEAVY","GATHER"];
const ELITES = ["fireRing","heal","aura","chargeElite","bannerElite"];

class ShuffleBag {
  private items: string[];
  private bag: string[] = [];
  private seed: number;
  constructor(items: string[], seed: number) { this.items = [...items]; this.seed = seed; this.refill(); }
  private rng(): number { this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff; return this.seed / 0x7fffffff; }
  private refill() { this.bag = [...this.items]; for (let i = this.bag.length-1; i>0; i--) { const j = Math.floor(this.rng()*(i+1)); [this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]]; } }
  next(exclude?: string[], pool?: string[]): string {
    const src = pool ?? this.items;
    const bag = [...src]; for (let i=bag.length-1;i>0;i--){const j=Math.floor(this.rng()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
    for (let i=0;i<bag.length;i++){if(!exclude?.includes(bag[i]))return bag[i];}
    return bag[0];
  }
}

function seededRng(floor: number): () => number {
  let s = (BASE_SEED + floor * 7) | 0;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function pickFrom<R>(rng: () => number, arr: readonly R[], exclude?: R[]): R {
  const pool = exclude ? arr.filter(a => !exclude.includes(a)) : [...arr];
  return pool[Math.floor(rng() * pool.length)];
}

export function generateAllRecipes(): FloorRecipe[] {
  const eliteBag = new ShuffleBag(ELITES, BASE_SEED + 999);
  const recipes: FloorRecipe[] = [];

  for (let f = 1; f <= 180; f++) {
    const rng = seededRng(f);
    const role = intensityRole(f);
    const pool = floorPool(f);

    if (f === 1) {
      const resolved = resolveEnemyType("infantry");
      recipes.push({ floor:1, primaryEnemy:"infantry", primaryExperienceAxis:"MASS", resolvedRuntimeType:resolved.runtimeType, secondaryEnemy:null, mode:"STANDARD", formation:"CENTER", rhythm:"STEADY", environment:"NONE", elite:"fireRing", intensityRole:"TUTORIAL", scene:"tutorial", seed:BASE_SEED });
      continue;
    }

    const prev = recipes[recipes.length-1];
    const prev2 = recipes.length >= 2 ? recipes[recipes.length-2] : null;

    // Primary: floor pool, intensity-influenced, not prev/prev2
    const exclude = [prev.primaryEnemy];
    if (prev2) exclude.push(prev2.primaryEnemy);
    let primary: string;
    if (role === "RELAX") {
      primary = pickFrom(rng, RELAX_AXES, exclude);
    } else if (role === "INTRO") {
      const introPool = pool.filter(e => INTRO_PRIMARIES.includes(e));
      primary = pickFrom(rng, introPool.length>0?introPool:pool, exclude);
    } else {
      primary = pickFrom(rng, pool, exclude);
    }

    // Secondary: MIX role forces secondary, RELAX avoids
    let secondary: string | null = null;
    const secPool = pool.filter(e => e !== primary);
    const secExclude = prev.secondaryEnemy ? [prev.secondaryEnemy] : [];
    const secCandidates = secExclude.length>0 ? secPool.filter(e=>!secExclude.includes(e)) : secPool;
    if (role === "MIX" && secCandidates.length > 0) {
      secondary = secCandidates[Math.floor(rng()*secCandidates.length)];
    } else if (secCandidates.length>0 && rng()>0.6) {
      secondary = secCandidates[Math.floor(rng()*secCandidates.length)];
    }

    // Mode
    const mode = pickFrom(rng, MODES, [prev.mode]);

    // Formation
    let formation = pickFrom(rng, FORMATIONS);
    let diffCount = (mode!==prev.mode?1:0)+(formation!==prev.formation?1:0);
    if (diffCount < 2) formation = pickFrom(rng, FORMATIONS, [prev.formation, formation]);

    // Rhythm + pressure boost
    let rhythm = pickFrom(rng, RHYTHMS);
    if (role === "PRESSURE") {
      rhythm = pickFrom(rng, ["PULSE","RUSH","BREACH"] as any, [prev.rhythm]);
    }
    if (prev2) {
      if (new Set([prev2.formation,prev.formation,formation]).size<2) formation = pickFrom(rng, FORMATIONS, [prev.formation,prev2.formation]);
      if (new Set([prev2.rhythm,prev.rhythm,rhythm]).size<2) rhythm = pickFrom(rng, RHYTHMS, [prev.rhythm,prev2.rhythm]);
    }

    const environment = pickFrom(rng, ENVS);
    const elite = eliteBag.next([prev.elite]);

    const resolved = resolveEnemyType(primary);
    recipes.push({ floor:f, primaryEnemy:primary, primaryExperienceAxis:ENEMY_META[primary]?.experienceAxis??"MASS", resolvedRuntimeType:resolved.runtimeType, secondaryEnemy:secondary, mode, formation, rhythm, environment, elite, intensityRole:role, scene:`mainline_${f}`, seed:BASE_SEED+f });
  }
  return recipes;
}

/** 审计统计 */
export function auditRecipes(recipes: FloorRecipe[]) {
  const primaries: Record<string,number>={}, modes: Record<string,number>={}, formations: Record<string,number>={}, rhythms: Record<string,number>={}, elites: Record<string,number>={}, roles: Record<string,number>={};
  let consecutiveViolations=0, primaryRepeat3=0, modeRepeat=0;
  let axisRepeat3=0, runtimeRepeat3=0;
  for (let i=0;i<recipes.length;i++){
    const r=recipes[i];primaries[r.primaryEnemy]=(primaries[r.primaryEnemy]??0)+1;modes[r.mode]=(modes[r.mode]??0)+1;formations[r.formation]=(formations[r.formation]??0)+1;rhythms[r.rhythm]=(rhythms[r.rhythm]??0)+1;elites[r.elite]=(elites[r.elite]??0)+1;roles[r.intensityRole]=(roles[r.intensityRole]??0)+1;
    if(i>=1){const p=recipes[i-1];let diffs=0;if(r.mode!==p.mode)diffs++;if(r.formation!==p.formation)diffs++;if(r.rhythm!==p.rhythm)diffs++;if(diffs<2)consecutiveViolations++;if(r.mode===p.mode)modeRepeat++;}
    if(i>=2&&r.primaryEnemy===recipes[i-1].primaryEnemy&&r.primaryEnemy===recipes[i-2].primaryEnemy)primaryRepeat3++;
    // V0811072: axis + runtime audit
    if(i>=2) {
      const a1=recipes[i-2].primaryExperienceAxis, a2=recipes[i-1].primaryExperienceAxis, a3=r.primaryExperienceAxis;
      if(a1===a2&&a2===a3) axisRepeat3++;
      const r1=recipes[i-2].resolvedRuntimeType, r2=recipes[i-1].resolvedRuntimeType, rr=r.resolvedRuntimeType;
      if(r1===r2&&r2===rr) runtimeRepeat3++;
    }
  }
  return {primaries,modes,formations,rhythms,elites,roles,consecutiveViolations,primaryRepeat3,modeRepeat,axisRepeat3,runtimeRepeat3,total:recipes.length};
}
