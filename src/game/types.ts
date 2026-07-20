export type Vec2 = {
  x: number;
  y: number;
};

export type BladeTier = "weak" | "normal" | "strong" | "burst";
export type EnemyKind = "infantry" | "shield" | "powder" | "core" | "elite" | "boss" | "splitter" | "tractor";
export type EliteKind = "fireRing" | "heal" | "aura";
export type BossId = "yaoWang" | "moXiu" | "huaYao";
export type PickupKind = "drum" | "soul" | "oil";
export type GamePhase = "playing" | "buffChoice" | "revive" | "won" | "lost" | "chestOpen" | "paused_for_chest";
export type RatingGrade = "C" | "B" | "A" | "S" | "SS" | "神之一刀";

// ---- P4.2: 统一播报调度 ----
export type BattleNoticePriority = "S" | "A" | "B";
export type BattleNoticeCategory = "victory" | "defeat" | "boss" | "elite" | "mechanic" | "milestone" | "system";
export type BattleNoticeStyle = "gold" | "danger" | "purple" | "blue" | "neutral";
export type BattleNotice = {
  id: string;
  text: string;
  subtext?: string;
  priority: BattleNoticePriority;
  category: BattleNoticeCategory;
  style: BattleNoticeStyle;
  duration: number;
  elapsed: number;
  dedupeKey: string;
  cooldown: number;
  interrupt: boolean;
  createdAt: number;
  /** P4.2A.3: 自定义Y坐标 */
  anchorY?: number;
  /** P4.2A.3: 布局类型 */
  layout?: "default" | "boss-intro" | "boss-phase" | "elite";
};

export type CombatFloatCategory = "damage" | "mechanic" | "pickup" | "energy" | "status" | "tutorial" | "blade-tier";
export type CombatFloatPriority = "A" | "B" | "C";

// ---- 战术指令路线系统 ----
export type TacticalRoute = "scorch" | "pierce" | "ironWall";

export type BuffId =
  | "oilSoak"       // 燎原1：火油浸润
  | "chainFuse"     // 燎原2：连锁引信
  | "scorch"        // 燎原3：燎原
  | "pierceShield"  // 贯阵1：穿盾
  | "shatterCore"   // 贯阵2：碎阵
  | "shatterArmy"   // 贯阵3：破军
  | "fortress"      // 鐵壁1：堅城
  | "warDrum"       // 鐵壁2：鼓阵
  | "soulReturn"    // 鐵壁3：魂返
  | "chest_first_clear"; // 第一关宝箱固定Buff（V0715008）

// ---- 技能雷达四维 ----
export type SkillDimension = "momentum" | "precision" | "shatter" | "guard";
export type SkillScores = {
  momentum: number;   // 势：蓄势能力
  precision: number;  // 斩：精准能力
  shatter: number;    // 破：破阵能力
  guard: number;      // 守：御守能力
};

export type SkillMilestone = {
  id: string;
  dimension: SkillDimension;
  title: string;
  achieved: boolean;
  progress: number;
  target: number;
};

export type EnemySpawn = {
  kind: EnemyKind;
  x: number;
  yOffset?: number;
  count?: number;  // 数量，1 表示单只
};

export type PickupSpawn = {
  kind: PickupKind;
  x: number;
  yOffset?: number;
};

export type MidfieldEventType = 'none' | 'gather' | 'charge_pause';

export type WaveConfig = {
  name: string;
  delay: number;
  spawnAt?: number;
  speedMultiplier?: number;
  enemies: EnemySpawn[];
  pickups?: PickupSpawn[];
  midfieldEventType?: MidfieldEventType;
  eventTitle?: string;
};

// ---- 战术简报数据 ----
export type BriefingData = {
  highlightEnemies: Array<{ kind: EnemyKind; label: string; icon: string }>;
  tacticalHint: string;
  initialBladeTier: string;
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
  briefing?: BriefingData;
  /** 精英怪出现时间（秒），0=无 */
  eliteSpawnAt?: number;
  /** 精英怪子类型 */
  eliteKind?: EliteKind;
  /** Boss ID，undefined=无Boss */
  bossId?: BossId;
  /** 阵眼阵法ID */
  formationId?: string;
  /** 宝箱后爆发怪潮（V0715008 新增，二次打磨改用 edictBurstRounds） */
  postChestWaves?: WaveConfig[];
  /** 第一关固定宝箱Buff ID（V0715008 新增） */
  chestBuffId?: string;
  /** entryPhase 前5关覆写（V0715008 新增） */
  entryOverride?: { multiplier: number; endY: number; maxDuration: number; spawnY: number };
};

