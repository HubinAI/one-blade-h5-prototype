import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';

describe('军令后验证潮流程', () => {
  it('主波8结束→开奖→3组验证潮→精英', () => {
    const game = new Game(LEVELS[0], (() => {}) as any);
    const g = game as any;

    // 模拟主波8完成
    g.wavesSpawned = 8;
    g.allNormalWavesSpawned = true;
    g.battlePhase = 'main_waves';
    g.level = { ...g.level, postChestWaves: [{ enemies: [] }, { enemies: [] }, { enemies: [] }] };
    g.postChestWaveIndex = 0;

    // 开奖触发
    g.edictPostWavesQueued = true;
    g.postChestStartAt = g.elapsed;

    // 验证：军令后未完成前不应出精英
    g.eliteSpawned = false;
    g.level.eliteSpawnAt = 1;
    g.level.eliteKind = 'fireRing';
    g.updateEliteSpawn();
    expect(g.eliteSpawned).toBe(false); // blocked by postChest

    // 模拟3组验证潮完成
    g.postChestWaveIndex = 3;
    g.allPostChestWavesSpawned = true;
    g.subSpawnQueue.length = 0;
    g.enemies = [];

    // 现在应该可以出精英
    g._eliteClearanceAt = g.elapsed - 1;
    g.updateEliteSpawn();
    expect(g.eliteSpawned).toBe(true);
  });
});
