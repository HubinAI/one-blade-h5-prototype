/**
 * 0807-11D 导演系统单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PostEdictDirector, POST_EDICT_PHASES, isInCombatZone, postEdictDirector } from './PostEdictDirector';
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
    expect(director.allComplete).toBe(false);
    expect(director.currentPhase).toBe('P1');
  });

  it('reset 后状态清零', () => {
    director.start();
    // 生成一批敌人
    director.tick(0.1, 0, 0, 0, 0);
    director.reset();
    expect(director.active).toBe(false);
    expect(director.allComplete).toBe(false);
    expect(director.currentPhase).toBeNull();
    expect(director.isRunning).toBe(false);
  });

  // ═══ P1/P2/P3 生成总量 ═══

  it('P1 首次生成 7 敌人（宽面铺场第一批）', () => {
    director.start();
    const results = director.tick(0.1, 0, 0, 0, 0);
    expect(results.length).toBe(1);
    expect(results[0].phase).toBe('P1');
    expect(results[0].batches.length).toBe(7); // P1-1 batch 1: 7 enemies
    expect(results[0].hp).toBe(75);
  });

  it('P1 速度倍率 1.00', () => {
    director.start();
    const results = director.tick(0.1, 0, 0, 0, 0);
    for (const b of results[0].batches) {
      expect(b.speedMul).toBe(1.00);
    }
  });

  it('阶段配置 P1=36, P2=48, P3=60 总计 144', () => {
    expect(POST_EDICT_PHASES[0].totalEnemies).toBe(36);
    expect(POST_EDICT_PHASES[1].totalEnemies).toBe(48);
    expect(POST_EDICT_PHASES[2].totalEnemies).toBe(60);
    const total = POST_EDICT_PHASES.reduce((s, p) => s + p.totalEnemies, 0);
    expect(total).toBe(144);
  });

  it('硬上限 P1=16, P2=20, P3=24', () => {
    expect(POST_EDICT_PHASES[0].hardCap).toBe(16);
    expect(POST_EDICT_PHASES[1].hardCap).toBe(20);
    expect(POST_EDICT_PHASES[2].hardCap).toBe(24);
  });

  it('HP P1=75, P2=90, P3=100', () => {
    expect(POST_EDICT_PHASES[0].hp).toBe(75);
    expect(POST_EDICT_PHASES[1].hp).toBe(90);
    expect(POST_EDICT_PHASES[2].hp).toBe(100);
  });

  it('速度倍率 P1=1.00, P2=1.08, P3=1.18', () => {
    expect(POST_EDICT_PHASES[0].speedMul).toBe(1.00);
    expect(POST_EDICT_PHASES[1].speedMul).toBe(1.08);
    expect(POST_EDICT_PHASES[2].speedMul).toBeCloseTo(1.18, 2);
  });

  // ═══ 硬上限阻塞 ═══

  it('同屏达硬上限时 WAIT_CAP', () => {
    director.start();
    // 生成第一批
    director.tick(0.1, 0, 0, 0, 0);
    // 模拟场上 16 人达到 P1 硬上限
    const results = director.tick(0.1, 6, 16, 0, 0.2);
    expect(results.length).toBe(0);
    const info = director.getDebugInfo(6, 16);
    expect(info.nextBatchState).toBe('WAIT_CAP');
  });

  // ═══ 完整阶段推进 ═══

  it('逐步生成的敌人数不超过阶段总量', () => {
    director.start();
    let totalGenerated = 0;
    let elapsed = 0;

    // 模拟快速推进（清场后立即生成新批次）
    for (let step = 0; step < 200; step++) {
      const results = director.tick(0.016, 0, 0, 0, elapsed);
      for (const r of results) {
        totalGenerated += r.batches.length;
      }
      elapsed += 0.016;
      if (director.allComplete) break;
    }

    // 总生成数应等于 144
    expect(totalGenerated).toBe(144);
  });

  // ═══ Debug 信息 ═══

  it('debug info 返回正确格式', () => {
    const info = director.getDebugInfo(3, 5);
    expect(info.phase).toBe('-');
    expect(info.subWave).toBe('-');
    expect(info.generated).toBe(0);

    director.start();
    const info2 = director.getDebugInfo(3, 5);
    expect(info2.phase).toBe('P1');
    expect(info2.subWave).toBe('P1-1');
  });

  // ═══ canSpawnElite ═══

  it('未完成时 canSpawnElite=false', () => {
    director.start();
    expect(director.canSpawnElite()).toBe(false);
  });

  it('重置后 canSpawnElite=false', () => {
    director.start();
    director.reset();
    expect(director.canSpawnElite()).toBe(false);
  });

  // ═══ 完成流程（死锁修复验证） ═══

  it('P3完成后经过 afterglow 进入 allComplete', () => {
    director.start();
    let elapsed = 0;

    // 快速模拟完整流程：生成→清场→advance→afterglow
    for (let step = 0; step < 500; step++) {
      // 始终传 alive=0 模拟快速清场
      director.tick(0.016, 0, 0, 0, elapsed);
      elapsed += 0.016;
      if (!director.active && director.allComplete) break;
    }

    expect(director.active).toBe(false);
    expect(director.allComplete).toBe(true);
    expect(director.isRunning).toBe(false);
    expect(director.canSpawnElite()).toBe(true);
  });

  it('afterglow 完成后 _finalAfterglowTimer 正常累积', () => {
    director.start();
    let elapsed = 0;

    // 快速清场到完成
    for (let step = 0; step < 500; step++) {
      director.tick(0.016, 0, 0, 0, elapsed);
      elapsed += 0.016;
      if (!director.active && director.allComplete) break;
    }

    // afterglow 时长应 >= FINAL_AFTERGLOW_SEC (0.28)
    // 实际经过时间应远大于 0.28（有阶段间隙和清场时间）
    expect(elapsed).toBeGreaterThanOrEqual(0.28);
    expect(director.allComplete).toBe(true);
  });

  // ═══ 子潮数量 ═══

  it('P1 有 3 个子潮', () => {
    expect(POST_EDICT_PHASES[0].subWaves.length).toBe(3);
  });

  it('P2 有 4 个子潮', () => {
    expect(POST_EDICT_PHASES[1].subWaves.length).toBe(4);
  });

  it('P3 有 5 个子潮', () => {
    expect(POST_EDICT_PHASES[2].subWaves.length).toBe(5);
  });

  // ═══ 子潮敌人总数验证 ═══

  it.each([
    ['P1-1', 12],
    ['P1-2', 12],
    ['P1-3', 12],
    ['P2-1', 12],
    ['P2-2', 12],
    ['P2-3', 12],
    ['P2-4', 12],
    ['P3-1', 12],
    ['P3-2', 12],
    ['P3-3', 12],
    ['P3-4', 12],
    ['P3-5', 12],
  ])('%s 总数为 %i', (id, expected) => {
    for (const phase of POST_EDICT_PHASES) {
      const sw = phase.subWaves.find(w => w.id === id);
      if (sw) {
        expect(sw.totalCount).toBe(expected);
        return;
      }
    }
    throw new Error(`SubWave ${id} not found`);
  });
});

// ═══ Game 集成测试 ═══

describe('Game 导演集成', () => {
  const mk = () => {
    const g = new Game(LEVELS[0], (() => {}) as any);
    const a = g as any;
    a.wavesSpawned = 8;
    a.allNormalWavesSpawned = true;
    a.battlePhase = 'main_waves';
    a.level = {
      id: 1,
      waves: [],
      postChestWaves: [],
      stats: { hp: 3 },
      eliteSpawnAt: 1,
      eliteKind: 'fireRing',
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
    expect(g.postChestWaveIndex).toBe(0);
    expect(g.battlePhase).toBe('edict_burst');
    expect(g.edictPostWavesQueued).toBe(true);
  });

  it('导演启动后生成 P1 批次', () => {
    const g = mk();
    g.chestDone = false;
    g.edictRewardApplied = false;
    g.edictRewardState = 'flying';
    g.completeEliteChestReward();

    // 第一帧 tick
    g._updatePostEdictDirector(0.016);

    // 应已从 waiting_spawn 进入 fighting
    expect(g.postChestSequenceState).toBe('fighting');
    // subSpawnQueue 中应有敌人
    expect(g.subSpawnQueue.length).toBeGreaterThan(0);
  });

  it('导演运行中精英 BLOCK', () => {
    const g = mk();
    g.chestDone = false;
    g.edictRewardApplied = false;
    g.edictRewardState = 'flying';
    g.completeEliteChestReward();
    g.eliteSpawned = false;
    g.elitePreviewShown = false;

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

    // 验证导演已启动
    expect(postEdictDirector.active).toBe(true);

    // 重置
    g.resetRunState();

    expect(postEdictDirector.active).toBe(false);
    expect(g.postChestSequenceState).toBe('inactive');
    expect(g.edictPostWavesQueued).toBe(false);
  });

  it('resetRunState 后精英门不受残留影响', () => {
    const g = mk();
    // 模拟导演完成后重置
    g.chestDone = false;
    g.edictRewardApplied = false;
    g.edictRewardState = 'flying';
    g.completeEliteChestReward();
    g.resetRunState();

    // 再设置正常波次完成
    g.wavesSpawned = 8;
    g.allNormalWavesSpawned = true;
    g.eliteSpawned = false;
    g.enemies = [];
    g.subSpawnQueue = [];
    // 直接设 complete 模拟无后置波
    g.setPostChestSequenceState('complete', 'test');

    g.updateEliteSpawn();
    // 应能正常进入精英（导演已重置，不阻塞）
    // 注意：需要 _eliteClearanceAt 满足 0.6s
    (g as any)._eliteClearanceAt = g.elapsed - 1;
    g.updateEliteSpawn();
    expect(g.eliteSpawned).toBe(true);
  });

  it('旧验证潮不与导演同时运行', () => {
    const g = mk();
    g.chestDone = false;
    g.edictRewardApplied = false;
    g.edictRewardState = 'flying';
    g.completeEliteChestReward();

    // 验证旧流程变量
    expect(g.allPostChestWavesSpawned).toBe(false);
    // postChestWaveIndex 在导演启动时设为 0
    expect(g.postChestWaveIndex).toBe(0);

    // 导演 tick 不应调用旧 updatePostChestWaves
    // (旧函数已不再被 update 调用)
  });

  it('P1 生成批次 HP=75', () => {
    const g = mk();
    g.chestDone = false;
    g.edictRewardApplied = false;
    g.edictRewardState = 'flying';
    g.completeEliteChestReward();

    g._updatePostEdictDirector(0.016);

    expect(g.subSpawnQueue.length).toBeGreaterThan(0);
    const item = g.subSpawnQueue[0];
    expect(item.stageNode).toBe('post_edict_director_p1');

    // 生成敌人验证 HP
    (g as any).spawnEnemyFromQueueItem(item);
    const e = g.enemies[g.enemies.length - 1];
    expect(e.maxHp).toBe(75);
  });

  it('导演完成→清场→postChestSequenceState=complete', () => {
    const g = mk();
    g.chestDone = false;
    g.edictRewardApplied = false;
    g.edictRewardState = 'flying';
    g.completeEliteChestReward();

    // 模拟快速清场：每帧 tick 后直接清空 enemies 和队列
    for (let i = 0; i < 200; i++) {
      (g as any)._updatePostEdictDirector(0.016);
      g.enemies = [];
      g.subSpawnQueue = [];
      // 手动推进 elapsed 避免 time-based spawn 不触发
      (g as any).elapsed += 0.5;
      if (g.postChestSequenceState === 'complete') break;
    }

    expect(g.postChestSequenceState).toBe('complete');
  });

  it('导演完成→精英门最终放行', () => {
    const g = mk();
    g.chestDone = false;
    g.edictRewardApplied = false;
    g.edictRewardState = 'flying';
    g.completeEliteChestReward();

    // 模拟导演完整运行到完成
    // 清空现场并推进到 allComplete
    for (let i = 0; i < 300; i++) {
      (g as any)._updatePostEdictDirector(0.016);
      g.enemies = [];
      g.subSpawnQueue = [];
      (g as any).elapsed += 0.5;
      if (g.postChestSequenceState === 'complete') break;
    }

    g.eliteSpawned = false;
    g.elitePreviewShown = false;
    (g as any)._eliteClearanceAt = g.elapsed - 1;

    g.updateEliteSpawn();
    expect(g.eliteSpawned).toBe(true);
    expect(g._eliteGateReason).toBe('yes(state=complete)');
  });
});

// ═══ isInCombatZone ═══

describe('isInCombatZone', () => {
  it('中场范围内返回 true', () => {
    expect(isInCombatZone(400)).toBe(true);
    expect(isInCombatZone(500)).toBe(true);
    expect(isInCombatZone(600)).toBe(true);
  });

  it('屏幕上方返回 false', () => {
    expect(isInCombatZone(-10)).toBe(false);
    expect(isInCombatZone(100)).toBe(false);
  });

  it('屏幕底部返回 false', () => {
    expect(isInCombatZone(800)).toBe(false);
  });
});
