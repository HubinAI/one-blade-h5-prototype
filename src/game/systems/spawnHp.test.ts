import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';

describe('生成链路HP验证', () => {
  function g(node?: string) {
    const game = new Game(LEVELS[0], (()=>{}) as any);
    if (node) (game as any)._currentStageNode = node;
    (game as any).gameMode = 'normal';
    // 确保 isLogicalLevel1 返回 true
    (game as any).level = { id: 1, waves: [], stats: { hp: 3 }, postChestWaves: [] };
    return game;
  }

  const nodes = [
    ['tutorial', 75],
    ['pre_edict_early', 75],
    ['pre_edict_late', 79],
    ['post_edict_release', 75],
    ['post_edict_understand', 83],
    ['post_edict_adapt', 86],
  ] as const;

  nodes.forEach(([node, expected]) => {
    it(`${node} → ${expected}HP`, () => {
      const game = g(node);
      const enemy = (game as any).createEnemy('infantry', 200, 400, 1);
      expect(enemy.maxHp).toBe(expected);
      expect(enemy.hp).toBe(expected);
      expect((game as any)._lastSpawnedInfantryHp).toBe(expected);
    });
  });

  it('精英 fireRing F1=3500HP', () => {
    const game = g('tutorial');
    const e = (game as any).createElite('fireRing', 200, 400, { maxHp: 3500, speed: 60, radius: 18, minKillsRequired: 0, spawnAfterWave: 1, preferredBatchSize: 1 });
    expect(e.maxHp).toBe(3500);
  });
});
