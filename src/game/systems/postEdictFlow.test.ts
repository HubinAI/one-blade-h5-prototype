import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';
import { resolveLevel1Node } from '../config/stageConfig';

describe('军令后验证潮流程', () => {
  const mk = () => { const g = new Game(LEVELS[0], (()=>{}) as any); const a = g as any;
    a.wavesSpawned = 8; a.allNormalWavesSpawned = true; a.battlePhase = 'main_waves';
    a.level = { id: 1, waves: [], postChestWaves: [{ enemies: [] }, { enemies: [] }, { enemies: [] }], stats: { hp: 3 } };
    a.gameMode = 'normal'; return a;
  };

  it('状态 inactive 时 updateEliteSpawn 跳过', () => {
    const g = mk(); g.postChestSequenceState = 'inactive';
    g.eliteSpawned = false; g.level.eliteSpawnAt = 1; g.level.eliteKind = 'fireRing';
    g.updateEliteSpawn(); expect(g.eliteSpawned).toBe(false);
  });

  it('状态 waiting_spawn 时 elite 被堵', () => {
    const g = mk(); g.postChestSequenceState = 'waiting_spawn';
    g.eliteSpawned = false; g.level.eliteSpawnAt = 1; g.level.eliteKind = 'fireRing';
    g.updateEliteSpawn(); expect(g.eliteSpawned).toBe(false);
  });

  it('状态 fighting 时 elite 被堵', () => {
    const g = mk(); g.postChestSequenceState = 'fighting';
    g.eliteSpawned = false; g.level.eliteSpawnAt = 1; g.level.eliteKind = 'fireRing';
    g.enemies = [{ alive: true, hp: 75, maxHp: 75 } as any];
    g.updateEliteSpawn(); expect(g.eliteSpawned).toBe(false);
  });

  it('状态 complete 后 elite 放行', () => {
    const g = mk(); g.postChestSequenceState = 'complete';
    g.eliteSpawned = false; g.level.eliteSpawnAt = 1; g.level.eliteKind = 'fireRing';
    g.enemies = []; g._eliteClearanceAt = g.elapsed - 1;
    g.updateEliteSpawn(); expect(g.eliteSpawned).toBe(true);
  });

  it('三组逐组切换: release→understand→adapt', () => {
    const g = mk();
    const verify = (pci: number, hp: number) => {
      g.postChestWaveIndex = pci;
      g._currentStageNode = resolveLevel1Node(g.battlePhase, g.wavesSpawned, g.postChestWaveIndex);
      const e = g.createEnemy('infantry', 200, 400, 1);
      expect(e.maxHp).toBe(hp);
    };
    verify(1, 75);
    verify(2, 83);
    verify(3, 86);
  });
});

