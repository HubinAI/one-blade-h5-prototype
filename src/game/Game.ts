import { LEVELS } from "../data/levels";
import { ENEMY_DEFS } from "../data/enemies";
import { PICKUP_DEFS } from "../data/pickups";
import { ELITE_VISUAL_DEFS } from "../data/elites";
import { BOSS_VISUAL_DEFS } from "../data/bosses";
import { FORMATIONS } from "../data/formations";
import { DESIGN_HEIGHT, DESIGN_WIDTH, HUD_HEIGHT, WALL_TOP_Y, MAX_ENEMIES_ON_SCREEN, MAX_PARTICLES_ON_SCREEN, MAX_CHAIN_DEPTH, MAX_FLOATING_TEXT } from "./config/constants";
import { BALANCE, ENEMY_BALANCE, PICKUP_BALANCE, SWORD_STAGE_BY_ID, BATTLEFIELD_ZONES, ENTRY_PHASE_CONFIG, PERFORMANCE_LIMITS, ENEMY_SOFT_SEPARATION, FLOATING_TEXT_LIMITS, ENTRY_PROFILE_COMMON, ENTRY_PROFILE_EDICT_BURST, ENTRY_PROFILE_ELITE, ENTRY_END_JITTER, BATTLE_SAFE_X, SPLITTER_CONFIG, TRACTOR_CONFIG, BATTLEFIELD_FLOW } from "./config/balance";
import { AD_CONFIG } from "./config/ads";
import { RUN_BUFFS, RUN_BUFF_BY_ID, ROUTE_COLORS, ROUTE_NAMES, ROUTE_BUFFS, getNextBuffInRoute, getBuffRoute } from "./config/buffs";
import { BOSS_CONFIG, getBossPhase } from "./config/bosses";
import { ELITE_CONFIG, ELITE_KINDS } from "./config/elites";
import { REWARD_CONFIG } from "./config/rewards";
import { getBladeTier, getBladeTierName, getTierConfig, canSlash, consumeEnergyByTier, calculateMomentumRefund, getSubBladeCDReduction, recoverEnergy } from "./systems/bladeEnergySystem";
import { isSharpTurn, segmentHitCircle } from "./systems/collisionSystem";
import { paperBurst, ringParticle, sparkBurst, glowParticle, explosionBurst, coreCollapseBurst } from "./systems/particleSystem";
import { BossController } from "./systems/BossController";
import { applyBattleRewards, evaluateRating, getCurrentRunContext, getUpgradeModifiers, getEquippedBlades, saveDefaultWhiteBlade } from "./services/ProgressionService";
import { BLADE_BASE_STATS, QUALITY_ORDER } from "./config/synthesis";
import type { Blade } from "./services/BladeService";
import type { Quality } from "./config/synthesis";
import { logEvent } from "./services/Analytics";
import { AudioService } from "./services/AudioService";
import { calculateSkillScores } from "./services/SkillTracker";
import type {
  BattlePhase,
  BattleResult,
  BattleStats,
  BossId,
  BuffId,
  EliteKind,
  Enemy,
  EnemyKind,
  FloatingText,
  GamePhase,
  LevelConfig,
  Particle,
  Pickup,
  PickupKind,
  SlashPoint,
  SlashTrail,
  SkillScores,
  TacticalRoute,
  Vec2,
  BattleNotice,
  BattleNoticePriority,
  BattleNoticeCategory,
  BattleNoticeStyle,
  CombatFloatCategory,
  CombatFloatPriority,
  EnemyFlowRole,
  BattlefieldPressureLayer,
} from "./types";
import { choose, clamp, distance, distanceToSegment, randomRange } from "../utils/math";

type FinishCallback = (result: BattleResult) => void;
export type ReviveOffer = {
  levelId: number;
  surviveTime: number;
};
type ReviveOfferCallback = (offer: ReviveOffer) => void;

const paperColors = ["#ead8a7", "#caa565", "#f6e7bd", "#8f5b32", "#ffd67c"];
const HINT_STORAGE_KEY = "one_blade_v04_seen_hints";

type EdictRewardState =
  | "none"
  | "dropped"
  | "modal"
  | "flying"
  | "active"
  | "finished";

/** P4.1A.5：副刀动作速度层级参数（集中配置） */
const SUB_BLADE_MOTION = {
  left: { readyMinHold: 0.12, arming: 0.28, outbound: 0.16, attacking: 0.30, normalHitHold: 0.04, specialHitHold: 0.06, returning: 0.34, settling: 0.18, highValueWait: 0 },
  right: { readyMinHold: 0.08, highValueWait: 0.35, arming: 0.20, outbound: 0.12, attacking: 0.18, normalHitHold: 0.05, specialHitHold: 0.07, returning: 0.26, settling: 0.14 }
};

/** P4.1A.6：副刀攻击Y轴硬约束（禁止进入顶部刷怪区） */
function clampSubBladeAttackY(y: number): number {
  return clamp(y, BATTLEFIELD_ZONES.midfieldStartY + 12, BALANCE.battlefield.bottomDefenseY - 42);
}

export class Game {
  /** P4.2: 统一播报配置 */
  private static BATTLE_NOTICE_CONFIG = {
    maxQueue: 4,
    priorityValue: { S: 100, A: 70, B: 40 },
    defaultDuration: { S: 1.6, A: 0.95, B: 0.7 },
    defaultCooldown: { S: 2.0, A: 1.2, B: 0.7 },
    centerY: 205,
    fadeIn: 0.12,
    fadeOut: 0.18,
  } as const;
  readonly level: LevelConfig;

  private readonly onFinish: FinishCallback;
  private readonly onReviveOffer?: ReviveOfferCallback;
  private phase: GamePhase = "playing";
  /** 二次打磨：战斗阶段 HUD 显示 */
  private battlePhase: BattlePhase = 'main_waves';
  /** 军令爆发轮次索引 */
  private edictBurstRoundIndex = 0;
  /** 军令爆发轮次总数 */
  private edictBurstRoundTotal = 0;
  /** P4.1A.7：锁定待提交的挥刀手势（按下→有效滑动后才正式消耗） */
  private pendingSlash: {
    startPos: Vec2;
    lockedEnergy: number;
    tier: "weak" | "normal" | "strong" | "burst";
    startedAt: number;
    hasSoul: boolean;
    hasOil: boolean;
    oneBladeBoost: number;
  } | null = null;
  private elapsed = 0;
  private idCounter = 0;
  private finished = false;

  private hp: number;
  private maxHp: number;
  private score = 0;
  private energy: number;
  private regenDelayTimer = 0;
  private drumTimer = 0;
  /** 三次修正：chest_first_clear 持续刀势回涌的 flag（独立于 drumTimer，避免显示"鼓"图标） */
  private chestMomentumTimer = 0;
  private nextSoul = false;
  private nextOil = false;
  private pickupsSpawned = 0;
  private warDrumNoDecayTimer = 0; // 鼓阵buff：击杀后1s刀势不衰减
  private soulReturnUsed = false;   // 魂返buff：是否已使用过
  private selectedRoutes: TacticalRoute[] = []; // 追踪选择的路线
  private defenseLineHits = 0;      // 敌军触线次数（技能雷达数据）
  private sharpTurnCount = 0;       // 急转弯次数
  private highBladeSlashCount = 0;  // 高刀势(>=60)挥刀次数
  private totalSlashEnergy = 0;     // 所有挥刀能量总和
  private chainKillTotal = 0;       // 连杀总数

  private enemies: Enemy[] = [];
  private pickups: Pickup[] = [];
  private particles: Particle[] = [];
  private texts: FloatingText[] = [];
  private splitFlashes: { x: number; y: number; angle: number; length: number; life: number; maxLife: number }[] = [];
  private currentSlash?: SlashTrail;
  // 副刀cd已好，等待下一帧释放（光圈提示用）
  private subReadyPing: { slot: number; life: number; maxLife: number }[] = [];
  /** @deprecated P4.1A.13: subRune已删除 */
  /** P4.1：副刀飞行/回弹动画状态 */
  private subBladeAnim: {
    slot: number;
    phase: "idle" | "cooldown" | "ready" | "arming" | "outbound" | "attacking" | "returning" | "settling";
    phaseTimer: number;
    phaseDuration: number;
    startPos: Vec2;
    endPos: Vec2;
    targetId: string | null;
    homePos: Vec2;
    rotation: number;        // 当前旋转角度（弧度）
    visualScale: number;
    hitApplied: boolean;
    /** P4.1A.13: 左刀横扫路径 */
    currentPos: Vec2;
    attackStartPos: Vec2;
    attackEndPos: Vec2;
  }[] = [];
  // 多波多次刷新队列：每个子刷新有时间戳，到时间就spawn
  private subSpawnQueue: { time: number; kind: string; x: number; speedMultiplier: number; yOffset: number; battlePhase: BattlePhase; flowRole?: EnemyFlowRole; spawnGroupId?: string; spawnOrder?: number; entryEndYOffset?: number; source?: "normal" | "edict"; roundIndex?: number; isTailCatchup?: boolean }[] = [];

  private pointerDown = false;
  private pointerPos?: Vec2;
  private wavesSpawned = 0;
  private wavesFinishedAt = 0; // 最后一波生成完成时 elapsed
  private currentRunMode: "normal" | "challenge" | "dailyChallenge" | "freeBurst" | "highYield" = "normal";
  /** P4.4A.1-R3: 游戏模式隔离 */
  private gameMode: "normal" | "boss" = "normal";
  private nextWaveTimer: number = BALANCE.waves.firstWaveDelay;
  private screenShake = 0;
  private flash = 0;
  private slowMoTimer = 0;
  private warriorDrawTimer = 0;
  private warriorSheathTimer = 0;
  private lastSlashAngle = -Math.PI / 2;
  /** 第六轮修正：debug 面板开关（线上默认关闭，?debug=1 开启） */
  private debugEnabled = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get("debug") === "1" : false;
  private hintSeen: Set<string>;
  /** 中场提示冷却计时器（秒） */
  private _midfieldHintTimer = 0;
  private reviveOfferSent = false;
  private buffChoiceOptions: BuffId[] = [];
  private buffChoicePause = 0;
  private usedBuffTimes = new Set<number>();
  private runBuffs = new Set<BuffId>();
  private discoveredEnemies = new Set<EnemyKind>();
  private progressionModifiers = getUpgradeModifiers();
  private runContext = getCurrentRunContext();
  private _lastWaveElapsed = 0;
  private _victoryPendingAt: number | undefined = undefined;

  // 首局教学标志
  private isFirstRun = false;
  private firstRunGuideShown = false;
  private firstRunPrettySlashShown = false;
  private firstRunCoreBoomShown = false;
  /** 破阵就绪提示是否已触发（每局仅1次） */
  private _breakReadyNotified = false;
  /** 三幕制：15s 满势时刻 */
  private _act1Triggered = false;
  /** 三幕制：30s 副刀共鸣 */
  private _act2Triggered = false;
  /** 三幕制：45s 一刀斩模式 */
  private _act3Triggered = false;
  /** P4.1A.9：一刀斩待激活（45秒到达但不一定有敌人，有4个有效目标时才激活） */
  private act3Pending = false;
  /** 一刀斩模式剩余时间：>0时下次挥刀威力×2 */
  private oneBladeModeTimer = 0;
  /** 当前挥刀的"一刀斩"倍率（1.0或2.0），在 startSlash 时设置 */
  private _slashOneBladeBoost = 1.0;
  /** 本局已触发的事件波类型（同局不重复） */
  private _usedEvents: Set<string> = new Set();
  /** 当前事件波生效剩余时间（秒） */
  private _activeEventTimer = 0;
  /** 减速雨：主刀路径减速倍率 */
  private _slowRainMultiplier = 1;
  /** 当前事件波类型 */
  private _currentEventType: string | null = null;
  /** 中场激活事件 */
  private _midfieldEvent: { type: string; timer: number; duration: number } | null = null;
  /** P4.1A.11: 可见战场空场计时器 */
  private visibleEmptyTimer = 0;
  /** P4.3A: 近场连续空场计时 */
  private nearEmptyTimer = 0;
  /** P4.3A.1: 波次提前推进锁 */
  private waveAdvanceLockedUntil = 0;
  /** P4.3A.3: 军令波提前推进锁 */
  private postChestAdvanceLockedUntil = 0;
  private postChestLastWaveQueuedAt = -999;
  private postChestActionableEmptyTimer = 0;
  private postChestLastAdvanceReason: "scheduled" | "low_pressure" | "empty_guard" | null = null;
  /** P4.3A.5: 尾队加速 */
  private edictTailCatchupTimer = 0;
  private edictTailCatchupCooldownUntil = 0;
  /** 当前波次对应的中场事件（仅作用于本波敌人生效） */
  private _currentWaveEvent: 'gather' | 'charge_pause' | null = null;

  // ---- 精英/Boss 系统 ----
  private eliteSpawned = false;
  private bossSpawned = false;
  /** P4.4A: Boss控制器（新状态机系统） */
  private bossController: import("./systems/BossController").BossController | null = null;
  /** P4.2A.1: 统一中央播报调度器 */
  private activeBattleNotice: BattleNotice | null = null;
  private battleNoticeQueue: BattleNotice[] = [];
  private battleNoticeCooldowns: Map<string, number> = new Map();
  private shownBladeTierPrompts: Set<string> = new Set();
  /** P4.2A.2: 神之一刀中央播报每局最多1次 */
  private godSlashNoticeShown = false;
  /** P3.2：精英预告/出场播报防重复 */
  private elitePreviewShown = false;
  private eliteSpawnAnnounced = false;

  // ---- 副刀自动AI ----
  private subBlades: Blade[] = [];
  private subBladeTimers: number[] = [];
  private subBladeCooldowns: number[] = [];
  /** P4.1A.14: 正在攻击的副刀归位后立即Ready */
  private subBladeReadyAfterAction: boolean[] = [];
  // P4.1A.12: subSlash已删除
  // 破绽标记系统：enemyId → 剩余时间
  private weakpointMarks: Map<string, number> = new Map();
  // ---- 主刀品质 ----
  private mainBladeQuality: Quality | null = null;
  private killedElites: EliteKind[] = [];
  private killedBoss: BossId | null = null;
  // 逐波HP递增（每波+1，最多+5）
  private waveHpBonus = 0;

  // ---- 军令宝箱 ----
  private chestDropTimer = 0;
  private chestDropX = 0;
  private chestDropY = 0;
  private chestDropped = false;
  private chestOpening = false;
  private chestOpened = false;
  private chestAnimTimer = 0;
  private chestBuffResult: BuffId | null = null;
  private chestBuffRevealed = false;
  /** 军令揭示后等待玩家在弹窗中确认（应用前不应用buff） */
  public chestPendingConfirm = false;
  /** P2.6：宝箱弹窗自动关闭计时器 */
  private chestAutoConfirmAt = 0;
  /** 军令图标飞向左上角的目标点（相对画布坐标） */
  public chestFlyTarget = { x: 0, y: 0 };
  /** 军令图标飞行动画的进度 0..1 */
  public chestFlyT = 0;
  /** 军令图标是否处于飞行动画中 */
  public chestFlying = false;
  /** 飞行完成后已隐藏 */
  public chestDone = false;

  // ---- V0715008 割草密度优化新增跟踪字段 ----
  /** 精英是否已死亡 */
  private eliteKilled = false;
  /** 所有前置波是否已生成 */
  private allNormalWavesSpawned = false;
  /** 宝箱后爆发波索引 */
  private postChestWaveIndex = 0;
  /** 宝箱后所有爆发波是否已生成 */
  private allPostChestWavesSpawned = false;
  /** 是否有关键动画播放中 */
  private hasPendingKeyAnimation = false;
  /** 最终波清场率（存活敌人/总生成） */
  private finalWaveClearRatio = 0;
  /** 第一轮修正：精英死后自动resolve chest的时间戳 */
  private autoChestResolveAt: number | null = null;
  /** 第一轮修正：军令爆发开始的时间基准 */
  private postChestStartAt: number | null = null;
  /** P2.7：hit stop 计时器 */
  private hitStopTimer = 0;
  private hitStopScale = 1;
  private lastHitStopAt = -999;
  /** P2.8：刀光残影 */
  private slashAfterglowTimer = 0;
  private slashAfterglowPower = 0;
  /** P2.8：屏幕边缘金光 */
  private edgeFlashTimer = 0;
  private edgeFlashPower = 0;
  /** P2.8：破阵成功过渡 */
  private victoryTransitionActive = false;
  private victoryTransitionTimer = 0;
  private victoryTransitionDuration = 1.0;

  /** P3.5：统一军令状态机切换 */
  private setEdictRewardState(next: EdictRewardState, reason: string): boolean {
    const prev = this.edictRewardState;
    const allowed: Record<EdictRewardState, EdictRewardState[]> = {
      none: ["dropped"],
      dropped: ["modal"],
      modal: ["flying"],
      flying: ["active"],
      active: ["finished"],
      finished: []
    };
    if (!allowed[prev].includes(next)) {
      console.warn("[edict invalid transition]", { prev, next, reason, time: this.elapsed });
      return false;
    }
    this.edictRewardState = next;
    return true;
  }

  /** P2.9：军令图标飞行 */
  private edictIconFlying = false;
  private edictIconFlyT = 0;
  private edictIconFlyDuration = 0.28;
  private edictIconFlyFrom = { x: DESIGN_WIDTH / 2, y: DESIGN_HEIGHT * 0.48 };
  private edictIconFlyTo = { x: 46, y: 78 };
  /** P2.9：左上角持续军令Icon */
  private edictIconActive = false;
  private edictIconTimer = 0;
  private edictIconMaxTimer = 12;
  /** P3.5：统一军令状态机 */
  private edictRewardState: EdictRewardState = "none";
  private edictRewardApplied = false;
  private edictPostWavesQueued = false;
  private edictModalConfirmed = false;
  /** P3.6：军令防重复守卫 */
  private edictRewardStarted = false;

  private chestFixedBuffApplied = false;

  private stats: BattleStats = {
    kills: 0,
    maxSingleBlade: 0,
    maxChain: 0,
    oneBladeBreaks: 0,
    coreHits: 0,
    coreCollapses: 0,
    explosions: 0,
    usedReviveAd: false,
    slashes: 0,
    pickups: 0,
    score: 0,
    highBladeSlashCount: 0,
    totalSlashEnergy: 0,
    slashCount: 0,
    sharpTurnCount: 0,
    totalKillPerSlash: 0,
    chainKillTotal: 0,
    defenseLineHits: 0,
    remainingHp: 0,
    pickupCollectRate: 0,
    killedElites: [],
    killedBoss: null
  };

  constructor(level: LevelConfig, onFinish: FinishCallback, onReviveOffer?: ReviveOfferCallback) {
    this.level = level;
    this.onFinish = onFinish;
    this.onReviveOffer = onReviveOffer;
    this.maxHp = Math.min(level.hp + this.progressionModifiers.openingShield, BALANCE.player.maxHp + this.progressionModifiers.openingShield);
    this.hp = this.maxHp;
    this.energy = clamp(this.runContext.mode === "freeBurst" ? BALANCE.swordEnergy.max : level.initialEnergy + this.progressionModifiers.initialEnergyBonus, 0, BALANCE.swordEnergy.max);
    this.hintSeen = this.readSeenHints();
    this.discoveredEnemies.add("infantry");
    this.currentRunMode = this.runContext.mode;

    // P3.2：重置精英播报状态，防止上一关残留
    this.elitePreviewShown = false;
    this.eliteSpawnAnnounced = false;

    // 首局教学检测
    this.isFirstRun = (level.id === 1 || level.id === 10001) && !window.localStorage.getItem("one_blade_first_run_done");
    if (this.isFirstRun) {
      this.overrideWithScriptedTutorial();
      this.showHint("drag-guide", "按住拖动，松手挥出一刀", DESIGN_WIDTH / 2, 118, 2.5);
    }

    // 初始化副刀（先确保有默认绿刀+2把绿副刀）
    saveDefaultWhiteBlade();
    const equipped = getEquippedBlades();
    this.mainBladeQuality = equipped.main?.quality ?? null;
    this.subBlades = equipped.subs.filter(b => b && b.quality);
    // P4.1A.11: 先初始化cooldowns，再初始化timers（避免NaN）
    this.subBladeCooldowns = this.subBlades.map((b) => {
      const stats = BLADE_BASE_STATS[b.quality];
      return stats ? stats.subSlashInterval : 5;
    });
    const firstReadyDelay = [4, 6];
    this.subBladeTimers = this.subBlades.map((_, i) =>
      this.subBladeCooldowns[i] - firstReadyDelay[i]
    );
    this.subBladeAnim = this.subBlades.map((_, i) => {
      const home = this.getSubBladeFloatingPos(i);
      return {
      slot: i,
      phase: "idle" as const,
      phaseTimer: 0,
      phaseDuration: 0.2,
      startPos: { ...home },
      endPos: { ...home },
      targetId: null,
      homePos: { ...home },
      rotation: 0,
      visualScale: 1,
      hitApplied: false,
      // P4.1A.13: 左刀横扫路径
      currentPos: { ...home },
      attackStartPos: { ...home },
      attackEndPos: { ...home }
    }});
    this.subBladeReadyAfterAction = this.subBlades.map(() => false);
    this.weakpointMarks = new Map();
    this._breakReadyNotified = false;
    this._act1Triggered = false;
    this._act2Triggered = false;
    this._act3Triggered = false;
    this.act3Pending = false;
    this.oneBladeModeTimer = 0;
    this.shownBladeTierPrompts = new Set();
    this.godSlashNoticeShown = false;
    // P4.2: 重置播报调度器状态
    this.activeBattleNotice = null;
    this.battleNoticeQueue = [];
    this.battleNoticeCooldowns.clear();
    this._usedEvents = new Set();
    this._activeEventTimer = 0;
    this._slowRainMultiplier = 1;
  }

  /** 首局教学：使用固定密集波次代替随机 */
  private overrideWithScriptedTutorial() {
    this.level.waves = [
      {
        name: "第一波·横切",
        delay: 0.2,
        spawnAt: 0.5,
        speedMultiplier: 1.0,
        enemies: [
          { kind: "infantry", x: 44, count: 1 },
          { kind: "infantry", x: 88, count: 1 },
          { kind: "infantry", x: 132, count: 1 },
          { kind: "infantry", x: 176, count: 1 },
          { kind: "infantry", x: 220, count: 1 },
          { kind: "infantry", x: 264, count: 1 },
          { kind: "infantry", x: 308, count: 1 },
        ],
      },
      {
        name: "第二波·双排",
        delay: 0.2,
        spawnAt: 4.0,
        speedMultiplier: 1.0,
        enemies: [
          { kind: "infantry", x: 44, count: 2 },
          { kind: "infantry", x: 108, count: 2 },
          { kind: "infantry", x: 172, count: 2 },
          { kind: "infantry", x: 236, count: 2 },
          { kind: "infantry", x: 300, count: 2 },
        ],
      },
      {
        name: "第三波·密集阵",
        delay: 0.2,
        spawnAt: 9.0,
        speedMultiplier: 1.0,
        enemies: [
          { kind: "infantry", x: 44, count: 3 },
          { kind: "infantry", x: 92, count: 3 },
          { kind: "infantry", x: 140, count: 3 },
          { kind: "infantry", x: 188, count: 3 },
          { kind: "infantry", x: 236, count: 3 },
          { kind: "infantry", x: 284, count: 3 },
          { kind: "infantry", x: 332, count: 2 },
        ],
      },
      {
        name: "第四波·火药连锁",
        delay: 0.2,
        spawnAt: 15.0,
        speedMultiplier: 1.0,
        enemies: [
          { kind: "infantry", x: 44, count: 3 },
          { kind: "infantry", x: 92, count: 2 },
          { kind: "powder", x: 120, count: 1 },
          { kind: "infantry", x: 150, count: 3 },
          { kind: "powder", x: 188, count: 1 },
          { kind: "infantry", x: 220, count: 3 },
          { kind: "infantry", x: 268, count: 2 },
          { kind: "infantry", x: 316, count: 2 },
        ],
      },
      {
        name: "第五波·混合流",
        delay: 0.2,
        spawnAt: 20.0,
        speedMultiplier: 1.0,
        enemies: [
          { kind: "infantry", x: 44, count: 2 },
          { kind: "shield", x: 92, count: 1 },
          { kind: "infantry", x: 140, count: 3 },
          { kind: "powder", x: 188, count: 1 },
          { kind: "infantry", x: 236, count: 2 },
          { kind: "infantry", x: 284, count: 2 },
          { kind: "shield", x: 332, count: 1 },
        ],
      },
    ];
    // 教程波次：快速冷却、满刀势
    this.level.initialEnergy = BALANCE.swordEnergy.max;
    this.level.enemySpeed = 1.0;
    this.level.durationSeconds = 180;
    this.energy = BALANCE.swordEnergy.max;
  }

  toggleDebugPanel() {
    this.debugEnabled = !this.debugEnabled;
  }

  /** 调试用：强制给所有存活敌人加破绽标记（按 W 触发） */
  debugForceWeakpoint() {
    for (const enemy of this.enemies) {
      if (enemy.alive) {
        this.weakpointMarks.set(enemy.id, 2.0);
      }
    }
    this.addText(DESIGN_WIDTH / 2, 240, "+ 破绽 调试触发", "#ff6a33", 18, 1.2);
  }

  /** P4.4A: 调试用跳过Boss开场（按 I 触发） */
  debugSkipBossIntro() {
    if (this.bossController) {
      this.bossController.skipIntro();
      console.log("[Boss Debug] 开场已跳过");
    }
  }

  /** P4.4A.1-R3: 调试用触发Boss胜利（按 V 触发） */
  debugForceBossVictory() {
    if (this.gameMode !== "boss") return;
    // 强制清除Boss并触发胜利
    this.bossController = null;
    this.gameMode = "normal";
    this.finish(true);
    console.log("[Boss Debug] 强制Boss胜利");
  }

  reviveFromRewardedAd() {
    if (this.phase !== "revive") return;
    this.phase = "playing";
    this.stats.usedReviveAd = true;
    this.hp = 1;
    this.energy = 80;
    const closest = [...this.enemies]
      .filter((enemy) => enemy.alive)
      .sort((a, b) => b.y - a.y)
      .slice(0, 8);
    for (const enemy of closest) {
      enemy.alive = false;
      this.particles.push(...paperBurst(enemy, 12, paperColors));
    }
    this.enemies = this.enemies.filter((enemy) => enemy.alive);
    this.flash = Math.max(this.flash, 0.85);
    this.screenShake = Math.max(this.screenShake, 0.65);
    this.addText(DESIGN_WIDTH / 2, 142, "复活反击，刀势 80%", "#ffd35a", 20, 1.2);
  }

  declineReviveOffer() {
    if (this.phase === "revive") this.finish(false);
  }

  update(dt: number) {
    const frameDt = Math.min(dt, 0.04);
    const baseDt = frameDt * (this.slowMoTimer > 0 ? 0.58 : 1);
    // P2.7：hit stop 叠加效果
    let scaledDt = baseDt;
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= frameDt;
      scaledDt = baseDt * this.hitStopScale;
      if (this.hitStopTimer <= 0) {
        this.hitStopScale = 1;
      }
    }
    this.slowMoTimer = Math.max(0, this.slowMoTimer - frameDt);

    // P3.8：军令弹窗期间暂停战斗模拟，不推进时间
    if (this.isEdictModalBlocking()) {
      this.phase = "chestOpen";
      this.validateEdictState();
      this.validateChestEdictState();
      return;
    }

    if (this.phase === "buffChoice") {
      this.buffChoicePause = Math.max(0, this.buffChoicePause - frameDt);
      this.updateParticles(frameDt);
      this.updateTexts(frameDt);
      return;
    }

    if (this.phase !== "playing") {
      this.updateParticles(scaledDt);
      this.updateTexts(scaledDt);
      return;
    }

    this.elapsed += scaledDt;
    this.regenDelayTimer = Math.max(0, this.regenDelayTimer - scaledDt);
    this.chestMomentumTimer = Math.max(0, this.chestMomentumTimer - scaledDt);
    // 三次修正：chest_first_clear 的刀势回涌用一个虚拟 drumTimer 注入到 recoverEnergy
    const effectiveDrumTimer = this.drumTimer + this.chestMomentumTimer;
    if (!this.currentSlash?.active && !this.pendingSlash && this.regenDelayTimer <= 0 && this.warDrumNoDecayTimer <= 0) {
      this.energy = recoverEnergy(this.energy, scaledDt * this.getPassiveRegenMultiplier(), effectiveDrumTimer);
    }
    // 鼓阵：击杀后1s内刀势不衰减（不扣regenDelay）
    if (!this.currentSlash?.active && this.warDrumNoDecayTimer > 0) {
      // 不恢复也不衰减，维持当前刀势
    }

    // 三幕制阶段爆发检查在主循环后面调用
    if (!this.currentSlash?.active && this.energy >= 90) {
      this.showHint("burst-ready", "破阵锋已成", DESIGN_WIDTH / 2, 656, 1);
    }

    this.drumTimer = Math.max(0, this.drumTimer - scaledDt);
    this.warDrumNoDecayTimer = Math.max(0, this.warDrumNoDecayTimer - scaledDt);
    this.warriorDrawTimer = Math.max(0, this.warriorDrawTimer - scaledDt);
    this.warriorSheathTimer = Math.max(0, this.warriorSheathTimer - scaledDt);
    // P4.2A.1: bossIntroTimer/eliteIntroTimer/eliteIntroText/bossIntroText已删除
    // P2.8：慢镜头 visual 衰减（用原始 frameDt，不随慢镜头变慢）
    if (this.slashAfterglowTimer > 0) {
      this.slashAfterglowTimer -= frameDt;
      if (this.slashAfterglowTimer <= 0) this.slashAfterglowPower = 0;
    }
    if (this.edgeFlashTimer > 0) {
      this.edgeFlashTimer -= frameDt;
      if (this.edgeFlashTimer <= 0) this.edgeFlashPower = 0;
    }
    this.screenShake = Math.max(0, this.screenShake - scaledDt * 2.7);
    this.flash = Math.max(0, this.flash - scaledDt * 2.2);
    if (this.oneBladeModeTimer > 0) this.oneBladeModeTimer = Math.max(0, this.oneBladeModeTimer - scaledDt);

    // 事件波计时衰减
    if (this._activeEventTimer > 0) {
      this._activeEventTimer = Math.max(0, this._activeEventTimer - scaledDt);
      if (this._activeEventTimer <= 0) this._currentEventType = null;
    }
    // P4.3A: 战场流动控制
    if (BATTLEFIELD_FLOW.enabled) {
      this.updateBattlefieldFlow(scaledDt);
    }

    // 三幕制阶段爆发
    this.checkActMilestones();

    this.updateActiveSlash(scaledDt);
    this.updateEnemies(scaledDt);
    this.updatePickups(scaledDt);
    this.updateParticles(scaledDt);
    this.updateTexts(scaledDt);
    this.updateWaves(scaledDt);
    this.updateSubSpawnQueue();
    this.updateEliteSpawn();
    this.updateSubBlades(scaledDt);
    this.updateBossSpawn();
    this.updateEliteSkills(scaledDt);
    this.updateBossSkills(scaledDt);
    this.updateBossController(scaledDt);
    this.updateMechanicEnemies(scaledDt);
    this.updateChestDrop(scaledDt);

    // 第一轮修正：精英死后 1 秒，自动 resolve 第一关 chest
    if (this.autoChestResolveAt !== null && this.elapsed >= this.autoChestResolveAt) {
      this.autoChestResolveAt = null;
      this.autoResolveEliteChestReward();
    }

    this.updateEdictIconFly(frameDt);
    this.updateEdictStatusIcon(frameDt);
    this.updatePostChestWaves(scaledDt);
    // P4.3A.5: 尾队加速（最后一轮队列提前）
    this.updateEdictTailCatchup(scaledDt);
    // P4.2: 统一播报更新
    this.updateBattleNotice(scaledDt);
    this.updateBattlePhase();
    this.updateBuffChoiceTriggers();
    this.checkBattleEnd();
    this.updateVictoryTransition(scaledDt);
    this.cleanupInvalidSpecialEnemies();
    this.validateEdictState();
    this.validateChestEdictState();
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    if (this.screenShake > 0) {
      const shake = this.screenShake * 5;
      ctx.translate(randomRange(-shake, shake), randomRange(-shake, shake));
    }

    this.drawBackground(ctx);
    this.drawPickups(ctx);
    this.drawEnemies(ctx);
    this.drawTractorLinks(ctx);
    // 远景山间雾气遮罩（敌人从雾后现身）
    this.drawTopMist(ctx);
    this.drawSlash(ctx);
    this.drawParticles(ctx);
    this.drawDefenseAndWarrior(ctx);
    this.drawSubBladeVisual(ctx);
    this.drawEdictIconFly(ctx);
    this.drawHud(ctx);
    this.drawEdictStatusIcon(ctx);
    this.drawSplitFlashes(ctx);
    this.drawFloatingTexts(ctx);
    this.drawBattleNotice(ctx);
    this.drawWaveProgress(ctx);
    this.drawChestDrop(ctx);
    this.drawEdictRewardModal(ctx);
    this.drawMidfieldEventBorder(ctx);
    // P4.2: drawIntroOverlay已删除，由BattleNotice系统替代
    // P2.8：战斗层之后绘制边缘金光和破阵过渡
    this.drawEdgeFlash(ctx);
    this.drawVictoryTransition(ctx);
    // P4.4A: Boss控制器渲染（HUD覆盖层/开场演出/暗角等）
    if (this.bossController) {
      this.bossController.render(ctx);
    }
    if (this.debugEnabled) this.drawDebugPanel(ctx);
    this.drawBuffChoice(ctx);
    this.drawRevivePause(ctx);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 232, 146, ${this.flash * 0.18})`;
      ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    }

    ctx.restore();
  }

  handlePointerDown(pos: Vec2) {
    // P4.4A: Boss开场期间阻断输入
    if (this.bossController?.isIntroActive) return;
    if (this.phase === "buffChoice") {
      this.selectBuffAt(pos);
      return;
    }
    // P3.8：军令弹窗期间，按钮或面板内部均可确认
    if (this.chestPendingConfirm) {
      if (
        this.isPointInChestConfirmButton(pos.x, pos.y) ||
        this.isPointInEdictModalPanel(pos.x, pos.y)
      ) {
        this.confirmEliteChestReward();
      }
      return;
    }
    if (this.phase !== "playing") return;
    // 蓄势阶段（0-9%）不可挥刀
    if (!canSlash(this.energy)) {
      this.showHint("蓄势中", "刀势不足", DESIGN_WIDTH / 2, 200, 0.6);
      return;
    }
    this.pointerDown = true;
    const start = this.clampPointer(pos);
    this.pointerPos = start;
    if (this.currentSlash?.active) this.endSlash("收刀");
    // P4.1A.7：按下只锁定Pending，不消耗刀势
    const lockedEnergy = clamp(this.energy, 0, BALANCE.swordEnergy.max);
    this.pendingSlash = {
      startPos: start,
      lockedEnergy,
      tier: getBladeTier(lockedEnergy),
      startedAt: this.elapsed,
      hasSoul: this.nextSoul,
      hasOil: this.nextOil,
      oneBladeBoost: this.oneBladeModeTimer > 0 ? 2.0 : 1.0
    };
  }

  handlePointerMove(pos: Vec2) {
    // P4.4A: Boss开场期间阻断输入
    if (this.bossController?.isIntroActive) return;
    if (this.phase !== "playing" || !this.pointerDown) return;
    const next = this.clampPointer(pos);
    this.pointerPos = next;
    if (!this.currentSlash?.active) {
      // P4.1A.7：检查是否达到激活距离
      const pending = this.pendingSlash;
      if (!pending) return;
      const moved = distance(pending.startPos, next);
      if (moved < BALANCE.slash.activationDistance) return;
      this.commitPendingSlash(pending, next);
      return;
    }
    this.extendSlash(next);
  }

  handlePointerUp() {
    // P4.4A: Boss开场期间阻断输入
    if (this.bossController?.isIntroActive) return;
    if (this.phase !== "playing") return;
    this.pointerDown = false;
    if (this.currentSlash?.active) {
      this.endSlash("收刀");
    } else {
      // P4.1A.7：只有Pending未提交，零消耗取消
      this.pendingSlash = null;
    }
  }

  /** P4.1A.7：正式提交挥刀（滑动超过activationDistance后触发） */
  private commitPendingSlash(pending: NonNullable<typeof this.pendingSlash>, firstMovePos: Vec2) {
    this.pendingSlash = null;
    this.startSlash(pending.startPos, pending);
    if (this.currentSlash?.active) this.extendSlash(firstMovePos);
  }

  private startSlash(pos: Vec2, pending?: NonNullable<typeof this.pendingSlash>) {
    const lockedEnergy = pending ? pending.lockedEnergy : clamp(this.energy, 0, BALANCE.swordEnergy.max);
    const tier = (pending ? pending.tier : getBladeTier(lockedEnergy)) as "weak" | "normal" | "strong" | "burst";
    const stage = SWORD_STAGE_BY_ID[tier];
    const pathMultiplier = (pending && pending.hasSoul ? PICKUP_BALANCE.soul.pathLengthMultiplier ?? 1 : (this.nextSoul ? PICKUP_BALANCE.soul.pathLengthMultiplier ?? 1 : 1)) * this.getPathLengthMultiplier();
    const widthMultiplier = pending && pending.hasSoul ? PICKUP_BALANCE.soul.widthMultiplier ?? 1 : (this.nextSoul ? PICKUP_BALANCE.soul.widthMultiplier ?? 1 : 1);
    const maxPathLength = stage.maxPathLength * pathMultiplier;
    const point = { x: pos.x, y: pos.y, t: this.elapsed, energyRatio: 1 };

    // P4.1A.7：使用已锁定的一刀斩倍率
    const oneBladeBoost = pending ? pending.oneBladeBoost : (this.oneBladeModeTimer > 0 ? 2.0 : 1.0);
    this._slashOneBladeBoost = oneBladeBoost;
    if (this._slashOneBladeBoost > 1) {
      this.oneBladeModeTimer = 0;
      this.addText(DESIGN_WIDTH / 2, 240, "⚡ 一刀斩！", "#ff6a33", 26, 1.5);
    } else {
      this._slashOneBladeBoost = 1.0;
    }

    // P4.1A.15: 先保存本刀Buff，再创建SlashTrail，最后消耗
    const slashHasSoul = pending ? pending.hasSoul : this.nextSoul;
    const slashHasOil = pending ? pending.hasOil : this.nextOil;

    this.currentSlash = {
      id: this.nextId("slash"),
      tier,
      lockedEnergy,
      maxPower: maxPathLength,
      remainingPower: maxPathLength,
      maxDuration: stage.duration,
      remainingDuration: stage.duration,
      maxPathLength,
      remainingPathLength: maxPathLength,
      pathUsed: 0,
      widthMultiplier,
      energyBank: 0,
      explosionCount: 0,
      coreCollapseCount: 0,
      points: [point],
      hitEnemyIds: new Set(),
      hitPickupIds: new Set(),
      pendingExplosionIds: new Set(),
      pendingCoreIds: new Set(),
      oilTriggeredIds: new Set(),
      hasOil: slashHasOil,
      kills: 0,
      chain: 0,
      active: true
    };

    // P4.1A.15: SlashTrail创建后再消耗全局状态
    if (slashHasSoul) this.nextSoul = false;
    if (slashHasOil) this.nextOil = false;

    this.energy = consumeEnergyByTier(this.energy, tier);
    this.regenDelayTimer = BALANCE.swordEnergy.regenDelayAfterSlash;
    this.nextSoul = false;
    this.nextOil = false;
    this.stats.slashes += 1;
    this.totalSlashEnergy += lockedEnergy;
    if (lockedEnergy >= 60) this.highBladeSlashCount += 1;
    this.warriorDrawTimer = 0.2;
    this.warriorSheathTimer = 0;
    this.lastSlashAngle = this.angleFromWarrior(pos);
    logEvent("slash_start", { levelId: this.level.id, energy: lockedEnergy, stage: stage.name });
    AudioService.slashDraw(tier);
    // P4.2: 段位提示每局每段位最多一次（强斩/破阵斩），弱斩/普通不显示
    if ((tier === "strong" || tier === "burst") && !this.shownBladeTierPrompts.has(tier)) {
      this.shownBladeTierPrompts.add(tier);
      this.addCombatFloat({ x: pos.x, y: pos.y - 18, text: stage.prompt, color: stage.color, size: 14, duration: 0.5, category: "blade-tier", priority: "B", mergeKey: `blade-tier:${tier}` });
    }
    if (lockedEnergy < 25) {
      this.showHint("low-energy-slash", "刀势越满，刀芒越强", DESIGN_WIDTH / 2, 118, 2);
    }
    this.particles.push(...sparkBurst(pos, tier === "burst" ? 15 : 8, stage.color));
  }

  private extendSlash(pos: Vec2) {
    const trail = this.currentSlash;
    if (!trail?.active) return;

    const points = trail.points;
    const last = points[points.length - 1];
    const dist = distance(last, pos);
    if (dist < BALANCE.slash.minMoveDistance) return;

    const prev = points.length >= 2 ? points[points.length - 2] : undefined;
    let cost = dist;
    if (prev && isSharpTurn(prev, last, pos)) {
      cost += BALANCE.slash.sharpTurnExtraCost;
      this.sharpTurnCount += 1;
      this.addText(pos.x, pos.y - 12, "折势", "#d9b45b", 12);
    }

    trail.pathUsed += cost;
    trail.remainingPathLength = Math.max(0, trail.maxPathLength - trail.pathUsed);
    trail.remainingPower = trail.remainingPathLength;
    const ratio = this.getSlashRatio(trail);
    const point: SlashPoint = { x: pos.x, y: pos.y, t: this.elapsed, energyRatio: ratio };
    points.push(point);
    if (points.length > 82) points.shift();

    this.lastSlashAngle = Math.atan2(pos.y - last.y, pos.x - last.x);
    this.checkSegmentHits(last, point, trail);

    if (trail.remainingPathLength <= 0) this.endSlash("刀芒耗尽");
  }

  private updateActiveSlash(dt: number) {
    const trail = this.currentSlash;
    if (!trail?.active) return;

    // 减速雨：主刀路径消耗加倍（等效"路径减速50%"）
    const slowRainMul = this._currentEventType === "slowRain" ? 2 : 1;
    trail.remainingDuration = Math.max(0, trail.remainingDuration - dt * slowRainMul);
    const ratio = this.getSlashRatio(trail);
    const last = trail.points[trail.points.length - 1];
    last.energyRatio = Math.min(last.energyRatio, ratio);

    if (trail.remainingDuration <= 0) this.endSlash("刀芒耗尽");
  }

  private endSlash(reason: string) {
    const trail = this.currentSlash;
    if (!trail?.active) return;

    trail.active = false;

    // P4.4A.2-R1: Boss模式跳过所有普通挥刀反馈（防止"破阵斩"等旧文字出现）
    if (this.gameMode === "boss") return;
    this.resolvePendingSlash(trail);
    const last = trail.points[trail.points.length - 1];

    // ---- 燎原路线收刀特效：所有点燃敌军额外爆炸 ----
    if (this.hasBuff("scorch")) {
      this.triggerScorchEnd(trail);
    }

    const slashBonus = this.getSlashScoreBonus(trail.kills);
    if (slashBonus > 0) this.score += slashBonus;

    // 新刀势返还：基于击杀数和段位的阶梯返还
    const refund = calculateMomentumRefund(trail.kills, trail.tier, {
      powderChains: trail.explosionCount,
      coreCollapses: trail.coreCollapseCount
    });
    if (refund > 0) {
      this.energy = clamp(this.energy + refund, 0, BALANCE.swordEnergy.max);
      // 返还 >= 15 时显示返还量
      if (refund >= 15) {
        this.addText(DESIGN_WIDTH / 2, 810, `+${refund}% 刀势`, "#5bc0ff", 12, 0.7);
      }
    }

    // 主刀高击杀减少副刀 CD
    const cdReduction = getSubBladeCDReduction(trail.kills);
    if (cdReduction.seconds > 0 || cdReduction.ratio > 0) {
      for (let i = 0; i < this.subBladeTimers.length; i++) {
        const anim = this.subBladeAnim[i];
        // P4.1A.8: 只对cooldown状态生效，已Ready/攻击中不重复加速
        if (!anim || (anim.phase !== "cooldown" && anim.phase !== "idle")) continue;
        const cd = this.subBladeCooldowns[i];
        if (cdReduction.seconds > 0) {
          this.subBladeTimers[i] = Math.min(cd, this.subBladeTimers[i] + cdReduction.seconds);
        } else if (cdReduction.ratio > 0 && cd > 0) {
          const remaining = Math.max(0, cd - this.subBladeTimers[i]);
          this.subBladeTimers[i] = Math.min(cd, this.subBladeTimers[i] + remaining * cdReduction.ratio);
        }
      }
      // P4.1A.8: 删除双份"副刀共鸣"文字，只保留槽位脉冲
      if (trail.kills >= 5) {
        for (let i = 0; i < 2; i++) {
          this.subReadyPing.push({ slot: i, life: 0.3, maxLife: 0.3 });
        }
      }
    }

    this.stats.maxSingleBlade = Math.max(this.stats.maxSingleBlade, trail.kills);
    this.stats.maxChain = Math.max(this.stats.maxChain, trail.chain);
    // P2.8：多杀综合反馈
    this.triggerSlashKillFeedback(trail.kills, last?.x, last?.y);
    this.warriorSheathTimer = 0.38;
    this.warriorDrawTimer = 0;
    this.regenDelayTimer = BALANCE.swordEnergy.regenDelayAfterSlash;
    AudioService.slashEnd();
    this.screenShake = Math.max(this.screenShake, trail.chain > 0 ? 0.5 : 0.18);

    const stage = SWORD_STAGE_BY_ID[trail.tier];
    // P4.2: 段位评价使用addCombatFloat局部反馈，不进入中央
    const praise = this.getSlashPraise(trail, reason);
    if (praise && trail.kills >= 1) {
      this.addCombatFloat({ x: last?.x ?? DESIGN_WIDTH / 2, y: (last?.y ?? 280) - 18, text: praise, color: stage.color, size: 15, duration: 0.6, category: "blade-tier", priority: "B", mergeKey: `praise:${this.stats.slashes}` });
    // 漂亮一刀：首次 5+ 击杀
    if (this.isFirstRun && trail.kills >= 5 && !this.firstRunPrettySlashShown) {
      this.firstRunPrettySlashShown = true;
      this.addText(DESIGN_WIDTH / 2, 80, "漂亮一刀！", "#ff6a33", 28, 1.5);
      this.slowMoTimer = Math.max(this.slowMoTimer, 0.15);
      this.screenShake = Math.max(this.screenShake, 0.5);
      this.flash = Math.max(this.flash, 0.6);
    }
    // 首次触发阵眼崩散
    if (trail.coreCollapseCount > 0 && !this.firstRunCoreBoomShown) {
      this.firstRunCoreBoomShown = true;
      this.slowMoTimer = Math.max(this.slowMoTimer, 0.2);
      this.screenShake = Math.max(this.screenShake, 0.65);
      this.flash = Math.max(this.flash, 0.8);
    }
    // P4.2A.2: 统一神之一刀判定（使用REWARD_CONFIG阈值），中央播报每局最多1次
    const triggeredGodSlash = trail.kills >= REWARD_CONFIG.godSlashThreshold || (trail.tier === "burst" && trail.coreCollapseCount > 0);
    if (triggeredGodSlash) {
      this.stats.oneBladeBreaks += 1;
      if (!this.godSlashNoticeShown) {
        this.godSlashNoticeShown = true;
        this.showBattleNotice({ text: "神之一刀", priority: "A", category: "milestone", style: "gold", duration: 0.85, dedupeKey: "god-slash:first", cooldown: 999, interrupt: false });
      }
      // 每次触发保留特效
      AudioService.oneBladeBreak();
      this.slowMoTimer = Math.max(this.slowMoTimer, 0.12);
      this.flash = Math.max(this.flash, 0.8);
      this.screenShake = Math.max(this.screenShake, 0.55);
    }
    if (praise === "阵破") AudioService.coreCollapse();
    if (praise === "连爆" || praise === "破阵") AudioService.explosion();
    }
    if (trail.kills > 0) {
      this.addText(last.x, last.y - 28, `${stage.scoreName} x${trail.kills}`, stage.color, 17);
      if (slashBonus > 0) this.addText(last.x, last.y - 46, `+${slashBonus}`, "#ffd67c", 13);
    } else {
      // 避免与startSlash的stage.prompt（如"残锋：应急"）重复显示
      if (!this.hasRecentText(reason, 0.6)) {
        this.addText(last.x, last.y - 22, reason, "#d9b45b", 14);
      }
    }

    if (trail.tier === "burst" && (trail.kills >= 8 || trail.coreCollapseCount > 0)) {
      // 破阵锋大杀 = 更强慢镜头 + 全屏闪 + 重震
      this.slowMoTimer = Math.max(this.slowMoTimer, trail.kills >= 12 ? 0.28 : trail.kills >= 8 ? 0.22 : BALANCE.feedback.burstSlowMotionSeconds);
      this.flash = Math.max(this.flash, trail.kills >= 12 ? 1.2 : 1);
      this.screenShake = Math.max(this.screenShake, trail.kills >= 12 ? 1.2 : 0.85);
      // 收刀粒子爆发：更多纸片飘散
      if (trail.kills >= 8 && last) {
        this.particles.push(glowParticle(last, "#ffffff", 60));
      }
    } else if (trail.tier === "burst" && trail.kills >= 4) {
      // 破阵锋中杀 = 轻慢镜
      this.slowMoTimer = Math.max(this.slowMoTimer, 0.14);
      this.flash = Math.max(this.flash, 0.75);
      this.screenShake = Math.max(this.screenShake, 0.55);
    } else if (trail.tier === "strong" && trail.kills >= 6) {
      // 强锋高杀 = 微慢镜
      this.slowMoTimer = Math.max(this.slowMoTimer, 0.1);
      this.screenShake = Math.max(this.screenShake, 0.5);
    }

    // ---- 路线收刀特效：路线专属闪光 + 粒子 ----
    if (this.selectedRoutes.length > 0) {
      const mainRoute = this.selectedRoutes[this.selectedRoutes.length - 1];
      const routeColor = ROUTE_COLORS[mainRoute];
      if (mainRoute === "scorch" && trail.kills > 0) {
        this.flash = Math.max(this.flash, 0.55);
        this.screenShake = Math.max(this.screenShake, 0.42);
        if (trail.kills >= 5 && last) this.particles.push(glowParticle(last, routeColor, 45));
      }
      if (mainRoute === "pierce" && trail.coreCollapseCount > 0) {
        this.flash = Math.max(this.flash, 0.5);
        this.screenShake = Math.max(this.screenShake, 0.55);
        if (trail.coreCollapseCount >= 2 && last) this.particles.push(glowParticle(last, routeColor, 50));
      }
      if (mainRoute === "ironWall" && trail.kills > 0) {
        this.screenShake = Math.max(this.screenShake, 0.28);
      }
    }

    // 二次打磨：击杀清空感分层反馈
    const kills = trail.kills;
    if (kills >= 10) {
      // 10+：中幅震屏 + 刀光余辉延长 + 刀路清空带
      this.screenShake = Math.max(this.screenShake, 0.5);
      // 沿刀路产生"裂痕"效果：每 3 个 trail 点一个 splitFlash
      for (let i = 0; i < trail.points.length; i += 3) {
        const p = trail.points[i];
        const next = trail.points[Math.min(i + 1, trail.points.length - 1)];
        const angle = Math.atan2(next.y - p.y, next.x - p.x);
        this.splitFlashes.push({
          x: p.x, y: p.y,
          angle,
          length: 20 + Math.random() * 12,
          life: 0.28, maxLife: 0.28,
        });
        // 碎片粒子向刀线两侧飞散
        this.particles.push(...sparkBurst({ x: p.x, y: p.y }, 4, "#ffffff"));
      }
    }
    // P4.2A.1: 神之一刀的播报与统计已统一迁移至统一判定，此处只保留特效
    if (kills >= 15) {
      this.slowMoTimer = Math.max(this.slowMoTimer, 0.12);
      this.screenShake = Math.max(this.screenShake, 0.75);
      this.flash = Math.max(this.flash, 1.0);
    }
    if (kills >= 20) {
      // 20+：全屏边缘金光 + "神之一刀"（已涵盖15+）
      this.flash = Math.max(this.flash, 1.2);
    }

    logEvent("slash_end", {
      levelId: this.level.id,
      hitCount: trail.hitEnemyIds.size,
      killCount: trail.kills,
      stage: stage.name,
      triggeredExplosive: trail.explosionCount > 0,
      triggeredCore: trail.coreCollapseCount > 0
    });

    this.currentSlash = undefined;
  }

  private getSlashPraise(trail: SlashTrail, fallback: string) {
    // P4.2: "神之一刀"由triggerSlashKillFeedback统一里程碑播报，此处不重复
    if (trail.tier === "burst" && trail.kills >= 8) return "一刀破军";
    if (trail.coreCollapseCount > 0 && trail.tier === "burst") return "破阵";
    if (trail.kills >= 13) return "破阵";
    if (trail.coreCollapseCount > 0) return "阵破";
    if (trail.explosionCount >= 2) return "连爆";
    if (trail.kills >= 8) return "破阵";
    if (trail.kills >= 4) return "连斩";
    if (trail.kills >= 1) return "斩击";
    return fallback;
  }

  private getSlashScoreBonus(kills: number) {
    if (kills >= 12) return BALANCE.score.slashKillBonus12;
    if (kills >= 8) return BALANCE.score.slashKillBonus8;
    if (kills >= 4) return BALANCE.score.slashKillBonus4;
    return 0;
  }

  private hasBuff(id: BuffId) {
    return this.runBuffs.has(id);
  }

  private hasRouteBuff(route: TacticalRoute) {
    for (const bid of ROUTE_BUFFS[route]) {
      if (this.runBuffs.has(bid)) return true;
    }
    return false;
  }

  private getPathLengthMultiplier() {
    const q = this.mainBladeQuality;
    const bladeBonus = q ? (BLADE_BASE_STATS[q]?.bladeMultiplier ?? 1) : 1;
    return this.progressionModifiers.pathLength * bladeBonus;
  }

  private getMainBladeDamageMultiplier(): number {
    const q = this.mainBladeQuality;
    return q ? (BLADE_BASE_STATS[q]?.damageMultiplier ?? 1) : 1;
  }

  private getPassiveRegenMultiplier() {
    const dailyBoost = this.runContext.mode === "dailyChallenge" && this.runContext.dailyChallengeId === "fast_energy" ? 1.2 : 1;
    return (this.hasBuff("warDrum") ? 1.2 : 1) * this.progressionModifiers.energyRegen * dailyBoost;
  }

  private getExplosionRadiusMultiplier() {
    const scorchBonus = this.hasBuff("chainFuse") ? 1.25 : 1;
    return scorchBonus * this.progressionModifiers.explosionRadius;
  }

  private getCoreRadiusMultiplier() {
    const dailyBoost = this.runContext.mode === "dailyChallenge" && this.runContext.dailyChallengeId === "core_bonus" ? 1.18 : 1;
    const pierceBonus = this.hasBuff("shatterCore") ? 1.25 : 1;
    return pierceBonus * dailyBoost;
  }

  private getEffectivePickupChance() {
    if (this.runContext.mode === "dailyChallenge" && this.runContext.dailyChallengeId === "more_pickups") {
      return Math.min(0.36, this.level.pickupChance + 0.18);
    }
    return this.level.pickupChance;
  }

  private getEffectivePickupLimit() {
    if (this.runContext.mode === "dailyChallenge" && this.runContext.dailyChallengeId === "more_pickups") {
      return BALANCE.waves.randomPickupLimit + 3;
    }
    return BALANCE.waves.randomPickupLimit;
  }

  private canOfferRevive() {
    return (
      AD_CONFIG.rewardedRevive.enabled &&
      this.level.id >= 3 &&
      !this.reviveOfferSent &&
      !this.stats.usedReviveAd &&
      this.elapsed >= AD_CONFIG.rewardedRevive.minSurviveTime
    );
  }

  private updateBuffChoiceTriggers() {
    if (this.currentSlash?.active || this.pointerDown) return;
    if (this.runBuffs.size >= 3) return;
    for (const time of this.level.buffTimes) {
      if (this.usedBuffTimes.has(time)) continue;
      if (this.elapsed >= time) {
        this.usedBuffTimes.add(time);
        this.openBuffChoice();
        return;
      }
    }
  }

  private openBuffChoice() {
    // 路线抽取：从三条路线各抽一个未拥有的buff
    const options: BuffId[] = [];
    const routes: TacticalRoute[] = ["scorch", "pierce", "ironWall"];
    for (const route of routes) {
      const nextBuff = getNextBuffInRoute(route, this.runBuffs);
      if (nextBuff) options.push(nextBuff);
    }
    // 如果某些路线已全部选完，从剩余路线中随机补充
    while (options.length < 3) {
      const remaining = RUN_BUFFS.filter((buff) => !this.runBuffs.has(buff.id) && !options.includes(buff.id));
      if (remaining.length === 0) break;
      const index = Math.floor(Math.random() * remaining.length);
      options.push(remaining[index].id);
    }
    this.buffChoiceOptions = options;
    this.buffChoicePause = 1;
    this.phase = "buffChoice";
    this.pointerDown = false;
    AudioService.buffOpen();
  }

  /** P2.9：判断点击是否在宝箱确认按钮范围内 */
  /** P3.9：获取逻辑关卡数（动态主线 level.id=10000+floor 返回 floor） */
  private getLogicalFloor(): number {
    if (this.level.id >= 10000) return this.level.id - 10000;
    return this.level.id;
  }

  /** P3.8：军令弹窗是否正在暂停战斗 */
  private isEdictModalBlocking(): boolean {
    return this.edictRewardState === "modal" && this.chestPendingConfirm;
  }

  /** P3.13：军令弹窗紧凑布局坐标（面板面板高276，统一所有绘制/点击坐标） */
  private getEdictModalLayout() {
    const cw = DESIGN_WIDTH;
    const ch = DESIGN_HEIGHT;
    const pw = 286;  // 面板宽
    const ph = 276;  // 面板高超短（原340→缩小，消除大空白）
    const px = (cw - pw) / 2;
    const py = (ch - ph) / 2 - 12;
    const bw = 200;  // 按钮宽
    const bh = 48;   // 按钮高
    const bx = (cw - bw) / 2;
    const by = py + 202;  // 按钮在面板局部坐标约202
    return {
      panelX: px, panelY: py, panelW: pw, panelH: ph,
      titleY: py + 22,
      iconY: py + 72, iconR: 34,
      nameY: py + 122,
      descY: py + 150,
      buttonX: bx, buttonY: by, buttonW: bw, buttonH: bh
    };
  }

  /** P3.8：点击命中弹窗面板内部 */
  private isPointInEdictModalPanel(x: number, y: number): boolean {
    const lay = this.getEdictModalLayout();
    return x >= lay.panelX && x <= lay.panelX + lay.panelW && y >= lay.panelY && y <= lay.panelY + lay.panelH;
  }

  private isPointInChestConfirmButton(x: number, y: number): boolean {
    const lay = this.getEdictModalLayout();
    return x >= lay.buttonX && x <= lay.buttonX + lay.buttonW && y >= lay.buttonY && y <= lay.buttonY + lay.buttonH;
  }

  private selectBuffAt(pos: Vec2) {
    if (this.buffChoicePause > 0) return;
    for (let index = 0; index < this.buffChoiceOptions.length; index += 1) {
      const rect = this.getBuffCardRect(index);
      if (pos.x >= rect.x && pos.x <= rect.x + rect.w && pos.y >= rect.y && pos.y <= rect.y + rect.h) {
        this.applyBuff(this.buffChoiceOptions[index]);
        return;
      }
    }
  }

  private applyBuff(id: BuffId) {
    this.runBuffs.add(id);
    const buff = RUN_BUFF_BY_ID[id];
    this.selectedRoutes.push(buff.route);

    // 堅城：HP+1
    if (id === "fortress") {
      this.maxHp = Math.min(BALANCE.player.maxHp + 1, this.maxHp + 1);
      this.hp = Math.min(this.maxHp, this.hp + 1);
    }

    // 鼓阵：energy regen +20% 已在getPassiveRegenMultiplier处理
    // warDrum buff选择时无需额外即时效果

    this.addText(DESIGN_WIDTH / 2, 148, buff.feedback, "#ffd35a", 16, 1.4);
    logEvent("buff_choice", { levelId: this.level.id, time: this.elapsed, selectedBuff: id, route: buff.route });
    AudioService.buffSelect();
    this.buffChoiceOptions = [];
    this.buffChoicePause = 0;
    this.phase = "playing";
  }

  private getBuffCardRect(index: number) {
    return {
      x: 38,
      y: 238 + index * 112,
      w: DESIGN_WIDTH - 76,
      h: 92
    };
  }

  /** 燎原路线收刀特效：所有点燃状态敌军额外爆炸 */
  private triggerScorchEnd(trail: SlashTrail) {
    const ignitedEnemies = this.enemies.filter((e) => e.alive && e.ignited);
    for (const enemy of ignitedEnemies) {
      const radius = 45;
      this.particles.push(ringParticle(enemy, "#ff6a33", radius));
      this.particles.push(...sparkBurst(enemy, 14, "#ff6a33"));
      this.screenShake = Math.max(this.screenShake, 0.28);
      this.addText(enemy.x, enemy.y - 16, "燎原", "#ff6a33", 14);
      // 对周围敌军造成1点伤害
      for (const target of this.enemies) {
        if (!target.alive || target === enemy || distance(target, enemy) > radius) continue;
        if (target.kind === "powder" && !target.ignited) {
          target.ignited = true;
          trail.pendingExplosionIds.add(target.id);
        } else if (target.kind !== "core") {
          this.damageEnemy(target, 1, trail, true, "scorch");
        }
      }
    }
    if (ignitedEnemies.length > 0) {
      this.flash = Math.max(this.flash, ignitedEnemies.length * 0.15);
      AudioService.explosion();
    }
  }

  private getSlashRatio(trail: SlashTrail) {
    return clamp(
      Math.min(trail.remainingDuration / trail.maxDuration, trail.remainingPathLength / trail.maxPathLength),
      0,
      1
    );
  }

  private checkSegmentHits(a: Vec2, b: Vec2, trail: SlashTrail) {
    const stage = SWORD_STAGE_BY_ID[trail.tier];
    const ratio = Math.max(0.06, this.getSlashRatio(trail));
    const bladeReach = BALANCE.slash.touchHitPadding + stage.width * trail.widthMultiplier * (0.75 + ratio);

    for (const pickup of this.pickups) {
      if (!pickup.active || trail.hitPickupIds.has(pickup.id)) continue;
      if (segmentHitCircle(a, b, pickup, pickup.radius + bladeReach)) {
        trail.hitPickupIds.add(pickup.id);
        this.collectPickup(pickup, trail);
      }
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive || trail.hitEnemyIds.has(enemy.id)) continue;

      // ---- 阵眼：检测阵法亮字 ----
      if (enemy.kind === "core" && enemy.formationId) {
        const formation = FORMATIONS[enemy.formationId] || FORMATIONS.snake;
        const chars = formation.chars;
        const totalWidth = (chars.length - 1) * 24;
        const startX = -totalWidth / 2;
        const charRadius = 14;
        for (let i = 0; i < chars.length; i++) {
          const cx = enemy.x + startX + i * 24;
          const cy = enemy.y;
          const pos = { x: cx, y: cy };
          if (segmentHitCircle(a, b, pos, charRadius + bladeReach * 0.5)) {
            trail.hitEnemyIds.add(enemy.id);
            const litIndex = enemy.formationLitIndex ?? 0;
            if (enemy.marked || i === litIndex) {
              // ✅ 切中亮字 → 阵眼破裂
              enemy.marked = true;
              this.handleEnemyHit(enemy, trail);
            } else {
              // ❌ 切错字 → 扣容错
              enemy.formationWrongHits = (enemy.formationWrongHits ?? 0) + 1;
              enemy.flash = 0.5;
              this.addText(cx, cy - 16, "切错", "#ff7b6e", 12);
              this.particles.push(...sparkBurst({ x: cx, y: cy }, 6, "#ff7b6e"));
              if (enemy.formationWrongHits >= formation.maxWrongHits) {
                // 容错耗尽，阵法崩塌（视为死亡）
                enemy.alive = false;
                this.score += 10;
                this.particles.push(...paperBurst(enemy, 18, ["#5d4a8f", "#e8d7ff"]));
                this.addText(enemy.x, enemy.y - 20, "阵法溃散", "#ff7b6e", 16);
                AudioService.defenseHit();
              }
            }
            break;
          }
        }
        continue; // 跳过默认碰撞检测
      }

      if (segmentHitCircle(a, b, enemy, enemy.radius + bladeReach)) {
        trail.hitEnemyIds.add(enemy.id);
        this.handleEnemyHit(enemy, trail);
        // P4.4A.2: Boss 护甲命中检测
        if (enemy.kind === "boss" && enemy.bossId === "thunderGeneral" && this.bossController) {
          const armorResult = this.bossController.checkSlashSegmentHit(a, b, trail.id);
          if (armorResult.hit) {
            // 正确命中护甲
            const progress = this.bossController.recordArmorHit(armorResult.targetId);
            this.flash = Math.max(this.flash, 0.35);
            this.screenShake = Math.max(this.screenShake, 0.25);
            // 碎甲粒子
            const shards = this.bossController.getArmorShardParticles(6, "#f0e130");
            this.particles.push(...sparkBurst({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 8, "#f0e130"));
            // 世界坐标"破甲"文字
            const worldPos = this.bossController.getActiveArmorWorldPos();
            if (worldPos) {
              this.addText(worldPos.x, worldPos.y - 20, "破甲", "#f0e130", 16, 0.6);
            }
            // HUD 进度已在 BossController 中更新
            if (progress.completed) {
              // 破甲完成——BossController会自行触发armor_break演出
              this.screenShake = Math.max(this.screenShake, 0.6);
              this.flash = Math.max(this.flash, 0.5);
            }
          } else if (enemy.y > -50) {
            // 未命中护甲（但砍中了Boss身体）→ 弹刀
            this.bossController.recordMissHit();
            this.particles.push(...sparkBurst({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 6, "#6c3483"));
            this.screenShake = Math.max(this.screenShake, 0.15);
          }
        }
        // 破绽检测：主刀命中带破绽标记的敌人
        const remaining = this.weakpointMarks.get(enemy.id) ?? 0;
        if (remaining > 0) {
          const refund = 15;
          this.energy = clamp(this.energy + refund, 0, BALANCE.swordEnergy.max);
          this.addText(enemy.x, enemy.y - 36, `破点斩 +${refund}%`, "#ff6a33", 20, 1.5);
          this.weakpointMarks.delete(enemy.id);
          this.flash = Math.max(this.flash, 0.5);
          this.screenShake = Math.max(this.screenShake, 0.3);
          // 更强的视觉反馈：中心迸发粒子
          this.particles.push(...sparkBurst(enemy, 12, "#ff6a33"));
          this.particles.push(...sparkBurst(enemy, 8, "#ffd35a"));
        }
      }
    }

    // ---- 破军(shatterArmy)：破阵锋阶段，刀芒proximity可触发阵眼崩塌 ----
    if (trail.tier === "burst" && this.hasBuff("shatterArmy")) {
      const auraReach = bladeReach * 1.5;
      for (const enemy of this.enemies) {
        if (!enemy.alive || enemy.kind !== "core" || trail.hitEnemyIds.has(enemy.id)) continue;
        // 检查线段附近是否有阵眼（proximity check）
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        if (distance(enemy, { x: midX, y: midY }) < enemy.radius + auraReach) {
          enemy.marked = true;
          trail.pendingCoreIds.add(enemy.id);
          trail.hitEnemyIds.add(enemy.id);
          this.stats.coreHits += 1;
          this.score += 6;
          this.addText(enemy.x, enemy.y - 20, "阵眼自崩", "#9b6dff", 14);
          this.particles.push(ringParticle(enemy, "#9b6dff", 34));
        }
      }
    }
  }

  private handleEnemyHit(enemy: Enemy, trail: SlashTrail) {
    // P3.10：教学高亮仍显示"蓄裂中"但不再阻断伤害
    if (enemy.kind === "splitter") {
      if ((enemy.mechanicProtectedTimer ?? 0) > 0) {
        this.addText(enemy.x, enemy.y - 34, "蓄裂中", "#ff8a3d", 14, 0.45);
      }
    }
    const stage = SWORD_STAGE_BY_ID[trail.tier];
    enemy.flash = 0.25;
    const bladeDmg = this.getMainBladeDamageMultiplier();
    // 一刀斩模式：本次挥刀所有伤害×2（仅当前这一刀）
    const oneBladeMul = this._slashOneBladeBoost ?? 1.0;
    // 一刀斩时强制破盾/破精英
    const canBreakAll = oneBladeMul > 1 ? true : stage.canBreakShield;

    if (enemy.kind === "infantry") {
      this.killEnemy(enemy, trail, false, "paper");
      AudioService.slashHit();
    }

    if (enemy.kind === "shield") {
      if (canBreakAll || (trail.tier === "normal" && this.hasBuff("pierceShield"))) {
        this.killEnemy(enemy, trail, false, "shield");
      } else if (trail.tier === "normal") {
        this.damageEnemy(enemy, 1 * this.progressionModifiers.shieldDamageMultiplier * bladeDmg * oneBladeMul, trail, false, "shield_crack");
        if (enemy.alive) {
          enemy.shieldCrack = 1;
          this.addText(enemy.x, enemy.y - 18, "盾裂", "#ffd67c", 13);
          this.particles.push(...sparkBurst(enemy, 8, "#ffd67c"));
        }
      } else {
        this.addText(enemy.x, enemy.y - 18, "挡住", "#d9b45b", 13);
        this.particles.push(...sparkBurst(enemy, 7, "#d9b45b"));
      }
    }

    if (enemy.kind === "powder") {
      enemy.ignited = true;
      trail.pendingExplosionIds.add(enemy.id);
      this.score += 4;
      this.addText(enemy.x, enemy.y - 18, "点燃", "#ffb15c", 14);
      this.showHint("powder-hit", "收刀引爆火药", enemy.x, Math.max(110, enemy.y - 38), 2);
      this.particles.push(...sparkBurst(enemy, 10, "#ffb15c"));
      AudioService.slashHit();

      // ---- 火油浸润(oilSoak)：击中火药兵时点燃附近1个敌军 ----
      if (this.hasBuff("oilSoak")) {
        const nearby = this.enemies.filter(
          (e) => e.alive && !e.ignited && e.kind !== "core" && distance(e, enemy) < 55
        );
        if (nearby.length > 0) {
          const target = nearby[0];
          target.ignited = true;
          trail.pendingExplosionIds.add(target.id);
          this.addText(target.x, target.y - 14, "残渣点燃", "#ff6a33", 12);
          this.particles.push(...sparkBurst(target, 6, "#ff6a33"));
        }
      }
    }

    if (enemy.kind === "core") {
      // 阵眼：已通过checkSegmentHits的亮字判定，只需处理标记逻辑
      if (enemy.marked && stage.canTriggerCoreCollapse) {
        this.stats.coreHits += 1;
        trail.pendingCoreIds.add(enemy.id);
        this.score += 6;
        this.addText(enemy.x, enemy.y - 20, "阵眼破", "#e8d7ff", 14);
        this.showHint("core-hit", "收刀破阵", enemy.x, Math.max(110, enemy.y - 42), 2);
        this.particles.push(ringParticle(enemy, "#e8d7ff", 34));
        // 亮字命中反馈
        const litIdx = enemy.formationLitIndex ?? 0;
        if (enemy.formationId) {
          const fm = FORMATIONS[enemy.formationId] || FORMATIONS.snake;
          const offsetX = (-(fm.chars.length - 1) * 24 / 2) + litIdx * 24;
          this.addText(enemy.x + offsetX, enemy.y - 28, `「${fm.chars[litIdx]}」破`, "#9b6dff", 16);
        }
      } else if (!enemy.marked && stage.canTriggerCoreCollapse) {
        // 通过周边爆炸/崩塌触发的标记（无亮字检测）
        enemy.marked = true;
        trail.pendingCoreIds.add(enemy.id);
        this.score += 6;
        this.addText(enemy.x, enemy.y - 20, "阵眼被波及", "#e8d7ff", 14);
        this.particles.push(ringParticle(enemy, "#e8d7ff", 34));
      } else {
        enemy.flash = 0.32;
        this.addText(enemy.x, enemy.y - 20, "裂纹未成", "#d9b45b", 13);
        this.particles.push(ringParticle(enemy, "#d9b45b", 22));
      }
    }

    // P3.10：分裂怪伤害处理
    if (enemy.kind === "splitter" && enemy.splitState !== "done") {
      const rawDamage = stage.damage * bladeDmg * oneBladeMul;
      const damage = Math.max(1, rawDamage);
      const killed = this.damageEnemy(enemy, damage, trail, false, "splitter");
      if (!killed && enemy.alive) {
        enemy.flash = Math.max(enemy.flash, 0.35);
        this.particles.push(...sparkBurst(enemy, 8, "#ff9d42"));
        this.addText(enemy.x, enemy.y - enemy.radius - 12, `${Math.max(0, Math.ceil(enemy.hp))}/${Math.max(1, Math.ceil(enemy.maxHp))}`, "#ffd08a", 13, 0.5);
      }
      AudioService.slashHit();
    }

    // ---- 精英怪：伤害处理 ----
    if (enemy.kind === "elite" && enemy.eliteKind) {
      const eliteConf = ELITE_CONFIG[enemy.eliteKind];
      if (enemy.eliteKind === "fireRing") {
        // 火环将：火焰碰刀芒会损耗刀势
        const flameDist = 40; // 火焰旋转半径
        const trailPoints = trail.points;
        if (trailPoints.length > 1) {
          const lastPoint = trailPoints[trailPoints.length - 1];
          const distToEnemy = distance(lastPoint, enemy);
          if (distToEnemy < flameDist) {
            // 触碰火焰：损耗当前挥刀剩余势
            trail.remainingPathLength = Math.max(0, trail.remainingPathLength - trail.maxPathLength * 0.5);
            trail.remainingPower = trail.remainingPathLength;
            trail.remainingDuration = trail.remainingDuration * 0.5;
            this.addText(enemy.x, enemy.y - 24, "烈焰灼刀!", "#e67e22", 14);
            this.particles.push(...sparkBurst(enemy, 10, "#e67e22"));
            AudioService.defenseHit();
          }
        }
      }
      if (enemy.eliteKind === "aura") {
        // 氛围将：护盾机制 - 强锋以上可一次扣2护盾
        const shieldValue = enemy.skillTimer ?? 2;
        const prevShield = shieldValue;
        if (shieldValue > 0 && stage.damage <= 1) {
          // 低伤刀打不穿护盾
          enemy.flash = 0.15;
          enemy.skillTimer = Math.max(0, shieldValue - 0.5);
          this.addText(enemy.x, enemy.y - 24, `护盾 ${Math.ceil(shieldValue)}`, "#8e44ad", 13);
          this.particles.push(...sparkBurst(enemy, 6, "#8e44ad"));
          return;
        } else if (shieldValue > 0 && stage.damage >= 2) {
          // 强锋/破阵锋：一次扣2护盾
          enemy.skillTimer = Math.max(0, shieldValue - 2);
          this.addText(enemy.x, enemy.y - 24, `护盾击穿 ${Math.ceil(shieldValue)}→${Math.max(0, shieldValue - 2)}`, "#8e44ad", 13);
          this.particles.push(...sparkBurst(enemy, 8, "#8e44ad"));
        }
        // P2：护盾破裂反馈
        if (prevShield > 0 && (enemy.skillTimer ?? 0) <= 0) {
          this.triggerEliteShieldBreak(enemy);
        }
      }
      // 对精英造成伤害
      const prevHp = enemy.hp;
      this.damageEnemy(enemy, stage.damage * bladeDmg, trail, false, "elite");
      // P2：精英受击反馈
      this.triggerEliteHitFeedback(enemy);
      if (trail.tier === "strong" || trail.tier === "burst") {
        this.triggerEliteHeavyHitFeedback(enemy);
      }
      this.checkEliteLowHpFeedback(enemy);
    }

    // ---- Boss：伤害处理 ----
    if (enemy.kind === "boss" && enemy.bossId) {
      const bossConf = BOSS_CONFIG[enemy.bossId];
      const phase = bossConf.phases[enemy.bossPhase ?? 0];
      const burstMultiplier = phase.burstDamageMultiplier;
      const baseDmg = stage.damage * bladeDmg;
      const actualDamage = trail.tier === "burst" ? baseDmg * burstMultiplier : baseDmg;
      this.addText(enemy.x, enemy.y - 30, `-${actualDamage}`, bossConf.color, 18);
      this.damageEnemy(enemy, actualDamage, trail, false, "boss");
      // 击退反弹
      enemy.flash = 0.4;
      AudioService.slashHit();

      // 司马懿无敌阶段（Phase1：瞬移后闪白=无敌）
      if (enemy.bossId === "moXiu" && (enemy.bossPhase === 0 || enemy.bossPhase === undefined)) {
        // 没有无敌
      }
    }

    if (trail.hasOil && !trail.oilTriggeredIds.has(enemy.id)) {
      trail.oilTriggeredIds.add(enemy.id);
      this.triggerOilBurst(enemy, trail);
    }
  }

  private triggerOilBurst(origin: Vec2, trail: SlashTrail) {
    const stage = SWORD_STAGE_BY_ID[trail.tier];
    const radius = (PICKUP_BALANCE.oil.extraExplosionRadius ?? 60) * this.getExplosionRadiusMultiplier();
    this.particles.push(ringParticle(origin, "#f0a235", radius));
    this.particles.push(...sparkBurst(origin, 16, "#f0a235"));
    this.addText(origin.x, origin.y + 24, "火油爆", "#f0a235", 13);

    for (const enemy of this.enemies) {
      if (!enemy.alive || distance(enemy, origin) > radius || trail.hitEnemyIds.has(enemy.id)) continue;
      if (enemy.kind === "powder") {
        enemy.ignited = true;
        trail.pendingExplosionIds.add(enemy.id);
      } else if (enemy.kind === "core" && stage.canTriggerCoreCollapse) {
        enemy.marked = true;
        trail.pendingCoreIds.add(enemy.id);
      } else if (enemy.kind !== "core") {
        this.damageEnemy(enemy, 1, trail, true, "oil");
      }
    }
  }

  private resolvePendingSlash(trail: SlashTrail) {
    const stage = SWORD_STAGE_BY_ID[trail.tier];
    const explosionQueue = [...trail.pendingExplosionIds];
    const coreQueue = [...trail.pendingCoreIds];
    const exploded = new Set<string>();
    const collapsed = new Set<string>();
    let guard = 0;
    const tierMap: Record<string, number> = { weak: 0, normal: 1, strong: 2, burst: 3 };
    const tierPower = tierMap[trail.tier] ?? 1;

    const enqueueExplosion = (enemy: Enemy) => {
      if (!exploded.has(enemy.id)) {
        enemy.ignited = true;
        explosionQueue.push(enemy.id);
      }
    };

    const enqueueCore = (enemy: Enemy) => {
      if (!collapsed.has(enemy.id)) {
        enemy.marked = true;
        coreQueue.push(enemy.id);
      }
    };

    const affectByBlast = (target: Enemy, damage: number, source: string) => {
      if (target.kind === "powder") {
        enqueueExplosion(target);
      } else if (target.kind === "core" && stage.canTriggerCoreCollapse) {
        enqueueCore(target);
      } else if (target.kind === "core") {
        target.flash = 0.25;
      } else {
        this.damageEnemy(target, damage, trail, true, source);
      }
    };

    while ((explosionQueue.length > 0 || coreQueue.length > 0) && guard < 96) {
      guard += 1;

      while (explosionQueue.length > 0) {
        const id = explosionQueue.shift()!;
        if (exploded.has(id)) continue;
        const enemy = this.enemies.find((item) => item.id === id);
        if (!enemy?.alive) continue;

        exploded.add(id);
        trail.explosionCount += 1;
        this.stats.explosions += 1;
        this.killEnemy(enemy, trail, true, "powder");
        AudioService.explosion();

        const radius = (ENEMY_BALANCE.powder.explosionRadius ?? 85) * stage.explosionRadiusMultiplier * this.getExplosionRadiusMultiplier();
        this.particles.push(...explosionBurst(enemy, tierPower, ["#ffb15c", "#d96c32", "#ffd67c"], "#ffd67c"));
        this.screenShake = Math.max(this.screenShake, 0.65);
        this.flash = Math.max(this.flash, 0.55);

        for (const target of this.enemies) {
          if (!target.alive || distance(target, enemy) > radius) continue;
          affectByBlast(target, ENEMY_BALANCE.powder.explosionDamage ?? 1, "chain");
        }

        // ---- 连锁引信(chainFuse)：爆炸自动点燃相邻火药兵（无需刀触） ----
        if (this.hasBuff("chainFuse")) {
          for (const target of this.enemies) {
            if (!target.alive || target.kind !== "powder" || distance(target, enemy) > radius * 1.1) continue;
            if (!target.ignited) {
              target.ignited = true;
              explosionQueue.push(target.id);
            }
          }
        }
      }

      while (coreQueue.length > 0) {
        const id = coreQueue.shift()!;
        if (collapsed.has(id)) continue;
        const enemy = this.enemies.find((item) => item.id === id);
        if (!enemy?.alive) continue;

        collapsed.add(id);
        trail.coreCollapseCount += 1;
        this.stats.coreCollapses += 1;
        this.killEnemy(enemy, trail, true, "core");
        AudioService.coreCollapse();
        const radius = stage.canTriggerCoreCollapse ? stage.coreCollapseRadius * this.getCoreRadiusMultiplier() : 0;
        this.particles.push(...coreCollapseBurst(enemy, radius, tierPower));
        this.addText(enemy.x, enemy.y - 30, trail.tier === "burst" ? "大阵崩散" : "阵崩", "#e8d7ff", 18);
        this.screenShake = Math.max(this.screenShake, 0.78);
        this.flash = Math.max(this.flash, 0.65);

        for (const target of this.enemies) {
          if (!target.alive || radius <= 0 || distance(target, enemy) > radius) continue;
          if (target.kind === "powder") {
            enqueueExplosion(target);
          } else if (target.kind === "core") {
            enqueueCore(target);
          } else {
            this.damageEnemy(target, target.kind === "shield" ? 1 : 99, trail, true, "core_chain");
          }
        }

        // ---- 碎阵(shatterCore)：崩塌连锁触发相邻阵眼 ----
        if (this.hasBuff("shatterCore")) {
          for (const target of this.enemies) {
            if (!target.alive || target.kind !== "core" || target.id === enemy.id) continue;
            if (distance(target, enemy) <= radius * 1.1) {
              enqueueCore(target);
            }
          }
        }
      }
    }

    this.enemies = this.enemies.filter((enemy) => enemy.alive);
  }

  private damageEnemy(enemy: Enemy, damage: number, trail: SlashTrail, chainKill: boolean, source: string) {
    if (!enemy.alive) return false;
    enemy.hp -= damage;
    enemy.flash = 0.25;
    if (enemy.hp <= 0) {
      return this.killEnemy(enemy, trail, chainKill, source);
    }
    this.particles.push(...sparkBurst(enemy, 8, "#ffd67c"));
    return false;
  }

  private killEnemy(enemy: Enemy, trail: SlashTrail, chainKill: boolean, source: string) {
    if (!enemy.alive) return false;

    enemy.alive = false;
    trail.kills += 1;
    if (chainKill) trail.chain += 1;
    this.stats.kills += 1;
    const stage = SWORD_STAGE_BY_ID[trail.tier];
    const chainBonus = chainKill ? BALANCE.score.chainKillBonus * Math.max(1, trail.chain) : 0;
    this.score += enemy.score + chainBonus;
    const energyReward = (enemy.energyGain + (chainKill ? 1.5 : 0)) * stage.killEnergyMultiplier;
    trail.energyBank = Math.min(BALANCE.swordEnergy.maxEnergyGainPerSlash, trail.energyBank + energyReward);
    if (this.runContext.mode === "dailyChallenge" && this.runContext.dailyChallengeId === "core_bonus" && enemy.kind === "core") {
      this.score += enemy.score;
      trail.energyBank = Math.min(BALANCE.swordEnergy.maxEnergyGainPerSlash, trail.energyBank + 5);
    }

    // 陷阱阵特殊机制：阵眼死→引爆附近火药兵
    if (this._currentEventType === "trapFormation" && enemy.kind === "core") {
      for (const powder of this.enemies) {
        if (!powder.alive || powder.kind !== "powder") continue;
        if (distance(enemy, powder) < 160) {
          powder.alive = false;
          trail.kills += 1;
          this.score += powder.score;
          this.stats.kills += 1;
          this.particles.push(...explosionBurst(powder, 2, ["#ff6a33", "#ffb15c", "#f6e7bd"]));
          this.addText(powder.x, powder.y - 16, "连锁引爆", "#ff6a33", 14, 0.8);
        }
      }
    }

    // P3.10：分裂怪击杀统一处理
    if (enemy.kind === "splitter") {
      this.handleSplitterKilled(enemy, source);
    }

    const colors = source === "core" || source === "core_chain" ? ["#e8d7ff", "#5d4a8f", "#ead8a7"] : paperColors;
    const tierMap: Record<string, number> = { weak: 0, normal: 1, strong: 2, burst: 3 };
    const tierPower = tierMap[trail.tier] ?? 1;
    // 混合爆发特效：纸片 + 火花 + 光晕 + 冲击波环
    this.particles.push(...explosionBurst(enemy, tierPower, colors, source === "core" || source === "core_chain" ? "#e8d7ff" : "#ffd67c"));
    if (trail.tier === "burst") {
      this.particles.push(...sparkBurst(enemy, 12, "#ffffff", 30));
    }
    // 斩断闪光分割线
    const slashAngle = this.lastSlashAngle;
    const splitLen = enemy.radius * 2.2 + (trail.tier === "burst" ? 14 : trail.tier === "strong" ? 8 : 0);
    this.splitFlashes.push({ x: enemy.x, y: enemy.y, angle: slashAngle, length: splitLen, life: 0.28, maxLife: 0.28 });
    if (source === "powder" || source === "oil" || source === "chain") {
      this.particles.push(...sparkBurst(enemy, 18, source === "powder" ? "#ffb15c" : "#ffd67c"));
    }
    this.addText(enemy.x, enemy.y - 20, chainKill ? "连锁" : "碎", chainKill ? "#ffd67c" : "#f6e7bd", 12);
    if (chainKill) AudioService.chainKill();

    // ---- 鼓阵(warDrum)：击杀后1秒刀势不衰减 ----
    if (this.hasBuff("warDrum") && chainKill) {
      this.warDrumNoDecayTimer = 1;
    }

    this.chainKillTotal += chainKill ? 1 : 0;

    // ---- 精英击杀：掉落军令宝箱 ----
    if (enemy.kind === "elite" && enemy.eliteKind && !this.chestDropped) {
      this.triggerEliteChestDrop(enemy);
    }

    // ---- Boss击杀：追踪图鉴 ----
    if (enemy.kind === "boss" && enemy.bossId) {
      this.killedBoss = enemy.bossId;
      this.stats.killedBoss = enemy.bossId;
      this.flash = Math.max(this.flash, 1);
      this.screenShake = Math.max(this.screenShake, 1.2);
      // P4.2A.2: Boss击败通知直接进入胜利过渡，不额外播报中央
      this.clearBossNoticeScope(enemy.bossId);
      AudioService.victory();
    }

    return true;
  }

  private collectPickup(pickup: Pickup, trail: SlashTrail) {
    pickup.active = false;
    this.stats.pickups += 1;
    this.score += 35;
    logEvent("pickup_collected", {
      levelId: this.level.id,
      time: this.elapsed,
      pickupKind: pickup.kind,
      slashStage: SWORD_STAGE_BY_ID[trail.tier].name
    });
    trail.energyBank = Math.min(
      BALANCE.swordEnergy.maxEnergyGainPerSlash,
      trail.energyBank + PICKUP_BALANCE[pickup.kind].energyGain
    );

    if (pickup.kind === "drum") {
      this.drumTimer = PICKUP_BALANCE.drum.duration === "next_slash" ? 5 : PICKUP_BALANCE.drum.duration;
    }
    if (pickup.kind === "soul") this.nextSoul = true;
    if (pickup.kind === "oil") this.nextOil = true;

    this.particles.push(ringParticle(pickup, PICKUP_DEFS[pickup.kind].color, 34));
    this.particles.push(...sparkBurst(pickup, 14, PICKUP_DEFS[pickup.kind].color));
    AudioService.pickup();
    this.addText(pickup.x, pickup.y - 18, PICKUP_BALANCE[pickup.kind].feedback, PICKUP_DEFS[pickup.kind].color, 15);
    trail.chain += 1;
  }

  private updateEnemies(dt: number) {
    // 中场事件计时衰减
    if (this._midfieldEvent) {
      this._midfieldEvent.timer += dt;
      if (this._midfieldEvent.timer >= this._midfieldEvent.duration) {
        this._midfieldEvent = null;
      }
    }

    // 同屏敌人上限
    if (this.enemies.length > MAX_ENEMIES_ON_SCREEN) {
      // 跳过多余敌人的更新（少移动），但保持存活逻辑
    }
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.wobble += dt;
      enemy.flash = Math.max(0, enemy.flash - dt * 3);
      if (enemy.shieldBrokenFlash !== undefined) {
        enemy.shieldBrokenFlash = Math.max(0, enemy.shieldBrokenFlash - dt * 3);
      }
      enemy.slowedTimer = Math.max(0, enemy.slowedTimer - dt);

      // ---- 阵法亮字切换 ----
      if (enemy.kind === "core" && enemy.marked && enemy.formationId) {
        const formation = FORMATIONS[enemy.formationId] || FORMATIONS.snake;
        enemy.formationLitTimer = (enemy.formationLitTimer ?? 0) + dt;
        if (enemy.formationLitTimer >= formation.litInterval) {
          enemy.formationLitTimer = 0;
          // 随机选下一个亮字（不重复当前）
          const nextIndex = Math.floor(Math.random() * formation.chars.length);
          enemy.formationLitIndex = nextIndex;
        }
      }

      const statusSlow = enemy.ignited || enemy.marked ? 0.54 : 1;
      const fortressSlow = enemy.slowedTimer > 0 ? 0.4 : 1;

      // ── 第一轮修正：entryPhase 按目标时间强制下压 ──
      // 无论 enemy.speed 被压多低，都保证在 maxDuration 内到达 entryEndY
      if (enemy.entryPhase?.active && !enemy.entryPhase.completed) {
        const e = enemy.entryPhase;
        e.elapsed += dt;
        const reachedEnd = enemy.y >= e.endY;
        const timeout = e.elapsed >= e.maxDuration;
        if (reachedEnd || timeout) {
          e.completed = true;
          e.active = false;
        }
      }
      const ep = enemy.entryPhase;
      let entryMultiplier = 1;
      if (ep?.active && !ep.completed) {
        // 保底速度：剩余距离 / 剩余时间，确保在 maxDuration 内到达
        const remainingDistance = Math.max(0, ep.endY - enemy.y);
        const remainingTime = Math.max(0.08, ep.maxDuration - ep.elapsed);
        const requiredSpeed = remainingDistance / remainingTime;
        const multipliedSpeed = enemy.speed * ep.speedMultiplier;
        // 实际速度 = max(倍率速度, 保底速度)
        const actualSpeed = Math.max(multipliedSpeed, requiredSpeed);
        entryMultiplier = actualSpeed / enemy.speed;
      }

      // ── 蛇形兵 sine_sway：横向正弦摆动 ──
      if (enemy.snakeSwayT !== undefined) {
        enemy.snakeSwayT += dt;
        // 振幅 14px，频率 0.8Hz（周期 1.25s）
        const sway = Math.sin(enemy.snakeSwayT * Math.PI * 1.6) * 14;
        if (enemy.homeX !== undefined) {
          enemy.x = enemy.homeX + sway;
        }
      }

      // ── 急冲兵 rush_then_slow ──
      let rushMultiplier = 1;
      if (enemy.rushTimer !== undefined) {
        if (enemy.rushTimer > 0) {
          rushMultiplier = 2.2;
          enemy.rushTimer -= dt;
          if (Math.random() < 0.15) {
            this.particles.push(glowParticle(enemy, "#ff6a33", 6, 4));
          }
        } else {
          rushMultiplier = 0.8;
        }
      }

      // ── 中场事件：gather 聚阵（仅作用于本波敌人，急冲兵不参与） ──
      if (enemy.spawnedWithEvent === 'gather' && enemy.homeX !== undefined && enemy.rushTimer === undefined) {
        if (enemy.y >= 420 && enemy.y <= 540) {
          const centerX = DESIGN_WIDTH / 2;
          const dx = centerX - enemy.x;
          enemy.x += dx * 0.08 * dt * 60;
          enemy.x = clamp(enemy.x, enemy.homeX - 35, enemy.homeX + 35);
        }
      }

      // ── 中场事件：charge_pause 蓄冲（仅作用于本波敌人） ──
      if (enemy.spawnedWithEvent === 'charge_pause' && enemy.chargeTimer === undefined) {
        // 到达 y=340 时触发蓄力
        if (enemy.y >= 340 && enemy.y <= 360) {
          enemy.chargeTimer = 0.45; // 0.45s 停顿蓄力
          // 蓄力视觉标记：闪光
          enemy.flash = 0.4;
          this.particles.push(glowParticle(enemy, "#ff6a33", 16, 28));
        }
      }
      if (enemy.chargeTimer !== undefined && enemy.chargeTimer >= 0) {
        enemy.chargeTimer -= dt;
        if (enemy.chargeTimer <= 0) {
          // 蓄力完成：1.8倍速冲刺
          enemy.chargeTimer = -1;
          enemy.speed *= 1.8;
          // 冲刺视觉标记：红色闪光
          enemy.flash = 0.6;
          this.particles.push(glowParticle(enemy, "#ff6a33", 22, 36));
        }
      }

      // 正常下落（未蓄力时或冲刺后）
      const isCharging = enemy.chargeTimer !== undefined && enemy.chargeTimer >= 0;
      if (!isCharging) {
        // P4.3A: 动态flow倍率替代固定harvestSlow
        const flowMul = enemy.flow?.currentSpeedMultiplier ?? 1;
        enemy.y += enemy.speed * entryMultiplier * rushMultiplier * statusSlow * fortressSlow * flowMul * dt;
      } else {
        // 蓄力时略微闪红光
        if (Math.sin(this.elapsed * 20) > 0) {
          enemy.flash = Math.max(enemy.flash, 0.2);
        }
      }

      // ── 中场特性激活：使用 BATTLEFIELD_ZONES 配置 ──
      if (enemy.y >= BATTLEFIELD_ZONES.midfieldStartY && !enemy.midfieldActivated) {
        enemy.midfieldActivated = true;
        this.activateMidfieldTrait(enemy);
      }

      // P4.4A.1-R3: Boss模式不扣防线伤害
      if (this.gameMode === "boss") {
        enemy.alive = false;
        continue;
      }
      if (enemy.y >= BALANCE.battlefield.bottomDefenseY) {
        // ---- 堅城(fortress)buff：敌军触线后减速1秒，而非立即消失 ----
        if (this.hasBuff("fortress") && enemy.slowedTimer <= 0) {
          enemy.slowedTimer = 1;
          enemy.hpDamage = Math.max(1, enemy.hpDamage - 1); // 减少伤害
          this.hp -= 1; // 触线仍扣1点（不扣原始damage）
          this.defenseLineHits += 1;
          this.screenShake = Math.max(this.screenShake, 0.28);
          this.addText(enemy.x, BALANCE.battlefield.bottomDefenseY - 12, "-1 坚城减速", "#5b8db8", 14);
          this.particles.push(...sparkBurst(enemy, 8, "#5b8db8"));
        } else {
          // 三次修正：精英触底死亡也要掉宝箱（之前直接 enemy.alive=false 绕过了 killEnemy）
          if (enemy.kind === "elite" && enemy.eliteKind && !this.chestDropped) {
            this.triggerEliteChestDrop(enemy);
          } else {
            this.addText(enemy.x, BALANCE.battlefield.bottomDefenseY - 12, `-${enemy.hpDamage}`, "#ff7b6e", 18);
          }
          enemy.alive = false;
          this.hp -= enemy.hpDamage;
          this.defenseLineHits += 1;
          this.screenShake = Math.max(this.screenShake, 0.45);
          this.flash = Math.max(this.flash, 0.35);
          AudioService.defenseHit();
          this.particles.push(...paperBurst({ x: enemy.x, y: BALANCE.battlefield.bottomDefenseY }, 12, ["#7b241f", "#d8b46e"]));
        }

        // 堅城减速到期后正常移除
        if (enemy.slowedTimer <= 0 && this.hasBuff("fortress")) {
          enemy.alive = false;
          this.enemies = this.enemies.filter((e) => e.alive);
        }
      }
    }

    this.enemies = this.enemies.filter((enemy) => enemy.alive);

    // 二次打磨：怪物软分离（中场/收割区自然挤开，减少重叠）
    this.applyEnemySoftSeparation(dt);

    // P3.13：所有 x 位移逻辑结束后，最后执行半径感知硬边界
    for (const enemy of this.enemies) {
      this.clampEnemyToVisibleArea(enemy);
    }
  }

  /** P3.13：半径感知的边界计算 */
  private getEnemyVisibleXBounds(enemy: Enemy): { min: number; max: number } {
    const visualMargin = 10;
    const min = Math.max(BATTLE_SAFE_X.absoluteMin, enemy.radius + visualMargin);
    const max = Math.min(BATTLE_SAFE_X.absoluteMax, DESIGN_WIDTH - enemy.radius - visualMargin);
    return { min, max };
  }

  /** P3.13：统一最终边界限制 */
  private clampEnemyToVisibleArea(enemy: Enemy) {
    const bounds = this.getEnemyVisibleXBounds(enemy);
    enemy.x = clamp(enemy.x, bounds.min, bounds.max);
  }

  /** 怪物软分离：同屏怪物过密时轻微推开 */
  private applyEnemySoftSeparation(dt: number) {
    const cfg = ENEMY_SOFT_SEPARATION;
    if (!cfg.enabled) return;
    // 第六轮修正：只处理普通小怪，不处理精英；最多 45 个 eligible
    const eligible = this.enemies.filter(e =>
      e.alive &&
      e.kind !== "elite" &&
      e.y >= cfg.yMin &&
      e.y <= cfg.yMax
    ).slice(0, 45);
    const alive = eligible;
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      if (a.y < cfg.yMin || a.y > cfg.yMax) continue;
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        if (b.y < cfg.yMin || b.y > cfg.yMax) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const tooCloseX = Math.abs(dx) < cfg.minXDistance;
        const tooCloseY = Math.abs(dy) < cfg.minYDistance;
        if (!tooCloseX || !tooCloseY) continue;
        const pushX = (cfg.minXDistance - Math.abs(dx)) * cfg.strength * Math.sign(dx || 1);
        const clampedPush = Math.max(-cfg.maxCorrectionPerFrame, Math.min(cfg.maxCorrectionPerFrame, pushX));
        a.x -= clampedPush * 0.5;
        b.x += clampedPush * 0.5;
        this.clampEnemyToVisibleArea(a);
        this.clampEnemyToVisibleArea(b);
      }
    }
  }

  private updatePickups(dt: number) {
    for (const pickup of this.pickups) {
      if (!pickup.active) continue;
      pickup.pulse += dt;
      pickup.life -= dt;
      pickup.y += 7 * dt;
      if (pickup.life <= 0 || pickup.y > BALANCE.battlefield.bottomDefenseY - 8) pickup.active = false;
    }
    this.pickups = this.pickups.filter((pickup) => pickup.active);
  }

  private updateParticles(dt: number) {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 88 * dt;
      particle.rotation += particle.spin * dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0).slice(0, MAX_PARTICLES_ON_SCREEN);
    for (const sf of this.splitFlashes) {
      sf.life -= dt;
    }
    this.splitFlashes = this.splitFlashes.filter((sf) => sf.life > 0);
  }

  /** @deprecated P4.2A.1: 强斩时机/破阵良机已删除 */
  private updateMidfieldHints(dt: number) { }

  /** 副刀自动攻击 - 蓄势横扫(槽0) + 破点追击(槽1) */
  private updateSubBlades(dt: number) {
    // P4.4A: Boss开场期间副刀保持待机
    if (this.bossController?.isIntroActive) return;
    // P4.1A.12: subSlash子系统已删除
    // 破绽标记衰减
    for (const [enemyId, timeLeft] of this.weakpointMarks) {
      const newTime = timeLeft - dt;
      if (newTime <= 0) {
        this.weakpointMarks.delete(enemyId);
      } else {
        this.weakpointMarks.set(enemyId, newTime);
      }
    }

    // 副刀cd光圈提示
    for (const p of this.subReadyPing) p.life -= dt;
    this.subReadyPing = this.subReadyPing.filter(p => p.life > 0);

    for (let i = 0; i < 2; i++) {
      const blade = this.subBlades[i];
      if (!blade) continue;
      const anim = this.subBladeAnim[i];
      const home = this.getSubBladeFloatingPos(i);
      const cd = this.subBladeCooldowns[i];
      const frameDt = Math.min(dt, 0.04);
      const M = SUB_BLADE_MOTION[i === 0 ? "left" : "right"];

      // P4.1A.5：switch状态机，细化速度层级
      switch (anim.phase) {
        case "cooldown":
        case "idle": {
          if (anim.phase === "idle") anim.phase = "cooldown";
          const inspireMul = this._currentEventType === "inspire" ? 1.3 : 1;
          this.subBladeTimers[i] += dt * inspireMul;
          if (this.subBladeTimers[i] >= cd) {
            anim.phase = "ready";
            anim.phaseTimer = 0;
          }
          break;
        }
        case "ready": {
          const validEnemies = this.enemies.filter(e => e.alive && e.y >= BATTLEFIELD_ZONES.midfieldStartY && e.y <= BALANCE.battlefield.bottomDefenseY - 30);
          // P4.1A.5: 最短Ready展示
          if (anim.phaseTimer < M.readyMinHold) {
            anim.phaseTimer += frameDt;
            break;
          }
          if (i === 0 && validEnemies.length >= 3) {
            // P4.1A.9: 局部80px密集群（不是全部有效敌人的平均点）
            let bestGroup: typeof validEnemies = [];
            for (const seed of validEnemies) {
              const group = validEnemies.filter(e => Math.abs(e.y - seed.y) <= 40);
              if (group.length > bestGroup.length) bestGroup = group;
            }
            if (bestGroup.length < 3) { anim.phaseTimer += frameDt; break; }
            const avgX = bestGroup.reduce((s, e) => s + e.x, 0) / bestGroup.length;
            const avgY = bestGroup.reduce((s, e) => s + e.y, 0) / bestGroup.length;
            const centerX = clamp(avgX, 100, DESIGN_WIDTH - 100);
            const centerY = clampSubBladeAttackY(avgY - 50);
            // P4.1A.11: 计算横扫入口/出口，让outbound飞向入口，attacking穿越到出口
            const entryPos = { x: clamp(centerX - 90, 32, DESIGN_WIDTH - 32), y: clampSubBladeAttackY(centerY + 6) };
            const exitPos = { x: clamp(centerX + 90, 32, DESIGN_WIDTH - 32), y: clampSubBladeAttackY(centerY - 6) };
            anim.startPos = { ...home };
            anim.endPos = { ...entryPos };
            // P4.1A.13: attackStartPos/attackEndPos 用于attacking阶段真实横扫
            anim.attackStartPos = { ...entryPos };
            anim.attackEndPos = { ...exitPos };
            anim.phase = "arming";
            anim.phaseTimer = 0;
            anim.phaseDuration = M.arming;
          } else if (i === 1) {
            // P4.1A.8: 高价值优先，全部限制在有效战区
            const highValPriorityOrder = ["splitter", "elite", "core", "powder", "shield"];
            let highVal = null;
            for (const kind of highValPriorityOrder) {
              if (kind === "splitter") highVal = validEnemies.find(e => e.kind === "splitter" && e.splitState === "warning");
              else highVal = validEnemies.find(e => e.kind === kind);
              if (highVal) break;
            }
            if (highVal) {
              anim.targetId = highVal.id;
              anim.startPos = { ...home };
              anim.endPos = { x: highVal.x, y: highVal.y - 30 };
              anim.phase = "arming";
              anim.phaseTimer = 0;
              anim.phaseDuration = M.arming;
            } else {
              const nearest = validEnemies.sort((a, b) => b.y - a.y)[0];
              const isUrgent = nearest && (nearest.y >= BALANCE.battlefield.bottomDefenseY - 120 || validEnemies.length >= 4);
              anim.phaseTimer += frameDt;
              if (isUrgent || anim.phaseTimer >= M.highValueWait) {
                if (nearest) {
                  anim.targetId = nearest.id;
                  anim.startPos = { ...home };
                  anim.endPos = { x: nearest.x, y: nearest.y - 30 };
                  anim.phase = "arming";
                  anim.phaseTimer = 0;
                  anim.phaseDuration = M.arming;
                }
              }
            }
          }
          break;
        }
        case "arming": {
          anim.phaseTimer += frameDt;
          if (anim.phaseTimer >= anim.phaseDuration) {
            anim.phase = "outbound";
            anim.phaseTimer = 0;
            anim.phaseDuration = M.outbound;
            anim.startPos = { ...home };
            const sl = this.getSubBladeSlotLayout(i);
            this.particles.push(ringParticle({ x: sl.centerX, y: sl.centerY }, i === 0 ? "#5bc0ff" : "#b58cff", 20));
          }
          break;
        }
        case "outbound": {
          anim.phaseTimer += frameDt;
          if (anim.phaseTimer >= anim.phaseDuration) {
            // P4.1A.5: outbound → attacking（不再直接returning）
            this.subBladeTimers[i] = 0;
            const stats = BLADE_BASE_STATS[blade.quality];
            if (stats) {
              // P4.1A.12: 伤害由attacking阶段直接结算，不再调用空trigger函数
            }
            anim.phase = "attacking";
            anim.phaseTimer = 0;
            anim.phaseDuration = M.attacking;
            // P4.1A.14: 左右副刀初始化currentPos
            if (i === 0) {
              anim.currentPos = { ...anim.attackStartPos };
              anim.rotation = Math.atan2(anim.attackEndPos.y - anim.attackStartPos.y, anim.attackEndPos.x - anim.attackStartPos.x) + Math.PI / 2;
              anim.startPos = { ...anim.attackEndPos };
            } else {
              // P4.1A.15: 右刀进入attacking时初始化rotation
              const dx = anim.endPos.x - anim.startPos.x;
              const dy = anim.endPos.y - anim.startPos.y;
              anim.rotation = Math.atan2(dy, dx) + Math.PI / 2;
              anim.currentPos = { ...anim.endPos };
              anim.startPos = { ...anim.endPos };
            }
          }
          break;
        }
        case "attacking": {
          anim.phaseTimer += frameDt;
          // P4.1A.11: attacking阶段飞刀实体沿真实路径运动
          const aT = clamp(anim.phaseTimer / anim.phaseDuration, 0, 1);
          if (i === 0) {
            // P4.1A.13: 左刀从attackStartPos到attackEndPos横扫
            const sweepStart = anim.attackStartPos ?? { x: anim.endPos.x - 90, y: anim.endPos.y };
            const sweepEnd = anim.attackEndPos ?? { x: anim.endPos.x + 90, y: anim.endPos.y };
            const easeT = aT < 0.5 ? 2 * aT * aT : 1 - Math.pow(-2 * aT + 2, 2) / 2;
            anim.currentPos = { x: sweepStart.x + (sweepEnd.x - sweepStart.x) * easeT, y: sweepStart.y + (sweepEnd.y - sweepStart.y) * easeT };
          } else if (i === 1 && anim.targetId) {
            // P4.1A.15: 右刀攻击阶段持续追踪存活目标（使用统一同步函数）
            const target = this.enemies.find(e => e.id === anim.targetId && e.alive);
            if (target) this.syncWeakpointBladeToTarget(anim, target);
          }
          // P4.1A.15: 左右刀使用命中进度（左52%，右45%）代替固定0.06s
          const attackProgress = clamp(anim.phaseTimer / anim.phaseDuration, 0, 1);
          const hitProgress = i === 0 ? 0.52 : 0.45;
          if (attackProgress >= hitProgress && !anim.hitApplied) {
            anim.hitApplied = true;
            const stats = BLADE_BASE_STATS[blade.quality];
            if (stats) {
              if (i === 0) {
                // P4.1A.14: 左刀伤害使用attackStartPos→attackEndPos（禁止endPos±90）
                const dmgX1 = anim.attackStartPos?.x ?? anim.endPos.x - 90;
                const dmgY1 = anim.attackStartPos?.y ?? anim.endPos.y + 6;
                const dmgX2 = anim.attackEndPos?.x ?? anim.endPos.x + 90;
                const dmgY2 = anim.attackEndPos?.y ?? anim.endPos.y - 6;
                this.applyMomentumSweepDamage({ x1: dmgX1, y1: dmgY1, x2: dmgX2, y2: dmgY2, color: "#5bc0ff", bladeIdx: 0 }, blade, stats);
              } else {
                // P4.1A.11: 右刀严格单目标伤害
                let rightTarget: Enemy | null = anim.targetId ? (this.enemies.find(e => e.id === anim.targetId && e.alive) ?? null) : null;
                if (!rightTarget) {
                  // 重锁：使用endPos附近90px搜索
                  const searchPos = { x: anim.endPos.x, y: anim.endPos.y + 30 };
                  const candidates = this.enemies.filter(e => e.alive && e.y >= BATTLEFIELD_ZONES.midfieldStartY && e.y <= BALANCE.battlefield.bottomDefenseY - 30);
                  const orders = ["splitter", "elite", "core", "powder", "shield"];
                  for (const kind of orders) { rightTarget = candidates.find(e => e.kind === kind && Math.abs(e.x - searchPos.x) <= 90 && Math.abs(e.y - searchPos.y) <= 90) ?? null; if (rightTarget) break; }
                  if (!rightTarget) rightTarget = candidates.sort((a, b) => b.y - a.y).find(e => Math.abs(e.x - searchPos.x) <= 90 && Math.abs(e.y - searchPos.y) <= 90) ?? null;
                  if (rightTarget) {
                    // P4.1A.15: 重锁同步targetId/currentPos/endPos/rotation
                    this.syncWeakpointBladeToTarget(anim as any, rightTarget);
                  } else {
                    // 无目标：回收+返还75%CD
                    this.subBladeTimers[i] = this.subBladeCooldowns[i] * 0.75;
                    anim.phase = "returning";
                    anim.phaseTimer = 0;
                    anim.phaseDuration = M.returning;
                    anim.startPos = { ...anim.endPos };
                    anim.endPos = { ...home };
                    break; // 跳过伤害
                  }
                }
                if (rightTarget) {
                  // P4.1A.13: 右刀严格单目标伤害
                  this.applyWeakpointDamageByTarget(rightTarget, blade, stats);
                }
              }
            }
          }
          if (anim.phaseTimer >= anim.phaseDuration) {
            anim.phase = "returning";
            anim.phaseTimer = 0;
            anim.phaseDuration = M.returning;
            // P4.1A.14: 左刀从attackEndPos收回，右刀从currentPos收回
            if (i === 0) {
              anim.startPos = { ...(anim.attackEndPos ?? { x: anim.endPos.x + 180, y: anim.endPos.y }) };
            } else {
              anim.startPos = { ...(anim.currentPos ?? anim.endPos) };
            }
            anim.endPos = { ...home };
            anim.hitApplied = false;
          }
          break;
        }
        case "returning": {
          anim.phaseTimer += frameDt;
          if (anim.phaseTimer >= anim.phaseDuration) {
            anim.phase = "settling";
            anim.phaseTimer = 0;
            anim.phaseDuration = M.settling;
            anim.startPos = { x: home.x, y: home.y + (i === 0 ? 7 : 9) };
            anim.endPos = { ...home };
          }
          break;
        }
        case "settling": {
          anim.phaseTimer += frameDt;
          if (anim.phaseTimer >= anim.phaseDuration) {
            // P4.1A.14: 检查readyAfterAction（共鸣期间正在攻击的副刀归位后立即Ready）
            if (this.subBladeReadyAfterAction[i]) {
              this.subBladeReadyAfterAction[i] = false;
              this.subBladeTimers[i] = this.subBladeCooldowns[i];
              anim.phase = "ready";
            } else {
              anim.phase = "cooldown";
            }
            anim.phaseTimer = 0;
            // P4.1A.9: cooldown时清空targetId和hit状态
            anim.targetId = null;
            anim.hitApplied = false;
            // P4.1A.14: 重置横扫坐标
            anim.currentPos = { ...home };
            anim.attackStartPos = { ...home };
            anim.attackEndPos = { ...home };
            anim.startPos = { ...home };
            anim.endPos = { ...home };
          }
          break;
        }
      }
    }
  }

  /** 蓄势横扫 —— 横向扫过敌群最密集区域 */
  /** P4.1A.8：左副刀横扫（不再生成假subSlash，由attacking阶段直接结算） */
  /** P2.8：hit stop 普通触发（有冷却，force=true 可无视冷却） */
  /** P4.3A: 战场三层流动压力控制器 */
  private getPressureLayer(enemyY: number): BattlefieldPressureLayer {
    const zones = BATTLEFIELD_ZONES;
    if (enemyY < zones.midfieldStartY) return "rear";
    if (enemyY < zones.harvestStartY) return "mid";
    return "front";
  }

  private getPressureSnapshot() {
    const rear: Enemy[] = []; const mid: Enemy[] = []; const front: Enemy[] = [];
    for (const e of this.enemies) {
      if (!e.alive || e.kind === "boss") continue;
      // P4.3A.2: entryPhase敌人计入入场压力而非完全排除
      if (e.entryPhase?.active && !e.entryPhase.completed) continue;
      const layer = this.getPressureLayer(e.y);
      if (layer === "rear") rear.push(e);
      else if (layer === "mid") mid.push(e);
      else front.push(e);
    }
    return { rear, mid, front, total: rear.length + mid.length + front.length };
  }

  /** P4.3A.2+3: 投影压力（按source过滤，修正actual漏算） */
  private getProjectedPressure(lookAhead = 1.5, source?: "normal" | "edict") {
    const actual = { rear: 0, mid: 0, front: 0 };
    for (const e of this.enemies) {
      if (!e.alive || e.kind === "boss") continue;
      if (source && e.spawnSource && e.spawnSource !== source) continue;
      // 修复：无entryPhase或已完成entry的计入actual
      if (!e.entryPhase || e.entryPhase.completed) {
        const l = this.getPressureLayer(e.y);
        if (l === "rear") actual.rear++; else if (l === "mid") actual.mid++; else actual.front++;
      }
    }
    const entry = { rear: 0, mid: 0, front: 0 };
    for (const e of this.enemies) {
      if (!e.alive || !e.entryPhase || e.entryPhase.completed) continue;
      if (source && e.spawnSource && e.spawnSource !== source) continue;
      const remain = Math.max(0, e.entryPhase.maxDuration - e.entryPhase.elapsed);
      const weight = remain <= 0.6 ? 1.0 : remain <= 1.2 ? 0.7 : 0.4;
      entry.mid += weight * 0.7;
      entry.rear += weight * 0.3;
    }
    // incoming只用于人口预算，不直接算front压力
    const incoming = { vanguard: 0, main: 0, reserve: 0 };
    for (const q of this.subSpawnQueue) {
      if (q.time - this.elapsed > lookAhead) continue;
      if (source && q.source && q.source !== source) continue;
      const role = q.flowRole ?? "main";
      if (role === "vanguard") incoming.vanguard++;
      else if (role === "main") incoming.main++;
      else incoming.reserve++;
    }
    // 未生成队列不直接映射到front
    const projected = {
      rear: actual.rear + entry.rear,
      mid: actual.mid + entry.mid,
      front: actual.front + entry.front,
    };
    return { actual, entry, incoming, projected,
      totalActual: actual.rear + actual.mid + actual.front,
      totalProjected: projected.rear + projected.mid + projected.front,
      actionableNow: actual.mid + actual.front,
    };
  }

  /** P4.3A.3: 可行动压力（只看当前/即将到mid的敌人） */
  /** P4.3A.4: 敌人到mid的真实ETA（包含入场剩余+到mid距离） */
  private estimateEnemyEtaToMid(enemy: Enemy): number {
    if (enemy.y >= BATTLEFIELD_ZONES.midfieldStartY) return 0;
    if (enemy.entryPhase?.active && !enemy.entryPhase.completed) {
      const entryRemain = Math.max(0, enemy.entryPhase.maxDuration - enemy.entryPhase.elapsed);
      const entryEndY = enemy.entryPhase.endY;
      const afterEntryDist = Math.max(0, BATTLEFIELD_ZONES.midfieldStartY - entryEndY);
      const spd = enemy.speed * (enemy.flow?.currentSpeedMultiplier ?? 1);
      return entryRemain + afterEntryDist / Math.max(spd, 1);
    }
    const dist = BATTLEFIELD_ZONES.midfieldStartY - enemy.y;
    const speed = enemy.speed * (enemy.flow?.currentSpeedMultiplier ?? 1);
    return speed > 0 ? dist / speed : 99;
  }

  /** P4.3A.4: 队列敌人到mid的真实ETA（等待生成+入场+到mid移动） */
  private estimateQueueItemEtaToMid(item: typeof this.subSpawnQueue[number]): number {
    const waitTime = Math.max(0, item.time - this.elapsed);
    const phase = item.battlePhase ?? this.battlePhase;
    const profile = this.getEntryProfileForEnemy(item.kind as EnemyKind, phase);
    const entryEndY = profile.entryEndY + (item.entryEndYOffset ?? 0);
    const entryDuration = profile.entryMaxDuration;
    const baseSpeed = ENEMY_BALANCE[item.kind as EnemyKind]?.speed ?? 48;
    const role = item.flowRole ?? "main";
    const roleSpeed = BATTLEFIELD_FLOW.roleSpeed[role];
    const afterEntryDist = Math.max(0, BATTLEFIELD_ZONES.midfieldStartY - entryEndY);
    return waitTime + entryDuration + afterEntryDist / Math.max(baseSpeed * roleSpeed * (item.speedMultiplier ?? 1), 1);
  }

  private getCombatPressure(scope: "all" | "normal" | "edict" = "all", horizon = 1.5) {
    const source = scope === "all" ? undefined : scope;
    const proj = this.getProjectedPressure(horizon, source);
    let actionableNow = 0;
    let arrivesMidWithin07 = 0;
    let nearestMidEta = 99;
    for (const e of this.enemies) {
      if (!e.alive || e.kind === "boss") continue;
      if (source && e.spawnSource && e.spawnSource !== source) continue;
      if (!e.entryPhase || e.entryPhase.completed) {
        const layer = this.getPressureLayer(e.y);
        if (layer === "mid" || layer === "front") actionableNow++;
      }
      const eta = this.estimateEnemyEtaToMid(e);
      if (eta < nearestMidEta) nearestMidEta = eta;
      if (eta <= 0.7 && eta > 0) arrivesMidWithin07++;
    }
    // 未来队列ETA（真实估算：包含生成等待+入场+到mid）
    let queueMidEta07 = 0;
    let queueMidEta12 = 0;
    for (const q of this.subSpawnQueue) {
      if (q.time - this.elapsed > horizon) continue;
      if (source && q.source !== source) continue;
      const eta = this.estimateQueueItemEtaToMid(q);
      if (eta <= 0.7) queueMidEta07++;
      if (eta <= 1.2) queueMidEta12++;
    }
    return {
      proj,
      actionableNow,
      actionableSoon07: actionableNow + arrivesMidWithin07 + queueMidEta07,
      actionableSoon12: actionableNow + arrivesMidWithin07 + queueMidEta12,
      nearestMidEta,
      arrivesMidWithin07,
      arrivesMidWithin12: arrivesMidWithin07 + queueMidEta12,
    };
  }

  /** P4.3A.3+5: 普通波提前推进（军令active时暂停） */
  private shouldAdvanceNextWave(): boolean {
    if (this.edictRewardState === "active" || this.battlePhase === "edict_burst") return false;
    const pressure = this.getCombatPressure("normal", 1.2);
    const activeThreat = pressure.proj.projected.mid + pressure.proj.projected.front;
    const tooLow = activeThreat <= 3;
    const noNearThreat = pressure.proj.projected.front < 0.8;
    const lockExpired = this.elapsed >= this.waveAdvanceLockedUntil;
    const enoughGap = this.elapsed - this._lastWaveElapsed >= 0.60;
    if (!tooLow || !noNearThreat || !lockExpired || !enoughGap) return false;
    if (this.chestPendingConfirm || this.phase !== "playing") return false;
    if (this.wavesSpawned >= this.level.waves.length) return false;
    const aliveCount = this.enemies.filter(e => e.alive).length;
    if (aliveCount + this.subSpawnQueue.length > 40) return false;
    // P4.3A.5: 未来1.2秒已有足够敌人时不提前
    if (pressure.actionableSoon12 >= 3) return false;
    return true;
  }

  private getTargetLayerCounts(total: number, phase: BattlePhase): { rear: number; mid: number; front: number } {
    const ratios = (BATTLEFIELD_FLOW.layerRatios as any)[phase] ?? BATTLEFIELD_FLOW.layerRatios.main_waves;
    if (total <= 0) return { rear: 0, mid: 0, front: 0 };
    if (total === 1) return { rear: 0, mid: 0, front: 1 };
    if (total === 2) return { rear: 0, mid: 1, front: 1 };
    if (total === 3) return { rear: 1, mid: 1, front: 1 };
    // 4只以上：最大余数法，保证和为total
    let front = Math.round(total * ratios.front);
    let mid = Math.round(total * ratios.mid);
    let rear = total - front - mid;
    if (rear < 0) { mid += rear; rear = 0; }
    if (mid < 0) { front += mid; mid = 0; }
    return { rear: Math.max(0, rear), mid: Math.max(1, mid), front: Math.max(1, front) };
  }

  /** P4.3A.1: 为直接生成的敌人挂接Flow（覆盖所有非Boss直接创建路径） */
  private attachEnemyFlow(enemy: Enemy, role: EnemyFlowRole = "main", groupId: string = "direct", order: number = 0) {
    if (enemy.kind === "boss" || !BATTLEFIELD_FLOW.enabled) return;
    enemy.flow = {
      role,
      currentLayer: this.getPressureLayer(enemy.y),
      targetSpeedMultiplier: BATTLEFIELD_FLOW.roleSpeed[role],
      currentSpeedMultiplier: BATTLEFIELD_FLOW.roleSpeed[role],
      spacingMultiplier: 1,
      spawnGroupId: groupId,
      spawnOrder: order,
      depthSeed: Math.random(),
    };
  }

  /** P4.3A.2: 怪物类型→Flow角色偏好 */
  private getPreferredFlowRoles(kind: EnemyKind): EnemyFlowRole[] {
    switch (kind) {
      case "infantry": return ["vanguard", "main", "reserve"];
      case "powder": return ["vanguard", "main"];
      case "shield": return ["main", "reserve"];
      case "splitter": return ["main", "reserve"];
      case "core": return ["reserve", "main"];
      case "tractor": return ["reserve"];
      default: return ["main"];
    }
  }

  /** P4.3A.2: 统一敌人加入（自动挂接flow） */
  private pushEnemy(enemy: Enemy, role?: EnemyFlowRole, groupId?: string, order?: number) {
    if (enemy.kind !== "boss" && !enemy.flow) {
      const prefRoles = this.getPreferredFlowRoles(enemy.kind);
      const preferredRole = role ?? (prefRoles.length > 0 ? prefRoles[0] : "main");
      // 急冲兵强制vanguard
      const finalRole = enemy.rushTimer !== undefined ? "vanguard" : preferredRole;
      this.attachEnemyFlow(enemy, finalRole, groupId ?? "direct", order ?? 0);
    }
    this.enemies.push(enemy);
  }

  private updateBattlefieldFlow(dt: number) {
    const snap = this.getPressureSnapshot();
    const targets = this.getTargetLayerCounts(snap.total, this.battlePhase);
    const flow = BATTLEFIELD_FLOW;

    // Y向纵深间距更新
    this.updateEnemyDepthSpacing(dt);

    // 近场补位候选人选择（只加速1-2只，非整层齐冲）
    const frontRefillCandidates = this.selectFrontRefillCandidates(snap);

    for (const enemy of this.enemies) {
      if (!enemy.alive || !enemy.flow || enemy.kind === "boss") continue;
      const f = enemy.flow;
      const layer = this.getPressureLayer(enemy.y);
      f.currentLayer = layer;

      // 基础角色速度
      let targetSpeed: number = flow.roleSpeed[f.role];

      // 近场动态
      if (layer === "front") {
        if (snap.front.length <= 1) targetSpeed = clamp(targetSpeed * 1.08, flow.minSpeedMultiplier, flow.maxSpeedMultiplier);
        else if (snap.front.length > targets.front + 2) targetSpeed = clamp(targetSpeed * 0.88, flow.minSpeedMultiplier, flow.maxSpeedMultiplier);
        else targetSpeed = clamp(targetSpeed * 0.98, flow.minSpeedMultiplier, flow.maxSpeedMultiplier);
      }

      // 远场补位
      if (layer === "rear" && snap.mid.length < targets.mid * 0.5 && f.role !== "reserve") {
        targetSpeed = clamp(targetSpeed * 1.12, flow.minSpeedMultiplier, flow.maxSpeedMultiplier);
      }

      // 近场为空时：只加速选中补位者
      if (layer === "mid" && frontRefillCandidates.includes(enemy)) {
        targetSpeed = clamp(targetSpeed * 1.18, flow.minSpeedMultiplier, flow.maxSpeedMultiplier);
      } else if (layer === "mid" && snap.front.length === 0 && this.nearEmptyTimer > flow.nearEmptyGrace) {
        // 非补位者但近场空时略加速
        targetSpeed = clamp(targetSpeed * 1.04, flow.minSpeedMultiplier, flow.maxSpeedMultiplier);
      }

      f.targetSpeedMultiplier = targetSpeed;
      // 平滑速度（含spacingMultiplier）
      f.currentSpeedMultiplier = f.currentSpeedMultiplier + (f.targetSpeedMultiplier * f.spacingMultiplier - f.currentSpeedMultiplier) * (1 - Math.exp(-flow.speedLerp * dt));
    }

    // 近场空场计时
    if (snap.front.length === 0) this.nearEmptyTimer += dt;
    else this.nearEmptyTimer = 0;
  }

  /** P4.3A.1: 选择近场补位候选人（只选1-2只） */
  private selectFrontRefillCandidates(snap: { front: Enemy[]; mid: Enemy[] }): Enemy[] {
    if (snap.front.length > 0) return [];
    const candidates: Enemy[] = [];
    const mids = [...snap.mid].sort((a, b) => {
      const aRole = a.flow?.role ?? "main"; const bRole = b.flow?.role ?? "main";
      const order = { vanguard: 1, main: 2, reserve: 3 };
      const roleDiff = (order[aRole as keyof typeof order] || 2) - (order[bRole as keyof typeof order] || 2);
      if (roleDiff !== 0) return roleDiff;
      return b.y - a.y; // 更靠前优先
    });
    for (const e of mids) {
      if (candidates.length >= 2) break;
      if (e.kind === "splitter" && e.splitState === "warning") continue;
      if (e.kind === "core" || e.kind === "tractor") continue;
      candidates.push(e);
    }
    return candidates;
  }

  /** P4.3A.1: Y向纵深间距控制（只减速后排，不推坐标） */
  private updateEnemyDepthSpacing(dt: number) {
    const alive = this.enemies.filter(e => e.alive && e.flow && e.kind !== "boss").sort((a, b) => b.y - a.y);
    const spacing = BATTLEFIELD_FLOW.spacing;
    for (let i = 0; i < alive.length; i++) {
      const rear = alive[i];
      if (!rear.flow) continue;
      // 特殊状态排除
      const isActivelyRushing = rear.rushTimer !== undefined && rear.rushTimer > 0;
      if (isActivelyRushing || rear.tractorState === "pulling" || (rear.kind === "splitter" && rear.splitState === "warning")) {
        rear.flow.spacingMultiplier = 1;
        continue;
      }
      let tooClose = false;
      for (let j = i - 1; j >= 0 && j > i - 6; j--) {
        const front = alive[j];
        if (Math.abs(front.x - rear.x) > spacing.xRadius) continue;
        const gap = front.y - rear.y;
        if (gap < spacing.minYGap && gap > -5) { tooClose = true; break; }
      }
      const desired = tooClose ? spacing.closeMultiplier : 1;
      rear.flow.spacingMultiplier = rear.flow.spacingMultiplier + (desired - rear.flow.spacingMultiplier) * (1 - Math.exp(-spacing.recoverSpeed * dt));
    }
  }

  private triggerHitStop(duration: number, scale = 0.18, force = false) {
    if (!force && this.elapsed - this.lastHitStopAt < 0.25) return;
    this.lastHitStopAt = this.elapsed;
    this.hitStopTimer = Math.max(this.hitStopTimer, duration);
    this.hitStopScale = Math.min(this.hitStopScale, scale);
  }

  /** P3.10：分裂怪击杀统一处理（主刀/副刀/爆炸/连锁均走此入口） */
  private handleSplitterKilled(enemy: Enemy, source: string) {
    if (enemy.kind !== "splitter") return;
    const wasCharging = enemy.splitState === "warning";
    if (wasCharging) {
      this.energy = Math.min(BALANCE.swordEnergy.max, this.energy + 12);
      this.addText(enemy.x, enemy.y - enemy.radius - 14, "阻裂成功 +12刀势", "#ffd35a", 18, 0.9);
      this.triggerHitStop(0.06, 0.22, true);
      this.particles.push(ringParticle(enemy, "#ffd35a", 34));
    } else {
      this.addText(enemy.x, enemy.y - enemy.radius - 12, "裂核斩碎", "#ff9d42", 15, 0.7);
    }
    enemy.splitState = "done";
    enemy.splitTimer = 0;
    enemy.mechanicProtectedTimer = 0;
    void source;
  }

  /** P2.8：刀光残影 */
  private triggerSlashAfterglow(power: number, duration: number) {
    this.slashAfterglowPower = Math.max(this.slashAfterglowPower, power);
    this.slashAfterglowTimer = Math.max(this.slashAfterglowTimer, duration);
  }

  /** P2.8：屏幕边缘金光 */
  private triggerEdgeFlash(power: number, duration: number) {
    this.edgeFlashPower = Math.max(this.edgeFlashPower, power);
    this.edgeFlashTimer = Math.max(this.edgeFlashTimer, duration);
  }

  /** P2.8：一刀结算后触发综合反馈 */
  private triggerSlashKillFeedback(slashKills: number, lastX?: number, lastY?: number) {
    // P4.2A.1: 神之一刀的播报/统计已统一迁移至endSlash
    if (slashKills >= 20) {
      this.triggerHitStop(0.18, 0.10);
      this.triggerSlashAfterglow(0.8, 0.25);
      this.triggerEdgeFlash(0.75, 0.25);
      this.screenShake = Math.max(this.screenShake, 0.22);
    } else if (slashKills >= 12) {
      this.triggerHitStop(0.10, 0.18);
      this.triggerSlashAfterglow(0.45, 0.16);
      this.triggerEdgeFlash(0.35, 0.15);
      this.screenShake = Math.max(this.screenShake, 0.12);
    } else if (slashKills >= 8) {
      this.triggerHitStop(0.06, 0.25);
    }
  }

  /** P2.8：破阵成功过渡启动 */
  private startVictoryTransition() {
    if (this.victoryTransitionActive || this.phase === "won") return;
    this.victoryTransitionActive = true;
    this.victoryTransitionTimer = 0;
    // P4.2A.2: 清空中央播报和世界浮字
    this.activeBattleNotice = null;
    this.battleNoticeQueue = [];
    this.texts = [];
    this.triggerHitStop(0.18, 0.08, true);
    this.triggerSlashAfterglow(1.0, 0.35);
    this.triggerEdgeFlash(1.0, 0.35);
    this.screenShake = Math.max(this.screenShake, 0.18);
  }

  /** P2.8：更新破阵过渡 */
  private updateVictoryTransition(dt: number) {
    if (!this.victoryTransitionActive) return;
    this.victoryTransitionTimer += dt;
    if (this.victoryTransitionTimer >= this.victoryTransitionDuration) {
      this.victoryTransitionActive = false;
      this.finish(true);
    }
  }

  /** P2.8：绘制破阵成功大字 */
  private drawVictoryTransition(ctx: CanvasRenderingContext2D) {
    if (!this.victoryTransitionActive) return;
    const t = clamp(this.victoryTransitionTimer / this.victoryTransitionDuration, 0, 1);
    const alpha = t < 0.2 ? t / 0.2 : 1 - Math.max(0, t - 0.75) / 0.25;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '900 34px "Microsoft YaHei", "SimHei", sans-serif';
    ctx.fillStyle = "#ffd35a";
    ctx.shadowColor = "rgba(255, 210, 90, 0.9)";
    ctx.shadowBlur = 18;
    const victoryText = this.currentRunMode === "challenge" ? "突破成功！" : "破阵成功！";
    ctx.fillText(victoryText, DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.38);
    ctx.restore();
  }

  /** P2.8：屏幕边缘金光 */
  private drawEdgeFlash(ctx: CanvasRenderingContext2D) {
    if (this.edgeFlashTimer <= 0) return;
    const t = clamp(this.edgeFlashTimer / 0.35, 0, 1);
    const alpha = t * this.edgeFlashPower * 0.45;
    ctx.save();
    const grd = ctx.createRadialGradient(
      DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, DESIGN_WIDTH * 0.28,
      DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, DESIGN_HEIGHT * 0.7
    );
    grd.addColorStop(0, "rgba(255, 210, 80, 0)");
    grd.addColorStop(0.72, `rgba(255, 210, 80, ${alpha * 0.2})`);
    grd.addColorStop(1, `rgba(255, 180, 50, ${alpha})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    ctx.restore();
  }

  /** P4.1A.3：副刀槽位统一布局 */
  private getSubBladeSlotLayout(slotIndex: number) {
    const iconR = 26;
    const topY = BALANCE.battlefield.warriorY + 5;
    const leftX = 24;
    const rightX = DESIGN_WIDTH - 76;
    const boxX = slotIndex === 0 ? leftX : rightX;
    return { boxX, boxY: topY, iconR, centerX: boxX + iconR, centerY: topY + iconR };
  }

  /** P4.1A.3：副刀浮空位置（以真实槽位中心为锚点） */
  private getSubBladeFloatingPos(slotIndex: number): Vec2 {
    const slot = this.getSubBladeSlotLayout(slotIndex);
    const offX = slotIndex === 0 ? 3 : -3;
    const offY = -24;
    return { x: slot.centerX + offX, y: slot.centerY + offY };
  }

  /** P2.6：副刀槽位发射起点 */
  /** P4.1A.15: 右刀同步到目标位置 */
  private syncWeakpointBladeToTarget(anim: typeof this.subBladeAnim[0], target: Enemy) {
    const nextPos = { x: target.x, y: target.y - 30 };
    const dx = nextPos.x - anim.currentPos.x;
    const dy = nextPos.y - anim.currentPos.y;
    anim.targetId = target.id;
    anim.currentPos = { ...nextPos };
    anim.endPos = { ...nextPos };
    if (Math.abs(dx) + Math.abs(dy) > 0.001) {
      anim.rotation = Math.atan2(dy, dx) + Math.PI / 2;
    }
  }

  /** 蓄势横扫伤害结算 */
  private applyMomentumSweepDamage(
    s: { x1: number; y1: number; x2: number; y2: number; color: string; bladeIdx: number },
    blade: Blade, stats: typeof BLADE_BASE_STATS[keyof typeof BLADE_BASE_STATS]
  ) {
    const hits: Enemy[] = [];
    // P3.11：副刀只攻击中下段区域（中场起始~防线上方）
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      if (enemy.y < BATTLEFIELD_ZONES.midfieldStartY) continue;
      const dist = distanceToSegment(enemy, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
      if (dist < enemy.radius + 32) hits.push(enemy);
    }
    const damage = stats.damageMultiplier * 0.8; // 蓄势副刀伤害略低
    let killCount = 0;
    for (const target of hits) {
      target.hp -= Math.max(1, Math.ceil(damage));
      target.flash = 0.18;
      // P2：副刀命中精英反馈
      if (target.kind === "elite") {
        this.triggerEliteHitFeedback(target);
        this.checkEliteLowHpFeedback(target);
      }
      const killed = target.hp <= 0;
      if (killed) {
        this.handleDirectEnemyKilledBySystem(target, "sub_momentum");
        killCount++;
        this.particles.push(...paperBurst(target, 5, ["#5bc0ff", "#f6e7bd"]));
      }
      this.particles.push(ringParticle({ x: target.x, y: target.y }, s.color, 18));
      if (blade.affix) this.applySubAffixEffect(blade.affix, target, killed, 'momentum_sweep');
    }

    // 蓄势返还刀势
    if (killCount > 0) {
      const refund = killCount * 1; // 每击杀1个 +1%
      if (killCount >= 3) {
        const extraRefund = 5; // 击杀3+ 额外 +5%
        this.addText(s.x1 + (s.x2 - s.x1) / 2, s.y1 + (s.y2 - s.y1) / 2 - 16, `蓄势连斩 +${refund + extraRefund}%`, "#5bc0ff", 16, 1.0);
        this.energy = clamp(this.energy + refund + extraRefund, 0, BALANCE.swordEnergy.max);
        // P4.1A.10: 击杀5+ 只推进下一轮CD，不永久修改subBladeCooldowns
        if (killCount >= 5 && s.bladeIdx < this.subBladeTimers.length) {
          const cd = this.subBladeCooldowns[s.bladeIdx];
          this.subBladeTimers[s.bladeIdx] = Math.max(this.subBladeTimers[s.bladeIdx], cd * 0.2);
        }
      } else {
        this.addText(s.x1 + (s.x2 - s.x1) / 2, s.y1 + (s.y2 - s.y1) / 2 - 16, `蓄势 +${refund}%`, "#5bc0ff", 14, 0.8);
        this.energy = clamp(this.energy + refund, 0, BALANCE.swordEnergy.max);
      }
    }
  }

  /** 破点追击伤害结算 */
  /** P4.1A.13: 右刀严格单目标伤害 */
  private applyWeakpointDamageByTarget(target: Enemy, blade: Blade, stats: typeof BLADE_BASE_STATS[keyof typeof BLADE_BASE_STATS]) {
    if (!target.alive) return;
    const damage = stats.damageMultiplier * 1.0;
    target.hp -= Math.max(1, Math.ceil(damage));
    target.flash = 0.2;
    if (target.kind === "elite") {
      this.triggerEliteHitFeedback(target);
      this.checkEliteLowHpFeedback(target);
    }
    const killed = target.hp <= 0;
    if (killed) {
      this.handleDirectEnemyKilledBySystem(target, "sub_weakpoint");
      this.particles.push(...paperBurst(target, 6, ["#ff6a33", "#ffd35a"]));
    }
    this.particles.push(ringParticle({ x: target.x, y: target.y }, "#b58cff", 22));
    if (blade.affix) this.applySubAffixEffect(blade.affix, target, killed, 'weakpoint_chase');
    const highValue: EnemyKind[] = ["core", "powder", "elite", "shield"];
    if (highValue.includes(target.kind) && !killed) {
      this.weakpointMarks.set(target.id, 2.0);
      this.addText(target.x, target.y - 20, "+ 破绽", "#ff6a33", 16, 1.2);
    }
    if (killed && highValue.includes(target.kind)) {
      this.energy = clamp(this.energy + 5, 0, BALANCE.swordEnergy.max);
      this.addText(target.x, target.y - 36, "+5%刀势", "#ffd35a", 14, 0.8);
    }
  }

  /** 副刀词缀效果（按槽位转译） */
  private applySubAffixEffect(affix: string, target: Vec2, killed: boolean, slotType?: 'momentum_sweep' | 'weakpoint_chase') {
    const st = slotType ?? 'momentum_sweep';
    const radius = 50;
    switch (affix) {
      case "frost":
        if (st === 'momentum_sweep') {
          // 蓄势槽：横扫命中区域减速 1.5 秒
          for (const e of this.enemies) {
            if (!e.alive || distance(e, target) > radius) continue;
            e.slowedTimer = 1.5;
          }
          this.addText(target.x, target.y - 34, "冰霜横扫", "#9FE1CB", 12, 0.4);
        } else {
          // 破点槽：锁定目标冻结 1 秒，周围小范围减速
          for (const e of this.enemies) {
            if (!e.alive || distance(e, target) > 35) continue;
            e.slowedTimer = 1.0;
          }
          this.addText(target.x, target.y - 34, "冰霜锁定", "#9FE1CB", 12, 0.4);
        }
        this.particles.push(ringParticle(target, "#9FE1CB", 24));
        break;
      case "flame":
        if (st === 'momentum_sweep') {
          // 蓄势槽：横扫路径点燃敌人
          for (const e of this.enemies) {
            if (!e.alive || distance(e, target) > radius) continue;
            e.ignited = true;
          }
          this.addText(target.x, target.y - 34, "烈火横扫", "#F0997B", 12, 0.4);
        } else {
          // 破点槽：点燃高血量目标
          const highHp = this.enemies.filter(e => e.alive).sort((a, b) => b.hp - a.hp)[0];
          if (highHp && distance(highHp, target) < 40) highHp.ignited = true;
          this.addText(target.x, target.y - 34, "烈火追击", "#F0997B", 12, 0.4);
        }
        this.particles.push(...sparkBurst(target, 8, "#F0997B"));
        break;
      case "thunder":
        this.addText(target.x, target.y - 34, st === 'momentum_sweep' ? "雷暴横扫" : "雷暴锁定", "#AFA9EC", 12, 0.4);
        if (Math.random() < 0.3) {
          // 30% 概率触发链雷
          const chain = this.enemies.filter(e => e.alive && distance(e, target) < 70).slice(0, st === 'momentum_sweep' ? 3 : 2);
          for (const ct of chain) {
            ct.hp -= 1; ct.flash = 0.3;
            this.particles.push(ringParticle(ct, "#AFA9EC", 16));
            if (ct.hp <= 0) { this.handleDirectEnemyKilledBySystem(ct, "chain"); }
          }
          this.flash = Math.max(this.flash, 0.25);
        }
        break;
      case "armorBreak":
        if (st === 'momentum_sweep') {
          // 蓄势槽：横扫命中敌人防御 -30%
          for (const e of this.enemies) {
            if (!e.alive || e.kind !== "shield" || distance(e, target) > radius) continue;
            e.hp -= 1; e.flash = 0.2;
          }
          this.addText(target.x, target.y - 34, "破甲横扫", "#85B7EB", 12, 0.4);
        } else {
          // 破点槽：对精英/盾兵防御 -50%
          for (const e of this.enemies) {
            if (!e.alive || !["elite", "shield", "core", "boss"].includes(e.kind) || distance(e, target) > 40) continue;
            e.hp -= 2; e.flash = 0.3;
          }
          this.addText(target.x, target.y - 34, "破甲点杀", "#85B7EB", 12, 0.4);
        }
        break;
      case "vampire":
        if (st === 'momentum_sweep') {
          // 蓄势槽：横扫击杀每个敌人额外 +1% 刀势
          if (killed) {
            this.energy = Math.min(BALANCE.swordEnergy.max, this.energy + 1);
            this.addText(target.x, target.y - 34, "蓄势回春+1", "#a8e6cf", 12, 0.4);
          }
        } else {
          // 破点槽：击杀高价值目标额外 +8% 刀势
          if (killed) {
            this.energy = Math.min(BALANCE.swordEnergy.max, this.energy + 8);
            this.addText(target.x, target.y - 34, "破点回春+8", "#a8e6cf", 12, 0.4);
          }
        }
        break;
      case "phantom":
        if (st === 'momentum_sweep') {
          // 25% 概率追加一次较弱横扫（视觉闪烁代替）
          if (Math.random() < 0.25) {
            this.flash = Math.max(this.flash, 0.15);
            this.addText(target.x, target.y - 34, "幻影横扫", "#EEEDFE", 12, 0.4);
          }
        } else {
          // 25% 概率追加一次追击
          if (Math.random() < 0.25) {
            if (!killed) {
              const p = this.enemies.find(e => e.alive && distance(e, target) < 45);
              if (p) { p.hp -= 1; p.flash = 0.2; }
            }
            this.addText(target.x, target.y - 34, "幻影追击", "#EEEDFE", 12, 0.4);
          }
        }
        break;
    }
  }

  private updateTexts(dt: number) {
    for (const text of this.texts) {
      text.life -= dt;
      text.y -= 22 * dt;
    }
    this.texts = this.texts.filter((text) => text.life > 0).slice(0, MAX_FLOATING_TEXT);
  }

  // ═══════════════════════════════════════════════════════════════
  // 三幕制阶段爆发 —— 15s/30s/45s 三个时间节点给玩家大礼
  // ═══════════════════════════════════════════════════════════════
  private checkActMilestones() {
    if (this.phase !== "playing") return;

    // 15s 第一幕结束 → 满势时刻
    if (!this._act1Triggered && this.elapsed >= 15) {
      this._act1Triggered = true;
      this.triggerMomentumBurst();
    }
    // 30s 第二幕结束 → 副刀共鸣
    if (!this._act2Triggered && this.elapsed >= 30) {
      this._act2Triggered = true;
      this.grantSubBladeReady();
    }
    // 45s 第三幕结束 → 一刀斩模式
    if (!this._act3Triggered && this.elapsed >= 45) {
      this._act3Triggered = true;
      this.act3Pending = true; // P4.1A.9: 延迟激活，按战斗状态才触发
    }
    // P4.1A.9: 检查一刀斩待激活
    if (this.act3Pending) this.tryActivatePendingOneBlade();
  }

  /** P4.2A.1: 满势时刻——只保留刀势灌满、震屏、粒子，删除中央大字 */
  private triggerMomentumBurst() {
    this.energy = BALANCE.swordEnergy.max;
    this._breakReadyNotified = true;
    this.screenShake = Math.max(this.screenShake, 0.9);
    this.flash = Math.max(this.flash, 0.5);
    this.slowMoTimer = Math.max(this.slowMoTimer, 0.12);
    // 满屏光晕粒子
    for (let i = 0; i < 12; i++) {
      this.particles.push(glowParticle({ x: DESIGN_WIDTH / 2 + (Math.random() - 0.5) * 200, y: 400 + (Math.random() - 0.5) * 300 }, "#ffd35a", 18));
    }
    AudioService.slashHit();
  }

  /** P4.1A.9：延迟激活一刀斩（有效战区至少4个目标才激活，等待超3秒后只要有1个有效目标即可） */
  private tryActivatePendingOneBlade() {
    if (!this.act3Pending) return;
    if (this.phase !== "playing" || this.victoryTransitionActive || this.isEdictModalBlocking()) return;
    const validTargets = this.enemies.filter(e => e.alive && e.y >= BATTLEFIELD_ZONES.midfieldStartY && e.y <= BALANCE.battlefield.bottomDefenseY - 30);
    // P4.1A.10: 优先等待4个，等待超3秒后只要有1个即可
    if (validTargets.length >= 4) {
      this.act3Pending = false;
      this.triggerOneBladeMode();
    } else if (this.elapsed - 45 >= 3 && validTargets.length >= 1) {
      this.act3Pending = false;
      this.triggerOneBladeMode();
    }
  }

  /** P4.1A.14: 统一副刀充能（冷却态立即Ready，攻击中归位后立即Ready） */
  private grantSubBladeReady() {
    for (let i = 0; i < this.subBladeAnim.length; i++) {
      const anim = this.subBladeAnim[i];
      const cd = this.subBladeCooldowns[i];
      if (anim.phase === "cooldown" || anim.phase === "idle") {
        this.subBladeTimers[i] = cd;
        anim.phase = "ready";
        anim.phaseTimer = 0;
      } else if (anim.phase !== "ready") {
        this.subBladeReadyAfterAction[i] = true;
      }
      this.subReadyPing.push({ slot: i, life: 0.4, maxLife: 0.4 });
    }
    this.screenShake = Math.max(this.screenShake, 0.6);
    this.flash = Math.max(this.flash, 0.3);
    // P4.1A.14: 只保留槽位脉冲，不显示重复文字
    AudioService.slashHit();
  }

  /** 一刀斩模式：45s 后下次挥刀威力×2 + 持续15s 引导 */
  private triggerOneBladeMode() {
    this.oneBladeModeTimer = 15;
    this.screenShake = Math.max(this.screenShake, 1.2);
    this.flash = Math.max(this.flash, 0.7);
    this.slowMoTimer = Math.max(this.slowMoTimer, 0.15);
    // P4.1A.9: 不显示中央大字，只在挥刀时提示
    for (let i = 0; i < 16; i++) {
      this.particles.push(...sparkBurst({ x: DESIGN_WIDTH / 2 + (Math.random() - 0.5) * 240, y: 400 + (Math.random() - 0.5) * 320 }, 8, "#ff6a33"));
    }
    AudioService.oneBladeBreak();
  }

  /** P4.3A.4: 普通波调度——固定截止时间+压力提前接入 */
  private updateWaves(dt: number) {
    // P4.4A.1-R3: Boss模式阻断所有波次
    if (this.gameMode === "boss") return;
    if (this.wavesSpawned >= this.level.waves.length) return;
    // 军令阶段停止普通波提前推进
    if (this.edictRewardState === "active" || this.battlePhase === "edict_burst") return;
    const wave = this.level.waves[this.wavesSpawned];
    const reachedSpawnAt = wave.spawnAt !== undefined && this.elapsed >= wave.spawnAt;
    const shouldAdvance = this.shouldAdvanceNextWave();
    if (reachedSpawnAt || shouldAdvance) {
      this.spawnCurrentWave(wave);
      this.waveAdvanceLockedUntil = this.elapsed + randomRange(0.65, 0.90);
      if (!reachedSpawnAt) this.waveAdvanceLockedUntil = this.elapsed + randomRange(0.65, 0.90);
    }
  }

  /** P4.3A.3: 军令波改为截止时间+压力提前接力 */
  private updatePostChestWaves(dt: number) {
    const postWaves = this.getEffectivePostChestWaves();
    if (!postWaves || postWaves.length === 0) return;
    if (!this.chestDone) return;
    if (this.postChestStartAt === null) return;
    if (this.allPostChestWavesSpawned) return;
    const wave = postWaves[this.postChestWaveIndex];
    if (!wave) { this.allPostChestWavesSpawned = true; return; }
    const total = postWaves.length;
    this.edictBurstRoundTotal = total;

    const postElapsed = this.elapsed - this.postChestStartAt;
    const scheduledTime = wave.spawnAt ?? 0;
    const pressure = this.getCombatPressure("edict");
    const enoughTimeSinceLast = this.elapsed - this.postChestLastWaveQueuedAt >= 1.35;
    const lockExpired = this.elapsed >= this.postChestAdvanceLockedUntil;
    const currentRoundVanguardLeft = pressure.proj.incoming.vanguard;
    const currentRoundMainLeft = pressure.proj.incoming.main;
    const tooLowMidFront = pressure.actionableNow + pressure.arrivesMidWithin07 <= 2;
    const vanguardMainNearlyDone = currentRoundVanguardLeft + currentRoundMainLeft <= 3;
    const alivePlusQueue = this.enemies.filter(e => e.alive).length + this.subSpawnQueue.length;

    // 空场保护
    const isCompletelyEmpty = pressure.actionableNow === 0 && pressure.actionableSoon07 <= 0;

    let shouldAdvance = false;
    let reason: "scheduled" | "low_pressure" | "empty_guard" | null = null;

    // 条件1：固定截止时间（spawnAt作为最晚时间）
    if (postElapsed >= scheduledTime) {
      shouldAdvance = true;
      reason = "scheduled";
    }
    // 条件2：低压力提前（仅当前轮次已运行足够时间且锁已过期）
    else if (enoughTimeSinceLast && lockExpired && tooLowMidFront && vanguardMainNearlyDone && alivePlusQueue < 45) {
      shouldAdvance = true;
      reason = "low_pressure";
    }
    // 条件3：完全空场保护
    if (!shouldAdvance && isCompletelyEmpty && lockExpired) {
      this.postChestActionableEmptyTimer += dt;
      if (this.postChestActionableEmptyTimer >= 0.40) {
        shouldAdvance = true;
        reason = "empty_guard";
      }
    } else if (!isCompletelyEmpty) {
      this.postChestActionableEmptyTimer = 0;
    }

    if (!shouldAdvance) { this.postChestLastAdvanceReason = null; return; }

    // 执行生成
    const roundIndex = this.postChestWaveIndex + 1;
    this.edictBurstRoundIndex = Math.min(roundIndex, total);
    this.spawnPostChestWave(wave, roundIndex);
    this.postChestWaveIndex += 1;
    this.postChestLastWaveQueuedAt = this.elapsed;
    this.postChestAdvanceLockedUntil = this.elapsed + randomRange(0.85, 1.10);
    this.postChestLastAdvanceReason = reason;
    this.postChestActionableEmptyTimer = 0;

    if (this.postChestWaveIndex >= total) {
      this.allPostChestWavesSpawned = true;
      this.edictBurstRoundIndex = total;
    }
  }

  /** 第四轮微调：军令爆发怪潮改为分批入队subSpawnQueue */
  /** P4.3A.5: 军令爆发入队 */
  private spawnPostChestWave(wave: typeof this.level.waves[0], roundIndex: number) {
    this.enqueuePostChestWave(wave, roundIndex);
  }

  private spawnCurrentWave(wave: typeof this.level.waves[0]) {
    this._lastWaveElapsed = this.elapsed;
    this.wavesSpawned += 1;
    if (this.wavesSpawned >= this.level.waves.length) {
      this.wavesFinishedAt = this.elapsed;
      this.allNormalWavesSpawned = true;
    }
    this.waveHpBonus = Math.min(5, this.wavesSpawned);

    // ── 决定是否触发事件波（20%概率，同局不重复，第1波不触发）──
    const triggerEvent = this.wavesSpawned > 1 && Math.random() < 0.2;
    // 事件波按关卡解锁
    // P3.9：使用逻辑层数，避免动态主线 level.id=10000+floor 误触发
    const e = this.getLogicalFloor();
    const availableEvents: string[] = [];
    if (e >= 1)  availableEvents.push("reinforce", "inspire");
    if (e >= 6)  availableEvents.push("slowRain");
    if (e >= 16) availableEvents.push("eliteStrike");
    if (e >= 31) availableEvents.push("trapFormation");
    const unusedAvailable = availableEvents.filter(ev => !this._usedEvents.has(ev));
    let chosenEvent: string | null = null;
    if (triggerEvent && unusedAvailable.length > 0) {
      chosenEvent = unusedAvailable[Math.floor(Math.random() * unusedAvailable.length)];
      this._usedEvents.add(chosenEvent);
      this._activeEventTimer = 0;
      this._currentEventType = chosenEvent;
    }

    // 根据事件波调整 spawn 参数
    let extraSpeedMul = (wave.speedMultiplier ?? 1);
    let extraEnemies: Array<{ kind: string; count: number; x: number; yOffset: number }> = [];

    // ── 中场事件触发（wave配置）──
    if (wave.midfieldEventType && wave.midfieldEventType !== 'none') {
      this._currentWaveEvent = wave.midfieldEventType;
      // P4.2A.1: 改为单条A级播报
      this.showBattleNotice({ text: wave.midfieldEventType === 'gather' ? "敌军聚阵" : "敌军蓄冲", priority: "A", category: "mechanic", style: wave.midfieldEventType === 'gather' ? "blue" : "danger", duration: 0.8, dedupeKey: `midfield:${wave.midfieldEventType}:${this.wavesSpawned}`, cooldown: 2, interrupt: false });
      this.flash = Math.max(this.flash, 0.15);
      // 屏幕边缘提示色（蓄冲=红，聚阵=青）
      const ringColor = wave.midfieldEventType === 'gather' ? "91,192,255" : "255,106,51";
      this._midfieldEvent = { type: wave.midfieldEventType, timer: 0, duration: 8 };
    } else {
      this._currentWaveEvent = null;
    }

    if (chosenEvent === "reinforce") {
      extraSpeedMul *= 1.2;
      // P4.2A.1: 改为单条A级播报
      this.showBattleNotice({ text: "增援潮", priority: "A", category: "mechanic", style: "danger", duration: 0.8, dedupeKey: `event:reinforce:${this.wavesSpawned}`, cooldown: 2, interrupt: false });
      this.screenShake = Math.max(this.screenShake, 0.4);
    } else if (chosenEvent === "slowRain") {
      this._activeEventTimer = 0.5;
      // P4.2A.1: 减速雨只通过HUD状态图标表达，不播文字
    } else if (chosenEvent === "inspire") {
      // 鼓舞：副刀CD临时-30%，持续8秒
      this._activeEventTimer = 8;
      for (let i = 0; i < this.subBladeTimers.length; i++) {
        this.subBladeTimers[i] = Math.min(this.subBladeCooldowns[i], this.subBladeTimers[i] + 0.5);
      }
    } else if (chosenEvent === "eliteStrike") {
      // P4.2A.1: 改为单条A级播报
      this.showBattleNotice({ text: "精锐护阵", priority: "A", category: "mechanic", style: "purple", duration: 0.8, dedupeKey: `event:eliteStrike:${this.wavesSpawned}`, cooldown: 2, interrupt: false });
      extraEnemies.push({ kind: "shield", count: 3, x: 140, yOffset: 0 });
      extraEnemies.push({ kind: "infantry", count: 4, x: 236, yOffset: 0 });
    } else if (chosenEvent === "trapFormation") {
      this.showBattleNotice({ text: "陷阱阵", priority: "A", category: "mechanic", style: "danger", duration: 0.8, dedupeKey: `event:trapFormation:${this.wavesSpawned}`, cooldown: 2, interrupt: false });
      // 增加火药+阵眼
      extraEnemies.push({ kind: "powder", count: 2, x: 140, yOffset: 0 });
      extraEnemies.push({ kind: "core", count: 1, x: 284, yOffset: 0 });
    }

    const speedMultiplier = extraSpeedMul;
    const countMul = chosenEvent === "reinforce" ? 1.5 : 1;
    const waveId = `${this.wavesSpawned}-${Date.now()}`;

    // P4.3A.1: 整波扁平化并分配三种流动角色
    const allSpawns = [...wave.enemies, ...extraEnemies];
    const flatEnemies: { kind: string; x: number; yOffset: number }[] = [];
    for (const spawn of allSpawns) {
      const cnt = Math.max(1, Math.ceil((spawn.count ?? 1) * countMul));
      const lanes = [BATTLE_SAFE_X.extendedMin, 120, 168, 216, 264, BATTLE_SAFE_X.extendedMax];
      for (let i = 0; i < cnt; i++) {
        const baseX = spawn.x ?? lanes[i % lanes.length];
        flatEnemies.push({ kind: spawn.kind as string, x: baseX + (Math.random() - 0.5) * 40, yOffset: spawn.yOffset ?? 0 });
      }
    }
    // P4.3A.2: 按怪物职责偏好分配角色（禁止随机分配）
    const isEdictBurst = this.battlePhase === "edict_burst";
    const total = flatEnemies.length;
    // 配额计算
    let qV = 0, qM = 0, qR = 0;
    if (total === 1) { qV = 0; qM = 1; qR = 0; }
    else if (total === 2) { qV = 1; qM = 1; qR = 0; }
    else if (total === 3) { qV = 1; qM = 1; qR = 1; }
    else if (total === 4) { qV = 1; qM = 2; qR = 1; }
    else if (total === 5) { qV = 1; qM = 3; qR = 1; }
    else {
      const pctV = isEdictBurst ? 0.45 : 0.25;
      const pctM = isEdictBurst ? 0.35 : 0.50;
      qV = Math.round(total * pctV);
      qM = Math.round(total * pctM);
      qR = total - qV - qM;
      if (qR < 0) { qM += qR; qR = 0; }
    }
    let quota = { vanguard: qV, main: qM, reserve: qR };
    const roles: (EnemyFlowRole | null)[] = new Array(total).fill(null);
    // 按偏好分配（限制最强者优先）
    const sortedByPreference = flatEnemies.map((e, i) => {
      const kind = e.kind as EnemyKind;
      return { index: i, kind, prefs: this.getPreferredFlowRoles(kind) };
    }).sort((a, b) => a.prefs.length - b.prefs.length);
    for (const item of sortedByPreference) {
      if (quota.vanguard + quota.main + quota.reserve === 0) break;
      const assigned = item.prefs.find(r => (quota as any)[r] > 0) ?? ((["vanguard","main","reserve"] as EnemyFlowRole[]).find(r => (quota as any)[r] > 0) ?? "main");
      roles[item.index] = assigned;
      (quota as any)[assigned] -= 1;
    }
    // 填充剩余
    for (let i = 0; i < total; i++) {
      if (roles[i] !== null) continue;
      const fallback = ["vanguard","main","reserve"].find(r => (quota as any)[r] > 0);
      roles[i] = (fallback ?? "main") as EnemyFlowRole;
      if (fallback) { (quota as any)[fallback] -= 1; }
    }
    // 分布保护：第一只不为reserve，splitter不得为第一vanguard
    const firstRole = roles[0];
    if (firstRole === "reserve") { roles[0] = "main"; }
    for (let i = 0; i < total; i++) {
      if (flatEnemies[i].kind === "splitter" && roles[i] === "vanguard") {
        const swapIdx = roles.findIndex((r, j) => r !== "vanguard" && flatEnemies[j].kind !== "splitter");
        if (swapIdx >= 0) { [roles[i], roles[swapIdx]] = [roles[swapIdx], roles[i]]; }
        break;
      }
    }
    // 分别计算各梯队的时间
    const vangTime = isEdictBurst ? 0.0 : 0.0;
    const mainTime = isEdictBurst ? 0.55 : 0.80;
    const resvTime = isEdictBurst ? 1.15 : 1.70;
    const vangSpread = isEdictBurst ? 0.15 : 0.18;
    const mainSpread = isEdictBurst ? 0.30 : 0.25;
    const resvSpread = isEdictBurst ? 0.40 : 0.30;
    // 梯队entry纵深
    const vangEntryOff = 30;
    const mainEntryOff = 6;
    const resvEntryOff = -24;
    let order = 0;
    for (let i = 0; i < total; i++) {
      const enemy = flatEnemies[i];
      const role = roles[i];
      const baseDelay = role === "vanguard" ? vangTime : role === "main" ? mainTime : resvTime;
      const spread = role === "vanguard" ? vangSpread : role === "main" ? mainSpread : resvSpread;
      const time = this.elapsed + baseDelay + Math.random() * spread;
      const entryOff = role === "vanguard" ? vangEntryOff : role === "main" ? mainEntryOff : resvEntryOff;
      this.subSpawnQueue.push({
        time, kind: enemy.kind, x: enemy.x, speedMultiplier, yOffset: enemy.yOffset,
        battlePhase: this.battlePhase, flowRole: role, spawnGroupId: waveId, spawnOrder: order++, entryEndYOffset: entryOff,
        source: this.battlePhase === "edict_burst" ? "edict" : "normal",
      } as any);
    }

    // 每日挑战特殊逻辑
    if (
      this.runContext.mode === "dailyChallenge" &&
      this.runContext.dailyChallengeId === "more_powder" &&
      this.elapsed >= 20
    ) {
      this.enemies.push(this.createEnemy("powder", randomRange(72, 318), BALANCE.battlefield.enemySpawnY - 42, speedMultiplier));
      this.discoveredEnemies.add("powder");
    }
    if (wave.enemies.some((spawn) => spawn.kind === "shield")) {
      this.showHint("shield-seen", "强锋可破盾", DESIGN_WIDTH / 2, 118, 2);
    }

    const configuredPickup = wave.pickups?.[0];
    if (configuredPickup && this.pickupsSpawned < BALANCE.waves.randomPickupLimit) {
      this.pickups.push(this.createPickup(configuredPickup.kind, configuredPickup.x, BALANCE.battlefield.topY + 78 - (configuredPickup.yOffset ?? 0)));
      this.pickupsSpawned += 1;
    } else if (
      Math.random() < this.getEffectivePickupChance() &&
      this.pickupsSpawned < this.getEffectivePickupLimit()
    ) {
      this.pickups.push(this.createPickup(choose<PickupKind>(["drum", "soul", "oil"]), randomRange(56, 334), BALANCE.battlefield.topY + randomRange(46, 104)));
      this.pickupsSpawned += 1;
    }

    // V0715008 二次打磨：屏蔽波次描述（"第一波·横切"等）飘字
    // this.addText(DESIGN_WIDTH / 2, 96, wave.name, "#f6e7bd", 16);
  }

  /** 处理 sub-spawn 队列（多波多次刷新） */
  /** 紧急修正：子刷新队列处理（三路拆分，禁止重复复制） */
  private updateSubSpawnQueue() {
    // P4.4A.1-R3: Boss模式阻断子刷新队列
    if (this.gameMode === "boss") return;
    if (this.subSpawnQueue.length === 0) return;
    const aliveCount = this.enemies.filter(e => e.alive).length;
    // 性能保护：达到上限时不处理队列（延迟生成）
    if (aliveCount >= PERFORMANCE_LIMITS.maxEnemiesOnScreen) return;
    const ready: typeof this.subSpawnQueue = [];
    const future: typeof this.subSpawnQueue = [];
    for (const item of this.subSpawnQueue) {
      if (item.time <= this.elapsed) {
        ready.push(item);
      } else {
        future.push(item);
      }
    }
    // 超过单帧上限的 ready item 延迟到下一帧
    const delayed: typeof this.subSpawnQueue = [];
    const MAX_SPAWNS_PER_FRAME = 10;
    let spawnedThisFrame = 0;
    for (const item of ready) {
      if (spawnedThisFrame >= MAX_SPAWNS_PER_FRAME) {
        delayed.push(item);
        continue;
      }
      this.spawnEnemyFromQueueItem(item);
      spawnedThisFrame += 1;
    }
    // 最终队列 = 延迟的 + 未来的（禁止重复复制）
    this.subSpawnQueue = [...delayed, ...future];
  }

  /** 第六轮修正：从队列 item 生成敌人（抽取为独立方法） */
  private spawnEnemyFromQueueItem(item: typeof this.subSpawnQueue[0]) {
    // P3.9：禁止普通队列生成裸 elite/boss（缺 eliteKind/bossId 会变成残影）
    if (item.kind === "elite" || item.kind === "boss") {
      console.warn("[invalid generic special spawn blocked]", { kind: item.kind, levelId: this.level.id, time: this.elapsed });
      return;
    }
    const phase = item.battlePhase ?? this.battlePhase;
    const baseProfile = this.getEntryProfileForEnemy(item.kind as EnemyKind, phase);
    // P4.3A.1: 角色化entryEndY纵深
    const profile = { ...baseProfile, entryEndY: baseProfile.entryEndY + (item.entryEndYOffset ?? 0) };
    // P4.3A.6: 尾队预接力快速入场
    if (item.isTailCatchup) {
      profile.entryMultiplier *= 1.35;
      profile.entryMaxDuration *= 0.68;
      profile.entryEndY += 24;
    }
    const spawnY = profile.spawnY - (item.yOffset ?? 0);
    // P2.7：安全区约束
    const safeX = this.clampSpawnXByPhaseAndKind(item.x, item.kind as EnemyKind, phase);
    const enemy = this.createEnemy(item.kind as any, safeX, spawnY, item.speedMultiplier, profile);
    if (this._currentWaveEvent) {
      enemy.spawnedWithEvent = this._currentWaveEvent;
    }
    this.enemies.push(enemy);
    this.discoveredEnemies.add(item.kind as any);
    this.particles.push(glowParticle({ x: item.x, y: spawnY }, "#5c4a3a", 10, 16));
    // P4.3A.3: 记录敌人来源
    enemy.spawnSource = item.source ?? "normal";
    // P4.3A: 初始化流动状态（Boss除外）
    if (item.kind !== "boss" && BATTLEFIELD_FLOW.enabled) {
      const flowRole = item.flowRole ?? "main";
      enemy.flow = {
        role: flowRole,
        currentLayer: "rear",
        targetSpeedMultiplier: BATTLEFIELD_FLOW.roleSpeed[flowRole],
        currentSpeedMultiplier: BATTLEFIELD_FLOW.roleSpeed[flowRole],
        spacingMultiplier: 1,
        spawnGroupId: item.spawnGroupId ?? `${this.wavesSpawned}`,
        spawnOrder: item.spawnOrder ?? 0,
        depthSeed: Math.random(),
      };
    }
  }

  /** 判定是否应立刻胜利结算（二次打磨：检查 battlePhase） */
  private shouldFinishVictory(): boolean {
    // P4.4A.1-R3: Boss模式禁止自然胜利，只能由BossController/Debug触发
    if (this.gameMode === "boss") return false;
    const allWavesDone = this.wavesSpawned >= this.level.waves.length;
    const noAliveEnemies = !this.enemies.some(e => e.alive);
    const notResolving = !this.currentSlash;

    // 基础条件
    if (!allWavesDone || !notResolving) return false;

    // 禁止在精英阶段/宝箱阶段结算
    if (this.battlePhase === 'elite' || this.battlePhase === 'chest') return false;

    // 有精英的关卡：必须已击杀精英
    if (this.level.eliteSpawnAt && this.level.eliteKind) {
      if (!this.eliteKilled) return false;
      // 第五轮修正：宝箱掉落了就必须 chestDone，避免卡住
      if (this.chestDropped && !this.chestDone) return false;
    }

    // 第五轮修正：使用 getEffectivePostChestWaves 判断
    const postWaves = this.getEffectivePostChestWaves();
    const hasPostChest = postWaves.length > 0;
    if (hasPostChest) {
      if (!this.chestDone) return false;
      if (this.postChestStartAt === null) return false;
      if (!this.allPostChestWavesSpawned) {
        // 第三轮修正：超时兜底——军令爆发 35s 后仍没刷完，强制完成
        if (this.elapsed - this.postChestStartAt > 35 && this.enemies.filter(e => e.alive).length <= 0 && this.subSpawnQueue.length === 0) {
          this.allPostChestWavesSpawned = true;
        } else {
          return false;
        }
      }
      // 第一轮修正：兜底——chestDone 已 true 但 postChestStartAt 未设置
      if (this.chestDone && this.postChestStartAt === null) {
        this.postChestStartAt = this.elapsed;
      }
    }

    // 无宝箱后怪潮：宝箱非强制
    if (!hasPostChest && this.level.eliteSpawnAt && this.chestDropped) {
      if (!this.chestDone) return false;
    }

    // 紧急修正：严格清场检查
    // 清理屏幕外异常敌人
    this.cleanupOutOfBattleEnemiesForVictoryCheck();

    // 仍有待刷出的敌人，不能结算
    if (this.subSpawnQueue.length > 0) return false;

    // 场上仍有存活敌人，不能结算
    const aliveCount = this.enemies.filter(e => e.alive).length;
    if (aliveCount > 0) return false;

    // 军令弹窗 / 飞行 / 奖励未完成，不能结算
    if (this.chestPendingConfirm || this.edictIconFlying || this.edictRewardState === "modal" || this.edictRewardState === "flying") return false;

    // 当前仍有挥刀处理，不能结算
    if (this.currentSlash) return false;

    return true;
  }

  /** P3：更新机制怪（分裂兵+牵引兵） */
  private updateMechanicEnemies(dt: number) {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      if (enemy.kind === "splitter") this.updateSplitterEnemy(enemy, dt);
      if (enemy.kind === "tractor") this.updateTractorEnemy(enemy, dt);
    }
  }

  /** P3：分裂兵逻辑 */
  private updateSplitterEnemy(enemy: Enemy, dt: number) {
    if (enemy.kind !== "splitter" || !enemy.alive) return;
    if (enemy.splitState === "done") return;
    if (!enemy.splitState) { enemy.splitState = "idle"; enemy.splitTimer = 0; enemy.splitCount = 0; }
    if (enemy.splitState === "idle") {
      if (enemy.y >= SPLITTER_CONFIG.triggerY) {
        enemy.splitState = "warning";
        enemy.splitTimer = SPLITTER_CONFIG.chargeDuration;
        // P3.4：教学分裂兵短暂保护，保证玩家看到蓄力
        if (enemy.isTutorialSplitter) {
          enemy.mechanicProtectedTimer = SPLITTER_CONFIG.tutorialProtectedSeconds;
        }
      }
      return;
    }
    // P3.4：教学保护计时衰减
    if ((enemy.mechanicProtectedTimer ?? 0) > 0) {
      enemy.mechanicProtectedTimer = Math.max(0, (enemy.mechanicProtectedTimer ?? 0) - dt);
    }
    if (enemy.splitState === "warning") {
      enemy.splitTimer = Math.max(0, (enemy.splitTimer ?? 0) - dt);
      if (enemy.splitTimer <= 0) this.performSplitterSplit(enemy);
    }
  }

  /** P3.4：执行分裂（4向弹开 + 强反馈） */
  private performSplitterSplit(enemy: Enemy) {
    if (!enemy.alive) return;
    if ((enemy.splitCount ?? 0) >= SPLITTER_CONFIG.maxSplitCount) return;
    if (this.enemies.filter(e => e.alive).length >= PERFORMANCE_LIMITS.maxEnemiesOnScreen - 4) {
      enemy.splitState = "done";
      this.addText(enemy.x, enemy.y - 24, "裂变受阻", "#f6e7bd", 12, 0.6);
      return;
    }
    enemy.splitState = "done";
    enemy.splitCount = (enemy.splitCount ?? 0) + 1;
    enemy.alive = false;

    const childOffsets = [
      { x: -32, y: -8 },
      { x: 32, y: -8 },
      { x: -22, y: 24 },
      { x: 22, y: 24 }
    ];
    for (let i = 0; i < Math.min(SPLITTER_CONFIG.childCount, childOffsets.length); i++) {
      const childX = clamp(enemy.x + childOffsets[i].x, BATTLE_SAFE_X.normalMin, BATTLE_SAFE_X.normalMax);
      const childY = enemy.y + childOffsets[i].y + randomRange(-4, 4);
      const child = this.createEnemy("infantry", childX, childY, 1, ENTRY_PROFILE_COMMON);
      child.isSplitChild = true;
      this.enemies.push(child);
    }
    this.triggerHitStop(0.08, 0.20, true);
    this.screenShake = Math.max(this.screenShake, 0.18);
    this.addText(enemy.x, enemy.y - 36, "分裂！", "#ff6a33", 24, 0.9);
    this.particles.push(ringParticle(enemy, "#ff8a3d", 42));
  }

  /** P3：牵引兵逻辑 */
  private updateTractorEnemy(enemy: Enemy, dt: number) {
    if (enemy.kind !== "tractor" || !enemy.alive) return;
    if (!enemy.tractorState) { enemy.tractorState = "idle"; enemy.tractorTimer = 0; enemy.tractorPullCount = 0; }
    if (enemy.tractorState === "idle") {
      if (enemy.y >= TRACTOR_CONFIG.triggerY) {
        enemy.tractorState = "charging";
        enemy.tractorTimer = TRACTOR_CONFIG.firstDelay + TRACTOR_CONFIG.chargeDuration;
        this.prepareTractorTargets(enemy);
      }
      return;
    }
    if (enemy.tractorState === "charging") {
      enemy.tractorTimer = Math.max(0, (enemy.tractorTimer ?? 0) - dt);
      if (enemy.tractorTimer <= TRACTOR_CONFIG.chargeDuration && (enemy.tractorTimer ?? 0) + dt > TRACTOR_CONFIG.chargeDuration) {
        // 刚进入牵引蓄力阶段
      }
      if (enemy.tractorTimer <= 0) {
        enemy.tractorState = "pulling";
        enemy.tractorTimer = 0.75;
        this.addText(enemy.x, enemy.y - 30, "牵引！", "#8fdcff", 16, 0.7);
      }
      return;
    }
    if (enemy.tractorState === "pulling") {
      this.applyTractorPull(enemy, dt);
      enemy.tractorTimer = Math.max(0, (enemy.tractorTimer ?? 0) - dt);
      if (enemy.tractorTimer <= 0) {
        enemy.tractorPullCount = (enemy.tractorPullCount ?? 0) + 1;
        if ((enemy.tractorPullCount ?? 0) >= TRACTOR_CONFIG.maxPullCount) {
          enemy.tractorState = "done";
        } else {
          enemy.tractorState = "cooldown";
          enemy.tractorTimer = TRACTOR_CONFIG.cooldown;
        }
      }
      return;
    }
    if (enemy.tractorState === "cooldown") {
      enemy.tractorTimer = Math.max(0, (enemy.tractorTimer ?? 0) - dt);
      if (enemy.tractorTimer <= 0) {
        enemy.tractorState = "charging";
        enemy.tractorTimer = TRACTOR_CONFIG.chargeDuration;
        this.prepareTractorTargets(enemy);
      }
    }
  }

  /** P3：选择牵引目标 */
  private prepareTractorTargets(enemy: Enemy) {
    const candidates = this.enemies
      .filter(e => e.alive && e !== enemy && e.kind !== "elite" && distance(e, enemy) <= TRACTOR_CONFIG.pullRadius)
      .sort((a, b) => distance(a, enemy) - distance(b, enemy));
    const count = Math.min(candidates.length, TRACTOR_CONFIG.maxTargets);
    enemy.tractorTargetRefs = candidates.slice(0, count);
  }

  /** P3：执行牵引拉力 */
  private applyTractorPull(enemy: Enemy, dt: number) {
    const targets = (enemy.tractorTargetRefs ?? []).filter(e => e.alive);
    if (targets.length === 0) return;
    for (const target of targets) {
      const dx = enemy.x - target.x;
      const dy = enemy.y - target.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const pull = TRACTOR_CONFIG.pullStrength * dt * 60;
      target.x += (dx / dist) * pull;
      target.y += (dy / dist) * pull * 0.35;
      target.x = clamp(target.x, BATTLE_SAFE_X.normalMin, BATTLE_SAFE_X.normalMax);
      target.y = clamp(target.y, 260, BALANCE.battlefield.bottomDefenseY - 30);
    }
  }

  /** P3：清理屏幕外异常敌人（仅清理不可见的异常残留） */
  private cleanupOutOfBattleEnemiesForVictoryCheck() {
    const aliveEnemies = this.enemies.filter(e => e.alive);
    const canCleanup =
      this.allNormalWavesSpawned &&
      this.allPostChestWavesSpawned &&
      this.subSpawnQueue.length === 0 &&
      aliveEnemies.length > 0 &&
      aliveEnemies.every(e => e.y < -40 || e.y > DESIGN_HEIGHT + 80) &&
      this.wavesFinishedAt !== undefined &&
      this.elapsed - this.wavesFinishedAt > 8;
    if (!canCleanup) return;
    for (const enemy of aliveEnemies) {
      enemy.alive = false;
    }
  }

  /** 二次打磨：自动切换 battlePhase HUD 显示 */
  private updateBattlePhase() {
    // 已进入结果页
    if (this.finished) { this.battlePhase = 'result'; return; }

    // P3.5：军令爆发阶段（不再用 chestDone 永久锁死）
    if (
      this.edictRewardState === "active" &&
      (
        !this.allPostChestWavesSpawned ||
        this.subSpawnQueue.length > 0 ||
        this.enemies.some(e => e.alive)
      )
    ) {
      this.battlePhase = 'edict_burst';
      return;
    }

    // 宝箱阶段（宝箱已打开但未确认）
    if (this.chestDropped && this.chestOpened) {
      this.battlePhase = 'chest';
      return;
    }

    // 精英阶段（精英已出场）
    if (this.eliteSpawned && !this.eliteKilled) {
      this.battlePhase = 'elite';
      return;
    }

    // 默认主波次阶段
    this.battlePhase = 'main_waves';
  }

  private checkBattleEnd() {
    // P4.4A.1-R3: Boss模式自然失败阻断
    if (this.gameMode === "boss") return;
    if (this.hp <= 0) {
      // ---- 魂返(soulReturn)buff：首次HP归零自动复活 ----
      if (this.hasBuff("soulReturn") && !this.soulReturnUsed) {
        this.soulReturnUsed = true;
        this.hp = 1;
        this.flash = Math.max(this.flash, 0.85);
        this.screenShake = Math.max(this.screenShake, 0.65);
        this.addText(DESIGN_WIDTH / 2, 142, "魂返·死而复生", "#5b8db8", 22, 1.4);
        // 清退最近6名敌军
        const closest = [...this.enemies]
          .filter((e) => e.alive)
          .sort((a, b) => b.y - a.y)
          .slice(0, 6);
        for (const enemy of closest) {
          enemy.alive = false;
          this.particles.push(...paperBurst(enemy, 14, ["#5b8db8", "#8bbdd8", paperColors[0]]));
        }
        this.enemies = this.enemies.filter((e) => e.alive);
        AudioService.victory(); // 复活音效借用victory
        return;
      }
      if (this.canOfferRevive()) {
        this.phase = "revive";
        this.reviveOfferSent = true;
        this.onReviveOffer?.({ levelId: this.level.id, surviveTime: this.elapsed });
        return;
      }
      this.finish(false);
      return;
    }

    if (
      this.shouldFinishVictory()
    ) {
      // P2.8：改为胜利过渡（破阵成功→0.8~1.2秒→结算）
      if (!this.victoryTransitionActive) {
        this.startVictoryTransition();
      }
    } else {
      this._victoryPendingAt = undefined;
    }

    // Boss战超时保护：如果Boss还活着但时间已超过关卡时长+15秒，强制结束算胜利
    if (this.bossSpawned && this.elapsed > this.level.durationSeconds + 15) {
      const bossAlive = this.enemies.some(e => e.alive && e.kind === "boss");
      if (bossAlive) {
        // 强制结束Boss战（视作胜利，但扣1HP作为代价）
        for (const e of this.enemies) {
          if (e.kind === "boss") {
            e.alive = false;
            this.particles.push(...paperBurst(e, 20, ["#c0392b", "#f5b7b1"]));
            this.flash = Math.max(this.flash, 0.8);
            this.screenShake = Math.max(this.screenShake, 0.6);
          }
        }
        this.enemies = this.enemies.filter((e) => e.alive);
      }
    }
  }

  private finish(win: boolean) {
    if (this.finished) return;
    this.finished = true;
    this.phase = win ? "won" : "lost";
    // 首局结束后标记
    if (this.isFirstRun) {
      window.localStorage.setItem("one_blade_first_run_done", "1");
    }
    if (win) AudioService.victory();
    else AudioService.defeat();
    this.stats.score = this.score;
    this.stats.remainingHp = this.hp;
    this.stats.defenseLineHits = this.defenseLineHits;
    this.stats.sharpTurnCount = this.sharpTurnCount;
    this.stats.highBladeSlashCount = this.highBladeSlashCount;
    this.stats.totalSlashEnergy = this.totalSlashEnergy;
    this.stats.chainKillTotal = this.chainKillTotal;
    this.stats.slashCount = this.stats.slashes;
    this.stats.totalKillPerSlash = this.stats.kills;
    this.stats.pickupCollectRate = this.pickupsSpawned > 0 ? this.stats.pickups / this.pickupsSpawned : 1;
    const triggeredOneBlade = this.stats.oneBladeBreaks > 0 || this.stats.maxSingleBlade >= REWARD_CONFIG.godSlashThreshold;
    const rating = evaluateRating({
      win,
      kills: this.stats.kills,
      maxSingleBlade: this.stats.maxSingleBlade,
      maxChain: this.stats.maxChain,
      triggeredOneBlade,
      coreCollapseCount: this.stats.coreCollapses,
      explosiveCount: this.stats.explosions
    });
    // 计算技能雷达四维分数
    const skillScores: SkillScores = calculateSkillScores({
      highBladeSlashCount: this.stats.highBladeSlashCount,
      totalSlashEnergy: this.stats.totalSlashEnergy,
      slashCount: this.stats.slashes,
      kills: this.stats.kills,
      maxSingleBlade: this.stats.maxSingleBlade,
      sharpTurnCount: this.stats.sharpTurnCount,
      coreCollapses: this.stats.coreCollapses,
      chainKillTotal: this.stats.chainKillTotal,
      explosions: this.stats.explosions,
      defenseLineHits: this.stats.defenseLineHits,
      remainingHp: this.stats.remainingHp,
      maxHp: this.maxHp,
      pickups: this.stats.pickups,
      pickupsSpawned: this.pickupsSpawned
    });
    const rewardMeta = applyBattleRewards({
      win,
      levelId: this.level.id,
      kills: this.stats.kills,
      maxSingleBlade: this.stats.maxSingleBlade,
      maxChain: this.stats.maxChain,
      oneBladeBreaks: this.stats.oneBladeBreaks,
      coreCollapseCount: this.stats.coreCollapses,
      explosiveCount: this.stats.explosions,
      rating,
      discoveredEnemies: [...this.discoveredEnemies]
    });
    const result: BattleResult = {
      win,
      levelId: this.level.id,
      levelTitle: this.level.title,
      duration: this.elapsed,
      completedGoal: win,
      score: this.score,
      kills: this.stats.kills,
      maxSingleBlade: this.stats.maxSingleBlade,
      maxChain: this.stats.maxChain,
      oneBladeBreaks: this.stats.oneBladeBreaks,
      triggeredOneBlade,
      hitCore: this.stats.coreHits > 0,
      coreCollapseCount: this.stats.coreCollapses,
      explosiveCount: this.stats.explosions,
      usedReviveAd: this.stats.usedReviveAd,
      canReviveAd: false,
      canDoubleReward: win,
      slashes: this.stats.slashes,
      rating,
      ...rewardMeta,
      skillScores,
      selectedRoutes: [...this.selectedRoutes],
      killedElites: [...this.killedElites],
      killedBoss: this.killedBoss
    };
    logEvent("game_end", {
      levelId: this.level.id,
      result: win ? "win" : "lost",
      duration: this.elapsed,
      kills: this.stats.kills,
      maxSlashKills: this.stats.maxSingleBlade,
      rating,
      usedReviveAd: this.stats.usedReviveAd
    });
    this.onFinish(result);
  }

  /** P2.7：按阶段和类型限制生成 x 到安全区 */
  private clampSpawnXByPhaseAndKind(x: number, kind: EnemyKind, phase: BattlePhase): number {
    if (kind === "elite") return clamp(x, BATTLE_SAFE_X.eliteMin, BATTLE_SAFE_X.eliteMax);
    if (phase === "edict_burst") return clamp(x, BATTLE_SAFE_X.burstMin, BATTLE_SAFE_X.burstMax);
    return clamp(x, BATTLE_SAFE_X.normalMin, BATTLE_SAFE_X.normalMax);
  }

  /** P2.5：随机选择前中后排 */
  private pickEntryRow(): "back" | "middle" | "front" {
    const r = Math.random();
    const weights = ENTRY_END_JITTER.rowWeights;
    if (r < weights.back) return "back";
    if (r < weights.back + weights.middle) return "middle";
    return "front";
  }

  /** P2.5：计算个体化 entryEndY */
  private getPersonalizedEntryEndY(kind: EnemyKind, baseEndY: number): number {
    if (!ENTRY_END_JITTER.enabled) return baseEndY;
    const row = this.pickEntryRow();
    const rowOffset = ENTRY_END_JITTER.rowOffset[row] ?? 0;
    const kindOffsetMap = ENTRY_END_JITTER.kindOffset as Record<string, number>;
    const kindOffset = kindOffsetMap[kind] ?? 0;
    const randomOffset = randomRange(ENTRY_END_JITTER.commonMin, ENTRY_END_JITTER.commonMax);
    return clamp(baseEndY + rowOffset + kindOffset + randomOffset, 330, 560);
  }

  /** P2.5：怪物类型速度微差异 */
  private getEntrySpeedFactorByKind(kind: EnemyKind): number {
    switch (kind) {
      case "infantry": return randomRange(0.95, 1.08);
      case "shield": return randomRange(0.86, 0.96);
      case "powder": return randomRange(0.9, 1.0);
      case "core": return randomRange(0.86, 0.95);
      case "elite": return randomRange(0.82, 0.92);
      default: return 1;
    }
  }

  /** 三次修正：根据当前战斗阶段获取对应 entry profile */
  private getEntryProfile() {
    if (this.battlePhase === 'edict_burst') return ENTRY_PROFILE_EDICT_BURST;
    return ENTRY_PROFILE_COMMON;
  }

  /** 第五轮修正：按怪物类型+阶段选择 entry profile（精英单独回调） */
  private getEntryProfileForEnemy(kind: EnemyKind, phase: BattlePhase) {
    if (kind === "elite") return ENTRY_PROFILE_ELITE;
    if (phase === "edict_burst") return ENTRY_PROFILE_EDICT_BURST;
    return ENTRY_PROFILE_COMMON;
  }

  /** 第五轮修正：获取有效军令爆发轮次（有配置用配置，没配置前5关给默认） */
  private getEffectivePostChestWaves(): typeof this.level.waves {
    if (this.level.postChestWaves && this.level.postChestWaves.length > 0) {
      return this.level.postChestWaves;
    }
    // 前5关有精英但没配置 postChestWaves 时，提供默认军令爆发
    if (this.level.eliteSpawnAt && this.level.eliteKind && this.level.id <= 5) {
      return this.getDefaultPostChestWavesForEarlyLevel();
    }
    return [];
  }

  private getDefaultPostChestWavesForEarlyLevel(): typeof this.level.waves {
    return [
      {
        name: "军令爆发一",
        delay: 0,
        spawnAt: 0.5,
        enemies: [
          { kind: "infantry", x: 92, count: 4 },
          { kind: "infantry", x: 188, count: 5 },
          { kind: "infantry", x: 284, count: 4 }
        ]
      },
      {
        name: "军令爆发二",
        delay: 0,
        spawnAt: 4.8,
        enemies: [
          { kind: "infantry", x: 76, count: 5 },
          { kind: "shield", x: 188, count: 1 },
          { kind: "infantry", x: 300, count: 5 }
        ]
      },
      {
        name: "军令爆发三",
        delay: 0,
        spawnAt: 9.2,
        enemies: [
          { kind: "infantry", x: 60, count: 5 },
          { kind: "powder", x: 188, count: 1 },
          { kind: "infantry", x: 316, count: 5 }
        ]
      }
    ] as any;
  }

  /** 第二轮修正：普通波次怪物横向分布函数（围绕 spawn.x 展开） */
  private getSpawnXForGroupedEnemy(baseX: number, index: number, count: number): number {
    if (count <= 1) return baseX;
    const spacing = count >= 5 ? 28 : 32;
    const centerOffset = (count - 1) * spacing * 0.5;
    const jitter = randomRange(-5, 5);
    return clamp(baseX - centerOffset + index * spacing + jitter, 24, DESIGN_WIDTH - 24);
  }

  /** P2：精英受击轻反馈 */
  private triggerEliteHitFeedback(enemy: Enemy) {
    enemy.flash = Math.max(enemy.flash, 0.22);
    if (this.particles.length < 120) {
      this.particles.push(ringParticle(enemy, "#ffd35a", 18));
    }
    if (!enemy.lastHitTextAt || this.elapsed - enemy.lastHitTextAt > 0.5) {
      enemy.lastHitTextAt = this.elapsed;
      this.addText(enemy.x, enemy.y - 28, "命中", "#ffd35a", 13, 0.45);
    }
  }

  /** P2：精英强力命中反馈 */
  private triggerEliteHeavyHitFeedback(enemy: Enemy) {
    enemy.flash = Math.max(enemy.flash, 0.4);
    this.addText(enemy.x, enemy.y - 34, "重创", "#ffdf7a", 16, 0.8);
    this.particles.push(ringParticle(enemy, "#ffdf7a", 26));
    this.screenShake = Math.max(this.screenShake, 0.16);
  }

  /** P2：精英护盾击破反馈 */
  private triggerEliteShieldBreak(enemy: Enemy) {
    enemy.shieldBrokenFlash = 0.45;
    enemy.flash = Math.max(enemy.flash, 0.35);
    this.addText(enemy.x, enemy.y - 34, "破盾", "#b58cff", 18, 1.0);
    this.particles.push(ringParticle(enemy, "#b58cff", 30));
    this.particles.push(...sparkBurst(enemy, 10, "#b58cff"));
    this.screenShake = Math.max(this.screenShake, 0.18);
    // P2.8：破盾综合反馈
    this.triggerHitStop(0.12, 0.15, true);
    this.triggerSlashAfterglow(0.5, 0.18);
    this.triggerEdgeFlash(0.45, 0.18);
    this.screenShake = Math.max(this.screenShake, 0.16);
  }

  /** P2：精英濒死提示 */
  private checkEliteLowHpFeedback(enemy: Enemy) {
    if (enemy.kind !== "elite") return;
    const maxHp = Math.max(1, enemy.maxHp || enemy.hp || 1);
    const ratio = enemy.hp / maxHp;
    if (ratio <= 0.25 && !enemy.eliteLowHpWarned && enemy.hp > 0) {
      enemy.eliteLowHpWarned = true;
      this.addText(enemy.x, enemy.y - 42, "将破", "#ff7b6e", 18, 1.0);
      this.particles.push(ringParticle(enemy, "#ff7b6e", 32));
      this.screenShake = Math.max(this.screenShake, 0.12);
    }
  }

  /** P3.5：军令图标飞行动画（只由状态机驱动） */
  private updateEdictIconFly(dt: number) {
    if (this.edictRewardState !== "flying") return;
    if (!this.edictIconFlying) return;
    this.edictIconFlyT += dt / this.edictIconFlyDuration;
    if (this.edictIconFlyT >= 1) {
      this.edictIconFlyT = 1;
      this.completeEliteChestReward();
    }
  }

  /** P3.5：军令图标飞行绘制（只显示 flying 状态） */
  private drawEdictIconFly(ctx: CanvasRenderingContext2D) {
    if (this.edictRewardState !== "flying") return;
    if (!this.edictIconFlying) return;
    const t = clamp(this.edictIconFlyT, 0, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const x = this.edictIconFlyFrom.x + (this.edictIconFlyTo.x - this.edictIconFlyFrom.x) * ease;
    const y = this.edictIconFlyFrom.y + (this.edictIconFlyTo.y - this.edictIconFlyFrom.y) * ease;
    const scale = 1.25 + (0.62 - 1.25) * ease;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(255, 190, 60, 0.95)";
    ctx.shadowColor = "rgba(255, 210, 90, 0.9)";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff7d0";
    ctx.font = '900 24px "Microsoft YaHei", "SimHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("令", 0, 1);
    ctx.restore();
  }

  /** P3.5：更新军令状态——爆发结束后收尾 */
  private updateEdictStatusIcon(dt: number) {
    // 军令爆发完成后清理状态
    if (
      this.edictRewardState === "active" &&
      this.allPostChestWavesSpawned &&
      this.subSpawnQueue.length === 0
    ) {
      const aliveEnemies = this.enemies.filter(e => e.alive);
      if (aliveEnemies.length === 0) {
        this.edictIconActive = false;
        this.chestMomentumTimer = 0;
        this.setEdictRewardState("finished", "edict burst finished");
      }
    }
  }

  /** P3.5：帧级卡死守卫 */
  private validateEdictState() {
    // 双UI错误检测
    const invalidDoubleUi = this.chestPendingConfirm && (this.edictIconFlying || this.edictIconActive);
    if (invalidDoubleUi) {
      console.warn("[edict invalid double ui]", { state: this.edictRewardState, chestPendingConfirm: this.chestPendingConfirm, edictIconFlying: this.edictIconFlying, edictIconActive: this.edictIconActive, time: this.elapsed });
      if (this.edictRewardState === "modal") { this.edictIconFlying = false; this.edictIconActive = false; }
    }
    // 奖励已应用但仍在弹窗状态
    if (this.edictRewardApplied && this.edictRewardState === "modal") {
      console.warn("[edict applied while still modal]");
      this.chestPendingConfirm = false;
      this.chestOpened = false;
      this.chestBuffRevealed = false;
      this.setEdictRewardState("active", "auto repair applied modal");
    }
    // 飞行卡死保护
    if (this.edictRewardState === "flying" && this.edictIconFlyT > 1.2) {
      console.warn("[edict flying stuck, force complete]");
      this.completeEliteChestReward();
    }
  }

  /** P3.7：卡死自检守卫 + 业务状态修复 */
  private validateChestEdictState() {
    // 修复旧的 paused_for_chest 残留
    if (this.phase === "paused_for_chest") {
      console.warn("[edict repair] legacy paused_for_chest detected", { time: this.elapsed, state: this.edictRewardState, chestPendingConfirm: this.chestPendingConfirm });
      this.phase = "playing";
    }
    // 修复 flying 状态缺失动画标志
    if (this.edictRewardState === "flying" && !this.edictIconFlying && !this.chestDone) {
      console.warn("[edict repair] flying state without icon flag", { time: this.elapsed, flyT: this.edictIconFlyT });
      this.edictIconFlying = true;
    }
    const doubleFlight = this.chestFlying && this.edictIconFlying;
    if (doubleFlight) {
      console.warn("[edict bug] double flight detected, disabling chestFlying", { time: this.elapsed, chestFlyT: this.chestFlyT, edictIconFlyT: this.edictIconFlyT });
      this.chestFlying = false;
      this.chestFlyT = 0;
    }
    const modalAndActive = this.chestPendingConfirm && (this.edictIconFlying || this.edictIconActive || this.chestDone);
    if (modalAndActive) {
      console.warn("[edict bug] modal overlaps active state", { time: this.elapsed, chestPendingConfirm: this.chestPendingConfirm, edictIconFlying: this.edictIconFlying, edictIconActive: this.edictIconActive, chestDone: this.chestDone });
      if (this.chestDone || this.edictIconActive) {
        this.chestPendingConfirm = false;
        this.chestOpened = false;
        this.chestBuffRevealed = false;
      }
    }
    if (this.edictIconFlying && this.edictIconFlyT > 1.2) {
      console.warn("[edict bug] edict icon flying stuck, force complete", { time: this.elapsed, edictIconFlyT: this.edictIconFlyT });
      this.completeEliteChestReward();
    }
  }

  /** P3.5：左上角军令状态 Icon（只显示 active 状态） */
  private drawEdictStatusIcon(ctx: CanvasRenderingContext2D) {
    if (this.edictRewardState !== "active") return;
    const shouldShow = this.edictIconActive || this.chestMomentumTimer > 0 || this.battlePhase === "edict_burst";
    if (!shouldShow) return;

    const x = 46;
    const y = 78;
    const inBurst = this.battlePhase === "edict_burst";
    const pulse = 0.5 + Math.sin(this.elapsed * 5) * 0.5;

    ctx.save();
    ctx.translate(x, y);

    ctx.shadowColor = "rgba(255, 210, 90, 0.75)";
    ctx.shadowBlur = 10 + pulse * 8;

    ctx.fillStyle = "rgba(45, 24, 10, 0.88)";
    ctx.strokeStyle = "rgba(255, 211, 90, 0.8)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#fff1b8";
    ctx.font = '900 18px "Microsoft YaHei", "SimHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("令", 0, 1);

    ctx.font = '700 10px "Microsoft YaHei", "SimHei", sans-serif';
    ctx.fillStyle = "#ffd35a";
    ctx.fillText(inBurst ? "爆发中" : "已激活", 0, 29);

    ctx.restore();
  }

  /** P3.8：绘制军令弹窗（紫色框体完整版） */
  private drawEdictRewardModal(ctx: CanvasRenderingContext2D) {
    if (!this.isEdictModalBlocking()) return;

    const lay = this.getEdictModalLayout();
    const cx = DESIGN_WIDTH / 2;
    const pulse = 0.5 + Math.sin(this.elapsed * 4) * 0.5;

    // 暗色遮罩
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    ctx.save();
    ctx.translate(lay.panelX, lay.panelY);

    // 面板背景
    ctx.fillStyle = "rgba(20, 14, 8, 0.94)";
    ctx.strokeStyle = "rgba(120, 80, 200, 0.5)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, 0, 0, lay.panelW, lay.panelH, 14);
    ctx.fill();
    ctx.stroke();

    // P3.13：标题（面板局部 y=22）
    ctx.fillStyle = "#c8b896";
    ctx.font = '600 12px "Microsoft YaHei", "SimHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("军令降临", lay.panelW / 2, 22);

    // 中央Icon（面板局部 y=72, r=34）
    const iconCx = lay.panelW / 2;
    const iconCy = 72;
    const iconR = 34;

    ctx.shadowColor = "rgba(150, 100, 220, 0.6)";
    ctx.shadowBlur = 16 + pulse * 8;
    ctx.fillStyle = "#7c3aed";
    ctx.beginPath();
    ctx.arc(iconCx, iconCy, iconR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(124, 58, 237, 0.6)";
    ctx.beginPath();
    ctx.arc(iconCx, iconCy, iconR - 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = '900 24px "Microsoft YaHei", "SimHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("令", iconCx, iconCy + 1);

    // 军令名（面板局部 y=122, 24px/900）
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff3d0";
    ctx.font = '900 24px "Microsoft YaHei", "SimHei", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("军令", iconCx, 122);

    // 描述（面板局部 y=150）
    ctx.fillStyle = "rgba(230, 220, 205, 0.78)";
    ctx.font = '400 13px "Microsoft YaHei", "SimHei", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("刀势回涌，副刀共鸣！", iconCx, 150);

    ctx.restore();

    // 底部紫色主按钮
    ctx.save();
    ctx.shadowColor = "rgba(124, 58, 237, 0.4)";
    ctx.shadowBlur = 6 + pulse * 4;
    ctx.fillStyle = "#7c3aed";
    ctx.strokeStyle = "rgba(150, 100, 220, 0.4)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, lay.buttonX, lay.buttonY, lay.buttonW, lay.buttonH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.font = '700 16px "Microsoft YaHei", "SimHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("收下军令", cx, lay.buttonY + lay.buttonH / 2);

    ctx.restore();
  }

  /** P3.9：清理非法特殊怪（裸 elite/boss）兜底 */
  private cleanupInvalidSpecialEnemies() {
    let removed = 0;
    for (const enemy of this.enemies) {
      const invalidElite = enemy.kind === "elite" && !enemy.eliteKind;
      const invalidBoss = enemy.kind === "boss" && !enemy.bossId;
      if (invalidElite || invalidBoss) {
        enemy.alive = false;
        removed += 1;
      }
    }
    if (removed > 0) {
      console.warn("[invalid special enemy removed]", { removed, levelId: this.level.id, time: this.elapsed });
      this.enemies = this.enemies.filter(enemy => enemy.alive);
    }
  }

  /** P2.9：军令Icon淡出消散 */
  private triggerEdictIconFadeOut() {
    this.particles.push(ringParticle({ x: 46, y: 78 }, "#ffd35a", 18));
  }

  /** P2.9：完成精英宝箱奖励——应用buff + 军令Icon + 进入军令爆发 */
  /** P3.7：飞行完成→应用军令奖励（真正幂等）+ 启动军令爆发 */
  private completeEliteChestReward() {
    if (this.chestDone || this.edictRewardApplied) return;
    if (this.edictRewardState !== "flying") return;

    this.phase = "playing";
    this.edictIconFlying = false;
    this.edictIconFlyT = 1;
    this.chestFlying = false;
    this.chestFlyT = 0;

    this.edictRewardApplied = true;

    this.energy = Math.min(BALANCE.swordEnergy.max, this.energy + 70);
    this.grantSubBladeReady();
    this.chestMomentumTimer = Math.max(this.chestMomentumTimer, 12);

    this.chestDone = true;
    this.edictIconActive = true;

    if (!this.setEdictRewardState("active", "edict reward complete")) {
      console.error("[edict fatal] failed to enter active state", { time: this.elapsed, state: this.edictRewardState });
      return;
    }

    this.startEdictBurstOnce();
  }

  /** P3.5：军令爆发只入队一次 */
  private startEdictBurstOnce() {
    if (this.edictPostWavesQueued) return;

    const postWaves = this.getEffectivePostChestWaves();

    if (postWaves.length <= 0) {
      this.allPostChestWavesSpawned = true;
      this.edictBurstRoundIndex = 0;
      this.edictBurstRoundTotal = 0;
      return;
    }

    this.edictPostWavesQueued = true;
    this.battlePhase = "edict_burst";
    this.postChestStartAt = this.elapsed;
    this.postChestWaveIndex = 0;
    this.allPostChestWavesSpawned = false;
    this.edictBurstRoundIndex = 1;
    this.edictBurstRoundTotal = postWaves.length;
  }

  /** P3.7：确认军令弹窗→启动飞行（恢复 playing 防止卡死） */
  private confirmEliteChestReward() {
    if (this.edictRewardState !== "modal") return;
    if (!this.chestPendingConfirm) return;
    if (this.edictModalConfirmed) return;

    this.edictModalConfirmed = true;

    // 确认军令后必须恢复主循环
    this.phase = "playing";

    this.chestPendingConfirm = false;
    this.chestOpened = false;
    this.chestBuffRevealed = false;
    this.chestFlying = false;
    this.chestFlyT = 0;

    this.edictIconFlying = true;
    this.edictIconFlyT = 0;
    this.edictIconFlyFrom = { x: DESIGN_WIDTH / 2, y: DESIGN_HEIGHT * 0.48 };
    this.edictIconFlyTo = { x: 46, y: 78 };

    if (!this.setEdictRewardState("flying", "confirm chest reward")) {
      this.edictIconFlying = false;
      this.edictIconFlyT = 0;
      this.edictModalConfirmed = false;
      return;
    }

    this.addText(DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.52, "军令已生效", "#ffd35a", 16, 0.45);
    this.screenShake = Math.max(this.screenShake, 0.08);
  }

  /** P3.9：精英名牌（禁止非法精英绘制血条） */
  /** P2.5：精英名牌显示名称 */
  private getEliteDisplayName(enemy: Enemy): string {
    switch (enemy.eliteKind) {
      case "heal": return "氛围将";
      case "fireRing": return "火环将";
      case "aura": return "护盾将";
      default: return "精英";
    }
  }

  /** P2：精英护盾层光晕 */
  private drawEliteShieldLayer(ctx: CanvasRenderingContext2D, enemy: Enemy) {
    if (enemy.kind !== "elite" || !enemy.alive) return;
    // 氛围将/火环将使用 skillTimer 作为护盾值
    const shieldValue = enemy.skillTimer ?? 0;
    if (shieldValue <= 0) return;

    const pulse = 0.5 + Math.sin(this.elapsed * 6) * 0.5;
    ctx.save();
    ctx.strokeStyle = `rgba(160, 110, 255, ${0.45 + pulse * 0.25})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(160, 110, 255, 0.6)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius + 8 + pulse * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** 第四轮微调：军令爆发怪潮横向分布函数（小批次内更稳定，不要太随机） */
  private getBurstSpawnX(baseX: number, index: number, count: number): number {
    if (count <= 1) return clamp(baseX, 24, DESIGN_WIDTH - 24);
    const spacing = count >= 6 ? 28 : 34;
    const centerOffset = (count - 1) * spacing * 0.5;
    const jitter = randomRange(-5, 5);
    return clamp(baseX - centerOffset + index * spacing + jitter, 24, DESIGN_WIDTH - 24);
  }

  /** 第四轮微调：军令爆发怪潮分批入队（拆 2-4 批，有间隔和前后排） */
  private enqueuePostChestWave(wave: typeof this.level.waves[0], roundIndex: number) {
    const totalSpawns = wave.enemies;
    let localDelay = 0;
    for (const spawn of totalSpawns) {
      const count = spawn.count ?? 1;
      // 1~3 个怪：1 批；4~7 个：2 批；8+：3~4 批
      const batchCount =
        count >= 12 ? 4 :
        count >= 8 ? 3 :
        count >= 4 ? 2 :
        1;
      const perBatch = Math.ceil(count / batchCount);
      for (let batch = 0; batch < batchCount; batch++) {
        const start = batch * perBatch;
        const end = Math.min(count, (batch + 1) * perBatch);
        const batchDelay = localDelay + batch * randomRange(0.28, 0.42);
        const rowYOffset = (spawn.yOffset ?? 0) + batch * 26;
        for (let i = start; i < end; i++) {
          const localIndex = i - start;
          const localCount = end - start;
          const x = this.getBurstSpawnX(spawn.x, localIndex, localCount);
          this.subSpawnQueue.push({
            time: this.elapsed + batchDelay,
            kind: spawn.kind,
            x,
            speedMultiplier: 1,
            yOffset: rowYOffset,
            battlePhase: "edict_burst",
            flowRole: batch < 1 ? "vanguard" : batch < 2 ? "main" : "reserve",
            spawnGroupId: `edict:${roundIndex}:${roundIndex}`,
            spawnOrder: i,
            entryEndYOffset: batch < 1 ? 30 : batch < 2 ? 6 : -24,
            source: "edict",
            roundIndex,
          } as any);
        }
      }
      localDelay += randomRange(0.18, 0.32);
    }
  }

  private createEnemy(kind: EnemyKind, x: number, y: number, speedMultiplier = 1, entryProfile?: { spawnY: number; entryEndY: number; entryMultiplier: number; entryMaxDuration: number }): Enemy {
    const balance = ENEMY_BALANCE[kind];
    const dailyShieldBonus = this.runContext.mode === "dailyChallenge" && this.runContext.dailyChallengeId === "hard_shield" && kind === "shield" ? 1 : 0;
    // 逐波HP递增：每波+1，最多+5（仅对基础敌人生效，精英/Boss不受影响）
    const isBasicEnemy = kind === "infantry" || kind === "shield" || kind === "powder" || kind === "core";
    const hpBonus = isBasicEnemy ? this.waveHpBonus : 0;
    // 第六轮修正：精英也使用 entryPhase（使用 ENTRY_PROFILE_ELITE）
    const shouldUseEntryPhase = isBasicEnemy || kind === "elite";
    // 第一轮修正：优先使用传入的 entryProfile，fallback 到 getEntryProfile()
    const profile = entryProfile ?? this.getEntryProfile();
    // P2.5：个体化落点扰动 + 速度微差异
    const epEndY = this.getPersonalizedEntryEndY(kind, profile.entryEndY);
    const epMul = profile.entryMultiplier * this.getEntrySpeedFactorByKind(kind);
    const epMaxDur = profile.entryMaxDuration;
    return {
      id: this.nextId("enemy"),
      kind,
      x,
      homeX: x,
      y,
      radius: balance.radius,
      hp: balance.hp + dailyShieldBonus + hpBonus,
      maxHp: balance.hp + dailyShieldBonus + hpBonus,
      speed: balance.speed * this.level.enemySpeed * speedMultiplier * randomRange(0.94, 1.08),
      hpDamage: balance.defenseDamage,
      score: balance.score,
      energyGain: balance.energyReward,
      alive: true,
      ignited: false,
      marked: false,
      shieldCrack: 0,
      flash: 0,
      wobble: randomRange(0, Math.PI * 2),
      slowedTimer: 0,
      // 阵眼添加阵法配置
      formationId: kind === "core" ? this.level.formationId : undefined,
      formationLitIndex: 0,
      formationLitTimer: 0,
      formationWrongHits: 0,
      // 30% 步兵是急冲兵；15% 步兵/盾兵是蛇形兵
      // rushTimer 被统一维护在 enemy 对象底部，这里移除
      snakeSwayT: (kind === "infantry" || kind === "shield") && Math.random() < 0.15 ? 0 : undefined,
      // 第六轮修正：所有基础敌人 + 精英必须有 entryPhase
      entryPhase: shouldUseEntryPhase ? {
        active: true,
        endY: epEndY,
        speedMultiplier: epMul,
        maxDuration: epMaxDur,
        elapsed: 0,
        completed: false
      } : undefined,
      rushTimer: isBasicEnemy && kind === "infantry" && Math.random() < 0.3 ? 0.8 : undefined,
    };
  }

  private createPickup(kind: PickupKind, x: number, y: number): Pickup {
    const life = PICKUP_BALANCE[kind].lifeSeconds;
    return {
      id: this.nextId("pickup"),
      kind,
      x,
      y,
      radius: 15,
      active: true,
      pulse: randomRange(0, Math.PI * 2),
      life,
      maxLife: life
    };
  }

  private nextId(prefix: string) {
    this.idCounter += 1;
    return `${prefix}_${this.idCounter}`;
  }

  private readSeenHints() {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const raw = window.localStorage.getItem(HINT_STORAGE_KEY);
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set<string>();
    }
  }

  private persistSeenHints() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(HINT_STORAGE_KEY, JSON.stringify([...this.hintSeen]));
    } catch {
      // localStorage can be unavailable in private browser contexts.
    }
  }

  private showHint(id: string, text: string, x: number, y: number, life: number = BALANCE.feedback.hintTextLife) {
    if (this.hintSeen.has(id)) return;
    this.hintSeen.add(id);
    this.persistSeenHints();
    this.addText(clamp(x, 72, DESIGN_WIDTH - 72), clamp(y, 104, 668), text, "#fff0ba", 16, life);
  }

  private addText(
    x: number,
    y: number,
    text: string,
    color: string,
    size: number,
    life: number = BALANCE.feedback.floatingTextLife
  ) {
    // P4.2A.3: addText仅允许13px以下的小型文字
    const allowedLegacy = size <= 13 && y >= 330;
    if (!allowedLegacy) {
      console.warn("[P4.2 legacy addText blocked]", { text, x, y, size });
      return;
    }
    // P4.2A.2: 正式环境阻止中央大字通过addText
    if (Math.abs(x - DESIGN_WIDTH / 2) < 56 && y < 330 && size >= 18) {
      console.warn("[P4.2 blocked central addText]", { text, x, y, size });
      return;
    }
    // 文字去重：相同内容已存在则不重复添加
    if (this.texts.some(t => t.text === text && t.life > life * 0.5)) {
      return;
    }
    this.texts.push({
      id: this.nextId("text"),
      x,
      y,
      text,
      life,
      maxLife: life,
      color,
      size
    });
    // 二次打磨：浮字上限保护，超出时移除最早的小字（size≤13为low priority）
    if (this.texts.length > MAX_FLOATING_TEXT) {
      // 保留大尺寸（关键反馈），从小尺寸中移除最老的
      this.texts.sort((a, b) => {
        const aIsLarge = a.size >= 16 ? 1 : 0;
        const bIsLarge = b.size >= 16 ? 1 : 0;
        if (aIsLarge !== bIsLarge) return aIsLarge - bIsLarge; // 大字在后面
        return b.maxLife - b.life - (a.maxLife - a.life); // 老的在前
      });
      this.texts = this.texts.slice(0, MAX_FLOATING_TEXT);
    }
  }

  /** 三次修正：浮字聚合器——同类型小浮字合并 + 优先级保护 */
  private pushFloatingTextEvent(
    x: number,
    y: number,
    text: string,
    priority: 'critical' | 'high' | 'medium' | 'low',
    color: string,
    size: number,
    life: number = BALANCE.feedback.floatingTextLife
  ) {
    // 合并：查找附近同类文本
    const mergeTarget = this.texts.find(t =>
      t.life > life * 0.3 &&
      Math.abs(t.x - x) < FLOATING_TEXT_LIMITS.mergeRadius &&
      Math.abs(t.y - y) < FLOATING_TEXT_LIMITS.mergeRadius &&
      (t.text === text || (
        (text.startsWith("连斩") && t.text.startsWith("连斩")) ||
        (text.startsWith("蓄势") && t.text.startsWith("蓄势")) ||
        (text.startsWith("连") && t.text.startsWith("连")) ||
        (text.startsWith("+") && t.text.startsWith("+"))
      ))
    );

    if (mergeTarget) {
      // 合并：累加数值（如"连斩 x4" + "连斩 x3" → "连斩 x7"）
      const numMatch = text.match(/(\d+)/);
      const targetNumMatch = mergeTarget.text.match(/(\d+)/);
      if (numMatch && targetNumMatch) {
        const sum = parseInt(numMatch[1]) + parseInt(targetNumMatch[1]);
        mergeTarget.text = mergeTarget.text.replace(/\d+/, String(sum));
      }
      mergeTarget.life = life * 0.85; // 合并后重置生存
      mergeTarget.maxLife = life;
      return;
    }

    // 低优先级文本：超出限制时丢弃
    if (priority === 'low' || priority === 'medium') {
      const lowCount = this.texts.filter(t => {
        const isLow = t.size <= 12;
        return isLow && t.life > 0;
      }).length;
      if (priority === 'low' && lowCount >= FLOATING_TEXT_LIMITS.lowPriorityMax) return;
      if (priority === 'medium' && lowCount >= FLOATING_TEXT_LIMITS.maxOnScreen - 2) return;
    }

    // 上限保护：临界值/高级别始终保留
    if (this.texts.length >= FLOATING_TEXT_LIMITS.maxOnScreen && priority !== 'critical') {
      // 找最低优先级文本
      const removable = [...this.texts].sort((a, b) => (a.size - b.size) || (a.life - b.life));
      if (removable[0]) {
        const idx = this.texts.indexOf(removable[0]);
        if (idx >= 0) this.texts.splice(idx, 1);
      }
    }

    this.texts.push({
      id: this.nextId("text"),
      x, y, text, life, maxLife: life, color, size
    });
  }

  /** 文字防抖：1秒内不显示重复文字 */
  private hasRecentText(text: string, withinSec: number = 1): boolean {
    return this.texts.some((t) => t.text === text && t.life > (t.maxLife - withinSec));
  }

  /** P4.2: 统一中央播报 */
  private showBattleNotice(input: { text: string; subtext?: string; priority: BattleNoticePriority; category: BattleNoticeCategory; style: BattleNoticeStyle; duration?: number; dedupeKey: string; cooldown?: number; interrupt?: boolean; anchorY?: number; layout?: "default" | "boss-intro" | "boss-phase" | "elite" }) {
    const now = this.elapsed;
    const cooldownUntil = this.battleNoticeCooldowns.get(input.dedupeKey) ?? 0;
    if (now < cooldownUntil) return;
    if (this.activeBattleNotice?.dedupeKey === input.dedupeKey) return;
    if (this.battleNoticeQueue.some(n => n.dedupeKey === input.dedupeKey)) return;
    const cfg = Game.BATTLE_NOTICE_CONFIG;
    const notice: BattleNotice = {
      ...input,
      id: this.nextId("notice"), elapsed: 0, createdAt: now,
      duration: input.duration ?? cfg.defaultDuration[input.priority],
      cooldown: input.cooldown ?? cfg.defaultCooldown[input.priority],
      interrupt: input.interrupt ?? false,
    };
    if (!this.activeBattleNotice) { this.activateBattleNotice(notice); return; }
    const np = cfg.priorityValue[notice.priority];
    const ap = cfg.priorityValue[this.activeBattleNotice.priority];
    if (notice.interrupt && np > ap) { this.activateBattleNotice(notice); return; }
    this.battleNoticeQueue.push(notice);
    this.battleNoticeQueue.sort((a, b) => (cfg.priorityValue[b.priority] - cfg.priorityValue[a.priority]) || (a.createdAt - b.createdAt));
    this.battleNoticeQueue = this.battleNoticeQueue.slice(0, cfg.maxQueue);
  }

  private activateBattleNotice(notice: BattleNotice) {
    this.activeBattleNotice = notice;
    this.battleNoticeCooldowns.set(notice.dedupeKey, this.elapsed + notice.cooldown);
  }

  /** P4.3A.6: 尾队预接力——基于可行动压力+真实ETA */
  private updateEdictTailCatchup(dt: number) {
    if (this.battlePhase !== "edict_burst" || !this.allPostChestWavesSpawned) return;
    if (this.phase !== "playing" || this.isEdictModalBlocking() || this.victoryTransitionActive) return;
    const isFinalRound = this.edictBurstRoundIndex >= this.edictBurstRoundTotal;
    if (!isFinalRound) return;
    if (this.elapsed < this.edictTailCatchupCooldownUntil) return;

    const pressure = this.getCombatPressure("edict", 1.2);
    // 尾队候选筛选：当前轮，按vanguard/main优先
    const candidates = this.subSpawnQueue
      .filter(q => q.source === "edict" && q.roundIndex === this.edictBurstRoundIndex && q.time > this.elapsed)
      .sort((a, b) => {
        const o = { vanguard: 0, main: 1, reserve: 2 };
        return (o[a.flowRole ?? "main"] - o[b.flowRole ?? "main"]) || (a.time - b.time);
      });
    if (candidates.length === 0) { this.edictTailCatchupTimer = 0; return; }

    // 触发条件：可行动压力低 + 远场ETA大
    const shouldTrigger = pressure.actionableNow <= 1 && pressure.actionableSoon07 === 0 && pressure.nearestMidEta > 0.75;
    if (!shouldTrigger) { this.edictTailCatchupTimer = 0; return; }

    this.edictTailCatchupTimer += dt;
    if (this.edictTailCatchupTimer < 0.30) return;

    // 加速1~2只
    let acc = 0;
    for (const q of candidates) {
      if (acc >= 2) break;
      q.time = this.elapsed + randomRange(0.03, 0.08);
      q.isTailCatchup = true;
      // reserve临时升级为vanguard入场
      if (q.flowRole === "reserve") q.flowRole = "vanguard";
      q.entryEndYOffset = Math.max(q.entryEndYOffset ?? 0, 28);
      acc++;
    }
    this.edictTailCatchupTimer = 0;
    this.edictTailCatchupCooldownUntil = this.elapsed + randomRange(0.45, 0.60);
  }

  private updateBattleNotice(dt: number) {
    const modalBlocking = this.chestPendingConfirm || this.phase === "buffChoice" || this.phase === "revive" || this.phase === "paused_for_chest";
    if (modalBlocking) return;
    const active = this.activeBattleNotice;
    if (active) {
      active.elapsed += dt;
      if (active.elapsed >= active.duration) this.activeBattleNotice = null;
    }
    if (!this.activeBattleNotice && this.battleNoticeQueue.length > 0) {
      const next = this.battleNoticeQueue.shift();
      if (next) this.activateBattleNotice(next);
    }
    for (const [key, until] of this.battleNoticeCooldowns) {
      if (until <= this.elapsed) this.battleNoticeCooldowns.delete(key);
    }
  }

  private getBattleNoticeColor(style: BattleNoticeStyle): string {
    switch (style) {
      case "gold": return "#ffd35a";
      case "danger": return "#ff6a33";
      case "purple": return "#b58cff";
      case "blue": return "#5bc0ff";
      default: return "#f6e7bd";
    }
  }

  /** P4.2A.1: Boss阶段/死亡队列清理 */
  private clearBossNoticeScope(bossId: string, keepDefeat = false) {
    if (this.activeBattleNotice?.dedupeKey.startsWith(`boss-phase:${bossId}:`)) {
      this.activeBattleNotice = null;
    }
    this.battleNoticeQueue = this.battleNoticeQueue.filter(notice => {
      if (notice.dedupeKey.startsWith(`boss-phase:${bossId}:`)) return false;
      return true;
    });
  }

  private drawBattleNotice(ctx: CanvasRenderingContext2D) {
    const notice = this.activeBattleNotice;
    if (!notice) return;
    const cfg = Game.BATTLE_NOTICE_CONFIG;
    const fadeIn = clamp(notice.elapsed / cfg.fadeIn, 0, 1);
    const remain = notice.duration - notice.elapsed;
    const fadeOut = clamp(remain / cfg.fadeOut, 0, 1);
    const alpha = Math.min(fadeIn, fadeOut);
    const y = notice.anchorY ?? cfg.centerY;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // P4.2A.3: Boss布局增加半透明背景
    if (notice.layout === "boss-intro" || notice.layout === "boss-phase") {
      const bgW = 280; const bgH = notice.subtext ? 62 : 44;
      ctx.fillStyle = "rgba(10, 7, 5, 0.38)";
      ctx.beginPath();
      roundRect(ctx, DESIGN_WIDTH / 2 - bgW / 2, y - bgH / 2, bgW, bgH, 8);
      ctx.fill();
    }
    ctx.font = notice.priority === "S" ? '900 30px "Microsoft YaHei", sans-serif' : '900 23px "Microsoft YaHei", sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(10,7,5,0.90)";
    ctx.fillStyle = this.getBattleNoticeColor(notice.style);
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = notice.priority === "S" ? 18 : 10;
    ctx.strokeText(notice.text, DESIGN_WIDTH / 2, y);
    ctx.fillText(notice.text, DESIGN_WIDTH / 2, y);
    if (notice.subtext) {
      ctx.shadowBlur = 0;
      ctx.font = '600 13px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = "rgba(246,231,189,0.82)";
      ctx.fillText(notice.subtext, DESIGN_WIDTH / 2, y + 30);
    }
    ctx.restore();
  }

  /** P4.2A.1: 局部浮字入口（支持分类/优先级/合并/轨道） */
  private addCombatFloat(input: { x: number; y: number; text: string; color: string; size: number; duration: number; category: CombatFloatCategory; priority: CombatFloatPriority; mergeKey?: string; targetId?: string }) {
    // 同类同目标0.25秒内合并（使用完整mergeKey）
    const effectiveMergeKey = input.mergeKey ? `${input.mergeKey}:${input.targetId ?? "global"}` : null;
    if (effectiveMergeKey) {
      const existing = this.texts.find(t => t.mergeKey === effectiveMergeKey && t.life > t.maxLife - 0.25);
      if (existing) {
        existing.life = input.duration;
        existing.text = input.text;
        existing.x = input.x;
        existing.y = input.y;
        return;
      }
    }
    // P4.2A.2: 淘汰规则修正——A计入总量，淘汰顺序C→B→A
    const worldFloats = this.texts.filter(t => t.category !== undefined);
    if (worldFloats.length >= 6) {
      const cFloats = worldFloats.filter(t => t.priority === "C");
      const bFloats = worldFloats.filter(t => t.priority === "B");
      const aFloats = worldFloats.filter(t => t.priority === "A");
      if (cFloats.length > 0) {
        this.texts = this.texts.filter(t => t.id !== cFloats[0].id);
      } else if (input.priority !== "C" && bFloats.length > 0) {
        this.texts = this.texts.filter(t => t.id !== bFloats[0].id);
      } else if (input.priority === "A" && bFloats.length > 0) {
        this.texts = this.texts.filter(t => t.id !== bFloats[0].id);
      } else if (input.priority === "A" && aFloats.length > 0) {
        this.texts = this.texts.filter(t => t.id !== aFloats[0].id);
      } else if (input.priority === "C") {
        return; // 新C没有旧C可替换，放弃
      } else {
        return;
      }
    }
    // 完整字符串Hash轨道选择
    const lane = input.targetId ? this.hashTextLane(input.targetId) : (this.texts.length % 3);
    const laneOffsets = [-18, 0, 18];
    this.texts.push({
      id: this.nextId("float"),
      x: input.x, y: input.y - laneOffsets[lane],
      text: input.text, color: input.color, size: input.size,
      life: input.duration, maxLife: input.duration,
      category: input.category, priority: input.priority,
      mergeKey: effectiveMergeKey ?? undefined, targetId: input.targetId, lane,
    });
  }

  private hashTextLane(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) { hash = ((hash * 31 + value.charCodeAt(i)) | 0); }
    return Math.abs(hash) % 3;
  }

  private clampPointer(pos: Vec2): Vec2 {
    return {
      x: clamp(pos.x, 0, DESIGN_WIDTH),
      y: clamp(pos.y, HUD_HEIGHT, BALANCE.battlefield.bottomDefenseY - 8)
    };
  }

  private angleFromWarrior(pos: Vec2) {
    return Math.atan2(pos.y - (BALANCE.battlefield.warriorY + 28), pos.x - DESIGN_WIDTH / 2);
  }

  private getDefensePressure() {
    if (this.enemies.length === 0) return 0;
    const closest = this.enemies.reduce(
      (min, enemy) => (enemy.alive ? Math.min(min, BALANCE.battlefield.bottomDefenseY - enemy.y) : min),
      Number.POSITIVE_INFINITY
    );
    return clamp(1 - closest / 128, 0, 1);
  }

  private drawBackground(ctx: CanvasRenderingContext2D) {
    const sky = ctx.createLinearGradient(0, 0, 0, DESIGN_HEIGHT);
    sky.addColorStop(0, "#180f0b");
    sky.addColorStop(0.42, "#352017");
    sky.addColorStop(1, "#150e0a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    // 微弱纹理线
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "#e7c27a";
    ctx.lineWidth = 1;
    for (let y = 0; y < DESIGN_HEIGHT; y += 18) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(y * 0.02) * 3);
      ctx.lineTo(DESIGN_WIDTH, y + Math.cos(y * 0.018) * 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 远山剪影（无旗帜）
    ctx.fillStyle = "rgba(12, 9, 8, 0.45)";
    ctx.beginPath();
    ctx.moveTo(0, 200);
    ctx.lineTo(60, 158);
    ctx.lineTo(130, 200);
    ctx.lineTo(200, 140);
    ctx.lineTo(270, 200);
    ctx.lineTo(330, 152);
    ctx.lineTo(390, 200);
    ctx.lineTo(390, 270);
    ctx.lineTo(0, 270);
    ctx.closePath();
    ctx.fill();

    // 防线
    const pressure = this.getDefensePressure();
    ctx.strokeStyle = pressure > 0 ? `rgba(255, 86, 68, ${0.22 + pressure * 0.58})` : "rgba(255, 214, 124, 0.22)";
    ctx.lineWidth = pressure > 0 ? 1.5 + pressure * 3 : 1;
    ctx.shadowColor = "rgba(255, 70, 56, 0.55)";
    ctx.shadowBlur = pressure * 18;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(18, BALANCE.battlefield.bottomDefenseY);
    ctx.lineTo(DESIGN_WIDTH - 18, BALANCE.battlefield.bottomDefenseY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
  }

  /** 远景山间雾气遮罩：画在敌人上方，让敌人从雾后现身 */
  private drawTopMist(ctx: CanvasRenderingContext2D) {
    // 下层：山峦剪影（敌人生成区遮罩）
    ctx.fillStyle = "rgba(8, 6, 5, 0.50)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(28, 72);
    ctx.lineTo(58, 36);
    ctx.lineTo(96, 96);
    ctx.lineTo(128, 28);
    ctx.lineTo(168, 88);
    ctx.lineTo(206, 44);
    ctx.lineTo(244, 102);
    ctx.lineTo(278, 52);
    ctx.lineTo(320, 108);
    ctx.lineTo(356, 62);
    ctx.lineTo(390, 84);
    ctx.lineTo(390, 0);
    ctx.closePath();
    ctx.fill();

    // 上层：雾气渐变（底部渐淡，与远处融合）
    const fog = ctx.createLinearGradient(0, 0, 0, 130);
    fog.addColorStop(0, "rgba(18, 12, 8, 0.65)");
    fog.addColorStop(0.4, "rgba(18, 12, 8, 0.28)");
    fog.addColorStop(1, "rgba(18, 12, 8, 0)");
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, DESIGN_WIDTH, 130);
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    // P4.4A: Boss战期间隐藏标准HUD（由BossController绘制专属HUD）
    if (this.bossController) return;

    ctx.fillStyle = "rgba(18, 12, 8, 0.78)";
    ctx.fillRect(0, 0, DESIGN_WIDTH, HUD_HEIGHT);
    ctx.strokeStyle = "rgba(255, 214, 124, 0.35)";
    ctx.beginPath();
    ctx.moveTo(0, HUD_HEIGHT);
    ctx.lineTo(DESIGN_WIDTH, HUD_HEIGHT);
    ctx.stroke();

    // 中间：关名 + 阶段（二次打磨：按 battlePhase 切换显示）
    ctx.textAlign = "center";
    ctx.fillStyle = "#f6e7bd";
    ctx.font = '700 16px "Microsoft YaHei", sans-serif';
    const isBossLevel = this.level.id < 10000 && Boolean(this.level.bossId);
    const displayFloor = isBossLevel ? null : (this.level.id >= 10000 ? this.level.id - 10000 : this.level.id);
    // 防止标题里已含"第X关"前缀造成重复
    const titleText = this.level.title;
    const hasPrefix = displayFloor !== null && titleText.startsWith(`第${displayFloor}关`);
    const displayTitle = hasPrefix ? titleText : (displayFloor !== null ? `第${displayFloor}关 ${titleText}` : titleText);
    ctx.fillText(displayTitle, DESIGN_WIDTH / 2, 28);
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = "rgba(246, 231, 189, 0.72)";
    // 按 battlePhase 显示不同的阶段文本
    let phaseText = "";
    switch (this.battlePhase) {
      case 'main_waves':
        phaseText = `波次 ${Math.min(this.wavesSpawned, this.level.waves.length)}/${this.level.waves.length}`;
        break;
      case 'elite':
        phaseText = "精英来袭";
        break;
      case 'chest':
        phaseText = "军令激活";
        break;
      case 'edict_burst':
        const postWaves = this.getEffectivePostChestWaves();
        const total = this.edictBurstRoundTotal || postWaves.length || 0;
        const current = Math.min(Math.max(this.edictBurstRoundIndex || 1, 1), total);
        phaseText = `军令爆发 ${current}/${total}`;
        break;
      case 'result':
        phaseText = "";
        break;
    }
    ctx.fillText(phaseText, DESIGN_WIDTH / 2, 48);

    // 右侧：分数
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffd35a";
    ctx.font = '700 14px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${Math.floor(this.score)} 分`, DESIGN_WIDTH - 16, 36);
  }

  private drawEnemies(ctx: CanvasRenderingContext2D) {
    // P4.1A.12: 第一遍 — 只画怪物主体（不含血条/名牌）
    const sorted = [...this.enemies].sort((a, b) => a.y - b.y);
    for (const enemy of sorted) {
      if (!enemy.alive) continue;
      const def = ENEMY_DEFS[enemy.kind];
      const wobbleX = Math.sin(enemy.wobble * 5) * 1.2;
      ctx.save();
      ctx.translate(enemy.x + wobbleX, enemy.y);
      // P4.3A: 三层纵深缩放（Boss/精英不受影响）
      if (BATTLEFIELD_FLOW.enabled && enemy.flow && enemy.kind !== "boss" && enemy.kind !== "elite") {
        const dd = BATTLEFIELD_FLOW.drawDepth;
        const layer = this.getPressureLayer(enemy.y);
        const scale = layer === "rear" ? dd.rearScale : layer === "front" ? dd.frontScale : dd.midScale;
        ctx.scale(scale, scale);
        ctx.globalAlpha = layer === "rear" ? dd.rearAlpha : 1;
      }
      ctx.rotate(Math.sin(enemy.wobble * 2) * 0.04);
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 3;

      const baseColor = enemy.flash > 0 ? "#fff1b8" : def.color;
      const accentColor = def.accent;

      // 破绽标记：瞄准准星（4 角括号向内 + 中心十字，区别于盾兵外圈）
      if (this.weakpointMarks.has(enemy.id)) {
        const remain = this.weakpointMarks.get(enemy.id) ?? 0;
        const pulse = 0.5 + Math.sin(this.elapsed * 8) * 0.5;
        // 4 角括号：紧贴敌人边缘内侧（缩小到圈内）
        const r = enemy.radius + 2 + pulse * 1;
        const armLen = 4; // 每段括号长度
        ctx.strokeStyle = `rgba(255, 106, 51, ${0.7 + pulse * 0.3})`;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        // top-left
        ctx.beginPath();
        ctx.moveTo(-r, -r + armLen); ctx.lineTo(-r, -r); ctx.lineTo(-r + armLen, -r);
        ctx.stroke();
        // top-right
        ctx.beginPath();
        ctx.moveTo(r - armLen, -r); ctx.lineTo(r, -r); ctx.lineTo(r, -r + armLen);
        ctx.stroke();
        // bottom-left
        ctx.beginPath();
        ctx.moveTo(-r, r - armLen); ctx.lineTo(-r, r); ctx.lineTo(-r + armLen, r);
        ctx.stroke();
        // bottom-right
        ctx.beginPath();
        ctx.moveTo(r - armLen, r); ctx.lineTo(r, r); ctx.lineTo(r, r - armLen);
        ctx.stroke();
        // 中心 + 十字（放大字号与"破绽"文字里+号对应，建立视觉关联）
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = `rgba(255, 200, 80, ${0.85 + pulse * 0.15})`;
        ctx.shadowColor = "rgba(255, 106, 51, 0.6)";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(-7, 0); ctx.lineTo(7, 0);
        ctx.moveTo(0, -7); ctx.lineTo(0, 7);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // ═════════════════════════════════════
      // 汉字化渲染：单字 + 颜色 + 动效
      // ═════════════════════════════════════

      if (enemy.kind === "infantry") {
        // 步兵："兵"字 朱红，旋转下落动画
        const rot = Math.sin(enemy.wobble * 5) * 0.15;
        ctx.save();
      // 急冲兵：顶部向下箭头 + 闪红底色（避免与破绽标记圆圈混淆）
      if (enemy.rushTimer !== undefined) {
        const rushPulse = Math.abs(Math.sin(this.elapsed * 12));
        ctx.save();
        // 闪红底色（更亮）
        ctx.fillStyle = `rgba(255, 106, 51, ${0.15 + rushPulse * 0.2})`;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 4, 0, Math.PI * 2);
        ctx.fill();
        // 顶部向下箭头（区别于破绽标记的4角括号+中心+）
        ctx.strokeStyle = `rgba(255, 106, 51, ${0.7 + rushPulse * 0.3})`;
        ctx.fillStyle = `rgba(255, 106, 51, ${0.7 + rushPulse * 0.3})`;
        ctx.lineWidth = 1.8;
        ctx.lineCap = "round";
        // 向下箭头（顶部"▼"指向敌人）
        ctx.beginPath();
        ctx.moveTo(0, -enemy.radius - 9);
        ctx.lineTo(0, -enemy.radius - 3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-3, -enemy.radius - 5);
        ctx.lineTo(0, -enemy.radius - 2);
        ctx.lineTo(3, -enemy.radius - 5);
        ctx.stroke();
        ctx.restore();
      }
        ctx.rotate(rot);
        ctx.shadowBlur = 8;
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.fillStyle = baseColor;
        ctx.font = `800 ${enemy.radius * 1.6}px "Microsoft YaHei", "SimHei", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("兵", 0, 0);
        ctx.restore();
        // 重置shadow
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;
      }

      if (enemy.kind === "shield") {
        // 盾兵："盾"字 钢蓝，带白色光环
        ctx.fillStyle = baseColor;
        ctx.font = `800 ${enemy.radius * 1.5}px "Microsoft YaHei", "SimHei", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("盾", 0, 0);
        // 光环
        ctx.strokeStyle = enemy.hp < enemy.maxHp ? "#f6e7bd" : "rgba(255,255,255,0.18)";
        ctx.lineWidth = 2;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;
      }

      if (enemy.kind === "powder") {
        // 火药兵："火"字 橙红，点燃时火星粒子
        ctx.fillStyle = enemy.ignited ? "#ffd67c" : baseColor;
        ctx.font = `800 ${enemy.radius * 1.6}px "Microsoft YaHei", "SimHei", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("火", 0, 0);
        // 点燃状态火星粒子
        if (enemy.ignited) {
          ctx.shadowBlur = 0;
          const sparkCount = 3;
          for (let i = 0; i < sparkCount; i++) {
            const a = this.elapsed * 4 + i * 2.1;
            const sx = Math.cos(a) * enemy.radius * 0.8;
            const sy = Math.sin(a + 1) * enemy.radius * 0.6 - 2;
            ctx.fillStyle = `rgba(255, 150, 50, ${0.4 + Math.sin(this.elapsed * 6 + i) * 0.3})`;
            ctx.beginPath();
            ctx.arc(sx, sy, 3, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.shadowBlur = 6;
          ctx.shadowOffsetY = 3;
        }
      }

      if (enemy.kind === "core") {
        // 阵眼：阵法文字列 + 亮字破阵
        const formationId = enemy.formationId || (this.level.formationId ?? "snake");
        const formation = FORMATIONS[formationId] || FORMATIONS.snake;
        const chars = formation.chars;
        const totalWidth = (chars.length - 1) * 24;
        const startX = -totalWidth / 2;
        const isLit = enemy.marked;
        const litIndex = enemy.formationLitIndex ?? 0;

        for (let i = 0; i < chars.length; i++) {
          const cx = startX + i * 24;
          const cy = 0;
          // 每个字的碰撞圆
          const charRadius = 14;
          const isThisLit = isLit && i === litIndex;

          ctx.save();
          ctx.translate(cx, cy);
          // 亮字或普通
          if (isThisLit) {
            // 亮字：金紫高亮 + 脉冲 + 抖动
            const pulse = 1 + Math.sin(this.elapsed * 8) * 0.12;
            ctx.shadowColor = "#9b6dff";
            ctx.shadowBlur = 18;
            ctx.fillStyle = "#e8d7ff";
            ctx.font = `800 ${Math.round(20 * pulse)}px "Microsoft YaHei", "SimHei", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(chars[i], 0, 0);
            ctx.shadowBlur = 0;
            // 外发光圈
            ctx.strokeStyle = "rgba(155, 109, 255, 0.6)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 16, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            // 普通字：暗灰色
            const alpha = enemy.marked ? 0.5 : 0.35;
            ctx.fillStyle = `rgba(180, 160, 140, ${alpha})`;
            ctx.font = `800 16px "Microsoft YaHei", "SimHei", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(chars[i], 0, 0);
          }

          // 切错闪红
          if (enemy.flash > 0 && i === litIndex && !isThisLit) {
            ctx.fillStyle = "rgba(255, 60, 60, 0.4)";
            ctx.beginPath();
            ctx.arc(0, 0, charRadius + 2, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        }
        // 阵名小字
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(155, 109, 255, 0.5)";
        ctx.font = '10px "Microsoft YaHei", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText(formation.name, 0, -enemy.radius - 4);
        // 切错计数
        if (enemy.formationWrongHits && enemy.formationWrongHits > 0) {
          ctx.fillStyle = "#ff7b6e";
          ctx.font = '10px "Microsoft YaHei", sans-serif';
          ctx.fillText(`容错 ${formation.maxWrongHits - enemy.formationWrongHits}/${formation.maxWrongHits}`, 0, enemy.radius + 6);
        }
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;
      }

      // ---- 精英怪渲染 ----
      if (enemy.kind === "elite" && enemy.eliteKind) {
        // P2：护盾层（在效果光环之前绘制）
        this.drawEliteShieldLayer(ctx, enemy);

        const visDef = ELITE_VISUAL_DEFS[enemy.eliteKind];
        // 精英气场：脉动外光环（增强震撼感）
        const auraPulse = 0.5 + Math.sin(this.elapsed * 3) * 0.5;
        ctx.save();
        ctx.shadowColor = visDef.color;
        ctx.shadowBlur = 16 + auraPulse * 8;
        ctx.strokeStyle = `${visDef.color}${auraPulse > 0.5 ? "55" : "33"}`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 8 + auraPulse * 4, 0, Math.PI * 2);
        ctx.stroke();
        // 第二层光环
        const ringT = (this.elapsed * 0.6) % 1;
        ctx.strokeStyle = `rgba(255, 255, 255, ${1 - ringT})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 4 + ringT * 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = enemy.flash > 0 ? "#fff1b8" : visDef.color;
        ctx.strokeStyle = visDef.accent;
        ctx.lineWidth = 3;
        // 六边形主体
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const px = Math.cos(angle) * enemy.radius;
          const py = Math.sin(angle) * enemy.radius;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // 内六角星纹
        ctx.strokeStyle = visDef.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const px = Math.cos(angle) * enemy.radius * 0.5;
          const py = Math.sin(angle) * enemy.radius * 0.5;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();

        // 名称（统一表达：大字 + 盾形包裹）
        ctx.save();
        const nameText = visDef.name; // "回血将" 3字
        // 盾形背景：3字用 22px 字号
        const charSize = 22;
        const charGap = 4;
        const totalW = nameText.length * charSize + (nameText.length - 1) * charGap;
        const shapeH = 32;
        const shapeW = totalW + 16;
        const shapeY = -enemy.radius - 38;
        // 盾形路径（圆角矩形 + 底部小三角）
        ctx.beginPath();
        const shapeX = -shapeW / 2;
        ctx.moveTo(shapeX + 8, shapeY);
        ctx.lineTo(shapeX + shapeW - 8, shapeY);
        ctx.quadraticCurveTo(shapeX + shapeW, shapeY, shapeX + shapeW, shapeY + 8);
        ctx.lineTo(shapeX + shapeW, shapeY + shapeH - 8);
        ctx.quadraticCurveTo(shapeX + shapeW, shapeY + shapeH, shapeX + shapeW - 8, shapeY + shapeH);
        ctx.lineTo(0, shapeY + shapeH + 6); // 底部小三角
        ctx.lineTo(shapeX + 8, shapeY + shapeH);
        ctx.quadraticCurveTo(shapeX, shapeY + shapeH, shapeX, shapeY + shapeH - 8);
        ctx.lineTo(shapeX, shapeY + 8);
        ctx.quadraticCurveTo(shapeX, shapeY, shapeX + 8, shapeY);
        ctx.closePath();
        // 填充
        ctx.fillStyle = "rgba(20, 14, 8, 0.92)";
        ctx.fill();
        // 边框（双层：外深 + 内亮）
        ctx.strokeStyle = visDef.color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
        // 名字
        ctx.font = `900 ${charSize}px "Microsoft YaHei", "SimHei", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = visDef.color;
        ctx.shadowBlur = 6;
        ctx.fillStyle = "#fff3c0";
        // 逐字绘制
        const textY = shapeY + shapeH / 2;
        for (let i = 0; i < nameText.length; i++) {
          const charX = -totalW / 2 + i * (charSize + charGap) + charSize / 2;
          ctx.fillText(nameText[i], charX, textY);
        }
        ctx.shadowBlur = 0;
        ctx.restore();

        // 火环将：三团火焰
        if (enemy.eliteKind === "fireRing") {
          const flameAngle = (enemy.skillTimer ?? 0) * 3;
          for (let i = 0; i < 3; i++) {
            const a = flameAngle + (Math.PI * 2 / 3) * i;
            const fx = Math.cos(a) * 40;
            const fy = Math.sin(a) * 40;
            ctx.fillStyle = "#e67e22";
            ctx.shadowColor = "#f39c12";
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(fx, fy, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            // 火焰光晕
            ctx.fillStyle = "rgba(230, 126, 34, 0.25)";
            ctx.beginPath();
            ctx.arc(fx, fy, 14, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // 回血将：绿光光圈
        if (enemy.eliteKind === "heal") {
          const pulse = 0.5 + Math.sin(this.elapsed * 3) * 0.5;
          ctx.strokeStyle = `rgba(39, 174, 96, ${0.3 + pulse * 0.3})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius + 6 + pulse * 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        // 氛围将：护盾指示
        if (enemy.eliteKind === "aura") {
          const shieldVal = enemy.skillTimer ?? 2;
          ctx.strokeStyle = "#8e44ad";
          ctx.lineWidth = 3;
          ctx.globalAlpha = 0.3 + Math.min(0.7, shieldVal / 6);
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#d7bde2";
          ctx.font = '700 12px "Microsoft YaHei", sans-serif';
          ctx.textAlign = "center";
          ctx.fillText(`护盾${Math.ceil(shieldVal)}`, 0, 4);
        }
      }

      // P4.1A.12: 血条移出局部坐标，由drawEnemyHealthOverlays统一绘制

      // P3.13：分裂兵只保留丝带/裂纹预警绘制
      if (enemy.kind === "splitter") {
        this.drawSplitterWarning(ctx, enemy);
      }

      // ---- Boss渲染 ----
      if (enemy.kind === "boss" && enemy.bossId) {
        // P4.4A: thunderGeneral 由 BossController 渲染
        if (enemy.bossId === "thunderGeneral") continue;
        const visDef = BOSS_VISUAL_DEFS[enemy.bossId];
        const phase = enemy.bossPhase ?? 0;
        const phaseColors = ["#c0392b", "#e74c3c", "#922b21"];
        const phaseColor = phaseColors[Math.min(phase, phaseColors.length - 1)];
        const pulse = 1 + Math.sin(this.elapsed * 4) * 0.08;

        ctx.fillStyle = enemy.flash > 0 ? "#fff" : visDef.color;
        ctx.strokeStyle = phaseColor;
        ctx.lineWidth = 3 + phase * 1.5;

        // 大型双环
        ctx.save();
        ctx.scale(pulse, pulse);
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 外环
        ctx.strokeStyle = visDef.accent;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5 + Math.sin(this.elapsed * 5) * 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.restore();

        // Boss名称（大字）
        ctx.shadowColor = visDef.color;
        ctx.shadowBlur = 20;
        ctx.fillStyle = "#fff3c0";
        ctx.font = '700 16px "Microsoft YaHei", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(visDef.name, 0, -enemy.radius - 14);
        ctx.shadowBlur = 0;

        // 血条（简短Boss血条）
        const hpRatio = enemy.hp / enemy.maxHp;
        // P4.1A.12: Boss血条移出局部坐标，由drawEnemyHealthOverlays统一绘制
        void hpRatio;

        // 阶段标识
        ctx.fillStyle = phaseColor;
        ctx.font = '10px "Microsoft YaHei", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText(`P${phase + 1}`, 0, enemy.radius + 16);
      }

      // 点燃/标记光环（保留）
      if (enemy.ignited || enemy.marked) {
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = enemy.ignited ? "#ffb15c" : "#e8d7ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 1, enemy.radius + 5 + Math.sin(this.elapsed * 10) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }
    // P4.1A.12: 第二遍 — 屏幕空间血条/名牌（不继承怪物旋转/缩放）
    this.drawEnemyHealthOverlays(ctx, sorted.filter(e => e.alive));
  }

  /** P4.1A.14: 屏幕空间血条/名牌层（不继承怪物局部坐标） */
  private drawEnemyHealthOverlays(ctx: CanvasRenderingContext2D, enemies: Enemy[]) {
    if (enemies.length === 0) return;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      // P4.1A.14: 入场阶段不显示孤立血条
      if (enemy.entryPhase?.active && !enemy.entryPhase?.completed) continue;
      if (enemy.y - enemy.radius < 90) continue;
      // 精英分段血条 + 名牌（绝对坐标）
      if (enemy.kind === "elite" && enemy.eliteKind) {
        this.drawEliteHealthOverlay(ctx, enemy);
      }
      // Boss简短血条（屏幕空间）
      if (enemy.kind === "boss" && enemy.bossId && enemy.bossId !== "thunderGeneral") {
        const hpRatio = enemy.hp / enemy.maxHp;
        const barW = 96;
        const barH = 7;
        const cx = clamp(enemy.x, barW / 2 + 8, DESIGN_WIDTH - barW / 2 - 8);
        const topY = clamp(enemy.y - enemy.radius - 32, 90, BALANCE.battlefield.bottomDefenseY - barH - 12);
        ctx.save();
        ctx.fillStyle = "rgba(10, 7, 5, 0.7)";
        ctx.fillRect(cx - barW / 2, topY, barW, barH);
        ctx.fillStyle = hpRatio > 0.5 ? "#2ecc71" : hpRatio > 0.25 ? "#f39c12" : "#e74c3c";
        ctx.fillRect(cx - barW / 2, topY, barW * hpRatio, barH);
        ctx.strokeStyle = "#fff3c0";
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - barW / 2, topY, barW, barH);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /** P4.1A.15: 精英血条（绝对坐标 + 5段式） */
  private drawEliteHealthOverlay(ctx: CanvasRenderingContext2D, enemy: Enemy) {
    if (!enemy.alive || enemy.kind !== "elite" || !enemy.eliteKind) return;
    const plateW = 58;
    const plateH = 14;
    const centerX = clamp(enemy.x, plateW / 2 + 8, DESIGN_WIDTH - plateW / 2 - 8);
    const topY = clamp(enemy.y - enemy.radius - 56, 90, BALANCE.battlefield.bottomDefenseY - plateH - 12);
    const x0 = centerX - plateW / 2;
    const y0 = topY;
    const maxSegments = 5;
    const hpRatio = Math.max(0, Math.min(1, enemy.hp / Math.max(1, enemy.maxHp)));
    const filledSegments = Math.ceil(hpRatio * maxSegments);
    const segW = 10;
    const segGap = 1.5;
    const totalW = maxSegments * segW + (maxSegments - 1) * segGap;
    const segStartX = centerX - totalW / 2;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    for (let seg = 0; seg < maxSegments; seg++) {
      const sx = segStartX + seg * (segW + segGap);
      const filled = seg < filledSegments;
      if (hpRatio < 0.25 && filled) {
        // 低血脉冲
        const pulse = 0.6 + Math.sin(this.elapsed * 10) * 0.4;
        ctx.fillStyle = `rgba(231, 76, 60, ${pulse})`;
      } else if (hpRatio < 0.5 && filled) {
        ctx.fillStyle = "#f39c12";
      } else {
        ctx.fillStyle = filled ? "#ffd35a" : "rgba(60, 50, 40, 0.5)";
      }
      ctx.fillRect(sx, y0, segW, plateH);
      if (filled) {
        ctx.strokeStyle = "rgba(255, 255, 200, 0.25)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx, y0, segW, plateH);
      }
    }
    ctx.restore();
  }

  private drawPickups(ctx: CanvasRenderingContext2D) {
    for (const pickup of this.pickups) {
      const def = PICKUP_DEFS[pickup.kind];
      const pulse = 1 + Math.sin((this.elapsed + pickup.pulse) * 5) * 0.08;
      const lifeRatio = clamp(pickup.life / pickup.maxLife, 0, 1);
      ctx.save();
      ctx.translate(pickup.x, pickup.y);
      ctx.scale(pulse, pulse);
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = "rgba(24, 16, 10, 0.86)";
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, pickup.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + lifeRatio * 0.35})`;
      ctx.beginPath();
      ctx.arc(0, 0, pickup.radius + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lifeRatio);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = def.color;
      ctx.font = '700 11px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = pickup.kind === "drum" ? "鼓" : pickup.kind === "soul" ? "魂" : "油";
      ctx.fillText(label, 0, 1);
      ctx.restore();
    }
  }

  private drawSlash(ctx: CanvasRenderingContext2D) {
    const trail = this.currentSlash;    if (!trail) return;

    const stage = SWORD_STAGE_BY_ID[trail.tier];
    const ratio = this.getSlashRatio(trail);
    const points = trail.points;
    const isLowBlade = ratio <= BALANCE.slash.lowBladeRemainRatio;
    const lowFade = isLowBlade ? 0.46 + (ratio / BALANCE.slash.lowBladeRemainRatio) * 0.38 : 1;
    const width = stage.width * trail.widthMultiplier * (0.28 + ratio * 0.95);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const age = i / Math.max(1, points.length - 1);
      const alpha = clamp(age * b.energyRatio * stage.brightness * lowFade, 0.05, 0.95);
      ctx.strokeStyle = `rgba(255, 213, 112, ${alpha * 0.58})`;
      ctx.shadowColor = stage.color;
      ctx.shadowBlur = (18 + stage.width * 0.7) * lowFade;
      ctx.lineWidth = width * (0.9 + b.energyRatio);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // 外发光层（第三层）：更大扩散范围的光晕
      ctx.strokeStyle = `rgba(255, 180, 70, ${alpha * 0.28})`;
      ctx.shadowColor = stage.color;
      ctx.shadowBlur = (40 + stage.width * 1.2) * lowFade;
      ctx.lineWidth = width * (1.3 + b.energyRatio * 0.8);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 255, 238, ${alpha})`;
      ctx.shadowBlur = 8;
      ctx.lineWidth = Math.max(2, width * 0.36);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const angle = prev ? Math.atan2(last.y - prev.y, last.x - prev.x) : this.lastSlashAngle;
    const visualLength = stage.visualLength * (0.34 + ratio * 0.82) * lowFade;
    this.drawBladeTip(ctx, last, angle, visualLength, width, stage.color, ratio);
    ctx.restore();
  }
  private drawSubBladeVisual(ctx: CanvasRenderingContext2D) {
    const warriorY = BALANCE.battlefield.warriorY;
    const heroX = DESIGN_WIDTH / 2;

    for (let i = 0; i < this.subBlades.length; i++) {
      const anim = this.subBladeAnim[i];
      const home = this.getSubBladeFloatingPos(i);
      const isLeft = i === 0;
      const baseColor = isLeft ? "#5bc0ff" : "#b58cff";
      const readyColor = isLeft ? "#8ad4ff" : "#d4a8ff";

      // 确定当前绘制位置
      let drawPos: Vec2;
      let rot: number;
      let bladeAlpha: number;
      let bladeScale: number;
      // P4.1A.3 尺寸（左44px/8px宽, 右48px/5.5px宽）
      const bladeLen = isLeft ? 44 : 48;
      const bladeW = isLeft ? 8 : 5.5;
      const bladeH = bladeLen * 0.6;
      const handleLen = isLeft ? 9 : 8;
      const tipLen = isLeft ? 8 : 12;

      // P4.1A.4: Cooldown/Ready: 横向悬浮（刀尖朝水平）
      if (anim.phase === "cooldown" || anim.phase === "idle" || anim.phase === "ready") {
        const isRdy = anim.phase === "ready";
        const baseRot = isLeft ? Math.PI / 2 : -Math.PI / 2;
        const sx = Math.sin(this.elapsed * (isRdy ? 2.0 : 2.2) + i * 1.3) * (isRdy ? 1.4 : 2.5);
        const sy = Math.sin(this.elapsed * (isRdy ? 2.6 : 3.0) + i * 0.7) * (isRdy ? 1.4 : 2.0);
        drawPos = { x: home.x + sx, y: home.y + sy };
        rot = baseRot + Math.sin(this.elapsed * 2.0 + i) * (isRdy ? 0.015 : 0.035);
        bladeAlpha = isRdy ? 0.92 : (isLeft ? 0.55 : 0.58);
        bladeScale = isRdy ? (isLeft ? 1.05 : 1.06) : 1;
      } else if (anim.phase === "arming") {
        const t = clamp(anim.phaseTimer / anim.phaseDuration, 0, 1);
        // P4.1A.4: 从横向→目标方向旋转，上提6px→后撤→放大
        const lift = t <= 0.3 ? t / 0.3 * 6 : 6;
        const retreat = t >= 0.45 && t <= 0.8 ? (t - 0.45) / 0.35 * 6 : (t > 0.8 ? 6 : 0);
        const dir = isLeft ? -1 : 1;
        drawPos = { x: home.x - retreat * dir, y: home.y - lift };
        // 从横向基础角→目标方向
        const baseHoriz = isLeft ? Math.PI / 2 : -Math.PI / 2;
        const targetAngle = Math.atan2(anim.endPos.y - drawPos.y, anim.endPos.x - drawPos.x) + Math.PI / 2;
        const rotProgress = clamp((t - 0.2) / 0.55, 0, 1);
        rot = baseHoriz + (targetAngle - baseHoriz) * Math.min(1, rotProgress);
        if (t < 0.25) bladeScale = 0.96;
        else bladeScale = 0.96 + (t - 0.25) / 0.75 * (isLeft ? 0.14 : 0.18);
        bladeAlpha = 0.85 + t * 0.15;
      } else if (anim.phase === "attacking") {
        // P4.1A.13: 用currentPos绘制，不再从startPos插值
        drawPos = anim.currentPos ?? { x: anim.endPos.x, y: anim.endPos.y };
        bladeAlpha = 0.92;
        bladeScale = 1;
        rot = anim.rotation;
      } else {
        // P4.1A.4: Outbound/Returning/Settling with non-linear easing
        const t = clamp(anim.phaseTimer / anim.phaseDuration, 0, 1);
        let eased: number;
        let targetRot = anim.rotation;
        if (anim.phase === "outbound") {
          // launchEase: 短暂蓄力→中段加速→接近收速
          if (t < 0.76) { const p = t / 0.76; eased = 0.88 * Math.pow(p, 2.6); }
          else { const p = (t - 0.76) / 0.24; eased = 0.88 + 0.12 * (1 - Math.pow(1 - p, 2)); }
          // 方向跟随速度
          targetRot = Math.atan2(anim.endPos.y - anim.startPos.y, anim.endPos.x - anim.startPos.x) + Math.PI / 2;
        } else if (anim.phase === "returning") {
          // returnEase: 短停→加速吸回→减速
          if (t < 0.12) { eased = 0.02 * (t / 0.12); }
          else if (t < 0.84) { const p = (t - 0.12) / 0.72; eased = 0.02 + 0.88 * Math.pow(p, 2.3); }
          else { const p = (t - 0.84) / 0.16; eased = 0.90 + 0.10 * (1 - Math.pow(1 - p, 3)); }
          // 回程留弧线偏移
          const arcDir = isLeft ? -1 : 1;
          const arcOff = Math.sin(t * Math.PI) * 20 * arcDir;
          drawPos = { x: anim.startPos.x + (anim.endPos.x - anim.startPos.x) * eased + arcOff, y: anim.startPos.y + (anim.endPos.y - anim.startPos.y) * eased };
          rot = Math.atan2(anim.endPos.y - (anim.startPos.y + arcOff), anim.endPos.x - anim.startPos.x) + Math.PI / 2;
          bladeAlpha = 0.92;
          bladeScale = 1;
          break; // skip the generic linear fallback below
        } else if (anim.phase === "settling") {
          // easeOutBack: 过冲回弹
          const overshoot = 1.7;
          const p2 = t - 1;
          eased = 1 + (overshoot + 1) * p2 * p2 * p2 + overshoot * p2 * p2;
          // settling后50%转回横向
          const baseHoriz = isLeft ? Math.PI / 2 : -Math.PI / 2;
          targetRot = t < 0.5 ? -Math.PI / 2 : -Math.PI / 2 + (-Math.PI / 2 - baseHoriz) * (t - 0.5) / 0.5;
        } else {
          eased = t;
        }
        drawPos = { x: anim.startPos.x + (anim.endPos.x - anim.startPos.x) * eased, y: anim.startPos.y + (anim.endPos.y - anim.startPos.y) * eased };
        rot = targetRot;
        bladeAlpha = 0.92;
        bladeScale = 1;
      }

      // P4.1A.4: 连接线统一使用槽位中心
      const slotLayout = this.getSubBladeSlotLayout(i);
      const ct = anim.phaseDuration > 0 ? clamp(anim.phaseTimer / anim.phaseDuration, 0, 1) : 0;
      const ph = anim.phase as string;
      const connAlpha2 = (ph === "cooldown" || ph === "idle" || ph === "ready") ? (ph === "ready" ? 0.42 : 0.18) : (ph === "arming" ? 0.72 : (ph === "returning" && ct >= 0.7 ? 0.20 + (ct - 0.7) / 0.3 * 0.35 : (ph === "settling" ? 0.60 - ct * 0.25 : 0)));
      const connWidth = anim.phase === "arming" ? 1.5 : 1;
      const connShadow = anim.phase === "idle" ? (this.subBladeTimers[i] >= this.subBladeCooldowns[i] ? 4 : 1) : (anim.phase === "arming" ? 8 : 0);
      ctx.save();
      ctx.strokeStyle = `rgba(${isLeft ? "91,192,255" : "181,140,255"},${connAlpha2})`;
      ctx.lineWidth = connWidth;
      ctx.setLineDash([3, 4]);
      ctx.shadowColor = baseColor;
      ctx.shadowBlur = connShadow;
      ctx.beginPath();
      ctx.moveTo(drawPos.x, drawPos.y + handleLen + 2);
      ctx.lineTo(slotLayout.centerX, slotLayout.centerY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // 飞刀主体
      ctx.save();
      ctx.translate(drawPos.x, drawPos.y);
      ctx.rotate(rot);
      ctx.scale(bladeScale, bladeScale);
      ctx.globalAlpha = bladeAlpha;

      ctx.shadowColor = baseColor;
      ctx.shadowBlur = (this.subBladeTimers[i] >= this.subBladeCooldowns[i]) ? 12 : (anim.phase === "idle" ? 3 : 8);

      // 刀身
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.moveTo(0, -bladeH);
      ctx.lineTo(-bladeW, 2);
      ctx.lineTo(0, bladeLen * 0.25);
      ctx.lineTo(bladeW, 2);
      ctx.closePath();
      ctx.fill();

      // 刀尖高光
      ctx.shadowBlur = 0;
      ctx.fillStyle = isLeft ? "#B8F4FF" : "#FFB45C";
      ctx.beginPath();
      ctx.moveTo(0, -bladeH);
      ctx.lineTo(-bladeW * 0.4, 2 - tipLen);
      ctx.lineTo(bladeW * 0.4, 2 - tipLen);
      ctx.closePath();
      ctx.fill();

      // 刀柄
      ctx.fillStyle = "#3a2818";
      ctx.beginPath();
      ctx.moveTo(-3, -handleLen);
      ctx.lineTo(3, -handleLen);
      ctx.lineTo(4, -2);
      ctx.lineTo(-4, -2);
      ctx.closePath();
      ctx.fill();

      // Ready 刀尖发光
      if (this.subBladeTimers[i] >= this.subBladeCooldowns[i] && anim.phase === "idle") {
        const tipPulse = 0.3 + Math.sin(this.elapsed * (isLeft ? 7.85 : 8.15)) * 0.3;
        ctx.shadowBlur = 0;
        ctx.fillStyle = isLeft ? "#B8F4FF" : "#FFB45C";
        ctx.beginPath();
        ctx.arc(0, -bladeH - 2, 2.5 + tipPulse * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private drawBladeTip(ctx: CanvasRenderingContext2D, pos: Vec2, angle: number, length: number, width: number, color: string, ratio: number) {
    const x2 = pos.x + Math.cos(angle) * length;
    const y2 = pos.y + Math.sin(angle) * length;
    const side = angle + Math.PI / 2;

    ctx.shadowColor = color;
    const lowFade = ratio <= BALANCE.slash.lowBladeRemainRatio ? 0.48 : 1;
    ctx.shadowBlur = (18 + width) * lowFade;
    const blade = ctx.createLinearGradient(pos.x, pos.y, x2, y2);
    blade.addColorStop(0, `rgba(255,255,255,${(0.36 + ratio * 0.54) * lowFade})`);
    blade.addColorStop(0.48, `rgba(255,233,151,${(0.28 + ratio * 0.55) * lowFade})`);
    blade.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = blade;
    ctx.beginPath();
    ctx.moveTo(pos.x + Math.cos(side) * width * 0.5, pos.y + Math.sin(side) * width * 0.5);
    ctx.quadraticCurveTo(
      pos.x + Math.cos(angle) * length * 0.45 + Math.cos(side) * width * 1.25,
      pos.y + Math.sin(angle) * length * 0.45 + Math.sin(side) * width * 1.25,
      x2,
      y2
    );
    ctx.quadraticCurveTo(
      pos.x + Math.cos(angle) * length * 0.45 - Math.cos(side) * width,
      pos.y + Math.sin(angle) * length * 0.45 - Math.sin(side) * width,
      pos.x - Math.cos(side) * width * 0.5,
      pos.y - Math.sin(side) * width * 0.5
    );
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `rgba(255,255,255,${(0.18 + ratio * 0.38) * lowFade})`;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, Math.max(5, width * 0.72), 0, Math.PI * 2);
    ctx.fill();
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const particle of this.particles) {
      const t = 1 - particle.life / particle.maxLife;
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);

      if (particle.kind === "ring") {
        ctx.globalAlpha = alpha * 0.7;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, particle.size * (0.3 + t * 0.7), 0, Math.PI * 2);
        ctx.stroke();
      } else if (particle.kind === "spark") {
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-particle.vx * 0.035, -particle.vy * 0.035);
        ctx.stroke();
      } else if (particle.kind === "smoke") {
        // 光晕粒子：半透明发光圆
        ctx.globalAlpha = alpha * 0.45;
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = particle.color;
        const r = particle.size * (0.5 + t * 0.5);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.fillStyle = particle.color;
        ctx.fillRect(-particle.size / 2, -particle.size / 3, particle.size, particle.size * 0.66);
      }

      ctx.restore();
    }
  }

  private drawDefenseAndWarrior(ctx: CanvasRenderingContext2D) {
    ctx.save();
    const energyRatio = this.energy / BALANCE.swordEnergy.max;
    const wall = ctx.createLinearGradient(0, WALL_TOP_Y, 0, DESIGN_HEIGHT);
    wall.addColorStop(0, "#57331f");
    wall.addColorStop(1, "#1f140f");
    ctx.fillStyle = wall;
    ctx.fillRect(0, WALL_TOP_Y, DESIGN_WIDTH, DESIGN_HEIGHT - WALL_TOP_Y);
    ctx.strokeStyle = "#d8a75d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, WALL_TOP_Y);
    ctx.lineTo(DESIGN_WIDTH, WALL_TOP_Y);
    ctx.stroke();
    if (energyRatio >= 0.9) {
      const pulse = 0.5 + Math.sin(this.elapsed * 6) * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(255, 222, 112, ${0.28 + pulse * 0.34})`;
      ctx.shadowColor = "#ffd35a";
      ctx.shadowBlur = 18 + pulse * 10;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, WALL_TOP_Y + 1);
      ctx.lineTo(DESIGN_WIDTH, WALL_TOP_Y + 1);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "#8a5d2e";
    // 顶部砖块：更不规则、更像墙
    for (let x = 4; x < DESIGN_WIDTH; x += 36) {
      ctx.fillRect(x, WALL_TOP_Y + 4, 28, 3);
    }
    // 第二层：错开半个位置
    for (let x = -12; x < DESIGN_WIDTH; x += 36) {
      ctx.fillRect(x, WALL_TOP_Y + 14, 28, 3);
    }
    ctx.restore();

    const cx = DESIGN_WIDTH / 2;
    const cy = BALANCE.battlefield.warriorY + 28;
    const stage = SWORD_STAGE_BY_ID[getBladeTier(this.energy)];
    const drawPulse = this.warriorDrawTimer > 0 ? 1 : 0;
    const sheathPulse = this.warriorSheathTimer > 0 ? 1 : 0;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = "lighter";
    // 弱化：仅在 >= 轻斩(0.1) 阶段显示能量气场
    if (energyRatio >= 0.1) {
      const auraCount = energyRatio >= 0.9 ? 3 : energyRatio >= 0.6 ? 2 : 1;
      for (let i = 0; i < auraCount; i += 1) {
        ctx.strokeStyle = stage.color;
        ctx.shadowColor = stage.color;
        ctx.shadowBlur = 4 + energyRatio * 8; // 减弱 12+28 → 4+8
        ctx.lineWidth = 1.5 + energyRatio * 2 - i * 0.4; // 减弱 4+7 → 1.5+2
        ctx.globalAlpha = (0.06 + energyRatio * 0.18) / (i + 1); // 减弱 0.16+0.46 → 0.06+0.18
        ctx.beginPath();
        ctx.arc(0, -12, 36 + energyRatio * 12 + i * 5 + Math.sin(this.elapsed * 5 + i) * 2, -Math.PI * 0.85, -Math.PI * 0.85 + energyRatio * Math.PI * 1.7);
        ctx.stroke();
      }
    }
    if (energyRatio >= 0.7) {
      // 仅在接近破阵斩时才有装饰性弧线
      for (let i = 0; i < 3; i += 1) {
        const angle = this.elapsed * 2.2 + i * Math.PI * 0.5;
        const r = 32 + energyRatio * 22 + Math.sin(this.elapsed * 4 + i) * 3;
        ctx.globalAlpha = 0.12 + energyRatio * 0.18;
        ctx.strokeStyle = stage.color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * r, -14 + Math.sin(angle) * r * 0.36);
        ctx.quadraticCurveTo(0, -40 - energyRatio * 14, Math.cos(angle + 0.7) * (r + 10), -12 + Math.sin(angle + 0.7) * r * 0.36);
        ctx.stroke();
      }
    }
    ctx.restore();

    if (this.drumTimer > 0 || this.nextSoul || this.nextOil) {
      // 顶部文字提示已迁移到右下角图标 — 此处保留空逻辑
    }

    ctx.translate(cx, cy);
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#21120d";
    ctx.beginPath();
    ctx.ellipse(0, 42, 56, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#17100d";
    this.paperCard(ctx, -22, -10, 44, 54);
    ctx.fill();
    ctx.strokeStyle = "#a8753f";
    ctx.stroke();
    ctx.fillStyle = "#d8a75d";
    ctx.beginPath();
    ctx.arc(0, -25, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#17100d";
    ctx.fillRect(-26, -39, 52, 10);
    ctx.fillRect(-14, -50, 28, 14);

    const bladeAngle = -0.95 + drawPulse * 0.46 - sheathPulse * 0.22;
    ctx.rotate(bladeAngle);
    ctx.strokeStyle = "#5b3b24";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(58, -8);
    ctx.stroke();

    ctx.strokeStyle = stage.color;
    ctx.shadowColor = stage.color;
    ctx.shadowBlur = 7 + energyRatio * 28;
    ctx.lineWidth = 3 + energyRatio * 5;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(60 + energyRatio * 24, -8 - energyRatio * 9);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 头顶心形：显示当前生命
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // 重置到屏幕坐标
    for (let i = 0; i < this.maxHp; i += 1) {
      const hx = cx + (i - (this.maxHp - 1) / 2) * 20;
      const hy = cy - 70;
      const alive = i < this.hp;
      const pulse = alive ? (1 + Math.sin(this.elapsed * 4 - i * 0.6) * 0.08) : 1;
      // 心形
      ctx.fillStyle = alive ? "#d64b3b" : "rgba(214, 75, 59, 0.18)";
      ctx.strokeStyle = alive ? "#ffd35a" : "rgba(255, 211, 90, 0.18)";
      ctx.lineWidth = 1;
      const size = 6 * pulse;
      ctx.beginPath();
      // 用心形曲线（两个半圆 + V型）
      const topY = hy;
      ctx.moveTo(hx, topY + 2);
      ctx.bezierCurveTo(hx - size * 1.4, topY - size * 0.8, hx - size * 1.4, topY + size * 0.4, hx, topY + size * 1.4);
      ctx.bezierCurveTo(hx + size * 1.4, topY + size * 0.4, hx + size * 1.4, topY - size * 0.8, hx, topY + 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore();

    // 右下角临时效果图标（鼓/魂/油）— 含圆形倒计时
    this.drawPickupBuffs(ctx);

    // P4.1A.3：副刀槽位使用统一布局（左紫/右紫+橙金强调）
    const leftSlot = this.getSubBladeSlotLayout(0);
    const rightSlot = this.getSubBladeSlotLayout(1);
    this.drawSubBladeSlot(ctx, 0, leftSlot.boxX, leftSlot.boxY, leftSlot.iconR, 0x5bc0ff);
    this.drawSubBladeSlot(ctx, 1, rightSlot.boxX, rightSlot.boxY, rightSlot.iconR, 0xb58cff);

    // 刀势三段能量条 —— 屏幕底部居中（窄条）
    const eBarW = 200;
    const eBarH = 14;
    const eBarX = (DESIGN_WIDTH - eBarW) / 2;
    const eBarY = DESIGN_HEIGHT - 36;
    const energyPct = this.energy / BALANCE.swordEnergy.max;
    const eTier = getBladeTier(this.energy);
    const eTierName = SWORD_STAGE_BY_ID[eTier]?.name ?? "蓄势";

    // 段位分界刻度（条下方对应位置的小三角）
    const tierMarks = [
      { pct: 0.10, color: "rgba(192, 208, 224, 0.6)" },  // 蓄势终点 → 轻斩
      { pct: 0.40, color: "rgba(91, 192, 255, 0.7)" },    // 轻斩终点 → 强斩
      { pct: 0.90, color: "rgba(255, 211, 90, 0.85)" },   // 强斩终点 → 破阵
    ];

    // 背景（深色实心，明确未填充区域）
    ctx.save();
    ctx.fillStyle = "rgba(10, 8, 6, 0.85)";
    ctx.strokeStyle = "rgba(255, 214, 124, 0.3)";
    ctx.lineWidth = 1;
    roundRect(ctx, eBarX, eBarY, eBarW, eBarH, 6);
    ctx.fill();
    ctx.stroke();

    // 段位色彩分层（极淡的色块作为背景刻度，仅作为视觉参考）
    const segColors = [
      { x0: 0, x1: 0.10, color: "rgba(192, 208, 224, 0.03)" },
      { x0: 0.10, x1: 0.40, color: "rgba(192, 208, 224, 0.04)" },
      { x0: 0.40, x1: 0.90, color: "rgba(91, 192, 255, 0.04)" },
      { x0: 0.90, x1: 1.00, color: "rgba(255, 211, 90, 0.05)" },
    ];
    for (const seg of segColors) {
      ctx.fillStyle = seg.color;
      ctx.fillRect(eBarX + eBarW * seg.x0, eBarY, eBarW * (seg.x1 - seg.x0), eBarH);
    }

    // 能量填充
    const fillX = eBarX;
    const fillW = eBarW * energyPct;
    if (fillW > 0) {
      // 渐变填充：从灰→青→金（按当前段位走色）
      const grad = ctx.createLinearGradient(fillX, 0, fillX + fillW, 0);
      const fillPct = energyPct;
      if (fillPct < 0.4) {
        grad.addColorStop(0, "#666");
        grad.addColorStop(1, "#c0d0e0");
      } else if (fillPct < 0.9) {
        grad.addColorStop(0, "#c0d0e0");
        grad.addColorStop(1, "#5bc0ff");
      } else {
        grad.addColorStop(0, "#5bc0ff");
        grad.addColorStop(1, "#ffd35a");
      }
      ctx.fillStyle = grad;
      ctx.shadowColor = eTier === "burst" ? "rgba(255, 211, 90, 0.8)" : eTier === "strong" ? "rgba(91, 192, 255, 0.6)" : "rgba(192, 208, 224, 0.4)";
      ctx.shadowBlur = eTier === "burst" ? 14 : 6;
      roundRect(ctx, fillX, eBarY, fillW, eBarH, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 段位分界点（条内部竖线）
    ctx.strokeStyle = "rgba(255, 211, 90, 0.45)";
    ctx.lineWidth = 1.5;
    for (const mark of tierMarks) {
      const mx = eBarX + eBarW * mark.pct;
      ctx.beginPath();
      ctx.moveTo(mx, eBarY + 1);
      ctx.lineTo(mx, eBarY + eBarH - 1);
      ctx.stroke();
    }

    // 段位分界刻度（条下方小三角，从左到右：蓄/轻/强/破）
    ctx.fillStyle = "#f6e7bd";
    for (let i = 0; i < tierMarks.length; i++) {
      const mark = tierMarks[i];
      const mx = eBarX + eBarW * mark.pct;
      ctx.beginPath();
      ctx.moveTo(mx - 3, eBarY + eBarH + 2);
      ctx.lineTo(mx + 3, eBarY + eBarH + 2);
      ctx.lineTo(mx, eBarY + eBarH + 6);
      ctx.closePath();
      ctx.fillStyle = mark.color;
      ctx.fill();
    }

    // 百分比 + 段位名（条下方居中）
    ctx.textAlign = "center";
    ctx.fillStyle = "#f6e7bd";
    ctx.font = '700 12px "Microsoft YaHei", sans-serif';
    const pctText = `${Math.floor(this.energy)}% ${eTierName}`;
    ctx.fillText(pctText, DESIGN_WIDTH / 2, eBarY - 4);

    // P4.1A.10：一刀斩"下一刀×2"小状态（仅oneBladeModeTimer>0时显示）
    if (this.oneBladeModeTimer > 0) {
      ctx.save();
      ctx.fillStyle = "#ff6a33";
      ctx.strokeStyle = "#ff8a45";
      ctx.lineWidth = 1;
      ctx.font = '800 14px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const labelX = eBarX + eBarW + 10;
      const labelY = eBarY;
      ctx.fillText("下一刀×2", labelX, labelY);
      ctx.restore();
    }

    ctx.restore();

    // 破阵就绪提示（移到屏幕顶部下方，与关卡文字分隔）
    if (eTier === "burst" && !this._breakReadyNotified) {
      this._breakReadyNotified = true;
      // V0715008 二次打磨：屏蔽"破阵斩已就绪！"飘字
      // this.addText(DESIGN_WIDTH / 2, 100, "破阵斩已就绪！", "#ffd35a", 20, 1.8);
      this.slowMoTimer = Math.max(this.slowMoTimer, 0.06);
    }
    ctx.restore();
  }

  /** 右下角临时效果图标：鼓/魂/油，含圆形旋转倒计时 */
  private drawPickupBuffs(ctx: CanvasRenderingContext2D) {
    const items: Array<{ key: string; label: string; color: string; ratio: number; active: boolean }> = [];
    if (this.drumTimer > 0) {
      const drumMax = PICKUP_BALANCE.drum.duration === "next_slash" ? 5 : Number(PICKUP_BALANCE.drum.duration) || 5;
      items.push({ key: "鼓", label: "鼓", color: "#ffb15c", ratio: this.drumTimer / drumMax, active: true });
    }
    if (this.nextSoul) items.push({ key: "魂", label: "魂", color: "#e9eef8", ratio: 1, active: true });
    if (this.nextOil) items.push({ key: "油", label: "油", color: "#f0a235", ratio: 1, active: true });

    if (items.length === 0) return;

    const itemSize = 30;
    const gap = 6;
    // 移到右上角（分数下方）
    const startX = DESIGN_WIDTH - 16;
    const startY = 60;

    ctx.save();
    items.forEach((item, idx) => {
      const ix = startX - itemSize - idx * (itemSize + gap);
      const iy = startY;

      // 暗色圆背景
      ctx.fillStyle = "rgba(18, 16, 14, 0.78)";
      ctx.beginPath();
      ctx.arc(ix + itemSize / 2, iy + itemSize / 2, itemSize / 2, 0, Math.PI * 2);
      ctx.fill();
      // 边框
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ix + itemSize / 2, iy + itemSize / 2, itemSize / 2, 0, Math.PI * 2);
      ctx.stroke();

      // 字符
      ctx.fillStyle = item.color;
      ctx.font = '800 13px "Microsoft YaHei", "SimHei", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = item.color;
      ctx.shadowBlur = 4;
      ctx.fillText(item.label, ix + itemSize / 2, iy + itemSize / 2);
      ctx.shadowBlur = 0;

      // 倒计时：旋转圆环
      if (item.ratio < 1) {
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + Math.PI * 2 * item.ratio;
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ix + itemSize / 2, iy + itemSize / 2, itemSize / 2 + 2, startAngle, endAngle);
        ctx.stroke();
      } else {
        // 永续效果：脉动圆
        const pulse = 0.6 + Math.sin(this.elapsed * 4) * 0.4;
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ix + itemSize / 2, iy + itemSize / 2, itemSize / 2 + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  /** 中场特性激活：敌人进入 y>=260 后触发特殊表现 */
  private activateMidfieldTrait(enemy: Enemy) {
    switch (enemy.kind) {
      case "powder":
        enemy.visualState = "powder_armed";
        enemy.flash = Math.max(enemy.flash, 0.1);
        break;
      case "core":
        enemy.visualState = "core_revealed";
        enemy.flash = Math.max(enemy.flash, 0.15);
        break;
      case "shield":
        enemy.visualState = "shield_ready";
        break;
      case "elite":
        enemy.visualState = "elite_warning";
        // 精英出场已在 updateEliteSpawn 中处理，此处增加进入中场后的光晕
        this.particles.push(glowParticle(enemy, "#ffd35a", 8, 4));
        break;
    }
  }

  /** 副刀槽位渲染（战士左右侧） */
  private drawSubBladeSlot(ctx: CanvasRenderingContext2D, slotIndex: number, x: number, y: number, iconR: number, color: number) {
    const blade = this.subBlades[slotIndex] ?? null;
    const colorStr = "#" + color.toString(16).padStart(6, "0");
    const slotType = slotIndex === 0 ? "蓄势" : "破点";
    const slotTypeIcon = slotIndex === 0 ? "斩" : "破";
    const timer = this.subBladeTimers[slotIndex] ?? 0;
    const cd = this.subBladeCooldowns[slotIndex] ?? 5;
    const ratio = blade ? Math.min(1, timer / cd) : 0;
    const ready = blade !== null && ratio >= 1;
    const cdSec = blade ? Math.max(0, Math.ceil(cd - timer)) : 0;

    ctx.save();

    // 槽位底框（实心填充圆盘，区别于老版本的"半填充"）
    ctx.fillStyle = "rgba(18, 16, 14, 0.92)";
    ctx.beginPath();
    ctx.arc(x + iconR, y + iconR, iconR + 1, 0, Math.PI * 2);
    ctx.fill();

    if (!blade) {
      ctx.strokeStyle = "rgba(255, 211, 90, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x + iconR, y + iconR, iconR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(246, 231, 189, 0.35)";
      ctx.font = '600 10px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("空", x + iconR, y + iconR + 4);
    } else {
      // 底圈
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x + iconR, y + iconR, iconR - 2, 0, Math.PI * 2);
      ctx.stroke();

      if (ready) {
        // Ready: 完整进度弧（360°）+ 脉冲双层环
        const pulse = 0.5 + Math.sin(this.elapsed * 6 + slotIndex * 2) * 0.5;
        ctx.strokeStyle = colorStr;
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(x + iconR, y + iconR, iconR - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2);
        ctx.stroke();
        // 脉冲光晕
        ctx.strokeStyle = colorStr;
        ctx.shadowColor = colorStr;
        ctx.shadowBlur = 6 + pulse * 6;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x + iconR, y + iconR, iconR - 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        // 冷却中：进度弧
        ctx.strokeStyle = colorStr;
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(x + iconR, y + iconR, iconR - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
        ctx.stroke();

        // CD 将好（最后 1 秒）: 多层脉冲 + 强烈发光
        if (ratio >= 0.85) {
          const flashPulse = Math.sin(this.elapsed * 12 + slotIndex * 3) * 0.5 + 0.5;
          const intensity = 0.5 + flashPulse * 0.5; // 0.5 → 1.0
          // 1) 外层大光环（最大 + 最亮）
          ctx.strokeStyle = colorStr;
          ctx.shadowColor = colorStr;
          ctx.shadowBlur = 10 + flashPulse * 16;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x + iconR, y + iconR, iconR + 4 + flashPulse * 3, 0, Math.PI * 2);
          ctx.stroke();
          // 2) 中层光环
          ctx.shadowBlur = 6 + flashPulse * 10;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x + iconR, y + iconR, iconR + 1, 0, Math.PI * 2);
          ctx.stroke();
          // 3) 填充发光底（透出亮色）
          ctx.fillStyle = colorStr;
          ctx.globalAlpha = 0.18 * intensity;
          ctx.beginPath();
          ctx.arc(x + iconR, y + iconR, iconR + 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.shadowBlur = 0;
        }
      }

      // 中心大字（"斩"/"破"）- 22px 是主元素
      ctx.fillStyle = colorStr;
      ctx.font = '900 22px "Microsoft YaHei", "SimHei", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(slotTypeIcon, x + iconR, y + iconR + 2);
      // 破槽位叠加 + 号（与破绽标记准星中心+号建立视觉关联）
      if (slotIndex === 1) {
        ctx.fillStyle = "#ff6a33";
        ctx.font = '900 13px "Microsoft YaHei", sans-serif';
        ctx.fillText("+", x + iconR + 13, y + iconR - 11);
      }
    }
    ctx.restore();

    // 槽位标签：CD态显示"X秒"，Ready态显示"可"，空状态显示"蓄势"/"破点"
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = colorStr;
    ctx.font = '700 11px "Microsoft YaHei", sans-serif';
    let label = slotType;
    if (blade && ready) {
      label = "可";
    } else if (blade) {
      label = `${cdSec}秒`;
      // CD 将好时标签闪烁 + 发光
      if (ratio >= 0.85) {
        const flashPulse = Math.sin(this.elapsed * 12 + slotIndex * 3) * 0.5 + 0.5;
        ctx.fillStyle = colorStr;
        ctx.shadowColor = colorStr;
        ctx.shadowBlur = 8 + flashPulse * 12;
        ctx.font = '900 12px "Microsoft YaHei", sans-serif';
      }
    }
    ctx.fillText(label, x + iconR, y + iconR * 2 + 6);
    ctx.restore();
  }

  /** P3.9：浮字绘制（描边 + 阴影） */
  private drawFloatingTexts(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const text of this.texts) {
      const alpha = clamp(text.life / text.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${text.size}px "Microsoft YaHei", sans-serif`;
      // 深色描边提高可读性
      ctx.lineWidth = Math.max(2, text.size * 0.16);
      ctx.strokeStyle = "rgba(10, 7, 5, 0.88)";
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 4;
      ctx.strokeText(text.text, text.x, text.y);
      ctx.fillStyle = text.color;
      ctx.fillText(text.text, text.x, text.y);
    }
    ctx.restore();
  }

  private drawBuffChoice(ctx: CanvasRenderingContext2D) {
    if (this.phase !== "buffChoice") return;
    ctx.save();
    ctx.fillStyle = "rgba(10, 7, 5, 0.72)";
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    ctx.textAlign = "center";
    ctx.fillStyle = "#fff3c0";
    ctx.font = '800 21px "Microsoft YaHei", sans-serif';
    ctx.fillText("选择一枚军令", DESIGN_WIDTH / 2, 148);
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = "rgba(246, 231, 189, 0.78)";
    ctx.fillText("改变这一局的刀势", DESIGN_WIDTH / 2, 172);

    if (this.buffChoicePause > 0) {
      ctx.fillStyle = "#ffd35a";
      ctx.font = '800 18px "Microsoft YaHei", sans-serif';
      ctx.fillText("军令将至", DESIGN_WIDTH / 2, 402);
      ctx.restore();
      return;
    }

    for (let index = 0; index < this.buffChoiceOptions.length; index += 1) {
      const buff = RUN_BUFF_BY_ID[this.buffChoiceOptions[index]];
      const rect = this.getBuffCardRect(index);
      ctx.save();
      ctx.translate(rect.x, rect.y);
      ctx.fillStyle = "rgba(30, 18, 10, 0.94)";
      ctx.strokeStyle = buff.color;
      ctx.lineWidth = 2;
      this.paperCard(ctx, 0, 0, rect.w, rect.h);
      ctx.fill();
      ctx.stroke();
      // 名称（唯一主标题）
      ctx.textAlign = "left";
      ctx.fillStyle = "#fff3c0";
      ctx.font = '800 18px "Microsoft YaHei", sans-serif';
      ctx.fillText(buff.name, 14, 40);
      // 描述
      ctx.fillStyle = "rgba(246, 231, 189, 0.72)";
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.fillText(buff.description, 14, 68);
      ctx.restore();
    }
    ctx.restore();
  }

  private drawRevivePause(ctx: CanvasRenderingContext2D) {
    if (this.phase !== "revive") return;
    ctx.save();
    ctx.fillStyle = "rgba(20, 5, 4, 0.48)";
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    ctx.fillStyle = "#fff3c0";
    ctx.font = '800 19px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("防线将破", DESIGN_WIDTH / 2, 246);
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = "rgba(246, 231, 189, 0.78)";
    ctx.fillText("看广告复活，立即释放强锋反击", DESIGN_WIDTH / 2, 272);
    ctx.restore();
  }

  private drawDebugPanel(ctx: CanvasRenderingContext2D) {
    if (!this.debugEnabled) return;
    const tier = getBladeTier(this.energy);
    const stage = getTierConfig(tier);
    const slash = this.currentSlash;
    // 计算各区域敌人数量
    const z = BATTLEFIELD_ZONES;
    const topCount = this.enemies.filter(e => e.alive && e.y < z.entryEndY).length;
    const entryCount = this.enemies.filter(e => e.alive && e.y >= z.entryEndY && e.y < z.midfieldStartY).length;
    const midCount = this.enemies.filter(e => e.alive && e.y >= z.midfieldStartY && e.y < z.harvestStartY).length;
    const harvestCount = this.enemies.filter(e => e.alive && e.y >= z.harvestStartY).length;
    const aliveCount = this.enemies.filter(e => e.alive).length;
    const avgTimeToMidfield = this._lastWaveElapsed > 0 ? (this.elapsed / Math.max(1, this.wavesSpawned)).toFixed(1) : "-";
    const lines = [
      `level: ${this.level.id}`,
      `phase: ${this.phase}`,
      `wave: ${Math.min(this.wavesSpawned, this.level.waves.length)}/${this.level.waves.length}`,
      `postWave: ${this.postChestWaveIndex}/${this.level.postChestWaves?.length ?? 0}`,
      `enemies: ${this.enemies.length} (alive: ${aliveCount})`,
      `energy: ${this.energy.toFixed(1)}`,
      `stage: ${stage.label}`,
      `slash stage: ${slash ? SWORD_STAGE_BY_ID[slash.tier].name : "-"}`,
      `--- V0715009 Debug ---`,
      `entryEndY: ${z.entryEndY}`,
      `midfieldStartY: ${z.midfieldStartY}`,
      `harvestStartY: ${z.harvestStartY}`,
      `Top: ${topCount}  Entry: ${entryCount}`,
      `Midfield: ${midCount}  Harvest: ${harvestCount}`,
      `Alive: ${aliveCount}`,
      `AvgTimeToMidfield: ${avgTimeToMidfield}s`,
      `eliteKilled: ${this.eliteKilled}`,
      `chestDone: ${this.chestDone}`,
      `allPostSpawned: ${this.allPostChestWavesSpawned}`,
      ...(this.bossController ? [
        `--- Boss Debug ---`,
        `Game Mode: ${this.gameMode}`,
        `Boss State: ${this.bossController.debugSnapshot["Boss State"]}`,
        `Input Locked: ${this.bossController.debugSnapshot["Input Locked"]}`,
        `Player Invuln: ${this.bossController.debugSnapshot["Player Invuln"]}`,
        `Alive Normal: ${this.enemies.filter(e => e.alive && e.kind !== "boss").length}`,
        `Boss HP: ${this.bossController.debugSnapshot["Boss HP"]}`,
        `Active Armor: ${this.bossController.debugSnapshot["Active Armor"]}`,
        `Armor Progress: ${this.bossController.debugSnapshot["Armor Progress"]}`,
      ] : []),
      `Sub0: ${this.subBladeAnim[0]?.phase ?? "-"} (t:${(this.subBladeAnim[0]?.phaseTimer ?? 0).toFixed(2)}/${(this.subBladeAnim[0]?.phaseDuration ?? 0).toFixed(2)})`,
      `Sub1: ${this.subBladeAnim[1]?.phase ?? "-"} (t:${(this.subBladeAnim[1]?.phaseTimer ?? 0).toFixed(2)}/${(this.subBladeAnim[1]?.phaseDuration ?? 0).toFixed(2)})`,
      `Sub0 target: ${this.subBladeAnim[0]?.targetId?.slice(0, 6) ?? "-"}`,
      `Sub1 target: ${this.subBladeAnim[1]?.targetId?.slice(0, 6) ?? "-"}`,
      `readyWait: ${(this.subBladeAnim[1]?.phaseTimer ?? 0).toFixed(2)}s`,
    ];

    ctx.save();
    const panelH = lines.length * 16 + 16;
    ctx.fillStyle = "rgba(13, 16, 17, 0.78)";
    ctx.fillRect(10, 82, 220, panelH);
    ctx.strokeStyle = "rgba(255, 214, 124, 0.36)";
    ctx.strokeRect(10, 82, 220, panelH);
    ctx.fillStyle = "#f6e7bd";
    ctx.font = '11px "Consolas", monospace';
    ctx.textAlign = "left";
    lines.forEach((line, index) => {
      ctx.fillStyle = line.startsWith("---") ? "#ffd35a" : "#f6e7bd";
      ctx.fillText(line, 18, 102 + index * 16);
    });
    ctx.restore();

    // 绘制区域参考线
    this.drawDebugZoneLine(ctx, z.entryEndY, "entryEndY=480", "#ff6a33");
    this.drawDebugZoneLine(ctx, z.midfieldStartY, "midfieldStartY=360", "#5bc0ff");
    this.drawDebugZoneLine(ctx, z.harvestStartY, "harvestStartY=560", "#9b6dff");
    this.drawDebugZoneLine(ctx, z.defenseLineY, "defenseLineY=720", "#ff3535");
  }

  private drawDebugZoneLine(ctx: CanvasRenderingContext2D, y: number, label: string, color: string) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(DESIGN_WIDTH, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.7;
    ctx.font = '10px "Consolas", sans-serif';
    ctx.textAlign = "left";
    ctx.fillText(label, 4, y - 3);
    ctx.restore();
  }

  private drawSplitFlashes(ctx: CanvasRenderingContext2D) {
    if (this.splitFlashes.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const sf of this.splitFlashes) {
      const alpha = sf.life / sf.maxLife;
      const x1 = sf.x - Math.cos(sf.angle) * sf.length * 0.5;
      const y1 = sf.y - Math.sin(sf.angle) * sf.length * 0.5;
      const x2 = sf.x + Math.cos(sf.angle) * sf.length * 0.5;
      const y2 = sf.y + Math.sin(sf.angle) * sf.length * 0.5;
      // 外层光晕
      ctx.strokeStyle = `rgba(255, 213, 112, ${alpha * 0.42})`;
      ctx.shadowColor = "#ffd35a";
      ctx.shadowBlur = 18 * alpha;
      ctx.lineWidth = 8 * alpha;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // 内层亮线
      ctx.strokeStyle = `rgba(255, 255, 238, ${alpha * 0.82})`;
      ctx.shadowBlur = 6;
      ctx.lineWidth = 2.5 * alpha;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawWaveProgress(ctx: CanvasRenderingContext2D) {
    // V0708008+ 屏蔽底部波次进度条（HUD 中已显示波次文本）
    return;
  }

  // ═══════════════════════════════════════════
  // 新系统：精英怪 / Boss / 军令宝箱 / HP成长
  // ═══════════════════════════════════════════

  /** 精英怪生成 */
  private updateEliteSpawn() {
    if (this.eliteSpawned || !this.level.eliteSpawnAt || !this.level.eliteKind) return;
    // 三次修正：等所有主波次全部刷完后才出精英（避免精英乱入）
    if (!this.allNormalWavesSpawned) return;

    // P3.2：精英预告（出场前 0.75 秒）
    if (!this.elitePreviewShown) {
      const previewLead = 0.75;
      if (this.elapsed >= this.level.eliteSpawnAt - previewLead && this.elapsed < this.level.eliteSpawnAt) {
        this.elitePreviewShown = true;
        // P4.2A.1: 精英预览文字已删除，出场使用showBattleNotice
      }
    }

    if (this.elapsed < this.level.eliteSpawnAt) return;
    this.eliteSpawned = true;
    const ek = this.level.eliteKind;
    const conf = ELITE_CONFIG[ek];
    // 在随机列生成
    // P2.7：精英安全区（远离左边缘）
    const eliteLanes = [BATTLE_SAFE_X.eliteMin, 152, 188, BATTLE_SAFE_X.eliteMax];
    const lane = eliteLanes[Math.floor(Math.random() * eliteLanes.length)];
    // 第五轮修正：精英使用专用 profile，不压太深
    const eliteY = ENTRY_PROFILE_ELITE.spawnY;
    const enemy = this.createElite(ek, lane, eliteY, conf);
    this.enemies.push(enemy);
    this.discoveredEnemies.add("elite");
    // 出场播报（0.85秒）
    // P4.2A.3: 精英播报使用noticeTitle（不超过8字）
    this.showBattleNotice({ text: conf.noticeTitle, priority: "A", category: "elite", style: "purple", duration: 0.85, dedupeKey: `elite:${ek}`, cooldown: 3, interrupt: false });
    // P3.2：标记已播报出场
    this.eliteSpawnAnnounced = true;
    // 出场特效强化
    this.screenShake = Math.max(this.screenShake, 0.6);
    this.flash = Math.max(this.flash, 0.5);
    // 全屏光柱粒子
    for (let i = 0; i < 8; i++) {
      this.particles.push(glowParticle(
        { x: lane + (Math.random() - 0.5) * 60, y: BALANCE.battlefield.enemySpawnY + (Math.random() - 0.5) * 40 },
        conf.color, 18 + Math.random() * 16, 40 + Math.random() * 20
      ));
    }
    // 向外扩散的光圈
    this.particles.push(ringParticle({ x: lane, y: BALANCE.battlefield.enemySpawnY + 14 }, conf.color, 75));
    logEvent("elite_spawn", { levelId: this.level.id, eliteKind: ek, time: this.elapsed });
  }

  /** Boss生成 */
  private updateBossSpawn() {
    // 原 debugBossOverride 参数已移除（突破配置改为直接使用 thunderGeneral）
    if (this.bossSpawned || !this.level.bossId) return;
    const isChallengeBreakthrough = this.currentRunMode === "challenge";
    if (isChallengeBreakthrough) {
      if (this.elapsed < 0.5) return;
      this.bossSpawned = true;
    } else {
      if (this.wavesSpawned < this.level.waves.length) return;
      if (this.elapsed < this.wavesFinishedAt + 5) return;
      this.bossSpawned = true;
    }
    const bid = this.level.bossId;

    // P4.4A.1-R2: thunderGeneral 使用新 BossController 系统
    if (bid === "thunderGeneral") {
      // P4.4A.1-R3: 切换游戏模式
      this.gameMode = "boss";
      // 清空场上所有非Boss敌人
      for (const e of this.enemies) { e.alive = false; }
      this.enemies = [];
      // 重置指针/副刀状态
      this.pointerDown = false;
      this.pendingSlash = null;
      this.currentSlash = undefined;
      for (let i = 0; i < 2; i++) {
        if (this.subBladeAnim[i]) this.subBladeAnim[i].phase = "idle";
      }
      // 清空波次/子队列/事件
      this.wavesSpawned = 0;
      this.subSpawnQueue = [];

      // 创建 Boss Enemy（可见位置，供刀路碰撞检测用）
      const enemy = this.createBoss(bid);
      enemy.y = 195; // 可见位置（BossController 同名坐标）
      this.enemies.push(enemy);

      // 创建并启动 BossController
      this.bossController = new BossController(bid);
      this.bossController.enterLoading();
      this.discoveredEnemies.add("boss");
      this.screenShake = Math.max(this.screenShake, 0.6);
      this.flash = Math.max(this.flash, 0.5);
      logEvent("boss_spawn", { levelId: this.level.id, bossId: bid, time: this.elapsed });
      return;
    }

    // 原有Boss系统（yaoWang/moXiu/huaYao）
    const bossId = bid as import("../game/types").BossId;
    const enemy = this.createBoss(bossId);
    this.enemies.push(enemy);
    this.discoveredEnemies.add("boss");
    const bossIntroTitle = BOSS_CONFIG[bossId].noticeTitle ?? BOSS_CONFIG[bossId].name;
    this.showBattleNotice({ text: bossIntroTitle, subtext: BOSS_CONFIG[bossId].noticeSubtitle, layout: "boss-intro", priority: "S", category: "boss", style: "danger", duration: 1.8, dedupeKey: `boss-intro:${bossId}`, cooldown: 10, interrupt: true });
    this.phase = "playing";
    this.screenShake = Math.max(this.screenShake, 0.8);
    this.flash = Math.max(this.flash, 0.65);
    this.particles.push(glowParticle({ x: DESIGN_WIDTH / 2, y: BALANCE.battlefield.enemySpawnY }, BOSS_CONFIG[bossId].color, 40, 80));
    logEvent("boss_spawn", { levelId: this.level.id, bossId: bossId, time: this.elapsed });
  }

  /** 精英怪技能更新 */
  private updateEliteSkills(dt: number) {
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.kind !== "elite" || !enemy.eliteKind) continue;
      const conf = ELITE_CONFIG[enemy.eliteKind];

      if (enemy.eliteKind === "fireRing") {
        // 火环将：三团火焰环绕，自动伤害触碰的刀芒
        // 实际判定在slash中处理，此处仅更新视觉计时器
        enemy.skillTimer = (enemy.skillTimer ?? 0) + dt;
      }

      if (enemy.eliteKind === "heal") {
        // 回血将：每3秒释放波纹
        enemy.skillTimer = (enemy.skillTimer ?? 0) + dt;
        if (enemy.skillTimer >= conf.skillCooldown) {
          enemy.skillTimer = 0;
          const radius = 120;
          this.particles.push(ringParticle(enemy, conf.color, radius));
          this.particles.push(...sparkBurst(enemy, 8, conf.color));
          this.addText(enemy.x, enemy.y - 30, "续命波纹", conf.color, 14, 0.6);
          // 回血范围内所有敌军
          for (const target of this.enemies) {
            if (!target.alive || target === enemy || distance(target, enemy) > radius) continue;
            const originalHp = ENEMY_BALANCE[target.kind as EnemyKind]?.hp ?? 1;
            target.hp = Math.min(target.hp + 1, originalHp);
            target.flash = 0.2;
          }
        }
      }

      if (enemy.eliteKind === "aura") {
        // 氛围将：实时计算护盾（降低难度：1+others/2, max 4）
        const aliveOthers = this.enemies.filter(e => e.alive && e !== enemy && e.kind !== "elite" && e.kind !== "boss").length;
        enemy.skillTimer = Math.min(4, 1 + Math.floor(aliveOthers / 2));
      }
    }
  }

  /** Boss技能更新 */
  private updateBossSkills(dt: number) {
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.kind !== "boss" || !enemy.bossId) continue;
      // P4.4A: thunderGeneral 由 BossController 管理
      if (enemy.bossId === "thunderGeneral") continue;
      const conf = BOSS_CONFIG[enemy.bossId];
      const prevPhase = enemy.bossPhase ?? 0;
      const newPhase = getBossPhase(conf, enemy.hp);

      // 阶段切换检测
      if (newPhase !== prevPhase) {
        enemy.bossPhase = newPhase;
        enemy.flash = 0.5;
        this.screenShake = Math.max(this.screenShake, 0.6);
        this.flash = Math.max(this.flash, 0.55);
        // P4.2A.2: Boss阶段使用BattleNotice + 清除旧阶段
        const phaseConf = conf.phases[newPhase];
        const phaseTitle = phaseConf.noticeTitle;
        if (phaseTitle) {
          this.clearBossNoticeScope(enemy.id);
          // P4.2A.3: Boss阶段计算安全Y（与血条保持间距）
          const bossBarTop = enemy.y - enemy.radius - 36;
          const safeNoticeY = clamp(bossBarTop - 92, 150, 185);
          this.showBattleNotice({ text: phaseTitle, subtext: phaseConf.noticeSubtitle, layout: "boss-phase", anchorY: safeNoticeY, priority: "S", category: "boss", style: "danger", duration: 1.25, dedupeKey: `boss-phase:${enemy.id}:${newPhase}`, cooldown: 3, interrupt: true });
        }
        AudioService.oneBladeBreak();
      }

      // 更新阶段属性
      const phase = conf.phases[newPhase];
      enemy.speed = conf.speed * phase.speedMultiplier;
      enemy.hpDamage = phase.defenseDamage;

      // 技能冷却
      enemy.skillCooldown = (enemy.skillCooldown ?? 0) + dt;

      if (enemy.bossId === "yaoWang") {
        // 妖兽咆哮：碰到的刀芒损耗能量
        if (enemy.skillCooldown >= conf.skill.cooldown) {
          // 怒吼视觉
          this.particles.push(ringParticle(enemy, conf.color, 80));
          this.screenShake = Math.max(this.screenShake, 0.45);
          enemy.skillCooldown = 0;
        }
      }

      if (enemy.bossId === "moXiu") {
        if (enemy.skillCooldown >= conf.skill.cooldown) {
          enemy.skillCooldown = 0;
          // 瞬移到随机列
          const lanes = [BATTLE_SAFE_X.extendedMin, 120, 168, 216, 264, BATTLE_SAFE_X.extendedMax];
          const newX = lanes[Math.floor(Math.random() * lanes.length)];
          this.particles.push(glowParticle(enemy, conf.accentColor, 20, 40));
          this.particles.push(...sparkBurst(enemy, 12, conf.accentColor));
          enemy.x = newX;
          this.particles.push(glowParticle({ x: newX, y: enemy.y }, conf.accentColor, 20, 40));
          this.addText(enemy.x, enemy.y - 30, "隐遁", conf.accentColor, 16, 0.8);
          // 绝命前无敌（标记为闪白）
          if (newPhase === 0) enemy.flash = 0.5;
        }
      }

      if (enemy.bossId === "huaYao") {
        if (enemy.skillCooldown >= conf.skill.cooldown) {
          enemy.skillCooldown = 0;
          // 释放花瓣小兵
          const miniCount = newPhase === 0 ? 3 : newPhase === 1 ? 5 : 6;
          for (let i = 0; i < miniCount; i++) {
            const mx = enemy.x + (Math.random() - 0.5) * 120;
            const my = enemy.y - 10 - Math.random() * 20;
            const mini: Enemy = {
              id: this.nextId("petal"),
              kind: "infantry", // 标准步兵视觉
              x: mx, y: my,
              radius: 12,
              hp: 1, maxHp: 1,
              speed: 25,
              hpDamage: 0, // 不给能量
              score: 0,
              energyGain: 0, // ❌ 不给能量
              alive: true,
              ignited: false,
              marked: false,
              shieldCrack: 0,
              flash: 0.2,
              wobble: Math.random() * Math.PI * 2,
              slowedTimer: 0
            };
            this.enemies.push(mini);
          }
          this.particles.push(ringParticle(enemy, conf.accentColor, 80));
          this.particles.push(...sparkBurst(enemy, 16, conf.accentColor));
          this.addText(enemy.x, enemy.y - 30, "花葬", conf.accentColor, 18, 1);
        }

        // 花之殇最终阶段：触发百花葬
        if (newPhase === 2 && enemy.skillTimer === undefined) {
          enemy.skillTimer = 0; // 标记已触发
          // 清空全场小兵
          const cleared = this.enemies.filter(e => e.alive && e.kind === "infantry" && e.energyGain === 0);
          for (const mini of cleared) {
            mini.alive = false;
            this.particles.push(...paperBurst(mini, 8, ["#fadbd8", "#e74c3c"]));
          }
          this.enemies = this.enemies.filter(e => e.alive);
          this.flash = Math.max(this.flash, 1);
          this.screenShake = Math.max(this.screenShake, 1);
          this.addText(DESIGN_WIDTH / 2, 200, "百花葬！— 一刀清场", "#e74c3c", 28, 1.8);
          AudioService.victory();
        }
      }
    }
  }

  /** P4.4A: Boss控制器更新 */
  private updateBossController(dt: number) {
    if (!this.bossController) return;
    this.bossController.update(dt);
    // thunderGeneral 不进入旧Boss技能系统
  }

  /** 创建精英怪 */
  private createElite(kind: EliteKind, x: number, y: number, conf: import("./config/elites").EliteConfig): Enemy {
    return {
      id: this.nextId("elite"),
      kind: "elite",
      eliteKind: kind,
      x, y,
      radius: conf.radius,
      hp: conf.maxHp,
      maxHp: conf.maxHp,
      speed: conf.speed,
      hpDamage: conf.defenseDamage,
      score: conf.score,
      energyGain: conf.energyGain,
      alive: true,
      ignited: false,
      marked: false,
      shieldCrack: 0,
      flash: 0.5,
      wobble: 0,
      slowedTimer: 0,
      skillTimer: 0,
      skillCooldown: 0,
      // 第五轮修正：精英使用专用 entry profile（不压太深）
      entryPhase: {
        active: true,
        endY: ENTRY_PROFILE_ELITE.entryEndY,
        speedMultiplier: ENTRY_PROFILE_ELITE.entryMultiplier,
        maxDuration: ENTRY_PROFILE_ELITE.entryMaxDuration,
        elapsed: 0,
        completed: false
      }
    };
  }

  /** 创建Boss */
  private createBoss(id: BossId): Enemy {
    const conf = BOSS_CONFIG[id];
    const cx = DESIGN_WIDTH / 2;
    return {
      id: this.nextId("boss"),
      kind: "boss",
      bossId: id,
      x: cx,
      y: BALANCE.battlefield.enemySpawnY,
      radius: conf.radius,
      hp: conf.maxHp,
      maxHp: conf.maxHp,
      speed: conf.speed,
      hpDamage: conf.defenseDamage,
      score: conf.score,
      energyGain: conf.energyGain,
      alive: true,
      ignited: false,
      marked: false,
      shieldCrack: 0,
      flash: 1,
      wobble: 0,
      slowedTimer: 0,
      bossPhase: 0,
      skillTimer: 0,
      skillCooldown: 0
    };
  }

  /** 军令宝箱：精英死亡后掉落 */
  private startChestDrop(x: number, y: number) {
    this.chestDropped = true;
    this.chestDropX = x;
    this.chestDropY = y;
    this.chestDropTimer = 0;
    this.chestOpening = false;
    this.chestOpened = false;
    this.chestAnimTimer = 0;
    this.chestBuffResult = null;
    this.chestAutoConfirmAt = 0;
    this.chestBuffRevealed = false;
    // 宝箱坠落特效（强化）
    this.particles.push(glowParticle({ x, y }, "#ffd35a", 24, 55));
    this.particles.push(glowParticle({ x: x - 12, y: y + 6 }, "#ffd67c", 16, 40));
    this.particles.push(glowParticle({ x: x + 12, y: y + 6 }, "#ffd67c", 16, 40));
    this.particles.push(ringParticle({ x, y: y + 10 }, "#ffd35a", 50));
    for (let i = 0; i < 6; i++) {
      this.particles.push(...sparkBurst({ x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 10 }, 4, "#ffd35a"));
    }
    this.screenShake = Math.max(this.screenShake, 0.3);
    this.flash = Math.max(this.flash, 0.2);
    this.addText(x, y - 22, "军令宝箱", "#ffd35a", 18, 2.0);
  }

  /** 随机抽取一个军令（第一关使用固定Buff） */
  private getRandomBuff(): BuffId {
    if (this.level.chestBuffId) return this.level.chestBuffId as BuffId;
    const all = RUN_BUFFS.map(b => b.id);
    return all[Math.floor(Math.random() * all.length)];
  }

  /** 第六轮修正：统一精英宝箱掉落入口（主刀/副刀/触底共用） */
  /** P3.6：精英死亡触发宝箱（三重防重复） */
  private triggerEliteChestDrop(enemy: Enemy) {
    if (this.edictRewardStarted || this.chestDropped || this.chestDone) {
      console.warn("[edict duplicate blocked]", { edictRewardStarted: this.edictRewardStarted, chestDropped: this.chestDropped, chestDone: this.chestDone, time: this.elapsed });
      return;
    }
    if (this.edictRewardState !== "none") {
      console.warn("[edict duplicate chest drop blocked]", { state: this.edictRewardState, time: this.elapsed });
      return;
    }
    if (enemy.kind !== "elite" || !enemy.eliteKind) return;

    this.killedElites.push(enemy.eliteKind);
    this.stats.killedElites = [...this.killedElites];
    this.eliteKilled = true;

    this.startChestDrop(enemy.x, enemy.y - 10);
    this.particles.push(glowParticle(enemy, "#ffd35a", 25, 50));
    this.addText(enemy.x, enemy.y - 40, "宝箱掉落！", "#ffd35a", 18, 1.6);
    // P3.11：精简文本，只保留"军令降临"一条

    this.autoChestResolveAt = this.elapsed + 0.55;
    // 精英死亡强反馈
    this.triggerHitStop(0.22, 0.08, true);
    this.triggerSlashAfterglow(0.9, 0.28);
    this.triggerEdgeFlash(0.85, 0.30);
    this.screenShake = Math.max(this.screenShake, 0.24);
    this.particles.push(ringParticle(enemy, "#ffd35a", 42));

    this.chestDropped = true;
    this.edictRewardStarted = true;
    this.setEdictRewardState("dropped", "elite killed");
  }

  /** 第六轮修正：副刀/系统伤害造成的敌人死亡处理（确保精英走宝箱流程） */
  private handleDirectEnemyKilledBySystem(enemy: Enemy, source: "sub_momentum" | "sub_weakpoint" | "chain" | "system") {
    if (!enemy.alive) return;
    enemy.alive = false;
    this.score += enemy.score;
    this.stats.kills += 1;

    if (enemy.kind === "elite" && enemy.eliteKind && !this.chestDropped) {
      this.triggerEliteChestDrop(enemy);
    }

    // P3.10：分裂怪击杀统一处理
    if (enemy.kind === "splitter") {
      this.handleSplitterKilled(enemy, source);
    }
    // P3：牵引兵预警击杀反馈
    if (enemy.kind === "tractor" && enemy.tractorState === "charging") {
      this.addText(enemy.x, enemy.y - 28, "断引！", "#8fdcff", 16, 0.7);
      this.particles.push(ringParticle(enemy, "#8fdcff", 22));
    }
  }

  /** P3.5：弹出宝箱军令弹窗（由状态机统一管理） */
  private autoResolveEliteChestReward() {
    if (this.edictRewardState !== "dropped") return;
    if (!this.chestDropped && !this.eliteKilled) return;

    this.chestOpening = false;
    this.chestOpened = true;
    this.chestBuffRevealed = true;
    this.chestBuffResult = "chest_first_clear";
    this.chestPendingConfirm = true;

    if (!this.setEdictRewardState("modal", "open chest modal")) return;

    this.addText(DESIGN_WIDTH / 2, 150, "军令降临", "#ffd35a", 24, 1.2);
    this.screenShake = Math.max(this.screenShake, 0.25);
  }

  /** 兼容旧调用名（仍被 update 中 autoChestResolveAt 调用） */
  private autoResolveFirstLevelChestReward() {
    this.autoResolveEliteChestReward();
  }

  private applyChestBuff(id: BuffId) {
    this.runBuffs.add(id);
    const buff = RUN_BUFF_BY_ID[id];

    // 第一关固定宝箱Buff：刀势回涌 + 副刀共鸣
    if (id === "chest_first_clear") {
      this.energy = Math.min(100, this.energy + 70);
      // P4.1A.14: 两把副刀CD清零（冷却态→立即Ready，攻击中→归位后Ready）
      this.grantSubBladeReady();
      // 三次修正：刀势回涌持续到关卡结束（用独立 flag，不显示"鼓"图标）
      this.chestMomentumTimer = Math.max(this.chestMomentumTimer, 120);
      this.selectedRoutes.push("scorch" as any);
      // 刀势回涌特效
      for (let i = 0; i < 3; i++) {
        this.particles.push(glowParticle({ x: DESIGN_WIDTH / 2, y: 800 }, "#5bc0ff", 24 + Math.random() * 10, 40));
      }
      this.addText(DESIGN_WIDTH / 2, 150, "刀势回涌！副刀共鸣！", "#ffd35a", 22, 2.0);
      this.addText(DESIGN_WIDTH / 2, 176, "12秒内刀势恢复+30%", "#5bc0ff", 14, 1.8);
      this.flash = Math.max(this.flash, 0.8);
      this.screenShake = Math.max(this.screenShake, 0.5);
      for (let i = 0; i < 6; i++) {
        this.particles.push(glowParticle({ x: 60, y: 768 + i * 10 }, "#5bc0ff", 15, 30));
        this.particles.push(glowParticle({ x: DESIGN_WIDTH - 60, y: 768 + i * 10 }, "#ff6a33", 15, 30));
      }
      AudioService.buffSelect();
      return;
    }

    this.selectedRoutes.push(buff.route);

    // 堅城：HP+1
    if (id === "fortress") {
      this.maxHp = Math.min(BALANCE.player.maxHp + 1, this.maxHp + 1);
      this.hp = Math.min(this.maxHp, this.hp + 1);
    }

    this.addText(DESIGN_WIDTH / 2, 148, `军令·${buff.name}`, buff.color, 22, 2);
    this.flash = Math.max(this.flash, 0.6);
    this.screenShake = Math.max(this.screenShake, 0.35);

    logEvent("buff_chest", { levelId: this.level.id, time: this.elapsed, selectedBuff: id, route: buff.route });
    AudioService.buffSelect();
  }

  /** 宝箱自动打开更新 */
  /** P3.7：宝箱掉落仅作为状态机兜底，不再创建第二套弹窗 */
  private updateChestDrop(dt: number) {
    if (!this.chestDropped || this.chestDone) return;

    this.chestDropTimer += dt;

    // 兜底：状态机卡在 dropped 超时后自动打开弹窗
    if (this.edictRewardState === "dropped" && this.chestDropTimer >= 1.2) {
      console.warn("[edict fallback] dropped state timeout, opening canonical modal", { time: this.elapsed, chestDropTimer: this.chestDropTimer });
      this.autoResolveEliteChestReward();
    }
  }

  /** P2.9：玩家确认宝箱军令——委托 confirmEliteChestReward */
  public confirmChestBuff() {
    if (!this.chestPendingConfirm) return;
    this.confirmEliteChestReward();
  }

  /** P3：分裂兵预警绘制 */
  private drawSplitterWarning(ctx: CanvasRenderingContext2D, enemy: Enemy) {
    if (enemy.kind !== "splitter" || enemy.splitState !== "warning") return;
    const timer = enemy.splitTimer ?? 0;
    const ratio = clamp(timer / SPLITTER_CONFIG.chargeDuration, 0, 1);
    const danger = ratio <= 0.25;
    const pulse = 0.5 + Math.sin(this.elapsed * (danger ? 16 : 8)) * 0.5;
    ctx.save();
    ctx.strokeStyle = danger
      ? `rgba(255, 80, 40, ${0.7 + pulse * 0.3})`
      : `rgba(255, 160, 70, ${0.45 + pulse * 0.25})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, -enemy.radius * 0.7);
    ctx.lineTo(3, -4);
    ctx.lineTo(-2, 6);
    ctx.lineTo(5, enemy.radius * 0.65);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 180, 80, 0.9)";
    ctx.lineWidth = 2;
    ctx.arc(0, -enemy.radius - 10, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - ratio));
    ctx.stroke();
    if (danger) {
      ctx.fillStyle = "#ff5a3d";
      ctx.font = '900 12px "Microsoft YaHei", "SimHei", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", 0, -enemy.radius - 10);
    }
    ctx.restore();
  }

  /** P3：牵引兵连接线绘制 */
  private drawTractorLinks(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const enemy of this.enemies) {
      if (enemy.kind !== "tractor" || !enemy.alive) continue;
      if (enemy.tractorState !== "charging" && enemy.tractorState !== "pulling") continue;
      const targets = (enemy.tractorTargetRefs ?? []).filter(e => e.alive);
      if (targets.length === 0) continue;
      const isPulling = enemy.tractorState === "pulling";
      const pulse = 0.5 + Math.sin(this.elapsed * (isPulling ? 12 : 6)) * 0.5;
      for (const target of targets) {
        ctx.strokeStyle = isPulling
          ? `rgba(120, 220, 255, ${0.55 + pulse * 0.35})`
          : `rgba(120, 220, 255, ${0.25 + pulse * 0.2})`;
        ctx.lineWidth = isPulling ? 2.5 : 1.5;
        ctx.setLineDash(isPulling ? [] : [4, 4]);
        ctx.beginPath();
        ctx.moveTo(enemy.x, enemy.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = `rgba(120, 220, 255, ${0.35 + pulse * 0.3})`;
        ctx.arc(target.x, target.y - target.radius - 4, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  private _chestFlyStart = { x: 0, y: 0 };
  private _chestBuffStartScale = 1;
  private _chestBuffEndScale = 0.32;

  /** @deprecated 军令飞行完成统一由 updateEdictIconFly 驱动 */
  public finishChestFly() {
    console.warn("[deprecated] finishChestFly ignored");
  }

  /** 绘制军令宝箱 */
  private drawChestDrop(ctx: CanvasRenderingContext2D) {
    if (!this.chestDropped || this.chestDone) return;

    // 1) 飞行中：画从中心飞向左上角的小图标
    if (this.chestFlying && this.chestBuffResult) {
      const buff = RUN_BUFF_BY_ID[this.chestBuffResult];
      if (buff) {
        // 缓出曲线
        const t = this.chestFlyT;
        const easeT = 1 - Math.pow(1 - t, 2);
        const curX = this._chestFlyStart.x + (this.chestFlyTarget.x - this._chestFlyStart.x) * easeT;
        const curY = this._chestFlyStart.y + (this.chestFlyTarget.y - this._chestFlyStart.y) * easeT;
        // 弧形轨迹：中段向上拱
        const arcOffset = Math.sin(t * Math.PI) * -40;
        const finalX = curX;
        const finalY = curY + arcOffset;
        // 缩放
        const scale = this._chestBuffStartScale + (this._chestBuffEndScale - this._chestBuffStartScale) * easeT;
        const radius = 22 * scale;
        ctx.save();
        ctx.translate(finalX, finalY);
        // 拖尾
        for (let i = 0; i < 4; i++) {
          const trailT = i * 0.08;
          const tt = Math.max(0, t - trailT);
          const et = 1 - Math.pow(1 - tt, 2);
          const tx = this._chestFlyStart.x + (this.chestFlyTarget.x - this._chestFlyStart.x) * et;
          const ty = this._chestFlyStart.y + (this.chestFlyTarget.y - this._chestFlyStart.y) * et + Math.sin(tt * Math.PI) * -40;
          ctx.fillStyle = `${buff.color}${i === 0 ? "AA" : i === 1 ? "77" : i === 2 ? "44" : "22"}`;
          ctx.beginPath();
          ctx.arc(tx - finalX, ty - finalY, radius * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        // 主圆
        ctx.shadowColor = buff.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = buff.color;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // 字符
        ctx.fillStyle = "#fff";
        ctx.font = `900 ${Math.round(22 * scale)}px "Microsoft YaHei", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(buff.name.charAt(0), 0, 1);
        ctx.restore();
      }
      return;
    }

    // 2) 揭示后等待确认：在屏幕中央绘制大图标
    // P3.13：旧确认绘制已删除，军令弹窗唯一由 drawEdictRewardModal 绘制

    // 3) 默认流程：落点处绘制（开箱前/开箱中）
    const cx = this.chestDropX;
    const cy = this.chestDropY - (this.chestOpening ? 8 : 0);

    // 落点光环：金色波纹
    const ringT = (this.chestDropTimer * 2) % 1;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 211, 90, ${1 - ringT * 0.8})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 8 + ringT * 60, 0, Math.PI * 2);
    ctx.stroke();
    const ringT2 = (this.chestDropTimer * 2 + 0.5) % 1;
    ctx.strokeStyle = `rgba(255, 158, 122, ${1 - ringT2 * 0.8})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 8 + ringT2 * 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);

    if (!this.chestOpened) {
      // 未打开：金色箱子
      const pulse = 1 + Math.sin(this.chestDropTimer * 3) * 0.08;
      ctx.scale(pulse, pulse);
      ctx.shadowColor = "#ffd35a";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "#8b6914";
      ctx.strokeStyle = "#ffd35a";
      ctx.lineWidth = 2.5;
      ctx.fillRect(-22, -10, 44, 24);
      ctx.strokeRect(-22, -10, 44, 24);
      ctx.fillStyle = "#a07d1a";
      ctx.beginPath();
      ctx.moveTo(-24, -12);
      ctx.lineTo(0, -22);
      ctx.lineTo(24, -12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffd35a";
      ctx.fillRect(-4, -4, 8, 5);
      ctx.fillStyle = "#8b6914";
      ctx.fillRect(-1, -1, 2, 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff3c0";
      ctx.font = '700 12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(`${Math.ceil(3 - this.chestDropTimer)}s`, 0, 32);
    } else if (!this.chestBuffRevealed) {
      // 已打开但军令未揭示：旋转的金色符文
      const spinAngle = this.chestAnimTimer * 6;
      ctx.save();
      ctx.rotate(spinAngle);
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 2);
        ctx.fillStyle = "#ffd35a";
        ctx.fillRect(15, -2, 8, 4);
        ctx.restore();
      }
      ctx.restore();
      ctx.fillStyle = "#ffd35a";
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8b6914";
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 顶部"军令宝箱"标题（未开箱时）
    if (!this.chestOpened) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd35a";
      ctx.shadowColor = "#ffd35a";
      ctx.shadowBlur = 8;
      ctx.font = '700 13px "Microsoft YaHei", sans-serif';
      ctx.fillText("军令宝箱", cx, cy - 38);
      ctx.restore();
    }
  }

  /** 绘制中场事件屏幕边缘提示 */
  private drawMidfieldEventBorder(ctx: CanvasRenderingContext2D) {
    if (!this._midfieldEvent) return;
    const e = this._midfieldEvent;
    if (e.timer > e.duration) return;
    const color = e.type === 'gather' ? "91,192,255" : "255,106,51";
    const alpha = Math.min(1, (e.duration - e.timer) / 2);
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    // 顶部边
    const grad = ctx.createLinearGradient(0, 0, 0, 60);
    grad.addColorStop(0, `rgba(${color}, 0.7)`);
    grad.addColorStop(1, `rgba(${color}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, DESIGN_WIDTH, 60);
    // 底部边
    const grad2 = ctx.createLinearGradient(0, DESIGN_HEIGHT - 60, 0, DESIGN_HEIGHT);
    grad2.addColorStop(0, `rgba(${color}, 0)`);
    grad2.addColorStop(1, `rgba(${color}, 0.7)`);
    ctx.fillStyle = grad2;
    ctx.fillRect(0, DESIGN_HEIGHT - 60, DESIGN_WIDTH, 60);
    ctx.restore();
  }

  private paperCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const cut = Math.min(6, w * 0.18);
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + w - cut, y + 2);
    ctx.lineTo(x + w, y + cut);
    ctx.lineTo(x + w - 2, y + h - cut);
    ctx.lineTo(x + w - cut, y + h);
    ctx.lineTo(x + cut, y + h - 2);
    ctx.lineTo(x, y + h - cut);
    ctx.lineTo(x + 2, y + cut);
    ctx.closePath();
  }
}

/** Canvas 圆角矩形辅助 */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  // 始终先 beginPath，避免与前一个未关闭的路径合并
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    // 降级方案
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

export function getLevelById(id: number) {
  return LEVELS.find((level) => level.id === id) ?? LEVELS[0];
}
