/**
 * V0812016: 1~180 FloorRecipe — Registry唯一解锁源 + INTRO认知节奏
 *
 * - 怪物池由 ENEMY_META[id].unlockFloor <= floor 唯一决定
 * - 新怪首次出现强制INTRO: primary=新怪, secondary=null/infantry, 轻量占比
 * - INTRO → MIX → PRESSURE 认知递进
 * - CHECK只用已教学机制
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

// ═══ 首次INTRO关卡映射(新怪首次出现) ═══
const FIRST_INTRO_FLOORS: Record<number, string> = {
  2: "powder",
  3: "shield",
  7: "splitter",
  12: "tractor",
  17: "charger",
  22: "mover",
  27: "shooter",
  31: "core",
};

/** 已解锁的可用池(含proxy) */
function availablePool(floor: number): string[] {
  return Object.entries(ENEMY_META)
    .filter(([, m]) => m.unlockFloor <= floor)
    .map(([id]) => id);
}

const MODES = ["STANDARD", "SWARM", "BREACH", "RUSH", "FLANK"];
const FORMATIONS = ["WIDE", "CENTER", "WINGS", "COLUMN", "STAGGER", "WALL"];
const RHYTHMS = ["STEADY", "PULSE", "FRONT", "BACK", "ALTERNATE"];
const ENVS = ["NONE", "TIDE", "GALE", "HEAVY", "GATHER"];
const ELITES = ["fireRing", "heal", "aura", "chargeElite", "bannerElite"];
const INTENSITY_CYCLE = ["RELAX", "INTRO", "MIX", "PRESSURE", "CHECK"] as const;

/** 轻量primary (RELAX友好) */
const RELAX_AXES = ["infantry", "powder"];