/** 军令爆发阶段类型（二次打磨新增） */
export type BattlePhase = 'main_waves' | 'elite' | 'chest' | 'edict_burst' | 'result';

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
  /** 鐵壁堅城buff：触线后减速 */
  slowedTimer: number;
  /** 精英怪子类型 */
  eliteKind?: EliteKind;
  /** Boss ID */
  bossId?: BossId;
  /** Boss当前阶段 (0=phase1, 1=phase2, 2=phase3) */
  bossPhase?: number;
  /** 技能计时器 */
  skillTimer?: number;
  /** Boss技能冷却 */
  skillCooldown?: number;
  /** 阵眼阵法ID */
  formationId?: string;
  /** 当前亮字索引 */
  formationLitIndex?: number;
  /** 亮字切换计时器 */
  formationLitTimer?: number;
  /** 切错字次数 */
  formationWrongHits?: number;
  /** 中场聚阵：原始x坐标（归位用） */
  homeX?: number;
  /** 蓄冲倒计时器：>0表示正在蓄力，-1表示已冲刺完毕 */
  chargeTimer?: number;
  /** 中场事件波及标记（只有本波敌人受影响） */
  spawnedWithEvent?: 'gather' | 'charge_pause';
  /** 急冲兵：出生后0.8s速度×2.2，之后×0.8 */
  rushTimer?: number;
  /** 蛇形兵初始y（用于 sin 摆动） */
  snakeSwayOriginY?: number;
  /** 蛇形兵已经过时间（秒） */
  snakeSwayT?: number;
  /** 快速入场阶段：从顶端到中场 y=240 的加速段 */
  entryPhase?: {
    active: boolean;
    endY: number;
    speedMultiplier: number;
    maxDuration: number;
    elapsed: number;
    completed: boolean;
  };
  /** 中场特性是否已激活（y>=260后激活一次） */
  midfieldActivated?: boolean;
  /** 中场视觉/行为状态 */
  visualState?: 'normal' | 'powder_armed' | 'core_revealed' | 'shield_ready' | 'charging_warning' | 'elite_warning';
  /** P2：精英受击文字冷却 */
  lastHitTextAt?: number;
  /** P2：精英濒死提示已触发标记 */
  eliteLowHpWarned?: boolean;
  /** P2：精英护盾破裂闪光计时 */
  shieldBrokenFlash?: number;
  /** P3：分裂兵状态 */
  splitState?: "idle" | "warning" | "splitting" | "done";
  splitTimer?: number;
  splitCount?: number;
  isSplitChild?: boolean;
  isTutorialSplitter?: boolean;
  mechanicProtectedTimer?: number;
  /** P3：牵引兵状态 */
  tractorState?: "idle" | "charging" | "pulling" | "cooldown" | "done";
  tractorTimer?: number;
  tractorPullCount?: number;
  tractorTargetRefs?: Enemy[];
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
  // P4.2: 信息降噪字段
  category?: CombatFloatCategory;
  priority?: CombatFloatPriority;
  mergeKey?: string;
  targetId?: string;
  lane?: number;
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
  /** 技能雷达原始数据（供SkillTracker计算） */
  highBladeSlashCount: number;
  totalSlashEnergy: number;
  slashCount: number;
  sharpTurnCount: number;
  totalKillPerSlash: number;
  chainKillTotal: number;
  defenseLineHits: number;
  remainingHp: number;
  pickupCollectRate: number;
  /** 本局击杀的精英/Boss（供图鉴追踪） */
  killedElites: EliteKind[];
  killedBoss: BossId | null;
};

export type RunRewards = {
  coins: number;
  battlePass: number;
  shardName: string;
  shardCount: number;
  doubled: boolean;
  chestOpened: boolean;
  adChestOpened: boolean;
  dailyBonusApplied?: boolean;
  highYieldBonusApplied?: boolean;
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
  oneBladeBreaks: number;
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
  /** 技能雷达四维分数 */
  skillScores: SkillScores;
  /** 本局选择的路线（用于归因） */
  selectedRoutes: TacticalRoute[];
  /** 本局击杀的精英/Boss（图鉴追踪） */
  killedElites: EliteKind[];
  killedBoss: BossId | null;
};

/** 图鉴条目 */
export type CodexEntry = {
  name: string;
  description: string;
  unlocked: boolean;
};
