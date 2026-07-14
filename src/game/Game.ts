import { LEVELS } from "../data/levels";
import { ENEMY_DEFS } from "../data/enemies";
import { PICKUP_DEFS } from "../data/pickups";
import { ELITE_VISUAL_DEFS } from "../data/elites";
import { BOSS_VISUAL_DEFS } from "../data/bosses";
import { FORMATIONS } from "../data/formations";
import { DESIGN_HEIGHT, DESIGN_WIDTH, HUD_HEIGHT, WALL_TOP_Y, MAX_ENEMIES_ON_SCREEN, MAX_PARTICLES_ON_SCREEN, MAX_CHAIN_DEPTH, MAX_FLOATING_TEXT } from "./config/constants";
import { BALANCE, ENEMY_BALANCE, PICKUP_BALANCE, SWORD_STAGE_BY_ID } from "./config/balance";
import { AD_CONFIG } from "./config/ads";
import { RUN_BUFFS, RUN_BUFF_BY_ID, ROUTE_COLORS, ROUTE_NAMES, ROUTE_BUFFS, getNextBuffInRoute, getBuffRoute } from "./config/buffs";
import { BOSS_CONFIG, getBossPhase } from "./config/bosses";
import { ELITE_CONFIG, ELITE_KINDS } from "./config/elites";
import { REWARD_CONFIG } from "./config/rewards";
import { getBladeTier, getBladeTierName, getTierConfig, canSlash, consumeEnergyByTier, calculateMomentumRefund, getSubBladeCDReduction, recoverEnergy } from "./systems/bladeEnergySystem";
import { isSharpTurn, segmentHitCircle } from "./systems/collisionSystem";
import { paperBurst, ringParticle, sparkBurst, glowParticle, explosionBurst, coreCollapseBurst } from "./systems/particleSystem";
import { applyBattleRewards, evaluateRating, getCurrentRunContext, getUpgradeModifiers, getEquippedBlades, saveDefaultWhiteBlade } from "./services/ProgressionService";
import { BLADE_BASE_STATS, QUALITY_ORDER } from "./config/synthesis";
import type { Blade } from "./services/BladeService";
import type { Quality } from "./config/synthesis";
import { logEvent } from "./services/Analytics";
import { AudioService } from "./services/AudioService";
import { calculateSkillScores } from "./services/SkillTracker";
import type {
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
  Vec2
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

export class Game {
  readonly level: LevelConfig;

  private readonly onFinish: FinishCallback;
  private readonly onReviveOffer?: ReviveOfferCallback;
  private phase: GamePhase = "playing";
  private elapsed = 0;
  private idCounter = 0;
  private finished = false;

  private hp: number;
  private maxHp: number;
  private score = 0;
  private energy: number;
  private regenDelayTimer = 0;
  private drumTimer = 0;
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
  /** 副刀符阵（方案B）：攻击前0.3s的旋转符文提示 */
  private subRune: { x: number; y: number; color: string; life: number; maxLife: number }[] = [];
  // 多波多次刷新队列：每个子刷新有时间戳，到时间就spawn
  private subSpawnQueue: { time: number; kind: string; x: number; speedMultiplier: number; yOffset: number }[] = [];

  private pointerDown = false;
  private pointerPos?: Vec2;
  private wavesSpawned = 0;
  private wavesFinishedAt = 0; // 最后一波生成完成时 elapsed
  private currentRunMode: "normal" | "challenge" | "dailyChallenge" | "freeBurst" | "highYield" = "normal";
  private nextWaveTimer: number = BALANCE.waves.firstWaveDelay;
  private screenShake = 0;
  private flash = 0;
  private slowMoTimer = 0;
  private warriorDrawTimer = 0;
  private warriorSheathTimer = 0;
  private lastSlashAngle = -Math.PI / 2;
  private debugEnabled = false;
  private hintSeen: Set<string>;
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
  /** 当前波次对应的中场事件（仅作用于本波敌人生效） */
  private _currentWaveEvent: 'gather' | 'charge_pause' | null = null;

  // ---- 精英/Boss 系统 ----
  private eliteSpawned = false;
  private bossSpawned = false;
  private bossIntroTimer = 0;
  private eliteIntroTimer = 0;
  private eliteIntroText = "";
  private bossIntroText = "";

  // ---- 副刀自动AI ----
  private subBlades: Blade[] = [];
  private subBladeTimers: number[] = [];
  private subBladeCooldowns: number[] = [];
  // 当前副刀挥击轨迹
  private subSlash: { x1: number; y1: number; x2: number; y2: number; color: string; life: number; maxLife: number; bladeIdx: number; damaged: boolean; slotType: 'momentum_sweep' | 'weakpoint_chase'; lockOnEnemyId?: string; }[] = [];
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
    this.subBladeTimers = this.subBlades.map((_, i) => -(4 + i * 2)); // 蓄势(槽0)=4s首发,破点(槽1)=6s首发
    this.subBladeCooldowns = this.subBlades.map((b) => {
      const stats = BLADE_BASE_STATS[b.quality];
      return stats ? stats.subSlashInterval : 5;
    });
    this.weakpointMarks = new Map();
    this._breakReadyNotified = false;
    this._act1Triggered = false;
    this._act2Triggered = false;
    this._act3Triggered = false;
    this.oneBladeModeTimer = 0;
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
        speedMultiplier: 0.7,
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
        speedMultiplier: 0.8,
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
        speedMultiplier: 0.85,
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
        speedMultiplier: 0.9,
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
        speedMultiplier: 0.95,
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
    this.level.enemySpeed = 0.65;
    this.level.durationSeconds = 180; // 不用这个判断了，保留作为fallback
    this.energy = BALANCE.swordEnergy.max;
  }

  toggleDebugPanel() {
    this.debugEnabled = !this.debugEnabled;
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
    const scaledDt = frameDt * (this.slowMoTimer > 0 ? 0.58 : 1);
    this.slowMoTimer = Math.max(0, this.slowMoTimer - frameDt);

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
    if (!this.currentSlash?.active && this.regenDelayTimer <= 0 && this.warDrumNoDecayTimer <= 0) {
      this.energy = recoverEnergy(this.energy, scaledDt * this.getPassiveRegenMultiplier(), this.drumTimer);
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
    this.eliteIntroTimer = Math.max(0, this.eliteIntroTimer - scaledDt);
    this.bossIntroTimer = Math.max(0, this.bossIntroTimer - scaledDt);
    this.screenShake = Math.max(0, this.screenShake - scaledDt * 2.7);
    this.flash = Math.max(0, this.flash - scaledDt * 2.2);
    if (this.oneBladeModeTimer > 0) this.oneBladeModeTimer = Math.max(0, this.oneBladeModeTimer - scaledDt);

    // 事件波计时衰减
    if (this._activeEventTimer > 0) {
      this._activeEventTimer = Math.max(0, this._activeEventTimer - scaledDt);
      if (this._activeEventTimer <= 0) this._currentEventType = null;
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
    this.updateChestDrop(scaledDt);
    this.updateBuffChoiceTriggers();
    this.checkBattleEnd();
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
    // 远景山间雾气遮罩（敌人从雾后现身）
    this.drawTopMist(ctx);
    this.drawSlash(ctx);
    this.drawSubSlashes(ctx);
    this.drawParticles(ctx);
    this.drawDefenseAndWarrior(ctx);
    this.drawSubReadyPings(ctx);
    this.drawSubRunes(ctx);
    this.drawHud(ctx);
    this.drawSplitFlashes(ctx);
    this.drawFloatingTexts(ctx);
    this.drawWaveProgress(ctx);
    this.drawChestDrop(ctx);
    this.drawMidfieldEventBorder(ctx);
    this.drawIntroOverlay(ctx);
    this.drawDebugPanel(ctx);
    this.drawBuffChoice(ctx);
    this.drawRevivePause(ctx);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 232, 146, ${this.flash * 0.18})`;
      ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    }

    ctx.restore();
  }

  handlePointerDown(pos: Vec2) {
    if (this.phase === "buffChoice") {
      this.selectBuffAt(pos);
      return;
    }
    if (this.phase !== "playing") return;
    // 蓄势阶段（0-9%）不可挥刀
    if (!canSlash(this.energy)) {
      this.showHint("蓄势中", "刀势不足", DESIGN_WIDTH / 2, 200, 0.6);
      return;
    }
    this.pointerDown = true;
    this.pointerPos = this.clampPointer(pos);
    if (this.currentSlash?.active) this.endSlash("收刀");
    this.startSlash(this.pointerPos);
  }

  handlePointerMove(pos: Vec2) {
    if (this.phase !== "playing" || !this.pointerDown || !this.currentSlash?.active) return;
    const next = this.clampPointer(pos);
    this.pointerPos = next;
    this.extendSlash(next);
  }

  handlePointerUp() {
    if (this.phase !== "playing") return;
    this.pointerDown = false;
    if (this.currentSlash?.active) this.endSlash("收刀");
  }

  private startSlash(pos: Vec2) {
    const lockedEnergy = clamp(this.energy, 0, BALANCE.swordEnergy.max);
    const tier = getBladeTier(lockedEnergy);
    const stage = SWORD_STAGE_BY_ID[tier];
    const pathMultiplier = (this.nextSoul ? PICKUP_BALANCE.soul.pathLengthMultiplier ?? 1 : 1) * this.getPathLengthMultiplier();
    const widthMultiplier = this.nextSoul ? PICKUP_BALANCE.soul.widthMultiplier ?? 1 : 1;
    const maxPathLength = stage.maxPathLength * pathMultiplier;
    const point = { x: pos.x, y: pos.y, t: this.elapsed, energyRatio: 1 };

    // 一刀斩模式：本次挥刀威力×2（仅当前这一刀）
    this._slashOneBladeBoost = this.oneBladeModeTimer > 0 ? 2.0 : 1.0;
    if (this._slashOneBladeBoost > 1) {
      this.oneBladeModeTimer = 0; // 消耗掉
      this.addText(DESIGN_WIDTH / 2, 240, "⚡ 一刀斩！", "#ff6a33", 26, 1.5);
    } else {
      this._slashOneBladeBoost = 1.0;
    }

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
      hasOil: this.nextOil,
      kills: 0,
      chain: 0,
      active: true
    };

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
    if (!this.hasRecentText(stage.prompt, 1.2)) {
      this.addText(pos.x, pos.y - 18, stage.prompt, stage.color, 16, BALANCE.feedback.stageTextLife);
    }
    if (lockedEnergy < 25) {
      this.showHint("low-energy-slash", "刀势越满，刀芒越强", DESIGN_WIDTH / 2, 118, 2);
    }
    this.particles.push(...sparkBurst(pos, tier === "burst" ? 15 : 8, stage.color));
    this.checkSegmentHits(point, point, this.currentSlash);
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
        this.addText(DESIGN_WIDTH / 2, 106, `刀势返还 +${refund}%`, "#5bc0ff", 18, 1.2);
      }
    }

    // 主刀高击杀减少副刀 CD
    const cdReduction = getSubBladeCDReduction(trail.kills);
    if (cdReduction.seconds > 0 || cdReduction.ratio > 0) {
      if (cdReduction.seconds > 0) {
        for (let i = 0; i < this.subBladeTimers.length; i++) {
          this.subBladeTimers[i] = Math.max(0, this.subBladeTimers[i] - cdReduction.seconds);
        }
      } else if (cdReduction.ratio > 0) {
        for (let i = 0; i < this.subBladeTimers.length; i++) {
          const cd = this.subBladeCooldowns[i];
          if (cd > 0) {
            this.subBladeTimers[i] = Math.max(this.subBladeTimers[i], cd * (1 - cdReduction.ratio));
          }
        }
      }
      // 副刀加速视觉反馈：浮字 + 图标光圈闪烁
      if (trail.kills >= 5 && !this.hasRecentText("副刀共鸣", 0.5)) {
        this.addText(DESIGN_WIDTH / 2, 160, "副刀共鸣", "#5bc0ff", 18, 0.8);
        // 触发所有副刀光圈闪烁
        for (let i = 0; i < 2; i++) {
          this.subReadyPing.push({ slot: i, life: 0.3, maxLife: 0.3 });
        }
      }
    }

    this.stats.maxSingleBlade = Math.max(this.stats.maxSingleBlade, trail.kills);
    this.stats.maxChain = Math.max(this.stats.maxChain, trail.chain);
    this.warriorSheathTimer = 0.38;
    this.warriorDrawTimer = 0;
    this.regenDelayTimer = BALANCE.swordEnergy.regenDelayAfterSlash;
    AudioService.slashEnd();
    this.screenShake = Math.max(this.screenShake, trail.chain > 0 ? 0.5 : 0.18);

    const stage = SWORD_STAGE_BY_ID[trail.tier];
    const praise = this.getSlashPraise(trail, reason);
    if (praise) {
      this.addText(DESIGN_WIDTH / 2, 136, praise, stage.color, praise === "一刀破阵" ? 26 : 20);
    // 漂亮一刀：首次 5+ 击杀
    if (this.isFirstRun && trail.kills >= 5 && !this.firstRunPrettySlashShown) {
      this.firstRunPrettySlashShown = true;
      this.addText(DESIGN_WIDTH / 2, 80, "漂亮一刀！", "#ff6a33", 28, 1.5);
      this.slowMoTimer = Math.max(this.slowMoTimer, 0.15);
      this.screenShake = Math.max(this.screenShake, 0.5);
      this.flash = Math.max(this.flash, 0.6);
    }
    // 首次触发阵眼崩散
    if (this.isFirstRun && trail.coreCollapseCount > 0 && !this.firstRunCoreBoomShown) {
      this.firstRunCoreBoomShown = true;
      this.addText(DESIGN_WIDTH / 2, 104, "一刀破阵！", "#ffd35a", 30, 1.8);
      this.slowMoTimer = Math.max(this.slowMoTimer, 0.2);
      this.screenShake = Math.max(this.screenShake, 0.65);
      this.flash = Math.max(this.flash, 0.8);
    }
      if (praise === "一刀破阵") {
      this.stats.oneBladeBreaks += 1;
      AudioService.oneBladeBreak();
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
    if (trail.tier === "burst" && trail.kills >= 12) return "神之一刀";
    if (trail.tier === "burst" && trail.kills >= 8) return "一刀破军";
    if (trail.coreCollapseCount > 0 && trail.tier === "burst") return "一刀破阵";
    if (trail.kills >= 13) return "一刀破阵";
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
      }
      // 对精英造成伤害
      this.damageEnemy(enemy, stage.damage * bladeDmg, trail, false, "elite");
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
      this.killedElites.push(enemy.eliteKind);
      this.stats.killedElites = [...this.killedElites];
      this.startChestDrop(enemy.x, enemy.y - 10);
      this.particles.push(glowParticle(enemy, "#ffd35a", 25, 50));
      this.addText(enemy.x, enemy.y - 40, "宝箱掉落！", "#ffd35a", 18, 1.6);
    }

    // ---- Boss击杀：追踪图鉴 ----
    if (enemy.kind === "boss" && enemy.bossId) {
      this.killedBoss = enemy.bossId;
      this.stats.killedBoss = enemy.bossId;
      this.flash = Math.max(this.flash, 1);
      this.screenShake = Math.max(this.screenShake, 1.2);
      this.addText(DESIGN_WIDTH / 2, 200, `${BOSS_CONFIG[enemy.bossId].name}·讨伐！`, "#ffd35a", 30, 2.5);
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
        if (enemy.y >= 260 && enemy.y <= 460) {
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
        enemy.y += enemy.speed * rushMultiplier * statusSlow * fortressSlow * dt;
      } else {
        // 蓄力时略微闪红光
        if (Math.sin(this.elapsed * 20) > 0) {
          enemy.flash = Math.max(enemy.flash, 0.2);
        }
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
          enemy.alive = false;
          this.hp -= enemy.hpDamage;
          this.defenseLineHits += 1;
          this.screenShake = Math.max(this.screenShake, 0.45);
          this.flash = Math.max(this.flash, 0.35);
          AudioService.defenseHit();
          this.addText(enemy.x, BALANCE.battlefield.bottomDefenseY - 12, `-${enemy.hpDamage}`, "#ff7b6e", 18);
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

  /** 副刀自动攻击 - 蓄势横扫(槽0) + 破点追击(槽1) */
  private updateSubBlades(dt: number) {
    // 处理挥击弧线生命衰减
    for (const s of this.subSlash) {
      s.life -= dt;
      if (!s.damaged && s.life <= s.maxLife * 0.5) {
        s.damaged = true;
        this.applySubSlashDamage(s);
      }
    }
    this.subSlash = this.subSlash.filter(s => s.life > 0);

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

    for (const r of this.subRune) r.life -= dt;
    this.subRune = this.subRune.filter(r => r.life > 0);

    for (let i = 0; i < 2; i++) {
      const blade = this.subBlades[i];
      if (!blade) continue;
      // 鼓舞：副刀CD加速30%
      const inspireMul = this._currentEventType === "inspire" ? 1.3 : 1;
      this.subBladeTimers[i] += dt * inspireMul;
      const cd = this.subBladeCooldowns[i];
      const remaining = cd - this.subBladeTimers[i];
      if (remaining > 0 && remaining < 0.3) {
        const hasPing = this.subReadyPing.some(p => p.slot === i);
        if (!hasPing) {
          this.subReadyPing.push({ slot: i, life: 0.4, maxLife: 0.4 });
        }
      }
      if (this.subBladeTimers[i] < cd) continue;
      this.subBladeTimers[i] = 0;
      const stats = BLADE_BASE_STATS[blade.quality];
      if (!stats) continue;

      const cx = DESIGN_WIDTH / 2;
      const cy = BALANCE.battlefield.warriorY;

      if (i === 0) {
        // 蓄势横扫：找敌群最密集的横向区域
        this.triggerMomentumSweep(blade, cx, cy, stats);
      } else {
        // 破点追击：锁定高价值目标
        this.triggerWeakpointChase(blade, cx, cy, stats);
      }
    }
  }

  /** 蓄势横扫 —— 横向扫过敌群最密集区域 */
  private triggerMomentumSweep(blade: Blade, cx: number, cy: number, stats: typeof BLADE_BASE_STATS[keyof typeof BLADE_BASE_STATS]) {
    // 找敌人最密集的 y 区间
    const denseY = this.findDensestYBand();
    // 中场化：从中场横向扫过（不再从玩家身上发出）
    const sweepY = Math.min(denseY, 580); // 中场密区y轴
    const sweepX = DESIGN_WIDTH / 2; // 横向居中
    // 从左到右横扫
    const span = 180;
    const tailX = sweepX - span;
    const tipX = sweepX + span;
    const tailY = sweepY + 8;
    const tipY = sweepY - 4;

    const color = "#5bc0ff";
    // 方案B：副刀符阵（起点+终点各一个旋转符文）
    this.subRune.push({ x: tailX, y: tailY, color, life: 0.3, maxLife: 0.3 });
    this.subRune.push({ x: tipX, y: tipY, color, life: 0.3, maxLife: 0.3 });
    this.subSlash.push({
      x1: tailX, y1: tailY, x2: tipX, y2: tipY,
      color,
      life: 0.35, maxLife: 0.35,
      bladeIdx: 0,
      damaged: false,
      slotType: 'momentum_sweep'
    });
  }

  /** 破点追击 —— 锁定高价值目标 */
  private triggerWeakpointChase(blade: Blade, cx: number, cy: number, stats: typeof BLADE_BASE_STATS[keyof typeof BLADE_BASE_STATS]) {
    let target = this.findHighValueTarget();
    if (!target) {
      // 无高价值目标 → 退化为攻击最近敌人
      const fallback = this.findClosestEnemy();
      if (!fallback) return;
      target = fallback;
    }
    // 从 warrior 飞向目标
    const dx = target.x - cx;
    const dy = target.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 10) return;
    // 中场化：从天而降追击（不再从玩家身上发出）
    const tipX = target.x;
    const tipY = target.y + 10;
    const tailX = target.x + (Math.random() - 0.5) * 60;
    const tailY = Math.max(70, target.y - 80); // 从目标上方追下

    const color = "#ff6a33"; // 金色——破点副刀
    // 方案B：副刀符阵（目标上方旋转符文）
    this.subRune.push({ x: tipX, y: tipY - 40, color, life: 0.3, maxLife: 0.3 });
    this.subRune.push({ x: tailX, y: tailY, color, life: 0.3, maxLife: 0.3 });
    this.subSlash.push({
      x1: tailX, y1: tailY, x2: tipX, y2: tipY,
      color,
      life: 0.40, maxLife: 0.40,
      bladeIdx: 1,
      damaged: false,
      slotType: 'weakpoint_chase',
      lockOnEnemyId: target.id
    });

    // 标记高价值目标弱点的前置：命中后由 applySubSlashDamage 处理
    this._pendingWeakpointChaseTarget = target;
  }

  // 临时存储破点追击的目标（在 applySubSlashDamage 中使用）
  private _pendingWeakpointChaseTarget: { x: number; y: number; id?: string; kind: string } | null = null;

  /** 找敌人最密集的 y 区间 */
  private findDensestYBand(): number {
    const alive = this.enemies.filter(e => e.alive);
    if (alive.length === 0) return 300;
    // 把 y 分成 3 个区间，找敌人最多的区间的中心 y
    const bands = [0, 0, 0]; // [0-200, 200-400, 400-600]
    for (const e of alive) {
      if (e.y < 200) bands[0]++;
      else if (e.y < 400) bands[1]++;
      else bands[2]++;
    }
    const maxIdx = bands.indexOf(Math.max(...bands));
    return [100, 300, 500][maxIdx];
  }

  /** 找高价值目标（阵眼 > 火药 > 精英 > 盾兵 > 最近敌人） */
  private findHighValueTarget(): Enemy | null {
    const alive = this.enemies.filter(e => e.alive);
    if (alive.length === 0) return null;
    const priority: EnemyKind[] = ["core", "powder", "elite", "shield"];
    for (const kind of priority) {
      const found = alive.find(e => e.kind === kind);
      if (found) return found;
    }
    return null;
  }

  /** 找离防线最近的敌人 */
  private findClosestEnemy(): Enemy | null {
    const alive = this.enemies.filter(e => e.alive);
    if (alive.length === 0) return null;
    return alive.reduce((a, b) => a.y > b.y ? a : b);
  }

  /** 在弧线中点结算副刀伤害 */
  private applySubSlashDamage(s: { x1: number; y1: number; x2: number; y2: number; color: string; bladeIdx: number; slotType?: 'momentum_sweep' | 'weakpoint_chase' }) {
    if (this.phase !== "playing") return;
    const blade = this.subBlades[s.bladeIdx];
    if (!blade) return;
    const stats = BLADE_BASE_STATS[blade.quality];
    if (!stats) return;
    const slotType = s.slotType ?? (s.bladeIdx === 0 ? 'momentum_sweep' : 'weakpoint_chase');

    if (slotType === 'momentum_sweep') {
      this.applyMomentumSweepDamage(s, blade, stats);
    } else {
      this.applyWeakpointChaseDamage(s, blade, stats);
    }
  }

  /** 蓄势横扫伤害结算 */
  private applyMomentumSweepDamage(
    s: { x1: number; y1: number; x2: number; y2: number; color: string; bladeIdx: number },
    blade: Blade, stats: typeof BLADE_BASE_STATS[keyof typeof BLADE_BASE_STATS]
  ) {
    const hits: Enemy[] = [];
    // 横扫判定范围更大（radius + 32）
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const dist = distanceToSegment(enemy, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
      if (dist < enemy.radius + 32) hits.push(enemy);
    }
    const damage = stats.damageMultiplier * 0.8; // 蓄势副刀伤害略低
    let killCount = 0;
    for (const target of hits) {
      target.hp -= Math.max(1, Math.ceil(damage));
      target.flash = 0.18;
      const killed = target.hp <= 0;
      if (killed) {
        target.alive = false;
        this.score += target.score;
        this.stats.kills += 1;
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
        // 击杀5+ 自加速：当前CD -20%（不低于原始CD的50%）
        if (killCount >= 5 && s.bladeIdx < this.subBladeCooldowns.length) {
          const origCd = BLADE_BASE_STATS[blade.quality]?.subSlashInterval ?? 5;
          const minCd = origCd * 0.5;
          this.subBladeCooldowns[s.bladeIdx] = Math.max(minCd, this.subBladeCooldowns[s.bladeIdx] * 0.8);
        }
      } else {
        this.addText(s.x1 + (s.x2 - s.x1) / 2, s.y1 + (s.y2 - s.y1) / 2 - 16, `蓄势 +${refund}%`, "#5bc0ff", 14, 0.8);
        this.energy = clamp(this.energy + refund, 0, BALANCE.swordEnergy.max);
      }
    }
  }

  /** 破点追击伤害结算 */
  private applyWeakpointChaseDamage(
    s: { x1: number; y1: number; x2: number; y2: number; color: string; bladeIdx: number },
    blade: Blade, stats: typeof BLADE_BASE_STATS[keyof typeof BLADE_BASE_STATS]
  ) {
    const hits: Enemy[] = [];
    // 破点判定范围更精确（radius + 24）
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const dist = distanceToSegment(enemy, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
      if (dist < enemy.radius + 24) hits.push(enemy);
    }
    const damage = stats.damageMultiplier * 1.0;
    for (const target of hits) {
      target.hp -= Math.max(1, Math.ceil(damage));
      target.flash = 0.2;
      const killed = target.hp <= 0;
      if (killed) {
        target.alive = false;
        this.score += target.score;
        this.stats.kills += 1;
        this.particles.push(...paperBurst(target, 6, ["#ff6a33", "#ffd35a"]));
      }
      this.particles.push(ringParticle({ x: target.x, y: target.y }, s.color, 22));
      if (blade.affix) this.applySubAffixEffect(blade.affix, target, killed, 'weakpoint_chase');

      // 破点标记：高价值目标（火药/阵眼/精英/盾兵）标记破绽2秒
      const highValue: EnemyKind[] = ["core", "powder", "elite", "shield"];
      if (highValue.includes(target.kind) && !killed) {
        this.weakpointMarks.set(target.id, 2.0);
        this.addText(target.x, target.y - 20, "破绽", "#ff6a33", 16, 1.2);
        // 标记浮字
        this.addText(s.x1 + (s.x2 - s.x1) / 2, s.y1 + (s.y2 - s.y1) / 2 - 16, "破点追击", "#ffd35a", 15, 0.8);
      }

      // 击杀高价值目标 → 主刀刀势 +5%
      if (killed && highValue.includes(target.kind)) {
        this.energy = clamp(this.energy + 5, 0, BALANCE.swordEnergy.max);
        this.addText(target.x, target.y - 36, "+5%刀势", "#ffd35a", 14, 0.8);
      }
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
            if (ct.hp <= 0) { ct.alive = false; this.score += ct.score; this.stats.kills += 1; }
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
      this.triggerSubBladeResonance();
    }
    // 45s 第三幕结束 → 一刀斩模式
    if (!this._act3Triggered && this.elapsed >= 45) {
      this._act3Triggered = true;
      this.triggerOneBladeMode();
    }
  }

  /** 满势时刻：15s 灌满刀势 + 强震屏 + 飘字 */
  private triggerMomentumBurst() {
    this.energy = BALANCE.swordEnergy.max;
    this._breakReadyNotified = true; // 满势时不再触发单独的破阵提示
    this.screenShake = Math.max(this.screenShake, 0.9);
    this.flash = Math.max(this.flash, 0.5);
    this.slowMoTimer = Math.max(this.slowMoTimer, 0.12);
    this.addText(DESIGN_WIDTH / 2, 280, "⚡ 满势时刻", "#ffd35a", 30, 2.0);
    // 满屏光晕粒子
    for (let i = 0; i < 12; i++) {
      this.particles.push(glowParticle({ x: DESIGN_WIDTH / 2 + (Math.random() - 0.5) * 200, y: 400 + (Math.random() - 0.5) * 300 }, "#ffd35a", 18));
    }
    AudioService.slashHit();
  }

  /** 副刀共鸣：30s 立即清空两把副刀CD + 飘字 */
  private triggerSubBladeResonance() {
    for (let i = 0; i < this.subBladeTimers.length; i++) {
      this.subBladeTimers[i] = 999; // 立即可发
    }
    this.screenShake = Math.max(this.screenShake, 0.6);
    this.flash = Math.max(this.flash, 0.3);
    this.addText(DESIGN_WIDTH / 2, 280, "⚔ 副刀共鸣", "#ff6a33", 28, 2.0);
    // 副刀光圈立刻出现
    for (let i = 0; i < 2; i++) {
      this.subReadyPing.push({ slot: i, life: 0.4, maxLife: 0.4 });
    }
    AudioService.slashHit();
  }

  /** 一刀斩模式：45s 后下次挥刀威力×2 + 持续15s 引导 */
  private triggerOneBladeMode() {
    this.oneBladeModeTimer = 15;
    this.screenShake = Math.max(this.screenShake, 1.2);
    this.flash = Math.max(this.flash, 0.7);
    this.slowMoTimer = Math.max(this.slowMoTimer, 0.15);
    this.addText(DESIGN_WIDTH / 2, 280, "🗡 一刀斩模式", "#ff6a33", 32, 2.5);
    for (let i = 0; i < 16; i++) {
      this.particles.push(...sparkBurst({ x: DESIGN_WIDTH / 2 + (Math.random() - 0.5) * 240, y: 400 + (Math.random() - 0.5) * 320 }, 8, "#ff6a33"));
    }
    AudioService.oneBladeBreak();
  }

  private updateWaves(dt: number) {
    if (this.wavesSpawned >= this.level.waves.length) return;
    const wave = this.level.waves[this.wavesSpawned];

    // 双重判断：到达 spawnAt 时间 或 场上敌人已少、立即刷下一波
    const reachedSpawnAt = wave.spawnAt !== undefined && this.elapsed >= wave.spawnAt;
    const aliveCount = this.enemies.filter(e => e.alive).length;
    const enoughGap = this.elapsed - (this._lastWaveElapsed ?? 0) >= 1.6;
    const fewEnemiesLeft = aliveCount <= 3 && enoughGap;

    if (reachedSpawnAt || fewEnemiesLeft) {
      this.spawnCurrentWave(wave);
    }
  }


  private spawnCurrentWave(wave: typeof this.level.waves[0]) {
    this._lastWaveElapsed = this.elapsed;
    this.wavesSpawned += 1;
    if (this.wavesSpawned >= this.level.waves.length) {
      this.wavesFinishedAt = this.elapsed;
    }
    this.waveHpBonus = Math.min(5, this.wavesSpawned);

    // ── 决定是否触发事件波（20%概率，同局不重复，第1波不触发）──
    const triggerEvent = this.wavesSpawned > 1 && Math.random() < 0.2;
    // 事件波按关卡解锁
    const e = this.level.id;
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
      this.addText(DESIGN_WIDTH / 2, 180,
        wave.midfieldEventType === 'gather' ? "敌军聚阵" : "敌军蓄冲",
        wave.midfieldEventType === 'gather' ? "#5bc0ff" : "#ff6a33", 22, 1.2);
      this.addText(DESIGN_WIDTH / 2, 208,
        wave.midfieldEventType === 'gather' ? "等它们靠近，一刀更爽" : "快斩，不然冲下来",
        "#f6e7bd", 13, 1.0);
      this.flash = Math.max(this.flash, 0.15);
      // 屏幕边缘提示色（蓄冲=红，聚阵=青）
      const ringColor = wave.midfieldEventType === 'gather' ? "91,192,255" : "255,106,51";
      this._midfieldEvent = { type: wave.midfieldEventType, timer: 0, duration: 8 };
    } else {
      this._currentWaveEvent = null;
    }

    if (chosenEvent === "reinforce") {
      extraSpeedMul *= 1.2;
      // 清除事件波计时器不算在局内
      this.addText(DESIGN_WIDTH / 2, 200, "⚡ 增援潮！", "#ff6a33", 24, 1.8);
      this.addText(DESIGN_WIDTH / 2, 228, "敌人数×1.5，速度↑", "#ff9e7a", 14, 1.5);
      this.screenShake = Math.max(this.screenShake, 0.4);
    } else if (chosenEvent === "slowRain") {
      this._activeEventTimer = 0.5; // 减速雨持续 0.5s
      this.addText(DESIGN_WIDTH / 2, 200, "🌧 减速雨！", "#5bc0ff", 24, 1.8);
      this.addText(DESIGN_WIDTH / 2, 228, "主刀路径减速50%", "#7fb1ff", 14, 1.5);
    } else if (chosenEvent === "inspire") {
      // 鼓舞：副刀CD临时-30%，持续8秒
      this._activeEventTimer = 8;
      // 给所有副刀施加临时加速
      for (let i = 0; i < this.subBladeTimers.length; i++) {
        this.subBladeTimers[i] = Math.max(0, this.subBladeTimers[i] - 0.5); // 立即加速0.5s
      }
      this.addText(DESIGN_WIDTH / 2, 200, "🥁 鼓舞！", "#ffd35a", 24, 1.8);
      this.addText(DESIGN_WIDTH / 2, 228, "副刀CD临时-30%", "#f6e7bd", 14, 1.5);
    } else if (chosenEvent === "eliteStrike") {
      this.addText(DESIGN_WIDTH / 2, 200, "👹 精英袭！", "#9b6dff", 24, 1.8);
      this.addText(DESIGN_WIDTH / 2, 228, "精英督战出现", "#c896ff", 14, 1.5);
      // 增加精英在wave中
      extraEnemies.push({ kind: "elite", count: 1, x: 188, yOffset: 0 });
    } else if (chosenEvent === "trapFormation") {
      this.addText(DESIGN_WIDTH / 2, 200, "🔱 陷阱阵！", "#ffb15c", 24, 1.8);
      this.addText(DESIGN_WIDTH / 2, 228, "火药+阵眼组合埋伏", "#ffd67c", 14, 1.5);
      // 增加火药+阵眼
      extraEnemies.push({ kind: "powder", count: 2, x: 140, yOffset: 0 });
      extraEnemies.push({ kind: "core", count: 1, x: 284, yOffset: 0 });
    }

    const speedMultiplier = extraSpeedMul;
    // 如果是增援潮，敌人数量×1.5
    const countMul = chosenEvent === "reinforce" ? 1.5 : 1;

    // 多波多次刷新：把每个 spawn 拆成 2~3 次 sub-spawn
    const subInterval = randomRange(0.8, 1.2);
    let subDelay = 0;
    const allSpawns = [...wave.enemies, ...extraEnemies];
    for (const spawn of allSpawns) {
      const cnt = Math.max(1, Math.ceil((spawn.count ?? 1) * countMul));
      const subGroups = Math.min(3, Math.max(2, Math.ceil(cnt / 3)));
      const perGroup = Math.ceil(cnt / subGroups);
      const lanes = [44, 92, 140, 188, 236, 284, 336];

      let enemyIdx = 0;
      for (let g = 0; g < subGroups; g++) {
        const subDelayAt = subDelay;
        subDelay += subInterval;
        const startK = g * perGroup;
        const endK = Math.min(cnt, (g + 1) * perGroup);
        for (let k = startK; k < endK; k++) {
          const x = cnt > 1 ? lanes[Math.floor((k * lanes.length) / cnt)] : (spawn.x ?? lanes[enemyIdx % lanes.length]);
          const xJ = (Math.random() - 0.5) * 40;
          this.subSpawnQueue.push({
            time: this.elapsed + subDelayAt,
            kind: spawn.kind,
            x: x + xJ,
            speedMultiplier,
            yOffset: spawn.yOffset ?? 0
          });
          enemyIdx++;
        }
      }
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

    this.addText(DESIGN_WIDTH / 2, 96, wave.name, "#f6e7bd", 16);
  }

  /** 处理 sub-spawn 队列（多波多次刷新） */
  private updateSubSpawnQueue() {
    if (this.subSpawnQueue.length === 0) return;
    const ready: typeof this.subSpawnQueue = [];
    const remain: typeof this.subSpawnQueue = [];
    for (const item of this.subSpawnQueue) {
      if (item.time <= this.elapsed) {
        ready.push(item);
      } else {
        remain.push(item);
      }
    }
    this.subSpawnQueue = remain;
    for (const item of ready) {
      const spawnY = BALANCE.battlefield.enemySpawnY - (item.yOffset ?? 0);
      const enemy = this.createEnemy(item.kind as any, item.x, spawnY, item.speedMultiplier);
      // 中场事件波及：本波敌人带event标记
      if (this._currentWaveEvent) {
        enemy.spawnedWithEvent = this._currentWaveEvent;
      }
      this.enemies.push(enemy);
      this.discoveredEnemies.add(item.kind as any);
      this.particles.push(glowParticle({ x: item.x, y: spawnY }, "#5c4a3a", 12, 20));
    }
  }

  /** 判定是否应立刻胜利结算 */
  private shouldFinishVictory(): boolean {
    const allWavesDone = this.wavesSpawned >= this.level.waves.length;
    const noAliveEnemies = !this.enemies.some(e => e.alive);
    const notResolving = !this.currentSlash;
    return allWavesDone && noAliveEnemies && notResolving;
  }

  private checkBattleEnd() {
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
      // 胜利结算延迟0.6秒，让最后的粒子动画播完
      if (this._victoryPendingAt === undefined) {
        this._victoryPendingAt = this.elapsed + 0.6;
      }
      if (this.elapsed >= this._victoryPendingAt) {
        this.finish(true);
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

  private createEnemy(kind: EnemyKind, x: number, y: number, speedMultiplier = 1): Enemy {
    const balance = ENEMY_BALANCE[kind];
    const dailyShieldBonus = this.runContext.mode === "dailyChallenge" && this.runContext.dailyChallengeId === "hard_shield" && kind === "shield" ? 1 : 0;
    // 逐波HP递增：每波+1，最多+5（仅对基础敌人生效，精英/Boss不受影响）
    const isBasicEnemy = kind === "infantry" || kind === "shield" || kind === "powder" || kind === "core";
    const hpBonus = isBasicEnemy ? this.waveHpBonus : 0;
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
      // 30% 步兵是急冲兵
      rushTimer: kind === "infantry" && Math.random() < 0.3 ? 0.8 : undefined
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
  }

  /** 文字防抖：1秒内不显示重复文字 */
  private hasRecentText(text: string, withinSec: number = 1): boolean {
    return this.texts.some((t) => t.text === text && t.life > (t.maxLife - withinSec));
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
    ctx.fillStyle = "rgba(18, 12, 8, 0.78)";
    ctx.fillRect(0, 0, DESIGN_WIDTH, HUD_HEIGHT);
    ctx.strokeStyle = "rgba(255, 214, 124, 0.35)";
    ctx.beginPath();
    ctx.moveTo(0, HUD_HEIGHT);
    ctx.lineTo(DESIGN_WIDTH, HUD_HEIGHT);
    ctx.stroke();

    // 中间：关名 + 波次（上下结构）
    ctx.textAlign = "center";
    ctx.fillStyle = "#f6e7bd";
    ctx.font = '700 16px "Microsoft YaHei", sans-serif';
    const isBossLevel = this.level.id < 10000 && Boolean(this.level.bossId);
    const displayFloor = isBossLevel ? null : (this.level.id >= 10000 ? this.level.id - 10000 : this.level.id);
    ctx.fillText(displayFloor !== null ? `第${displayFloor}关 ${this.level.title}` : this.level.title, DESIGN_WIDTH / 2, 28);
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = "rgba(246, 231, 189, 0.72)";
    ctx.fillText(`波次 ${Math.min(this.wavesSpawned, this.level.waves.length)}/${this.level.waves.length}`, DESIGN_WIDTH / 2, 48);

    // 右侧：分数
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffd35a";
    ctx.font = '700 14px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${Math.floor(this.score)} 分`, DESIGN_WIDTH - 16, 36);
  }

  private drawEnemies(ctx: CanvasRenderingContext2D) {
    for (const enemy of this.enemies) {
      const def = ENEMY_DEFS[enemy.kind];
      const wobbleX = Math.sin(enemy.wobble * 5) * 1.2;
      ctx.save();
      ctx.translate(enemy.x + wobbleX, enemy.y);
      ctx.rotate(Math.sin(enemy.wobble * 2) * 0.04);
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 3;

      const baseColor = enemy.flash > 0 ? "#fff1b8" : def.color;
      const accentColor = def.accent;

      // 破绽标记：外发光光圈（2秒持续）
      if (this.weakpointMarks.has(enemy.id)) {
        const remain = this.weakpointMarks.get(enemy.id) ?? 0;
        const pulse = 0.5 + Math.sin(this.elapsed * 8) * 0.5;
        ctx.shadowColor = "#ff6a33";
        ctx.shadowBlur = 18 + pulse * 12;
        ctx.strokeStyle = `rgba(255, 106, 51, ${0.5 + pulse * 0.3})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 6 + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 6;
        ctx.shadowColor = "rgba(0,0,0,0.45)";
      }

      // ═════════════════════════════════════
      // 汉字化渲染：单字 + 颜色 + 动效
      // ═════════════════════════════════════

      if (enemy.kind === "infantry") {
        // 步兵："兵"字 朱红，旋转下落动画
        const rot = Math.sin(enemy.wobble * 5) * 0.15;
        ctx.save();
        // 急冲兵：底部红色光环 + 名称上方加⚡标识
        if (enemy.rushTimer !== undefined) {
          const rushPulse = Math.abs(Math.sin(this.elapsed * 12));
          ctx.strokeStyle = `rgba(255, 106, 51, ${rushPulse * 0.6})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius + 6, 0, Math.PI * 2);
          ctx.stroke();
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

        // 名称（更显眼：背景+发光+加大）
        ctx.save();
        const nameText = visDef.name;
        ctx.font = '800 13px "Microsoft YaHei", sans-serif';
        const nameW = ctx.measureText(nameText).width;
        // 背景
        ctx.fillStyle = "rgba(20, 14, 8, 0.85)";
        ctx.fillRect(-nameW / 2 - 6, -enemy.radius - 22, nameW + 12, 18);
        // 边框
        ctx.strokeStyle = visDef.color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-nameW / 2 - 6, -enemy.radius - 22, nameW + 12, 18);
        // 文字
        ctx.fillStyle = "#fff3c0";
        ctx.shadowColor = visDef.color;
        ctx.shadowBlur = 6;
        ctx.fillText(nameText, 0, -enemy.radius - 9);
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

      // ---- Boss渲染 ----
      if (enemy.kind === "boss" && enemy.bossId) {
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
        ctx.fillStyle = "rgba(10, 7, 5, 0.7)";
        ctx.fillRect(-enemy.radius - 4, -enemy.radius - 8, (enemy.radius + 4) * 2, 5);
        ctx.fillStyle = hpRatio > 0.5 ? "#2ecc71" : hpRatio > 0.25 ? "#f39c12" : "#e74c3c";
        ctx.fillRect(-enemy.radius - 4, -enemy.radius - 8, (enemy.radius + 4) * 2 * hpRatio, 5);

        ctx.strokeStyle = "#fff3c0";
        ctx.lineWidth = 1;
        ctx.strokeRect(-enemy.radius - 4, -enemy.radius - 8, (enemy.radius + 4) * 2, 5);

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

  /** 副刀弧形挥击 - 从尾到头延展的弧线（0.40s，更粗更亮） */
  private drawSubSlashes(ctx: CanvasRenderingContext2D) {
    if (this.subSlash.length === 0) return;
    ctx.save();
    for (const s of this.subSlash) {
      const t = 1 - s.life / s.maxLife; // 0→1 随时间推进
      // 弧形控制点（中间略偏移，形成弧线）
      const midX = (s.x1 + s.x2) / 2 + (s.bladeIdx === 0 ? -22 : 22);
      const midY = (s.y1 + s.y2) / 2 - 30;
      // 已划到的部分：t 比例的尾→头
      const curX = s.x1 + (s.x2 - s.x1) * t;
      const curY = s.y1 + (s.y2 - s.y1) * t;
      // 外发光层（最宽、最低不透明）
      ctx.strokeStyle = s.color + "88";
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 26;
      ctx.lineWidth = 18;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.quadraticCurveTo(midX, midY, curX, curY);
      ctx.stroke();
      // 主刀光（亮）
      ctx.strokeStyle = s.color + "ee";
      ctx.shadowBlur = 12;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.quadraticCurveTo(midX, midY, curX, curY);
      ctx.stroke();
      // 内白线（最亮核心）
      ctx.strokeStyle = "#ffffffee";
      ctx.shadowBlur = 0;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.quadraticCurveTo(midX, midY, curX, curY);
      ctx.stroke();
      // 刀头圆点
      if (t > 0.05) {
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(curX, curY, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      // 破点追击：被锁定敌人头顶准星
      if (s.slotType === 'weakpoint_chase' && s.lockOnEnemyId) {
        const target = this.enemies.find(e => e.id === s.lockOnEnemyId);
        if (target && target.alive) {
          const pulse = 0.5 + Math.sin(this.elapsed * 16) * 0.5;
          ctx.save();
          ctx.shadowColor = s.color;
          ctx.shadowBlur = 12 + pulse * 8;
          ctx.strokeStyle = `rgba(255, 106, 51, ${0.7 + pulse * 0.3})`;
          ctx.lineWidth = 2.5;
          const r = target.radius + 10;
          // 4个角的L型
          const L = 8;
          const corners = [[target.x - r, target.y - r], [target.x + r, target.y - r], [target.x - r, target.y + r], [target.x + r, target.y + r]];
          for (const [cx, cy] of corners) {
            const dx = Math.sign(cx - target.x);
            const dy = Math.sign(cy - target.y);
            ctx.beginPath();
            ctx.moveTo(cx - dx * L, cy);
            ctx.lineTo(cx, cy);
            ctx.lineTo(cx, cy - dy * L);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  /** 副刀cd将好：warrior 身上召唤光圈（0.4s） */
  private drawSubReadyPings(ctx: CanvasRenderingContext2D) {
    if (this.subReadyPing.length === 0) return;
    const cx = DESIGN_WIDTH / 2;
    const cy = BALANCE.battlefield.warriorY;
    for (const p of this.subReadyPing) {
      const t = 1 - p.life / p.maxLife; // 0→1
      const slot = p.slot;
      const baseColor = "#a8e6cf";
      const ringR = 38 + t * 24; // 从38扩大到62
      const alpha = (1 - t) * 0.85;
      ctx.save();
      ctx.strokeStyle = baseColor + Math.floor(alpha * 255).toString(16).padStart(2, "0");
      ctx.shadowColor = baseColor;
      ctx.shadowBlur = 18;
      ctx.lineWidth = 3.5;
      // 偏左/右（匹配 slot 0/1 角度）
      const offX = slot === 0 ? -34 : 34;
      const offY = -8;
      ctx.beginPath();
      ctx.arc(cx + offX, cy + offY, ringR, 0, Math.PI * 2);
      ctx.stroke();
      // 中心小光点
      ctx.fillStyle = baseColor + Math.floor(alpha * 200).toString(16).padStart(2, "0");
      ctx.beginPath();
      ctx.arc(cx + offX, cy + offY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** 绘制副刀符阵（方案B：旋转符文提示） */
  private drawSubRunes(ctx: CanvasRenderingContext2D) {
    if (this.subRune.length === 0) return;
    for (const r of this.subRune) {
      const t = r.life / r.maxLife;
      const alpha = Math.min(1, t * 4) * 0.6;
      const pulse = Math.sin(this.elapsed * 8 + r.x) * 0.5 + 0.5;
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.globalAlpha = alpha;
      // 外圈符文环（旋转）
      const rotAngle = this.elapsed * 4;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = r.color;
      ctx.shadowBlur = 8;
      // 外圆
      ctx.beginPath();
      ctx.arc(0, 0, 8 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      // 内圈8个小圆
      for (let i = 0; i < 8; i++) {
        const a = rotAngle + (Math.PI * 2 / 8) * i;
        const rx = Math.cos(a) * 10;
        const ry = Math.sin(a) * 10;
        ctx.beginPath();
        ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // 中心点
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
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
    const auraCount = energyRatio >= 0.9 ? 4 : energyRatio >= 0.6 ? 2 : 1;
    for (let i = 0; i < auraCount; i += 1) {
      ctx.strokeStyle = stage.color;
      ctx.shadowColor = stage.color;
      ctx.shadowBlur = 12 + energyRatio * 28;
      ctx.lineWidth = 4 + energyRatio * 7 - i;
      ctx.globalAlpha = (0.16 + energyRatio * 0.46) / (i + 1);
      ctx.beginPath();
      ctx.arc(0, -12, 42 + energyRatio * 18 + drawPulse * 8 + i * 9 + Math.sin(this.elapsed * 5 + i) * 2, -Math.PI * 0.92, -Math.PI * 0.92 + energyRatio * Math.PI * 1.85);
      ctx.stroke();
    }
    if (energyRatio >= 0.6) {
      for (let i = 0; i < 4; i += 1) {
        const angle = this.elapsed * 2.2 + i * Math.PI * 0.5;
        const r = 34 + energyRatio * 28 + Math.sin(this.elapsed * 4 + i) * 4;
        ctx.globalAlpha = 0.2 + energyRatio * 0.28;
        ctx.strokeStyle = stage.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * r, -14 + Math.sin(angle) * r * 0.36);
        ctx.quadraticCurveTo(0, -44 - energyRatio * 18, Math.cos(angle + 0.7) * (r + 12), -12 + Math.sin(angle + 0.7) * r * 0.36);
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

    // 副刀槽位1（蓄势）：战士左侧
    this.drawSubBladeSlot(ctx, 0, 24, BALANCE.battlefield.warriorY + 5, 26, 0x5bc0ff);
    // 副刀槽位2（破点）：战士右侧
    this.drawSubBladeSlot(ctx, 1, DESIGN_WIDTH - 76, BALANCE.battlefield.warriorY + 5, 26, 0xff6a33);

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

    // 背景
    ctx.save();
    ctx.fillStyle = "rgba(18, 16, 14, 0.6)";
    ctx.strokeStyle = "rgba(255, 214, 124, 0.25)";
    ctx.lineWidth = 1;
    roundRect(ctx, eBarX, eBarY, eBarW, eBarH, 6);
    ctx.fill();
    ctx.stroke();

    // 段位色彩分层（极淡的色块作为背景刻度）
    const segColors = [
      { x0: 0, x1: 0.10, color: "rgba(192, 208, 224, 0.08)" },
      { x0: 0.10, x1: 0.40, color: "rgba(192, 208, 224, 0.16)" },
      { x0: 0.40, x1: 0.90, color: "rgba(91, 192, 255, 0.16)" },
      { x0: 0.90, x1: 1.00, color: "rgba(255, 211, 90, 0.20)" },
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

    ctx.restore();

    // 破阵就绪提示（移到屏幕顶部下方，与关卡文字分隔）
    if (eTier === "burst" && !this._breakReadyNotified) {
      this._breakReadyNotified = true;
      this.addText(DESIGN_WIDTH / 2, 100, "破阵斩已就绪！", "#ffd35a", 20, 1.8);
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

  /** 副刀槽位渲染（战士左右侧） */
  private drawSubBladeSlot(ctx: CanvasRenderingContext2D, slotIndex: number, x: number, y: number, iconR: number, color: number) {
    const blade = this.subBlades[slotIndex] ?? null;
    const colorStr = "#" + color.toString(16).padStart(6, "0");
    const slotType = slotIndex === 0 ? "蓄势" : "破点";
    const slotTypeIcon = slotIndex === 0 ? "斩" : "破";

    ctx.save();

    // 槽位底框（圆形背景）
    ctx.fillStyle = "rgba(18, 16, 14, 0.75)";
    ctx.beginPath();
    ctx.arc(x + iconR, y + iconR, iconR + 2, 0, Math.PI * 2);
    ctx.fill();

    // 边框（统一样式）
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x + iconR, y + iconR, iconR, 0, Math.PI * 2);
    ctx.stroke();

    if (!blade) {
      ctx.fillStyle = "rgba(246, 231, 189, 0.35)";
      ctx.font = '600 10px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("空", x + iconR, y + iconR + 4);
    } else {
      const timer = this.subBladeTimers[slotIndex] ?? 0;
      const cd = this.subBladeCooldowns[slotIndex] ?? 5;
      const ratio = Math.min(1, timer / cd);
      const ready = ratio >= 1;

      if (ready) {
        // Ready: 完整光环 + 中心色点
        const pulse = 0.5 + Math.sin(this.elapsed * 6 + slotIndex * 2) * 0.5;
        ctx.strokeStyle = colorStr;
        ctx.shadowColor = colorStr;
        ctx.shadowBlur = 12 + pulse * 12;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + iconR, y + iconR, iconR - 1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // 中心icon（统一风格）
        ctx.fillStyle = colorStr;
        ctx.font = '900 16px "Microsoft YaHei", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(slotTypeIcon, x + iconR, y + iconR + 1);
      } else {
        // 冷却中：未填充圆 + 进度弧（统一风格）
        // 底圈
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(x + iconR, y + iconR, iconR - 1, 0, Math.PI * 2);
        ctx.stroke();
        // 进度弧
        ctx.strokeStyle = colorStr;
        ctx.lineWidth = 3.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(x + iconR, y + iconR, iconR - 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
        ctx.stroke();
        // CD数字（中心）
        ctx.fillStyle = "#f6e7bd";
        ctx.font = '700 14px "Microsoft YaHei", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${Math.ceil(cd - timer)}`, x + iconR, y + iconR);
      }
    }
    ctx.restore();

    // 槽位标签（图标下方）
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = colorStr;
    ctx.font = '700 11px "Microsoft YaHei", sans-serif';
    ctx.fillText(slotType, x + iconR, y + iconR * 2 + 6);
    ctx.restore();
  }

  private drawFloatingTexts(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const text of this.texts) {
      const alpha = clamp(text.life / text.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = text.color;
      ctx.font = `700 ${text.size}px "Microsoft YaHei", sans-serif`;
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 4;
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
    const lines = [
      `level: ${this.level.id}`,
      `phase: ${this.phase}`,
      `wave: ${Math.min(this.wavesSpawned, this.level.waves.length)}/${this.level.waves.length}`,
      `enemies: ${this.enemies.length}`,
      `energy: ${this.energy.toFixed(1)}`,
      `stage: ${stage.label}`,
      `slash stage: ${slash ? SWORD_STAGE_BY_ID[slash.tier].name : "-"}`,
      `slash time: ${slash ? slash.remainingDuration.toFixed(2) : "-"}`,
      `slash path: ${slash ? slash.remainingPathLength.toFixed(0) : "-"}`,
      `hits: ${slash ? slash.hitEnemyIds.size : 0}`,
      `max single: ${this.stats.maxSingleBlade}`
    ];

    ctx.save();
    ctx.fillStyle = "rgba(13, 16, 17, 0.78)";
    ctx.fillRect(10, 82, 178, 190);
    ctx.strokeStyle = "rgba(255, 214, 124, 0.36)";
    ctx.strokeRect(10, 82, 178, 190);
    ctx.fillStyle = "#f6e7bd";
    ctx.font = '11px "Consolas", monospace';
    ctx.textAlign = "left";
    lines.forEach((line, index) => ctx.fillText(line, 18, 102 + index * 16));
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
    if (this.elapsed < this.level.eliteSpawnAt) return;
    this.eliteSpawned = true;
    const ek = this.level.eliteKind;
    const conf = ELITE_CONFIG[ek];
    // 在随机列生成
    const lanes = [44, 92, 140, 188, 236, 284, 336];
    const lane = lanes[Math.floor(Math.random() * lanes.length)];
    const enemy = this.createElite(ek, lane, BALANCE.battlefield.enemySpawnY, conf);
    this.enemies.push(enemy);
    this.discoveredEnemies.add("elite");
    // 出场播报（2.5秒）
    this.eliteIntroTimer = 2.5;
    this.eliteIntroText = conf.introText;
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
    if (this.bossSpawned || !this.level.bossId) return;
    // 突破战(boss关): Boss开场即出（0.5秒后）
    const isChallengeBreakthrough = this.currentRunMode === "challenge";
    if (isChallengeBreakthrough) {
      if (this.elapsed < 0.5) return;
      this.bossSpawned = true;
    } else {
      // 普通主线不会有 boss（由 levels.ts 配置控制）
      // Boss在最后一波敌人出波完成后才出
      if (this.wavesSpawned < this.level.waves.length) return;
      if (this.elapsed < this.wavesFinishedAt + 5) return;
      this.bossSpawned = true;
    }
    const bid = this.level.bossId;
    const enemy = this.createBoss(bid);
    this.enemies.push(enemy);
    this.discoveredEnemies.add("boss");
    // 出场播报（带暂停效果）
    this.bossIntroTimer = 3;
    this.bossIntroText = BOSS_CONFIG[bid].introText;
    this.phase = "playing"; // 确保不误用buffChoice
    this.screenShake = Math.max(this.screenShake, 0.8);
    this.flash = Math.max(this.flash, 0.65);
    this.particles.push(glowParticle({ x: DESIGN_WIDTH / 2, y: BALANCE.battlefield.enemySpawnY }, BOSS_CONFIG[bid].color, 40, 80));
    logEvent("boss_spawn", { levelId: this.level.id, bossId: bid, time: this.elapsed });
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
      const conf = BOSS_CONFIG[enemy.bossId];
      const prevPhase = enemy.bossPhase ?? 0;
      const newPhase = getBossPhase(conf, enemy.hp);

      // 阶段切换检测
      if (newPhase !== prevPhase) {
        enemy.bossPhase = newPhase;
        enemy.flash = 0.5;
        this.screenShake = Math.max(this.screenShake, 0.6);
        this.flash = Math.max(this.flash, 0.55);
        this.addText(DESIGN_WIDTH / 2, 160, conf.phases[newPhase].announce, conf.color, 22, 2);
        AudioService.oneBladeBreak(); // 借用
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
          const lanes = [44, 92, 140, 188, 236, 284, 336];
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
      skillCooldown: 0
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

  /** 随机抽取一个军令 */
  private getRandomBuff(): BuffId {
    const all = RUN_BUFFS.map(b => b.id);
    return all[Math.floor(Math.random() * all.length)];
  }

  /** 应用军令 */
  private applyChestBuff(id: BuffId) {
    this.runBuffs.add(id);
    const buff = RUN_BUFF_BY_ID[id];
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
  private updateChestDrop(dt: number) {
    if (!this.chestDropped) return;

    if (!this.chestOpened) {
      this.chestDropTimer += dt;
      // 3秒后自动打开
      if (this.chestDropTimer >= 3) {
        this.chestOpening = true;
        this.chestOpened = true;
        this.chestAnimTimer = 0;
        this.chestBuffResult = this.getRandomBuff();
        this.chestBuffRevealed = false;
        // 宝箱打开全屏粒子爆发
        for (let i = 0; i < 4; i++) {
          this.particles.push(glowParticle(
            { x: this.chestDropX + (Math.random() - 0.5) * 30, y: this.chestDropY + (Math.random() - 0.5) * 30 },
            "#ffd35a", 30 + Math.random() * 12, 60
          ));
        }
        for (let i = 0; i < 3; i++) {
          this.particles.push(glowParticle(
            { x: this.chestDropX + (Math.random() - 0.5) * 40, y: this.chestDropY + (Math.random() - 0.5) * 40 },
            "#ffb15c", 22 + Math.random() * 10, 50
          ));
        }
        this.particles.push(ringParticle({ x: this.chestDropX, y: this.chestDropY }, "#ffd35a", 80));
        this.particles.push(ringParticle({ x: this.chestDropX, y: this.chestDropY }, "#ff9e7a", 60));
        for (let i = 0; i < 8; i++) {
          this.particles.push(...sparkBurst({ x: this.chestDropX + (Math.random() - 0.5) * 20, y: this.chestDropY + (Math.random() - 0.5) * 20 }, 4, "#ffd35a"));
        }
        this.flash = Math.max(this.flash, 0.7);
        this.screenShake = Math.max(this.screenShake, 0.5);
        this.addText(this.chestDropX, this.chestDropY - 36, "军令宝箱开启", "#ffd35a", 18, 1.8);
        AudioService.pickup();
      }
    }

    if (this.chestOpened && !this.chestBuffRevealed) {
      this.chestAnimTimer += dt;
      // 0.8秒后揭示军令
      if (this.chestAnimTimer >= 0.8) {
        this.chestBuffRevealed = true;
        if (this.chestBuffResult) {
          this.applyChestBuff(this.chestBuffResult);
          // 播放随机卷轴动画：卷轴在空中展开
          const buff = RUN_BUFF_BY_ID[this.chestBuffResult];
          const routeColor = ROUTE_COLORS[buff.route];
          this.particles.push(ringParticle({ x: DESIGN_WIDTH / 2, y: 140 }, routeColor, 60));
          this.addText(DESIGN_WIDTH / 2, 120, `${ROUTE_NAMES[buff.route]}·${buff.name}`, routeColor, 24, 2);
          this.flash = Math.max(this.flash, 0.7);
        }
      }
    }

    // 3秒后清除宝箱状态
    if (this.chestBuffRevealed && this.chestAnimTimer > 3) {
      this.chestDropped = false;
    }
  }

  /** 绘制军令宝箱 */
  private drawChestDrop(ctx: CanvasRenderingContext2D) {
    if (!this.chestDropped) return;
    const cx = this.chestDropX;
    const cy = this.chestDropY - (this.chestOpening ? 8 : 0);

    // 落点光环：金色波纹 + 远景光柱
    const ringT = (this.chestDropTimer * 2) % 1;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 211, 90, ${1 - ringT * 0.8})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 8 + ringT * 60, 0, Math.PI * 2);
    ctx.stroke();
    // 第二层环
    const ringT2 = (this.chestDropTimer * 2 + 0.5) % 1;
    ctx.strokeStyle = `rgba(255, 158, 122, ${1 - ringT2 * 0.8})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 8 + ringT2 * 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);

    if (!this.chestOpened) {
      // 未打开：金色箱子（强化版）
      const pulse = 1 + Math.sin(this.chestDropTimer * 3) * 0.08;
      ctx.scale(pulse, pulse);

      // 阴影光晕
      ctx.shadowColor = "#ffd35a";
      ctx.shadowBlur = 20;

      // 箱子体（加大）
      ctx.fillStyle = "#8b6914";
      ctx.strokeStyle = "#ffd35a";
      ctx.lineWidth = 2.5;
      ctx.fillRect(-22, -10, 44, 24);
      ctx.strokeRect(-22, -10, 44, 24);

      // 箱子盖
      ctx.fillStyle = "#a07d1a";
      ctx.beginPath();
      ctx.moveTo(-24, -12);
      ctx.lineTo(0, -22);
      ctx.lineTo(24, -12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 锁扣
      ctx.fillStyle = "#ffd35a";
      ctx.fillRect(-4, -4, 8, 5);
      ctx.fillStyle = "#8b6914";
      ctx.fillRect(-1, -1, 2, 2);

      ctx.shadowBlur = 0;

      // 倒计时
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
      // 中心圆
      ctx.fillStyle = "#ffd35a";
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8b6914";
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
    } else {
        // 军令已揭示：大图标 + 名字
        const buff = RUN_BUFF_BY_ID[this.chestBuffResult!];
        if (buff) {
          // 背景光圈
          ctx.fillStyle = "rgba(255, 211, 90, 0.3)";
          ctx.beginPath();
          ctx.arc(0, 0, 30, 0, Math.PI * 2);
          ctx.fill();
          // 圆形
          ctx.fillStyle = buff.color;
          ctx.shadowColor = buff.color;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(0, 0, 22, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          // 军令字符（取名字首字）
          ctx.fillStyle = "#fff";
          ctx.font = '900 22px "Microsoft YaHei", sans-serif';
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(buff.name.charAt(0), 0, 1);
          // 军令名称（横条）
          const nameW = ctx.measureText(buff.name).width + 16;
          ctx.fillStyle = "rgba(20, 14, 8, 0.85)";
          ctx.fillRect(-nameW / 2, 30, nameW, 16);
          ctx.fillStyle = buff.color;
          ctx.font = '700 11px "Microsoft YaHei", sans-serif';
          ctx.fillText(buff.name, 0, 39);
        }
    }
    ctx.restore();

    // 顶部"军令宝箱"标题
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

  /** 绘制精英/Boss出场播报 */
  private drawIntroOverlay(ctx: CanvasRenderingContext2D) {
    const timer = Math.max(this.eliteIntroTimer, this.bossIntroTimer);
    if (timer <= 0) return;

    const text = this.eliteIntroTimer > 0 ? this.eliteIntroText : this.bossIntroText;
    const isBoss = this.bossIntroTimer > 0;
    const alpha = Math.min(1, timer * 2);

    ctx.save();
    ctx.globalAlpha = alpha;

    // 半透明暗色遮罩
    ctx.fillStyle = "rgba(10, 7, 5, 0.35)";
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // 弹出版本文字（从下往上）
    const slideY = 300 - (isBoss ? 20 : 10) * (1 - Math.min(1, timer * 3));

    // 名称大字
    ctx.shadowColor = isBoss ? "#c0392b" : "#d48c2a";
    ctx.shadowBlur = isBoss ? 24 : 16;
    ctx.fillStyle = isBoss ? "#f5b7b1" : "#f5d78a";
    ctx.font = isBoss ? '800 32px "Microsoft YaHei", sans-serif' : '800 26px "Microsoft YaHei", sans-serif';
    ctx.fillText(text, DESIGN_WIDTH / 2, slideY);

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(246, 231, 189, 0.72)";
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillText(isBoss ? "Boss 参上！" : "精英 现身", DESIGN_WIDTH / 2, slideY + 36);

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
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    // 降级方案
    ctx.beginPath();
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
