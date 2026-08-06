/**
 * 0807-11D-1 导演系统单元测试（节拍/断点/桥接版）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PostEdictDirector, BEATS, PHASES, isInCombatZone, isApproaching, STANDARD_SLASH_DAMAGE, HP_TIERS, postEdictDirector } from './PostEdictDirector';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';

describe('PostEdictDirector', () => {
  let director: PostEdictDirector;

  beforeEach(() => {
    director = new PostEdictDirector();
  });

  // ═══ 基础生命周期 ═══

  it('初始状态 inactive', () => {
    expect(director.active).toBe(false);
    expect(director.allComplete).toBe(false);
    expect(director.currentPhase).toBeNull();
    expect(director.isRunning).toBe(false);
  });

  it('start 后 active', () => {
    director.start();
    expect(director.active).toBe(true);
    expect(director.isRunning).toBe(true);
    expect(director.currentPhase).toBe('P1');
  });

  it('reset 后状态清零', () => {
    director.start();
    director.tick(0.1, 0, 0, 0, 0, 0);
    director.reset();
    expect(director.active).toBe(false);
    expect(director.currentPhase).toBeNull();
  });

  // ═══ D 值和 HP 断点 ═══

  it('标准主刀伤害 D=125', () => {
    expect(STANDARD_SLASH_DAMAGE).toBe(125);
  });

  it('杂兵 100HP (0.80D) 一刀击杀', () => {
    expect(HP_TIERS.trash.hp).toBe(100);
    expect(STANDARD_SLASH_DAMAGE).toBeGreaterThanOrEqual(HP_TIERS.trash.hp);
  });

  it('韧兵 170HP (1.36D) 需要两刀', () => {
    expect(HP_TIERS.tough.hp).toBe(170);
    expect(HP_TIERS.tough.hp).toBeGreaterThan(STANDARD_SLASH_DAMAGE);
    expect(STANDARD_SLASH_DAMAGE * 2).toBeGreaterThanOrEqual(HP_TIERS.tough.hp);
  });

  it('压阵 260HP (2.08D) 需要三刀', () => {
    expect(HP_TIERS.elite_wall.hp).toBe(260);
    expect(HP_TIERS.elite_wall.hp).toBeGreaterThan(STANDARD_SLASH_DAMAGE * 2);
    expect(STANDARD_SLASH_DAMAGE * 3).toBeGreaterThanOrEqual(HP_TIERS.elite_wall.hp);
  });

  // ═══ 总量验证 ═══

  it('P1=48, P2=64, P3=80 总计 192', () => {
    expect(PHASES.P1.totalEnemies).toBe(48);
    expect(PHASES.P2.totalEnemies).toBe(64);
    expect(PHASES.P3.totalEnemies).toBe(80);
    expect(PHASES.P1.totalEnemies + PHASES.P2.totalEnemies + PHASES.P3.totalEnemies).toBe(192);
  });

  it('硬上限 P1=16, P2=20, P3=24', () => {
    expect(PHASES.P1.hardCap).toBe(16);
    expect(PHASES.P2.hardCap).toBe(20);
    expect(PHASES.P3.hardCap).toBe(24);
  });

  it('速度倍率 P1=1.00, P2=1.12, P3=1.25', () => {
    expect(PHASES.P1.speedMul).toBe(1.00);
    expect(PHASES.P2.speedMul).toBe(1.12);
    expect(PHASES.P3.speedMul).toBe(1.25);
  });

  // ═══ 节拍数量 ═══

  it('P1=4个节拍, P2=5个, P3=6个', () => {
    const p1 = BEATS.filter(b => b.phase === 'P1');
    const p2 = BEATS.filter(b => b.phase === 'P2');
    const p3 = BEATS.filter(b => b.phase === 'P3');
    expect(p1.length).toBe(4);
    expect(p2.length).toBe(5);
    expect(p3.length).toBe(6);
  });

  // ═══ notBefore 验证 ═══

  it('P1-2 的 notBefore=1800ms', () => {
    expect(BEATS[1].notBeforeMs).toBe(1800);
  });

  it('P1-4 的 notBefore=5400ms', () => {
    expect(BEATS[3].notBeforeMs).toBe(5400);
  });

  it('notBefore 限制：未到时间时 WAIT_TIME', () => {
    director.start();
    // 生成第一个微批次
    director.tick(0.016, 0, 0, 0, 0, 0);
    // 产生足够的 enemies 清场来推进（这里需要模拟完整推进）
    // 但 notBefore 未到 → WAIT_TIME
    for (let i = 0; i < 20; i++) {
      director.tick(0.016, 0, 0, 0, 0, 100); // elapsed=100ms < 1800ms
    }
    const info = director.getDebugInfo(0, 0, 0, 0, 0, 0, 0, 100);
    expect(info.nextState).toBe('WAIT_TIME');
  });

  // ═══ 硬上限和接近区 ═══

  it('同屏达到硬上限时 WAIT_CAP', () => {
    director.start();
    // 生成第一批
    director.tick(0.1, 0, 0, 0, 0, 0);
    // 模拟满屏
    const results = director.tick(0.1, 6, 16, 8, 0, 5000);
    expect(results.length).toBe(0);
    const info = director.getDebugInfo(0, 0, 0, 0, 16, 6, 0, 5000);
    expect(info.nextState).toBe('WAIT_CAP');
  });

  // ═══ 精英╝══

  it('未完成时 canSpawnElite=false', () => {
    director.start();
    expect(director.canSpawnElite()).toBe(false);
  });

  it('重置后 canSpawnElite=false', () => {
    director.start();
    director.reset();
    expect(director.canSpawnElite()).toBe(false);
  });

  // ═══ Debug 信息 ═══

  it('debug info 返回正确格式 (inactive)', () => {
    const info = director.getDebugInfo(0, 0, 0, 0, 0, 0, 0, 0);
    expect(info.phase).toBe('-');
    expect(info.beat).toBe('-');
  });

  it('debug info 返回正确格式 (active)', () => {
    director.start();
    const info = director.getDebugInfo(0, 0, 0, 0, 0, 0, 0, 0);
    expect(info.phase).toBe('P1');
    expect(info.beat).toBe('P1-1');
  });

  // ═══ 接近区判定 ═══

  it('isApproaching: y=-10 → true', () => {
    expect(isApproaching(-10)).toBe(true);
    expect(isApproaching(200)).toBe(true);
  });

  it('isApproaching: y=400 → false (已在战斗区)', () => {
    expect(isApproaching(400)).toBe(false);
  });

  it('isApproaching: y=-50 → false (太上面)', () => {
    expect(isApproaching(-50)).toBe(false);
  });
});

// ═══ Game 集成测试 ═══

describe('Game 导演集成 (11D-1)', () => {
  const mk = () => {
    const g = new Game(LEVELS[0], (() => {}) as any);
    const a = g as any;
    a.wavesSpawned = 8;
    a.allNormalWavesSpawned = true;
    a.battlePhase = 'main_waves';
    a.level = {
      id: 1, waves: [], postChestWaves: [],
      stats: { hp: 3 }, eliteSpawnAt: 1, eliteKind: 'fireRing',
    };
    a.gameMode = 'normal';
    a.debugEnabled = false;
    return a;
  };

  it('completeEliteChestReward 启动导演', () => {
    const g = mk();
    g.chestDone = false;
    g.edictRewardApplied = false;
    g.edictRewardState = 'flying';
    g.completeEliteChestReward();

    expect(g.postChestSequenceState).toBe('waiting_spawn');
    expect(g.battlePhase).toBe('edict_burst');
    expect(g.edictPostWavesQueued).toBe(true);
  });

  it('导演启动后 P1 批次使用 hpOverride', () => {
    const g = mk();
    g.chestDone = false;
    g.edictRewardApplied = false;
    g.edictRewardState = 'flying';
    g.completeEliteChestReward();

    g._updatePostEdictDirector(0.016);

    expect(g.subSpawnQueue.length).toBeGreaterThan(0);
    const item = g.subSpawnQueue[0];
    expect(item.hpOverride).toBeDefined();
    expect(item.hpOverride).toBe(100); // trash = 100 HP
  });

  it('导演运行中精英 BLOCK', () => {
    const g = mk();
    g.chestDone = false;
    g.edictRewardApplied = false;
    g.edictRewardState = 'flying';
    g.completeEliteChestReward();
    g.eliteSpawned = false;

    g.updateEliteSpawn();
    expect(g.eliteSpawned).toBe(false);
    expect(g._eliteGateReason).toBe('no(director_running)');
  });

  it('resetRunState 后导演清零', () => {
    const g = mk();
    g.chestDone = false;
    g.edictRewardApplied = false;
    g.edictRewardState = 'flying';
    g.completeEliteChestReward();

    expect(postEdictDirector.active).toBe(true);

    g.resetRunState();
    expect(postEdictDirector.active).toBe(false);
    expect(g.postChestSequenceState).toBe('inactive');
  });

  it('hpOverride 覆盖默认 HP', () => {
    const g = mk();
    g.chestDone = false;
    g.edictRewardApplied = false;
    g.edictRewardState = 'flying';
    g.completeEliteChestReward();

    g._updatePostEdictDirector(0.016);

    const item = g.subSpawnQueue[0];
    expect(item.hpOverride).toBe(100); // 杂兵 = 100

    // 生成敌人并验证
    (g as any).spawnEnemyFromQueueItem(item);
    const e = g.enemies[g.enemies.length - 1];
    expect(e.hp).toBe(100);
    expect(e.maxHp).toBe(100);
  });
});
