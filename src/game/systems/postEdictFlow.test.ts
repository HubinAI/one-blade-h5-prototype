import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';
import { resolveLevel1Node } from '../config/stageConfig';

describe('军令后验证潮流程', () => {
  const mk = () => { const g = new Game(LEVELS[0], (()=>{}) as any); const a = g as any;
    a.wavesSpawned = 8; a.allNormalWavesSpawned = true; a.battlePhase = 'main_waves';
    a.level = { id: 1, waves: [], postChestWaves: [{ enemies: [] }, { enemies: [] }, { enemies: [] }], stats: { hp: 3 }, eliteSpawnAt: 1, eliteKind: 'fireRing' };
    a.gameMode = 'normal'; a.debugEnabled = false; return a;
  };

  it('inactive+无敌人时死锁保护→complete+elite', () => {
    const g = mk(); g.postChestSequenceState = 'inactive'; g.eliteSpawned = false;
    g.enemies = []; g.subSpawnQueue = [];
    g._eliteClearanceAt = g.elapsed - 1;
    g.updateEliteSpawn();
    expect(g.postChestSequenceState).toBe('complete');
    expect(g.eliteSpawned).toBe(true);
  });

  it('inactive+有敌人→BLOCK', () => {
    const g = mk(); g.postChestSequenceState = 'inactive'; g.eliteSpawned = false;
    g.enemies = [{ alive: true }];
    g.updateEliteSpawn();
    expect(g.eliteSpawned).toBe(false);
  });

  it('waiting_spawn→BLOCK', () => {
    const g = mk(); g.setPostChestSequenceState('waiting_spawn', 'test');
    g.eliteSpawned = false;
    g.updateEliteSpawn(); expect(g.eliteSpawned).toBe(false);
  });

  it('complete→ALLOW', () => {
    const g = mk(); g.setPostChestSequenceState('complete', 'test');
    g.eliteSpawned = false; g.enemies = []; g._eliteClearanceAt = g.elapsed - 1;
    g.updateEliteSpawn(); expect(g.eliteSpawned).toBe(true);
  });

  it('三组逐组: release→understand→adapt', () => {
    const g = mk();
    const verify = (pci: number, hp: number) => {
      g.postChestWaveIndex = pci;
      g._currentStageNode = resolveLevel1Node(g.battlePhase, g.wavesSpawned, g.postChestWaveIndex);
      const e = g.createEnemy('infantry', 200, 400, 1);
      expect(e.maxHp).toBe(hp);
    };
    verify(1, 75); verify(2, 83); verify(3, 86);
  });
});
