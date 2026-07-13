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
import { getBladeTier, getTierConfig, consumeEnergyForSlash, recoverEnergy } from "./systems/bladeEnergySystem";
import { isSharpTurn, segmentHitCircle } from "./systems/collisionSystem";
import { paperBurst, ringParticle, sparkBurst, glowParticle, explosionBurst, coreCollapseBurst } from "./systems/particleSystem";
import { applyBattleRewards, evaluateRating, getCurrentRunContext, getUpgradeModifiers, getEquippedBlades } from "./services/ProgressionService";
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

  private pointerDown = false;
  private pointerPos?: Vec2;
  private wavesSpawned = 0;
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

  // 首局教学标志
  private isFirstRun = false;
  private firstRunGuideShown = false;
  private firstRunPrettySlashShown = false;
  private firstRunCoreBoomShown = false;

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

    // 首局教学检测
    this.isFirstRun = level.id === 1 && !window.localStorage.getItem("one_blade_first_run_done");
    if (this.isFirstRun) {
      this.overrideWithScriptedTutorial();
      this.showHint("drag-guide", "按住拖动，松手挥出一刀", DESIGN_WIDTH / 2, 118, 2.5);
    }

    // 初始化副刀
    const equipped = getEquippedBlades();
    this.mainBladeQuality = equipped.main?.quality ?? null;
    this.subBlades = equipped.subs.filter(b => b && b.quality);
    this.subBladeTimers = this.subBlades.map(() => 0);
    this.subBladeCooldowns = this.subBlades.map((b) => {
      const stats = BLADE_BASE_STATS[b.quality];
      return stats ? stats.subSlashInterval : 5;
    });
  }

  /** 首局教学：使用固定波次代替随机 */
  private overrideWithScriptedTutorial() {
    this.level.waves = [
      {
        name: "纸片兵",
        delay: 0.2,
        spawnAt: 0.5,
        speedMultiplier: 0.7,
        enemies: [
          { kind: "infantry", x: 44, count: 1 },
          { kind: "infantry", x: 110, count: 1 },
          { kind: "infantry", x: 172, count: 1 },
          { kind: "infantry", x: 236, count: 1 },
          { kind: "infantry", x: 300, count: 1 },
        ],
      },
      {
        name: "密集敌军",
        delay: 0.2,
        spawnAt: 6,
        speedMultiplier: 0.8,
        enemies: [
          { kind: "infantry", x: 44, count: 2 },
          { kind: "infantry", x: 120, count: 2 },
          { kind: "powder", x: 188, count: 1 },
          { kind: "infantry", x: 250, count: 2 },
          { kind: "infantry", x: 310, count: 2 },
        ],
      },
      {
        name: "阵型挑战",
        delay: 0.2,
        spawnAt: 14,
        speedMultiplier: 0.9,
        enemies: [
          { kind: "infantry", x: 44, count: 2 },
          { kind: "shield", x: 100, count: 1 },
          { kind: "core", x: 188, count: 1 },
          { kind: "shield", x: 280, count: 1 },
          { kind: "infantry", x: 340, count: 2 },
        ],
      },
    ];
    // 教程波次低速、满刀势
    this.level.initialEnergy = BALANCE.swordEnergy.max;
    this.level.enemySpeed = 0.65;
    this.level.durationSeconds = 180;
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
    if (!this.currentSlash?.active && this.energy >= 90) {
      this.showHint("burst-ready", "破阵锋已成", DESIGN_WIDTH / 2, 656, 1);
    }

    this.drumTimer = Math.max(0, this.drumTimer - scaledDt);
    this.warDrumNoDecayTimer = Math.max(0, this.warDrumNoDecayTimer - scaledDt);
    this.warriorDrawTimer = Math.max(0, this.warriorDrawTimer - scaledDt);
    this.warriorSheathTimer = Math.max(0, this.warriorSheathTimer - scaledDt);
    this.screenShake = Math.max(0, this.screenShake - scaledDt * 2.7);
    this.flash = Math.max(0, this.flash - scaledDt * 2.2);

    this.updateActiveSlash(scaledDt);
    this.updateEnemies(scaledDt);
    this.updatePickups(scaledDt);
    this.updateParticles(scaledDt);
    this.updateTexts(scaledDt);
    this.updateWaves(scaledDt);
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
    this.drawParticles(ctx);
    this.drawDefenseAndWarrior(ctx);
    this.drawHud(ctx);
    this.drawSplitFlashes(ctx);
    this.drawFloatingTexts(ctx);
    this.drawWaveProgress(ctx);
    this.drawChestDrop(ctx);
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

    this.energy = consumeEnergyForSlash(this.energy);
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

    trail.remainingDuration = Math.max(0, trail.remainingDuration - dt);
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

    if (BALANCE.swordEnergy.applyKillEnergyAfterSlash) {
      const gainedEnergy = Math.min(trail.energyBank, BALANCE.swordEnergy.maxEnergyGainPerSlash);
      this.energy = clamp(this.energy + gainedEnergy, 0, BALANCE.swordEnergy.max);
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

    if (enemy.kind === "infantry") {
      this.killEnemy(enemy, trail, false, "paper");
      AudioService.slashHit();
    }

    if (enemy.kind === "shield") {
      if (stage.canBreakShield || (trail.tier === "normal" && this.hasBuff("pierceShield"))) {
        this.killEnemy(enemy, trail, false, "shield");
      } else if (trail.tier === "normal") {
        this.damageEnemy(enemy, 1 * this.progressionModifiers.shieldDamageMultiplier * bladeDmg, trail, false, "shield_crack");
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
      if (enemy.bossId === "simaYi" && (enemy.bossPhase === 0 || enemy.bossPhase === undefined)) {
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
      enemy.y += enemy.speed * statusSlow * fortressSlow * dt;

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

  /** 副刀自动攻击 - 两把副刀对称角度出刀（视觉拖影+伤害扫描） */
  private updateSubBlades(dt: number) {
    for (let i = 0; i < 2; i++) {
      const blade = this.subBlades[i];
      if (!blade) continue;
      this.subBladeTimers[i] += dt;
      if (this.subBladeTimers[i] < this.subBladeCooldowns[i]) continue;
      this.subBladeTimers[i] = 0;
      const stats = BLADE_BASE_STATS[blade.quality];
      if (!stats) continue;

      const cx = DESIGN_WIDTH / 2;
      const cy = BALANCE.battlefield.warriorY;
      // 两把副刀分别从左/右斜下方挥向斜上方
      const angle = i === 0 ? -Math.PI * 0.6 : -Math.PI * 0.4;
      const reach = 80 + (stats.bladeMultiplier - 1) * 30;
      const tipX = cx + Math.cos(angle) * reach;
      const tipY = cy + Math.sin(angle) * reach;
      const tailX = cx - Math.cos(angle) * 30;
      const tailY = cy - Math.sin(angle) * 30;

      // 路径粒子（拖影）
      for (let p = 0; p < 6; p++) {
        const t = p / 6;
        const px = tailX + (tipX - tailX) * t;
        const py = tailY + (tipY - tailY) * t;
        this.particles.push(ringParticle({ x: px, y: py }, "rgba(168, 230, 207, 0.6)", 12));
      }

      // 扫描路径上所有敌人
      const hits: Enemy[] = [];
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        // 检查到路径线段的距离
        const dist = distanceToSegment(enemy, { x: tailX, y: tailY }, { x: tipX, y: tipY });
        if (dist < enemy.radius + 22) hits.push(enemy);
      }

      // 应用伤害 + 词缀
      const damage = stats.damageMultiplier;
      let killedAny = false;
      for (const target of hits) {
        target.hp -= Math.ceil(damage);
        target.flash = 0.18;
        const killed = target.hp <= 0;
        if (killed) {
          target.alive = false;
          this.score += target.score;
          this.stats.kills += 1;
          this.particles.push(...paperBurst(target, 6, ["#a8e6cf", "#f6e7bd"]));
          killedAny = true;
        }
        this.particles.push(ringParticle({ x: target.x, y: target.y }, "#a8e6cf", 16));
        if (blade.affix) {
          this.applySubAffixEffect(blade.affix, target, killed);
        }
      }

      if (hits.length > 0) {
        // 命中统计
      } else {
        // 无敌人：恢复1点刀势
        this.energy = Math.min(BALANCE.swordEnergy.max, this.energy + 1);
      }
    }
  }

  /** 副刀词缀效果 */
  private applySubAffixEffect(affix: string, target: Vec2, killed: boolean) {
    switch (affix) {
      case "frost":
        for (const e of this.enemies) {
          if (!e.alive || distance(e, target) > 50) continue;
          e.slowedTimer = 0.8;
        }
        this.addText(target.x, target.y - 34, "冰霜", "#9FE1CB", 12, 0.4);
        this.particles.push(ringParticle(target, "#9FE1CB", 24));
        break;
      case "flame":
        for (const e of this.enemies) {
          if (!e.alive || distance(e, target) > 40) continue;
          e.ignited = true;
        }
        this.addText(target.x, target.y - 34, "烈火", "#F0997B", 12, 0.4);
        this.particles.push(...sparkBurst(target, 8, "#F0997B"));
        break;
      case "thunder":
        this.addText(target.x, target.y - 34, "雷暴", "#AFA9EC", 12, 0.4);
        this.flash = Math.max(this.flash, 0.35);
        const chain = this.enemies.filter(e => e.alive && distance(e, target) < 70).slice(0, 3);
        for (const ct of chain) {
          ct.hp -= 1; ct.flash = 0.3;
          this.particles.push(ringParticle(ct, "#AFA9EC", 16));
          if (ct.hp <= 0) { ct.alive = false; this.score += ct.score; this.stats.kills += 1; }
        }
        break;
      case "armorBreak":
        for (const e of this.enemies) {
          if (!e.alive || e.kind !== "shield" || distance(e, target) > 55) continue;
          e.hp -= 1; e.flash = 0.2;
        }
        this.addText(target.x, target.y - 34, "破甲", "#85B7EB", 12, 0.4);
        break;
      case "vampire":
        if (killed) {
          this.energy = Math.min(BALANCE.swordEnergy.max, this.energy + 8);
          this.addText(target.x, target.y - 34, "回春+"+Math.round(8), "#a8e6cf", 12, 0.4);
        }
        break;
      case "phantom":
        if (!killed) {
          const p = this.enemies.find(e => e.alive && distance(e, target) < 45);
          if (p) { p.hp -= 0.5; p.flash = 0.2; }
          this.addText(target.x, target.y - 34, "幻影", "#EEEDFE", 12, 0.4);
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

  private updateWaves(dt: number) {
    if (this.wavesSpawned >= this.level.waves.length) return;
    const wave = this.level.waves[this.wavesSpawned];

    if (wave.spawnAt !== undefined) {
      if (this.elapsed < wave.spawnAt) return;
    } else {
      if (this.enemies.length > 0) return;
      this.nextWaveTimer -= dt;
      if (this.nextWaveTimer > 0) return;
      this.nextWaveTimer = wave.delay;
    }

    this.wavesSpawned += 1;
    // 每波HP递增（从第2波开始+1，最多+5）
    this.waveHpBonus = Math.min(5, this.wavesSpawned);
    const speedMultiplier = wave.speedMultiplier ?? 1;

    for (const spawn of wave.enemies) {
      const cnt = Math.max(1, spawn.count ?? 1);
      const spawnY = BALANCE.battlefield.enemySpawnY - (spawn.yOffset ?? 0);
      // 多只同品质敌人均匀分布在7条通道
      const lanes = [44, 92, 140, 188, 236, 284, 336];
      for (let k = 0; k < cnt; k++) {
        const x = cnt > 1 ? lanes[Math.floor((k * lanes.length) / cnt)] : spawn.x;
        const yJ = (k % 2) * 8 - 4;
        this.enemies.push(this.createEnemy(spawn.kind, x, spawnY + yJ, speedMultiplier));
        this.discoveredEnemies.add(spawn.kind);
        // 出生烟雾
        this.particles.push(glowParticle({ x, y: spawnY + yJ }, "#5c4a3a", 12, 20));
      }
    }
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
      this.wavesSpawned >= this.level.waves.length &&
      this.enemies.length === 0 &&
      !this.currentSlash &&
      this.elapsed >= Math.max(0, this.level.durationSeconds - 8)
    ) {
      this.finish(true);
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
      formationWrongHits: 0
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
    const displayFloor = this.level.id >= 10000 ? this.level.id - 10000 : this.level.id;
    ctx.fillText(`第${displayFloor}关 ${this.level.title}`, DESIGN_WIDTH / 2, 28);
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

      // ═════════════════════════════════════
      // 汉字化渲染：单字 + 颜色 + 动效
      // ═════════════════════════════════════

      if (enemy.kind === "infantry") {
        // 步兵："兵"字 朱红，旋转下落动画
        const rot = Math.sin(enemy.wobble * 5) * 0.15;
        ctx.save();
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

        // 名称
        ctx.fillStyle = "#fff3c0";
        ctx.font = '700 11px "Microsoft YaHei", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText(visDef.name, 0, -enemy.radius - 10);

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
    const trail = this.currentSlash;
    if (!trail) return;

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

    ctx.globalAlpha = 0.23;
    ctx.fillStyle = "#efd08c";
    for (let x = -10; x < DESIGN_WIDTH; x += 44) {
      ctx.fillRect(x, WALL_TOP_Y + 18, 28, 8);
      ctx.fillRect(x + 20, WALL_TOP_Y + 48, 30, 8);
    }
    ctx.globalAlpha = 1;

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

    // 副刀槽位（始终显示2个，未解锁显示🔒+条件，已装备显示冷却）
    {
      const startX = 20;
      const y = 824;
      ctx.textAlign = "left";
      for (let i = 0; i < 2; i++) {
        const ix = startX + i * 32;
        const blade = this.subBlades[i] ?? null;
        ctx.save();

        if (!blade) {
          // 未装备
          ctx.fillStyle = "rgba(18, 16, 14, 0.6)";
          ctx.beginPath();
          ctx.arc(ix + 8, y + 6, 11, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 211, 90, 0.3)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = "rgba(246, 231, 189, 0.5)";
          ctx.font = '600 8px "Microsoft YaHei", sans-serif';
          ctx.textAlign = "center";
          ctx.fillText("空", ix + 8, y + 9);
        } else {
          const timer = this.subBladeTimers[i] ?? 0;
          const cd = this.subBladeCooldowns[i] ?? 5;
          const ratio = Math.min(1, timer / cd);
          // 圆背景
          ctx.fillStyle = "rgba(18, 16, 14, 0.7)";
          ctx.beginPath();
          ctx.arc(ix + 8, y + 6, 11, 0, Math.PI * 2);
          ctx.fill();
          if (ratio >= 1) {
            ctx.strokeStyle = "#a8e6cf";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(ix + 8, y + 6, 10, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = "#a8e6cf";
            ctx.font = '700 8px "Microsoft YaHei", sans-serif';
            ctx.textAlign = "center";
            ctx.fillText("⚔", ix + 8, y + 9);
          } else {
            // 冷却进度弧
            const qualityColor = BLADE_BASE_STATS[blade.quality] ? "#ffd35a" : "rgba(168, 230, 207, 0.5)";
            ctx.strokeStyle = qualityColor;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(ix + 8, y + 6, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
            ctx.stroke();
            // 品质边框
            ctx.strokeStyle = "rgba(240, 195, 107, 0.4)";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(ix + 8, y + 6, 10, 0, Math.PI * 2);
            ctx.stroke();
            // 数字
            ctx.fillStyle = "#f6e7bd";
            ctx.font = '600 9px "Microsoft YaHei", sans-serif';
            ctx.textAlign = "center";
            ctx.fillText(`${Math.ceil(cd - timer)}s`, ix + 8, y + 9);
          }
        }
        ctx.restore();
      }
    }

    ctx.fillStyle = "#f6e7bd";
    ctx.font = '700 13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(`刀势 ${Math.floor(this.energy)}% ${stage.name}`, DESIGN_WIDTH / 2, 828);
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

    const itemSize = 36;
    const gap = 8;
    const startX = DESIGN_WIDTH - 16;
    const startY = DESIGN_HEIGHT - 110;

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
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ix + itemSize / 2, iy + itemSize / 2, itemSize / 2, 0, Math.PI * 2);
      ctx.stroke();

      // 字符
      ctx.fillStyle = item.color;
      ctx.font = '800 16px "Microsoft YaHei", "SimHei", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = item.color;
      ctx.shadowBlur = 6;
      ctx.fillText(item.label, ix + itemSize / 2, iy + itemSize / 2);
      ctx.shadowBlur = 0;

      // 倒计时：旋转圆环
      if (item.ratio < 1) {
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + Math.PI * 2 * item.ratio;
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ix + itemSize / 2, iy + itemSize / 2, itemSize / 2 + 3, startAngle, endAngle);
        ctx.stroke();
        // 剩余秒数
        ctx.fillStyle = "#fff";
        ctx.font = '700 10px "Microsoft YaHei", sans-serif';
        ctx.fillText(`${Math.ceil(item.ratio * (PICKUP_BALANCE.drum.duration === "next_slash" ? 5 : Number(PICKUP_BALANCE.drum.duration) || 5))}`, ix + itemSize / 2, iy + itemSize + 8);
      } else {
        // 永续效果：脉动圆
        const pulse = 0.6 + Math.sin(this.elapsed * 4) * 0.4;
        ctx.strokeStyle = `rgba(${item.color.slice(1).match(/.{2}/g)?.map((h) => parseInt(h, 16)).join(", ") || "255,255,255"}, ${pulse * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ix + itemSize / 2, iy + itemSize / 2, itemSize / 2 + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
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
    // 出场播报
    this.eliteIntroTimer = 2.5;
    this.eliteIntroText = conf.introText;
    // 出场特效
    this.screenShake = Math.max(this.screenShake, 0.45);
    this.flash = Math.max(this.flash, 0.35);
    this.particles.push(glowParticle({ x: lane, y: BALANCE.battlefield.enemySpawnY }, conf.color, 30, 55));
    logEvent("elite_spawn", { levelId: this.level.id, eliteKind: ek, time: this.elapsed });
  }

  /** Boss生成 */
  private updateBossSpawn() {
    if (this.bossSpawned || !this.level.bossId) return;
    // Boss在最后一波之后才生成
    if (this.wavesSpawned < this.level.waves.length) return;
    if (this.elapsed < this.level.durationSeconds - 20) return;
    this.bossSpawned = true;
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

      if (enemy.bossId === "zhangFei") {
        // 张飞：怒吼 — 碰到的刀芒损耗能量
        if (enemy.skillCooldown >= conf.skill.cooldown) {
          // 怒吼视觉
          this.particles.push(ringParticle(enemy, conf.color, 80));
          this.screenShake = Math.max(this.screenShake, 0.45);
          enemy.skillCooldown = 0;
        }
      }

      if (enemy.bossId === "simaYi") {
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

      if (enemy.bossId === "zhenJi") {
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
    // 飘落宝箱粒子
    this.particles.push(glowParticle({ x, y }, "#ffd35a", 20, 45));
    this.addText(x, y - 22, "军令宝箱", "#ffd35a", 16, 1.6);
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
        // 宝箱打开粒子效果
        this.particles.push(glowParticle({ x: this.chestDropX, y: this.chestDropY }, "#ffd35a", 30, 60));
        this.particles.push(...sparkBurst({ x: this.chestDropX, y: this.chestDropY }, 24, "#ffd35a"));
        this.flash = Math.max(this.flash, 0.5);
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
    const cy = this.chestDropY - (this.chestOpening ? 4 : 0);

    ctx.save();
    ctx.translate(cx, cy);

    // 宝箱主体
    const pulse = 1 + Math.sin(this.chestDropTimer * 3) * 0.06;
    const alpha = this.chestOpened ? 0.6 : 1;
    ctx.globalAlpha = alpha;

    // 宝箱阴影
    ctx.shadowColor = "#ffd35a";
    ctx.shadowBlur = this.chestOpened ? 0 : 16;

    if (!this.chestOpened) {
      // 未打开：金色箱子
      ctx.fillStyle = "#8b6914";
      ctx.strokeStyle = "#ffd35a";
      ctx.lineWidth = 2.5;
      ctx.scale(pulse, pulse);
      // 箱子体
      ctx.fillRect(-14, -8, 28, 18);
      ctx.strokeRect(-14, -8, 28, 18);
      // 箱子盖
      ctx.fillStyle = "#a07d1a";
      ctx.beginPath();
      ctx.moveTo(-15, -10);
      ctx.lineTo(0, -18);
      ctx.lineTo(15, -10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // 锁扣
      ctx.fillStyle = "#ffd35a";
      ctx.fillRect(-3, -4, 6, 4);
      // 倒计时
      ctx.fillStyle = "#fff3c0";
      ctx.font = '10px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(`${Math.ceil(3 - this.chestDropTimer)}s`, 0, 24);
    } else {
      // 已打开：卷轴 + 光效
      ctx.fillStyle = "rgba(255, 211, 90, 0.25)";
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.fill();
      // 卷轴
      if (!this.chestBuffRevealed) {
        // 卷轴旋转动画
        const spinAngle = Math.min(this.chestAnimTimer * 4, Math.PI * 0.5);
        ctx.save();
        ctx.rotate(spinAngle);
        ctx.fillStyle = "#d4a574";
        ctx.fillRect(-8, -12, 16, 24);
        ctx.strokeStyle = "#8b6914";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-8, -12, 16, 24);
        ctx.restore();
        ctx.fillStyle = "#fff3c0";
        ctx.font = '10px "Microsoft YaHei", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText("开", 0, 4);
      }
    }

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

export function getLevelById(id: number) {
  return LEVELS.find((level) => level.id === id) ?? LEVELS[0];
}
