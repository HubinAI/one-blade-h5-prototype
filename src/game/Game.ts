import { LEVELS } from "../data/levels";
import { ENEMY_DEFS } from "../data/enemies";
import { PICKUP_DEFS } from "../data/pickups";
import { DESIGN_HEIGHT, DESIGN_WIDTH, HUD_HEIGHT, WALL_TOP_Y } from "./config/constants";
import { BALANCE, ENEMY_BALANCE, PICKUP_BALANCE, SWORD_STAGE_BY_ID } from "./config/balance";
import { AD_CONFIG } from "./config/ads";
import { RUN_BUFFS, RUN_BUFF_BY_ID } from "./config/buffs";
import { REWARD_CONFIG } from "./config/rewards";
import { getBladeTier, getTierConfig, consumeEnergyForSlash, recoverEnergy } from "./systems/bladeEnergySystem";
import { isSharpTurn, segmentHitCircle } from "./systems/collisionSystem";
import { paperBurst, ringParticle, sparkBurst } from "./systems/particleSystem";
import { applyBattleRewards, evaluateRating, getUpgradeModifiers } from "./services/ProgressionService";
import { logEvent } from "./services/Analytics";
import type {
  BattleResult,
  BattleStats,
  BuffId,
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
  Vec2
} from "./types";
import { choose, clamp, distance, randomRange } from "../utils/math";

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

  private enemies: Enemy[] = [];
  private pickups: Pickup[] = [];
  private particles: Particle[] = [];
  private texts: FloatingText[] = [];
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
    score: 0
  };

  constructor(level: LevelConfig, onFinish: FinishCallback, onReviveOffer?: ReviveOfferCallback) {
    this.level = level;
    this.onFinish = onFinish;
    this.onReviveOffer = onReviveOffer;
    this.maxHp = Math.min(level.hp + this.progressionModifiers.openingShield, BALANCE.player.maxHp + this.progressionModifiers.openingShield);
    this.hp = this.maxHp;
    this.energy = clamp(level.initialEnergy + this.progressionModifiers.initialEnergyBonus, 0, BALANCE.swordEnergy.max);
    this.hintSeen = this.readSeenHints();
    this.discoveredEnemies.add("infantry");
    if (level.id === 1) {
      this.showHint("start-slash", "随时拖动挥刀", DESIGN_WIDTH / 2, 118, 2);
    }
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
    if (!this.currentSlash?.active && this.regenDelayTimer <= 0) {
      this.energy = recoverEnergy(this.energy, scaledDt * this.getPassiveRegenMultiplier(), this.drumTimer);
    }
    if (!this.currentSlash?.active && this.energy >= 90) {
      this.showHint("burst-ready", "破阵锋已成", DESIGN_WIDTH / 2, 656, 1);
    }

    this.drumTimer = Math.max(0, this.drumTimer - scaledDt);
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
    this.drawSlash(ctx);
    this.drawParticles(ctx);
    this.drawDefenseAndWarrior(ctx);
    this.drawHud(ctx);
    this.drawFloatingTexts(ctx);
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
    this.warriorDrawTimer = 0.2;
    this.warriorSheathTimer = 0;
    this.lastSlashAngle = this.angleFromWarrior(pos);
    logEvent("slash_start", { levelId: this.level.id, energy: lockedEnergy, stage: stage.name });
    this.addText(pos.x, pos.y - 18, stage.prompt, stage.color, 16, BALANCE.feedback.stageTextLife);
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
    if (this.hasBuff("burstLine") && trail.kills >= 5) {
      this.triggerBuffBurst(last, trail);
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
    this.screenShake = Math.max(this.screenShake, trail.chain > 0 ? 0.5 : 0.18);

    const stage = SWORD_STAGE_BY_ID[trail.tier];
    const praise = this.getSlashPraise(trail, reason);
    if (praise) {
      this.addText(DESIGN_WIDTH / 2, 136, praise, stage.color, praise === "一刀破阵" ? 26 : 20);
      if (praise === "一刀破阵") this.stats.oneBladeBreaks += 1;
    }
    if (trail.kills > 0) {
      this.addText(last.x, last.y - 28, `${stage.scoreName} x${trail.kills}`, stage.color, 17);
      if (slashBonus > 0) this.addText(last.x, last.y - 46, `+${slashBonus}`, "#ffd67c", 13);
    } else {
      this.addText(last.x, last.y - 22, reason, "#d9b45b", 14);
    }

    if (trail.tier === "burst" && (trail.kills >= 8 || trail.coreCollapseCount > 0)) {
      this.slowMoTimer = BALANCE.feedback.burstSlowMotionSeconds;
      this.flash = Math.max(this.flash, 1);
      this.screenShake = Math.max(this.screenShake, 0.78);
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

  private getPathLengthMultiplier() {
    return (this.hasBuff("longBlade") ? 1.18 : 1) * this.progressionModifiers.pathLength;
  }

  private getPassiveRegenMultiplier() {
    return (this.hasBuff("warDrum") ? 1.2 : 1) * this.progressionModifiers.energyRegen;
  }

  private getKillEnergyMultiplier() {
    return this.hasBuff("breath") ? 1.3 : 1;
  }

  private getExplosionRadiusMultiplier() {
    return (this.hasBuff("fireOil") ? 1.25 : 1) * this.progressionModifiers.explosionRadius;
  }

  private getCoreRadiusMultiplier() {
    return this.hasBuff("coreBreak") ? 1.25 : 1;
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
    const available = RUN_BUFFS.filter((buff) => !this.runBuffs.has(buff.id));
    const options: BuffId[] = [];
    while (options.length < 3 && available.length > 0) {
      const index = Math.floor(Math.random() * available.length);
      const [picked] = available.splice(index, 1);
      options.push(picked.id);
    }
    this.buffChoiceOptions = options;
    this.buffChoicePause = 1;
    this.phase = "buffChoice";
    this.pointerDown = false;
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
    if (id === "fortify") {
      this.maxHp = Math.min(BALANCE.player.maxHp + 1, this.maxHp + 1);
      this.hp = Math.min(this.maxHp, this.hp + 1);
    }
    this.addText(DESIGN_WIDTH / 2, 148, buff.feedback, "#ffd35a", 16, 1.4);
    logEvent("buff_choice", { levelId: this.level.id, time: this.elapsed, selectedBuff: id });
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

  private triggerBuffBurst(origin: Vec2, trail: SlashTrail) {
    const radius = 66;
    this.particles.push(ringParticle(origin, "#ffb15c", radius));
    this.particles.push(...sparkBurst(origin, 22, "#ffb15c"));
    this.addText(origin.x, origin.y - 24, "爆裂", "#ffb15c", 16);
    for (const enemy of this.enemies) {
      if (!enemy.alive || distance(enemy, origin) > radius) continue;
      this.damageEnemy(enemy, 1, trail, true, "oil");
    }
  }

  private triggerPaperSplash(origin: Enemy, trail: SlashTrail) {
    const radius = 52;
    this.particles.push(ringParticle(origin, "#f6e7bd", radius));
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.kind !== "infantry" || distance(enemy, origin) > radius) continue;
      this.damageEnemy(enemy, 1, trail, true, "paper_splash");
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
      if (segmentHitCircle(a, b, enemy, enemy.radius + bladeReach)) {
        trail.hitEnemyIds.add(enemy.id);
        this.handleEnemyHit(enemy, trail);
      }
    }

    if (trail.tier === "burst" && this.hasBuff("doubleBlade")) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const offset = 28;
      const ox = (-dy / len) * offset;
      const oy = (dx / len) * offset;
      const a2 = { x: a.x + ox, y: a.y + oy };
      const b2 = { x: b.x + ox, y: b.y + oy };
      for (const enemy of this.enemies) {
        if (!enemy.alive || trail.hitEnemyIds.has(enemy.id)) continue;
        if (segmentHitCircle(a2, b2, enemy, enemy.radius + bladeReach * 0.72)) {
          trail.hitEnemyIds.add(enemy.id);
          this.handleEnemyHit(enemy, trail);
        }
      }
    }
  }

  private handleEnemyHit(enemy: Enemy, trail: SlashTrail) {
    const stage = SWORD_STAGE_BY_ID[trail.tier];
    enemy.flash = 0.25;

    if (enemy.kind === "infantry") {
      this.killEnemy(enemy, trail, false, "paper");
    }

    if (enemy.kind === "shield") {
      if (stage.canBreakShield || (trail.tier === "normal" && this.hasBuff("shieldBreaker"))) {
        this.killEnemy(enemy, trail, false, "shield");
      } else if (trail.tier === "normal") {
        this.damageEnemy(enemy, 1 * this.progressionModifiers.shieldDamageMultiplier, trail, false, "shield_crack");
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
    }

    if (enemy.kind === "core") {
      if (stage.canTriggerCoreCollapse) {
        this.stats.coreHits += 1;
        enemy.marked = true;
        trail.pendingCoreIds.add(enemy.id);
        this.score += 6;
        this.addText(enemy.x, enemy.y - 20, "阵眼破裂", "#e8d7ff", 14);
        this.showHint("core-hit", "收刀破阵", enemy.x, Math.max(110, enemy.y - 42), 2);
        this.particles.push(ringParticle(enemy, "#e8d7ff", 34));
      } else {
        enemy.flash = 0.32;
        this.addText(enemy.x, enemy.y - 20, "裂纹未成", "#d9b45b", 13);
        this.particles.push(ringParticle(enemy, "#d9b45b", 22));
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

        const radius = (ENEMY_BALANCE.powder.explosionRadius ?? 85) * stage.explosionRadiusMultiplier * this.getExplosionRadiusMultiplier();
        this.particles.push(ringParticle(enemy, "#ffb15c", radius));
        this.particles.push(...sparkBurst(enemy, 24, "#ffb15c"));
        this.screenShake = Math.max(this.screenShake, 0.55);
        this.flash = Math.max(this.flash, 0.42);

        for (const target of this.enemies) {
          if (!target.alive || distance(target, enemy) > radius) continue;
          affectByBlast(target, ENEMY_BALANCE.powder.explosionDamage ?? 1, "chain");
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
        const radius = stage.canTriggerCoreCollapse ? stage.coreCollapseRadius * this.getCoreRadiusMultiplier() : 0;
        this.particles.push(ringParticle(enemy, "#e8d7ff", radius));
        this.particles.push(...paperBurst(enemy, 28, ["#e8d7ff", "#c7a7ff", "#5d4a8f"]));
        this.addText(enemy.x, enemy.y - 30, trail.tier === "burst" ? "大阵崩散" : "阵崩", "#e8d7ff", 18);
        this.screenShake = Math.max(this.screenShake, 0.62);
        this.flash = Math.max(this.flash, 0.55);

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
    const energyReward = (enemy.energyGain + (chainKill ? 1.5 : 0)) * stage.killEnergyMultiplier * this.getKillEnergyMultiplier();
    trail.energyBank = Math.min(BALANCE.swordEnergy.maxEnergyGainPerSlash, trail.energyBank + energyReward);

    const colors = source === "core" || source === "core_chain" ? ["#e8d7ff", "#5d4a8f", "#ead8a7"] : paperColors;
    const stageBurstBoost = trail.tier === "burst" ? 8 : trail.tier === "strong" ? 4 : 0;
    this.particles.push(...paperBurst(enemy, (enemy.kind === "shield" ? 20 : 15) + stageBurstBoost, colors));
    if (source === "powder" || source === "oil" || source === "chain") {
      this.particles.push(...sparkBurst(enemy, 18, source === "powder" ? "#ffb15c" : "#ffd67c"));
    }
    this.addText(enemy.x, enemy.y - 20, chainKill ? "连锁" : "碎", chainKill ? "#ffd67c" : "#f6e7bd", 12);
    if (enemy.kind === "infantry" && source !== "paper_splash" && this.hasBuff("paperSplash") && Math.random() < 0.2) {
      this.triggerPaperSplash(enemy, trail);
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
    this.addText(pickup.x, pickup.y - 18, PICKUP_BALANCE[pickup.kind].feedback, PICKUP_DEFS[pickup.kind].color, 15);
    trail.chain += 1;
  }

  private updateEnemies(dt: number) {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.wobble += dt;
      enemy.flash = Math.max(0, enemy.flash - dt * 3);
      const statusSlow = enemy.ignited || enemy.marked ? 0.54 : 1;
      enemy.y += enemy.speed * statusSlow * dt;

      if (enemy.y >= BALANCE.battlefield.bottomDefenseY) {
        enemy.alive = false;
        this.hp -= enemy.hpDamage;
        this.screenShake = Math.max(this.screenShake, 0.45);
        this.flash = Math.max(this.flash, 0.35);
        this.addText(enemy.x, BALANCE.battlefield.bottomDefenseY - 12, `-${enemy.hpDamage}`, "#ff7b6e", 18);
        this.particles.push(...paperBurst({ x: enemy.x, y: BALANCE.battlefield.bottomDefenseY }, 12, ["#7b241f", "#d8b46e"]));
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
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  private updateTexts(dt: number) {
    for (const text of this.texts) {
      text.life -= dt;
      text.y -= 22 * dt;
    }
    this.texts = this.texts.filter((text) => text.life > 0);
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
    const speedMultiplier = wave.speedMultiplier ?? 1;

    for (const spawn of wave.enemies) {
      this.enemies.push(this.createEnemy(spawn.kind, spawn.x, BALANCE.battlefield.enemySpawnY - (spawn.yOffset ?? 0), speedMultiplier));
      this.discoveredEnemies.add(spawn.kind);
    }
    if (wave.enemies.some((spawn) => spawn.kind === "shield")) {
      this.showHint("shield-seen", "强锋可破盾", DESIGN_WIDTH / 2, 118, 2);
    }

    const configuredPickup = wave.pickups?.[0];
    if (configuredPickup && this.pickupsSpawned < BALANCE.waves.randomPickupLimit) {
      this.pickups.push(this.createPickup(configuredPickup.kind, configuredPickup.x, BALANCE.battlefield.topY + 78 - (configuredPickup.yOffset ?? 0)));
      this.pickupsSpawned += 1;
    } else if (Math.random() < this.level.pickupChance && this.pickupsSpawned < BALANCE.waves.randomPickupLimit) {
      this.pickups.push(this.createPickup(choose<PickupKind>(["drum", "soul", "oil"]), randomRange(56, 334), BALANCE.battlefield.topY + randomRange(46, 104)));
      this.pickupsSpawned += 1;
    }

    this.addText(DESIGN_WIDTH / 2, 96, wave.name, "#f6e7bd", 16);
  }

  private checkBattleEnd() {
    if (this.hp <= 0) {
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
  }

  private finish(win: boolean) {
    if (this.finished) return;
    this.finished = true;
    this.phase = win ? "won" : "lost";
    this.stats.score = this.score;
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
      ...rewardMeta
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
    return {
      id: this.nextId("enemy"),
      kind,
      x,
      y,
      radius: balance.radius,
      hp: balance.hp,
      maxHp: balance.hp,
      speed: balance.speed * this.level.enemySpeed * speedMultiplier * randomRange(0.94, 1.08),
      hpDamage: balance.defenseDamage,
      score: balance.score,
      energyGain: balance.energyReward,
      alive: true,
      ignited: false,
      marked: false,
      shieldCrack: 0,
      flash: 0,
      wobble: randomRange(0, Math.PI * 2)
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

    ctx.globalAlpha = 0.11;
    ctx.strokeStyle = "#e7c27a";
    ctx.lineWidth = 1;
    for (let y = 0; y < DESIGN_HEIGHT; y += 18) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(y * 0.02) * 3);
      ctx.lineTo(DESIGN_WIDTH, y + Math.cos(y * 0.018) * 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(12, 9, 8, 0.55)";
    ctx.beginPath();
    ctx.moveTo(0, 188);
    ctx.lineTo(52, 144);
    ctx.lineTo(120, 188);
    ctx.lineTo(178, 126);
    ctx.lineTo(244, 188);
    ctx.lineTo(310, 136);
    ctx.lineTo(390, 188);
    ctx.lineTo(390, 270);
    ctx.lineTo(0, 270);
    ctx.closePath();
    ctx.fill();

    this.drawBanner(ctx, 28, 112, "#77311d");
    this.drawBanner(ctx, 356, 132, "#5c2c54");

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

  private drawBanner(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    ctx.strokeStyle = "#19100d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 32);
    ctx.lineTo(x, y + 70);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - 28);
    ctx.lineTo(x + (x < DESIGN_WIDTH / 2 ? 34 : -34), y - 18);
    ctx.lineTo(x, y + 4);
    ctx.closePath();
    ctx.fill();
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "rgba(18, 12, 8, 0.78)";
    ctx.fillRect(0, 0, DESIGN_WIDTH, HUD_HEIGHT);
    ctx.strokeStyle = "rgba(255, 214, 124, 0.35)";
    ctx.beginPath();
    ctx.moveTo(0, HUD_HEIGHT);
    ctx.lineTo(DESIGN_WIDTH, HUD_HEIGHT);
    ctx.stroke();

    ctx.fillStyle = "#f6e7bd";
    ctx.font = '700 16px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "left";
    ctx.fillText(`第${this.level.id}关 ${this.level.title}`, 16, 28);
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = "rgba(246, 231, 189, 0.72)";
    ctx.fillText(this.level.subtitle, 16, 49);

    ctx.textAlign = "right";
    ctx.fillStyle = "#f6e7bd";
    ctx.font = '700 13px "Microsoft YaHei", sans-serif';
    const remaining = Math.max(0, Math.ceil(this.level.durationSeconds - this.elapsed));
    ctx.fillText(`${remaining}s  ${Math.min(this.wavesSpawned, this.level.waves.length)}/${this.level.waves.length}`, 374, 24);
    ctx.fillText(`分 ${Math.floor(this.score)}`, 374, 45);
    ctx.fillStyle = "rgba(255, 211, 90, 0.68)";
    ctx.font = '800 10px "Microsoft YaHei", sans-serif';
    ctx.fillText("V0.4 IAA", 374, 66);

    ctx.textAlign = "center";
    for (let i = 0; i < this.maxHp; i += 1) {
      const x = 302 + i * 16;
      ctx.fillStyle = i < this.hp ? "#d64b3b" : "rgba(214, 75, 59, 0.18)";
      ctx.beginPath();
      ctx.moveTo(x, 56);
      ctx.lineTo(x + 6, 63);
      ctx.lineTo(x, 70);
      ctx.lineTo(x - 6, 63);
      ctx.closePath();
      ctx.fill();
    }

    if (this.runBuffs.size > 0) {
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255, 211, 90, 0.86)";
      ctx.font = '700 11px "Microsoft YaHei", sans-serif';
      const labels = [...this.runBuffs].map((id) => RUN_BUFF_BY_ID[id].shortName).join(" / ");
      ctx.fillText(`军令 ${labels}`, 16, 68);
    }
  }

  private drawEnemies(ctx: CanvasRenderingContext2D) {
    for (const enemy of this.enemies) {
      const def = ENEMY_DEFS[enemy.kind];
      const wobbleX = Math.sin(enemy.wobble * 5) * 1.2;
      ctx.save();
      ctx.translate(enemy.x + wobbleX, enemy.y);
      ctx.rotate(Math.sin(enemy.wobble * 2) * 0.04);
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;

      ctx.fillStyle = enemy.flash > 0 ? "#fff1b8" : def.color;
      ctx.strokeStyle = def.accent;
      ctx.lineWidth = 2;
      this.paperCard(ctx, -enemy.radius, -enemy.radius, enemy.radius * 2, enemy.radius * 2.25);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = def.accent;
      ctx.font = '700 12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      if (enemy.kind === "infantry") {
        ctx.fillText("步", 0, 2);
        ctx.strokeStyle = def.accent;
        ctx.beginPath();
        ctx.moveTo(-9, -10);
        ctx.lineTo(10, 12);
        ctx.stroke();
      }

      if (enemy.kind === "shield") {
        ctx.fillText("盾", 0, 2);
        ctx.strokeStyle = "#2a1811";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 1, 12, 0.15 * Math.PI, 1.85 * Math.PI);
        ctx.stroke();
        if (enemy.hp < enemy.maxHp || enemy.shieldCrack > 0) {
          ctx.strokeStyle = "#f6e7bd";
          ctx.beginPath();
          ctx.moveTo(-4, -10);
          ctx.lineTo(3, -2);
          ctx.lineTo(-2, 9);
          ctx.stroke();
        }
      }

      if (enemy.kind === "powder") {
        ctx.fillText("火", 0, 3);
        ctx.strokeStyle = enemy.ignited ? "#ffd67c" : "#2a1811";
        ctx.beginPath();
        ctx.moveTo(8, -13);
        ctx.quadraticCurveTo(15, -20, 6, -24);
        ctx.stroke();
        if (enemy.ignited) {
          ctx.fillStyle = "#ffb15c";
          ctx.beginPath();
          ctx.arc(8, -16, 4 + Math.sin(this.elapsed * 18) * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (enemy.kind === "core") {
        ctx.fillText("阵", 0, 2);
        ctx.strokeStyle = enemy.marked ? "#ffffff" : "#e8d7ff";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 1, 12 + Math.sin(this.elapsed * 5) * 1.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(10, 8);
        ctx.lineTo(-10, 8);
        ctx.closePath();
        ctx.stroke();
        if (enemy.marked) {
          ctx.strokeStyle = "#fff8d8";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-9, -9);
          ctx.lineTo(1, -1);
          ctx.lineTo(-4, 10);
          ctx.moveTo(8, -7);
          ctx.lineTo(2, 1);
          ctx.lineTo(9, 10);
          ctx.stroke();
        }
      }

      if (enemy.ignited || enemy.marked) {
        ctx.globalAlpha = 0.62;
        ctx.strokeStyle = enemy.ignited ? "#ffb15c" : "#e8d7ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 1, enemy.radius + 7 + Math.sin(this.elapsed * 10) * 2, 0, Math.PI * 2);
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

      ctx.strokeStyle = `rgba(255, 255, 238, ${alpha})`;
      ctx.shadowBlur = 8;
      ctx.lineWidth = Math.max(2, width * 0.36);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      if (trail.tier === "burst" && this.hasBuff("doubleBlade")) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ox = (-dy / len) * 28;
        const oy = (dx / len) * 28;
        ctx.strokeStyle = `rgba(255, 245, 200, ${alpha * 0.46})`;
        ctx.shadowBlur = 10;
        ctx.lineWidth = Math.max(2, width * 0.24);
        ctx.beginPath();
        ctx.moveTo(a.x + ox, a.y + oy);
        ctx.lineTo(b.x + ox, b.y + oy);
        ctx.stroke();
      }
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
        ctx.globalAlpha = alpha * 0.8;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, particle.size * t, 0, Math.PI * 2);
        ctx.stroke();
      } else if (particle.kind === "spark") {
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-particle.vx * 0.035, -particle.vy * 0.035);
        ctx.stroke();
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
      ctx.save();
      ctx.translate(cx, cy);
      ctx.font = '700 12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.fillStyle = this.nextOil ? "#f0a235" : this.nextSoul ? "#e9eef8" : "#ffb15c";
      const buffText = [this.drumTimer > 0 ? "鼓" : "", this.nextSoul ? "魂" : "", this.nextOil ? "油" : ""].join("");
      ctx.fillText(buffText, 0, -70);
      ctx.restore();
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
    ctx.restore();

    ctx.fillStyle = "#f6e7bd";
    ctx.font = '700 13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(`刀势 ${Math.floor(this.energy)}% ${stage.name}`, DESIGN_WIDTH / 2, 828);
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
      ctx.strokeStyle = "#d8a75d";
      ctx.lineWidth = 2;
      this.paperCard(ctx, 0, 0, rect.w, rect.h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#17100d";
      ctx.beginPath();
      ctx.arc(34, 46, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd35a";
      ctx.font = '900 16px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(buff.shortName, 34, 46);
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillStyle = "#fff3c0";
      ctx.font = '800 17px "Microsoft YaHei", sans-serif';
      ctx.fillText(buff.name, 72, 35);
      ctx.fillStyle = "rgba(246, 231, 189, 0.78)";
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.fillText(buff.description, 72, 62);
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
