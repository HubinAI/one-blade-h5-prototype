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
    expect(g.postChestSequenceState).toBe('inactive'); // 不自动改 complete
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
    // startEdictBurstOnce 被重复调用时不应改变 state
    (g as any).startEdictBurstOnce();
    expect(g.postChestSequenceState).toBe('waiting_spawn');
  });

  it('三组逐组: P1(release/75) P2(understand/83) P3(adapt/86)', () => {
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
