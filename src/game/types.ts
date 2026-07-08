export type Vec2 = {
  x: number;
  y: number;
};

export type BladeTier = "weak" | "normal" | "strong" | "burst";
export type EnemyKind = "infantry" | "shield" | "powder" | "core";
export type PickupKind = "drum" | "soul" | "oil";
export type GamePhase = "playing" | "buffChoice" | "revive" | "won" | "lost";
export type RatingGrade = "C" | "B" | "A" | "S" | "SS" | "神之一刀";
export type BuffId =
  | "longBlade"
  | "burstLine"
  | "breath"
  | "shieldBreaker"
  | "fireOil"
  | "coreBreak"
  | "warDrum"
  | "fortify"
  | "doubleBlade"
  | "paperSplash";

export type EnemySpawn = {
  kind: EnemyKind;
  x: number;
  yOffset?: number;
};

export type PickupSpawn = {
  kind: PickupKind;
  x: number;
  yOffset?: number;
};

export type WaveConfig = {
  name: string;
  delay: number;
  spawnAt?: number;
  speedMultiplier?: number;
  enemies: EnemySpawn[];
  pickups?: PickupSpawn[];
};

export type LevelConfig = {
  id: number;
  title: string;
  subtitle: string;
  initialEnergy: number;
  hp: number;
  enemySpeed: number;
  pickupChance: number;
  durationSeconds: number;
  buffTimes: number[];
  waves: WaveConfig[];
};

export type Enemy = {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  hpDamage: number;
  score: number;
  energyGain: number;
  alive: boolean;
  ignited: boolean;
  marked: boolean;
  shieldCrack: number;
  flash: number;
  wobble: number;
};

export type Pickup = {
  id: string;
  kind: PickupKind;
  x: number;
  y: number;
  radius: number;
  active: boolean;
  pulse: number;
  life: number;
  maxLife: number;
};

export type SlashPoint = Vec2 & {
  t: number;
  energyRatio: number;
};

export type SlashTrail = {
  id: string;
  tier: BladeTier;
  lockedEnergy: number;
  maxPower: number;
  remainingPower: number;
  maxDuration: number;
  remainingDuration: number;
  maxPathLength: number;
  remainingPathLength: number;
  pathUsed: number;
  widthMultiplier: number;
  energyBank: number;
  explosionCount: number;
  coreCollapseCount: number;
  points: SlashPoint[];
  hitEnemyIds: Set<string>;
  hitPickupIds: Set<string>;
  pendingExplosionIds: Set<string>;
  pendingCoreIds: Set<string>;
  oilTriggeredIds: Set<string>;
  hasOil: boolean;
  kills: number;
  chain: number;
  active: boolean;
};

export type ParticleKind = "paper" | "spark" | "ring" | "rune" | "smoke" | "slash";

export type Particle = Vec2 & {
  id: string;
  kind: ParticleKind;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
};

export type FloatingText = Vec2 & {
  id: string;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

export type BattleStats = {
  kills: number;
  maxSingleBlade: number;
  maxChain: number;
  oneBladeBreaks: number;
  coreHits: number;
  coreCollapses: number;
  explosions: number;
  usedReviveAd: boolean;
  slashes: number;
  pickups: number;
  score: number;
};

export type RunRewards = {
  coins: number;
  battlePass: number;
  shardName: string;
  shardCount: number;
  doubled: boolean;
  chestOpened: boolean;
  adChestOpened: boolean;
};

export type RunProgress = {
  runIndex: number;
  chestProgress: number;
  chestTarget: number;
  codexFound: number;
  codexTotal: number;
  oneBladeChallenge: number;
  oneBladeChallengeTarget: number;
  fragmentName: string;
  fragmentCount: number;
  fragmentTarget: number;
};

export type BattleResult = {
  win: boolean;
  levelId: number;
  levelTitle: string;
  duration: number;
  completedGoal: boolean;
  score: number;
  kills: number;
  maxSingleBlade: number;
  maxChain: number;
  triggeredOneBlade: boolean;
  hitCore: boolean;
  coreCollapseCount: number;
  explosiveCount: number;
  usedReviveAd: boolean;
  canReviveAd: boolean;
  canDoubleReward: boolean;
  slashes: number;
  rating: RatingGrade;
  nextRatingHint: string;
  nearMisses: string[];
  rewards: RunRewards;
  progress: RunProgress;
};