class ShuffleBag {
  private items: string[];
  private bag: string[] = [];
  private seed: number;
  constructor(items: string[], seed: number) { this.items = [...items]; this.seed = seed; this.refill(); }
  private rng(): number { this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff; return this.seed / 0x7fffffff; }
  private refill() { this.bag = [...this.items]; for (let i = this.bag.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; } }
  next(exclude?: string[], pool?: string[]): string {
    const src = pool ?? this.items;
    const bag = [...src]; for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    for (let i = 0; i < bag.length; i++) { if (!exclude?.includes(bag[i])) return bag[i]; }
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
  const seenMechanisms = new Set<string>(); // 已完成INTRO的机制
  let useCount: Record<string, number> = {};  // 各primary使用计数

  for (let f = 1; f <= 180; f++) {
    const rng = seededRng(f);
    const pool = availablePool(f);
    const prev = recipes[recipes.length - 1];
    const prev2 = recipes.length >= 2 ? recipes[recipes.length - 2] : null;

    // ═══ F1 固定 ═══
    if (f === 1) {
      const resolved = resolveEnemyType("infantry");
      recipes.push({ floor: 1, primaryEnemy: "infantry", primaryExperienceAxis: "MASS", resolvedRuntimeType: resolved.runtimeType, secondaryEnemy: null, mode: "STANDARD", formation: "CENTER", rhythm: "STEADY", environment: "NONE", elite: "fireRing", intensityRole: "TUTORIAL", scene: "tutorial", seed: BASE_SEED });
      useCount["infantry"] = 1;
      continue;
    }

    // ═══ Determine intensityRole ═══
    const firstIntro = FIRST_INTRO_FLOORS[f];
    let role: string;
    if (f === 2) {
      role = "INTRO"; // F2 always INTRO (first new mechanic)
    } else if (firstIntro) {
      role = "INTRO"; // 新怪首次出现强制INTRO
    } else {
      // 正常5关循环, 但INTRO没新怪时降为RELAX
      const cycleRole = INTENSITY_CYCLE[(f - 2) % 5];
      if (cycleRole === "INTRO") {
        // 本周期INTRO但无新怪: 降为RELAX或保持(选一个未用过或少用的)
        role = "RELAX";
      } else {
        role = cycleRole;
      }
    }

    // ═══ Primary selection ═══
    const exclude = [prev.primaryEnemy];
    if (prev2) exclude.push(prev2.primaryEnemy);
    let primary: string;

    if (firstIntro) {
      // 首次INTRO: primary=新怪, 强制
      primary = firstIntro;
    } else if (role === "RELAX") {
      const relaxPool = pool.filter(e => RELAX_AXES.includes(e) && !exclude.includes(e));
      primary = relaxPool.length > 0
        ? relaxPool[Math.floor(rng() * relaxPool.length)]
        : pickFrom(rng, pool, exclude);
    } else if (role === "CHECK") {
      // CHECK: 只用已教学机制
      const checkPool = pool.filter(e => seenMechanisms.has(e) && !exclude.includes(e));
      primary = checkPool.length > 0
        ? pickFrom(rng, checkPool, exclude)
        : pickFrom(rng, pool, exclude);
    } else {
      // MIX / PRESSURE: 从已解锁池选(优先已教学机制)
      const taught = pool.filter(e => seenMechanisms.has(e) && !exclude.includes(e));
      const fresh = pool.filter(e => !seenMechanisms.has(e) && !exclude.includes(e));
      if (role === "PRESSURE" && taught.length > 0) {
        primary = pickFrom(rng, taught);
      } else if (taught.length > 0 && (fresh.length === 0 || rng() < 0.75)) {
        primary = pickFrom(rng, taught);
      } else {
        primary = pickFrom(rng, pool, exclude);
      }
    }

    // INTRO新怪加入已教学集合
    if (firstIntro || (role === "INTRO" && !seenMechanisms.has(primary))) {
      seenMechanisms.add(primary);
    }
    // 也记录所有首次出现的primary
    if (!seenMechanisms.has(primary)) {
      seenMechanisms.add(primary);
    }
    useCount[primary] = (useCount[primary] ?? 0) + 1;

    // ═══ Secondary selection ═══
    let secondary: string | null = null;
    if (role === "INTRO") {
      // INTRO关: 如果是首次INTRO, secondary极简
      if (firstIntro) {
        secondary = null; // 纯focus
      } else {
        // 无新怪INTRO: 可用infantry做辅助
        secondary = "infantry";
      }
    } else if (role === "RELAX") {
      secondary = null;
    } else if (role === "MIX" || role === "PRESSURE") {
      const secPool = pool.filter(e => e !== primary && seenMechanisms.has(e));
      const secExclude = prev.secondaryEnemy ? [prev.secondaryEnemy] : [];
      const candidates = secExclude.length > 0 ? secPool.filter(e => !secExclude.includes(e)) : secPool;
      if (candidates.length > 0) {
        secondary = candidates[Math.floor(rng() * candidates.length)];
      }
    }

    // ═══ Mode / Formation / Rhythm ═══
    const mode = pickFrom(rng, MODES, [prev.mode]);

    let formation = pickFrom(rng, FORMATIONS);
    let diffCount = (mode !== prev.mode ? 1 : 0) + (formation !== prev.formation ? 1 : 0);
    if (diffCount < 2) formation = pickFrom(rng, FORMATIONS, [prev.formation, formation]);

    let rhythm = pickFrom(rng, RHYTHMS);
    if (role === "PRESSURE") {
      rhythm = pickFrom(rng, ["PULSE", "FRONT", "ALTERNATE"] as any, [prev.rhythm]);
    }
    if (prev2) {
      if (new Set([prev2.formation, prev.formation, formation]).size < 2)
        formation = pickFrom(rng, FORMATIONS, [prev.formation, prev2.formation]);
      if (new Set([prev2.rhythm, prev.rhythm, rhythm]).size < 2)
        rhythm = pickFrom(rng, RHYTHMS, [prev.rhythm, prev2.rhythm]);
    }

    const environment = pickFrom(rng, ENVS);
    const elite = eliteBag.next([prev.elite]);

    const resolved = resolveEnemyType(primary);
    recipes.push({
      floor: f, primaryEnemy: primary,
      primaryExperienceAxis: ENEMY_META[primary]?.experienceAxis ?? "MASS",
      resolvedRuntimeType: resolved.runtimeType,
      secondaryEnemy: secondary,
      mode, formation, rhythm, environment, elite,
      intensityRole: role,
      scene: `mainline_${f}`,
      seed: BASE_SEED + f,
    });
  }

  return recipes;
}

/** 审计统计 */
export function auditRecipes(recipes: FloorRecipe[]) {
  const primaries: Record<string, number> = {}, modes: Record<string, number> = {}, formations: Record<string, number> = {}, rhythms: Record<string, number> = {}, elites: Record<string, number> = {}, roles: Record<string, number> = {};
  let consecutiveViolations = 0, primaryRepeat3 = 0, modeRepeat = 0;
  let axisRepeat3 = 0, runtimeRepeat3 = 0;
  let unlockViolations = 0, firstIntroViolations = 0, checkViolations = 0;
  const seenMechanisms = new Set<string>();
  if (recipes.length > 0) seenMechanisms.add(recipes[0].primaryEnemy); // F1 tutorial已教学

  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i];
    primaries[r.primaryEnemy] = (primaries[r.primaryEnemy] ?? 0) + 1; modes[r.mode] = (modes[r.mode] ?? 0) + 1; formations[r.formation] = (formations[r.formation] ?? 0) + 1; rhythms[r.rhythm] = (rhythms[r.rhythm] ?? 0) + 1; elites[r.elite] = (elites[r.elite] ?? 0) + 1; roles[r.intensityRole] = (roles[r.intensityRole] ?? 0) + 1;

