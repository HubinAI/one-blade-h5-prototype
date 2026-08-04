import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';
import { resolveLevel1Node } from '../config/stageConfig';

describe('军令后验证潮流程', () => {
  it('主波8→开奖→3组验证潮→精英', () => {
    const game = new Game(LEVELS[0], (() => {}) as any);
    const g = game as any;
    g.wavesSpawned = 8; g.allNormalWavesSpawned = true;
    g.level = { ...g.level, postChestWaves: [{ enemies: [] }, { enemies: [] }, { enemies: [] }] };
    g.postChestWaveIndex = 0; g.edictPostWavesQueued = true; g.postChestStartAt = g.elapsed;

    g.eliteSpawned = false; g.level.eliteSpawnAt = 1; g.level.eliteKind = 'fireRing';
    g.updateEliteSpawn(); expect(g.eliteSpawned).toBe(false);

    g.postChestWaveIndex = 3; g.allPostChestWavesSpawned = true;
    g.subSpawnQueue.length = 0; g.enemies = [];
    g._eliteClearanceAt = g.elapsed - 1;
    g.updateEliteSpawn(); expect(g.eliteSpawned).toBe(true);
  });

  it('三组验证潮逐组切换节点HP', () => {
    const game = new Game(LEVELS[0], (() => {}) as any);
    const g = game as any;
    g.wavesSpawned = 8; g.battlePhase = 'main_waves';
    g.level = { id: 1, waves: [], postChestWaves: [{ enemies: [] }, { enemies: [] }, { enemies: [] }], stats: { hp: 3 } };
    g.gameMode = 'normal';

    // 第1组: pci=1 → release → 75
    g.postChestWaveIndex = 1;
    g._currentStageNode = resolveLevel1Node(g.battlePhase, g.wavesSpawned, g.postChestWaveIndex);
    const e1 = g.createEnemy('infantry', 200, 400, 1);
    expect(e1.maxHp).toBe(75);

    // 第2组: pci=2 → understand → 83
    g.postChestWaveIndex = 2;
    g._currentStageNode = resolveLevel1Node(g.battlePhase, g.wavesSpawned, g.postChestWaveIndex);
    const e2 = g.createEnemy('infantry', 200, 400, 1);
    expect(e2.maxHp).toBe(83);

    // 第3组: pci=3 → adapt → 86
    g.postChestWaveIndex = 3;
    g._currentStageNode = resolveLevel1Node(g.battlePhase, g.wavesSpawned, g.postChestWaveIndex);
    const e3 = g.createEnemy('infantry', 200, 400, 1);
    expect(e3.maxHp).toBe(86);
  });
});

