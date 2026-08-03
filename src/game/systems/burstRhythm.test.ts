import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';

describe('爆发节奏', () => {
  function makeGame() {
    return new Game(LEVELS[0], (() => {}) as any);
  }

  it('3 目标 → 3 组独立显示', () => {
    const game = makeGame();
    (game as any).clusterSlashFloats([
      { damage: 125, x: 50, y: 400, isKill: false },
      { damage: 125, x: 150, y: 400, isKill: false },
      { damage: 125, x: 250, y: 400, isKill: false },
    ], 100, 's1');
    expect((game as any)._burstTimers.length).toBeGreaterThanOrEqual(3);
  });

  it('6 目标 → 3 组 + 连斩 >= 4', () => {
    const game = makeGame();
    const hits = Array.from({ length: 6 }, (_, i) => ({ damage: 125, x: 50 + i * 30, y: 400, isKill: false }));
    (game as any).clusterSlashFloats(hits, 100, 's2');
    expect((game as any)._burstTimers.length).toBeGreaterThanOrEqual(4);
  });

  it('10 目标 → 5 组 + 一刀十斩 >= 6', () => {
    const game = makeGame();
    const hits = Array.from({ length: 10 }, (_, i) => ({ damage: 125, x: 50 + i * 25, y: 400, isKill: false }));
    (game as any).clusterSlashFloats(hits, 100, 's3');
    expect((game as any)._burstTimers.length).toBeGreaterThanOrEqual(6);
  });
});