    // unlock违规
    const meta = ENEMY_META[r.primaryEnemy];
    if (!meta || meta.unlockFloor > r.floor) unlockViolations++;
    if (r.secondaryEnemy) {
      const sm = ENEMY_META[r.secondaryEnemy];
      if (!sm || sm.unlockFloor > r.floor) unlockViolations++;
    }

    // 首次出现非INTRO (F1豁免, tutorial特殊)
    if (r.floor > 1 && !seenMechanisms.has(r.primaryEnemy)) {
      if (r.intensityRole !== "INTRO") firstIntroViolations++;
      seenMechanisms.add(r.primaryEnemy);
    }

    // CHECK使用未教学机制 (F1豁免)
    if (r.floor > 1 && r.intensityRole === "CHECK" && !seenMechanisms.has(r.primaryEnemy)) {
      checkViolations++;
    }

    if (i >= 1) { const p = recipes[i - 1]; let diffs = 0; if (r.mode !== p.mode) diffs++; if (r.formation !== p.formation) diffs++; if (r.rhythm !== p.rhythm) diffs++; if (diffs < 2) consecutiveViolations++; if (r.mode === p.mode) modeRepeat++; }
    if (i >= 2 && r.primaryEnemy === recipes[i - 1].primaryEnemy && r.primaryEnemy === recipes[i - 2].primaryEnemy) primaryRepeat3++;
    if (i >= 2) {
      const a1 = recipes[i - 2].primaryExperienceAxis, a2 = recipes[i - 1].primaryExperienceAxis, a3 = r.primaryExperienceAxis;
      if (a1 === a2 && a2 === a3) axisRepeat3++;
      const r1 = recipes[i - 2].resolvedRuntimeType, r2 = recipes[i - 1].resolvedRuntimeType, rr = r.resolvedRuntimeType;
      if (r1 === r2 && r2 === rr) runtimeRepeat3++;
    }
  }
  return { primaries, modes, formations, rhythms, elites, roles, consecutiveViolations, primaryRepeat3, modeRepeat, axisRepeat3, runtimeRepeat3, unlockViolations, firstIntroViolations, checkViolations, total: recipes.length };
}
