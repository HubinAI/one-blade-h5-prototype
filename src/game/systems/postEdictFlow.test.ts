import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';
import { resolveLevel1Node } from '../config/stageConfig';

describe('军令后验证潮统一流程', () => {
  const mk = () => { const g = new Game(LEVELS[0], (()=>{}) as any); const a = g as any;
    a.wavesSpawned = 8; a.allNormalWavesSpawned = true; a.battlePhase = 'main_waves';
    a.level = { id: 1, waves: [], postChestWaves: [{ enemies: [] }, { enemies: [] }, { enemies: [] }], stats: { hp: 3 }, eliteSpawnAt: 1, eliteKind: 'fireRing' };
    a.gameMode = 'normal'; a.debugEnabled = false; return a;
  };

  it('inactive+hasPostWaves → elite BLOCK', () => {
    const g = mk(); g.eliteSpawned = false;
    g.enemies = []; g.subSpawnQueue = [];
    g.updateEliteSpawn();
    expect(g.eliteSpawned).toBe(false);
  });

  it('waiting_spawn → elite BLOCK', () => {
    const g = mk(); g.setPostChestSequenceState('waiting_spawn', 'test'); g.eliteSpawned = false;
    g.updateEliteSpawn(); expect(g.eliteSpawned).toBe(false);
  });

  it('fighting → elite BLOCK', () => {
    const g = mk(); g.setPostChestSequenceState('fighting', 'test'); g.eliteSpawned = false;
    g.enemies = [{ alive: true }];
    g.updateEliteSpawn(); expect(g.eliteSpawned).toBe(false);
  });

  it('complete+清空 → elite ALLOW', () => {
    const g = mk(); g.setPostChestSequenceState('complete', 'test');
    g.eliteSpawned = false; g.enemies = []; g._eliteClearanceAt = g.elapsed - 1;
    g.updateEliteSpawn(); expect(g.eliteSpawned).toBe(true);
  });

  it('completeEliteChestReward 启动 waiting_spawn', () => {
    const g = mk();
    g.chestDone = false; g.edictRewardApplied = false;
    g.edictRewardState = 'flying';
    g.completeEliteChestReward();
    expect(g.postChestSequenceState).toBe('waiting_spawn');
    expect(g.postChestWaveIndex).toBe(0);
    expect(g.battlePhase).toBe('edict_burst');
  });

  it('startEdictBurstOnce 不覆盖 state', () => {
    const g = mk();
    g.setPostChestSequenceState('waiting_spawn', 'init');
    (g as any).startEdictBurstOnce();
    expect(g.postChestSequenceState).toBe('waiting_spawn');
  });

  it('P1队列项 stageNode=post_edict_release HP=75', () => {
    const g = mk();
    g.postChestWaveIndex = 1;
    g._currentStageNode = 'post_edict_release';
    g.setPostChestSequenceState('fighting', 'test');
    g.postChestStartAt = g.elapsed;
    // 模拟入队
    (g as any).enqueuePostChestWave({ enemies: [{ kind: 'infantry', count: 1, x: 200 }] } as any, 1);
    expect(g.subSpawnQueue.length).toBe(1);
    const item = g.subSpawnQueue[0];
    expect(item.stageNode).toBe('post_edict_release');
    // 生成敌人并使用快照
    g._currentStageNode = 'post_edict_adapt'; // 尝试覆盖
    (g as any).spawnEnemyFromQueueItem(item);
    const e = g.enemies[g.enemies.length - 1];
    expect(e.maxHp).toBe(75);
  });

  it('P2队列项 stageNode=post_edict_understand HP=83', () => {
    const g = mk();
    g.setPostChestSequenceState('fighting', 'test');
    g.postChestStartAt = g.elapsed;
    (g as any).enqueuePostChestWave({ enemies: [{ kind: 'infantry', count: 1, x: 200 }] } as any, 2);
    expect(g.subSpawnQueue[0].stageNode).toBe('post_edict_understand');
    (g as any).spawnEnemyFromQueueItem(g.subSpawnQueue[0]);
    expect(g.enemies[g.enemies.length - 1].maxHp).toBe(83);
  });

  it('P3队列项 stageNode=post_edict_adapt HP=86', () => {
    const g = mk();
    g.setPostChestSequenceState('fighting', 'test');
    g.postChestStartAt = g.elapsed;
    (g as any).enqueuePostChestWave({ enemies: [{ kind: 'infantry', count: 1, x: 200 }] } as any, 3);
    expect(g.subSpawnQueue[0].stageNode).toBe('post_edict_adapt');
    (g as any).spawnEnemyFromQueueItem(g.subSpawnQueue[0]);
    expect(g.enemies[g.enemies.length - 1].maxHp).toBe(86);
  });

  it('卡死现场: fighting+pci=3+alive=0+q=0 → complete', () => {
    const g = mk();
    g.setPostChestSequenceState('fighting', 'test');
    g.postChestWaveIndex = 3;
    g.allPostChestWavesSpawned = true;
    g.postChestStartAt = g.elapsed;
    g.enemies = []; g.subSpawnQueue = [];
    // 模拟一帧 updatePostChestWaves
    (g as any).updatePostChestWaves(0.016);
    expect(g.postChestSequenceState).toBe('complete');
  });

  it('complete前 elite BLOCK (fighting+有敌人)', () => {
    const g = mk();
    g.setPostChestSequenceState('fighting', 'test');
    g.eliteSpawned = false; g.enemies = [{ alive: true }];
    g.updateEliteSpawn();
    expect(g.eliteSpawned).toBe(false);
  });

  it('complete后下一帧 elite ALLOW', () => {
    const g = mk();
    g.setPostChestSequenceState('complete', 'test');
    g.eliteSpawned = false; g.enemies = []; g._eliteClearanceAt = g.elapsed - 1;
    g.updateEliteSpawn();
    expect(g.eliteSpawned).toBe(true);
  });
});
