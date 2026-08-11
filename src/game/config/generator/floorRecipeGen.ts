/**
 * V0811061: 1~180 FloorRecipe 确定性生成器
 * ShuffleBag + adjacency constraints + seed
 */

export interface FloorRecipe {
  floor: number;
  primaryEnemy: string;
  secondaryEnemy: string | null;
  mode: string;
  formation: string;
  rhythm: string;
  environment: string;
  elite: string;
  scene: string;
  seed: number;
}

const BASE_SEED = 20260811;
const NORMAL_POOL = ["infantry","powder","tractor","splitter","core","shield","charger","flanker","linker"];
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
  next(exclude?: string[]): string {
    for (let i=0; i<this.bag.length; i++) {
      const candidate = this.bag[i];
      if (!exclude?.includes(candidate)) { const picked = this.bag.splice(i,1)[0]; if (this.bag.length===0) this.refill(); return picked; }
    }
    this.refill(); return this.next(exclude);
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
  const enemyBag = new ShuffleBag(NORMAL_POOL, BASE_SEED);
  const eliteBag = new ShuffleBag(ELITES, BASE_SEED + 999);
  const recipes: FloorRecipe[] = [];

  for (let f = 1; f <= 180; f++) {
    const rng = seededRng(f);

    // Floor 1: fixed tutorial
    if (f === 1) {
      recipes.push({ floor:1, primaryEnemy:"infantry", secondaryEnemy:null, mode:"STANDARD", formation:"CENTER", rhythm:"STEADY", environment:"NONE", elite:"fireRing", scene:"tutorial", seed:BASE_SEED });
      continue;
    }

    const prev = recipes[recipes.length - 1];
    const prev2 = recipes.length >= 2 ? recipes[recipes.length - 2] : null;

    // Primary: shuffle bag, not same as prev, not same as prev2
    const exclude = [prev.primaryEnemy];
    if (prev2) exclude.push(prev2.primaryEnemy);
    const primary = enemyBag.next(exclude);

    // Secondary: from pool, not primary, not prev.secondary if possible
    let secondary: string | null = null;
    const secPool = NORMAL_POOL.filter(e => e !== primary);
    const secExclude = prev.secondaryEnemy ? [prev.secondaryEnemy] : [];
    const secCandidates = secExclude.length > 0 ? secPool.filter(e => !secExclude.includes(e)) : secPool;
    if (secCandidates.length > 0 && rng() > 0.4) secondary = secCandidates[Math.floor(rng() * secCandidates.length)];

    // Mode: no repeat with prev
    const mode = pickFrom(rng, MODES, [prev.mode]);

    // Formation: ensure 2+ different from prev
    let formation = pickFrom(rng, FORMATIONS);
    let diffCount = (mode !== prev.mode ? 1 : 0) + (formation !== prev.formation ? 1 : 0);
    if (diffCount < 2) {
      const altFormations = FORMATIONS.filter(fm => fm !== prev.formation && fm !== formation);
      if (altFormations.length > 0) formation = altFormations[Math.floor(rng() * altFormations.length)];
    }

    // Rhythm: ensure at least 2 formation in any 3 consecutive
    let rhythm = pickFrom(rng, RHYTHMS);
    if (prev2) {
      const last3Formations = [prev2.formation, prev.formation, formation];
      if (new Set(last3Formations).size < 2) { formation = pickFrom(rng, FORMATIONS, [prev.formation, prev2.formation]); }
      const last3Rhythms = [prev2.rhythm, prev.rhythm, rhythm];
      if (new Set(last3Rhythms).size < 2) { rhythm = pickFrom(rng, RHYTHMS, [prev.rhythm, prev2.rhythm]); }
    }

    // Environment: random
    const environment = pickFrom(rng, ENVS);

    // Elite: shuffle bag, not repeat prev
    const elite = eliteBag.next([prev.elite]);

    recipes.push({ floor:f, primaryEnemy:primary, secondaryEnemy:secondary, mode, formation, rhythm, environment, elite, scene:`mainline_${f}`, seed:BASE_SEED+f });
  }
  return recipes;
}

/** 审计统计 */
export function auditRecipes(recipes: FloorRecipe[]) {
  const primaries: Record<string,number>={}, modes: Record<string,number>={}, formations: Record<string,number>={}, rhythms: Record<string,number>={}, elites: Record<string,number>={};
  let consecutiveViolations=0, primaryRepeat3=0, modeRepeat=0;
  for (let i=0; i<recipes.length; i++) {
    const r=recipes[i]; primaries[r.primaryEnemy]=(primaries[r.primaryEnemy]??0)+1; modes[r.mode]=(modes[r.mode]??0)+1; formations[r.formation]=(formations[r.formation]??0)+1; rhythms[r.rhythm]=(rhythms[r.rhythm]??0)+1; elites[r.elite]=(elites[r.elite]??0)+1;
    if (i>=1) {
      const p=recipes[i-1]; let diffs=0; if(r.mode!==p.mode)diffs++; if(r.formation!==p.formation)diffs++; if(r.rhythm!==p.rhythm)diffs++; if(diffs<2)consecutiveViolations++;
      if(r.mode===p.mode)modeRepeat++;
    }
    if (i>=2 && r.primaryEnemy===recipes[i-1].primaryEnemy && r.primaryEnemy===recipes[i-2].primaryEnemy) primaryRepeat3++;
  }
  return { primaries, modes, formations, rhythms, elites, consecutiveViolations, primaryRepeat3, modeRepeat, total: recipes.length };
}
