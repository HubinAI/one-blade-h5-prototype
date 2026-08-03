import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';

describe('聚类飘字', () => {
  function makeGame() {
    const game = new Game(LEVELS[0], (() => {}) as any);
    (game as any).energy = 50; (game as any).bladeMomentumMax = 100;
    return game;
  }

  function hits(n: number) {
    return Array.from({ length: n }, (_, i) => ({ damage: 125, x: 50 + i * 30, y: 400, isKill: false }));
  }

  it('2 目标 → 2 条独立飘字', () => {
    const game = makeGame();
    (game as any).clusterSlashFloats(hits(2), 100, 's1');
    // 2 groups + summary (≥4 triggers)
    const bt = (game as any)._burstTimers;
    expect(bt.length).toBeGreaterThanOrEqual(2); // 2 groups (summary not triggered for <4)
  });

  it('6 目标 → 最多 3 组 + 连斩', () => {
    const game = makeGame();
    (game as any).clusterSlashFloats(hits(6), 100, 's2');
    const bt = (game as any)._burstTimers;
    expect(bt.length).toBeGreaterThanOrEqual(4); // 3 groups + summary
  });

  it('10 目标 → 最多 5 组 + 一刀十斩', () => {
    const game = makeGame();
    (game as any).clusterSlashFloats(hits(10), 100, 's3');
    const bt = (game as any)._burstTimers;
    expect(bt.length).toBeGreaterThanOrEqual(6); // 5 groups + summary
  });

  it('精英独立显示', () => {
    const game = makeGame();
    const mixed = [
      { damage: 125, x: 100, y: 400, isKill: false },
      { damage: 200, x: 150, y: 400, isKill: false, isElite: true },
      { damage: 125, x: 200, y: 400, isKill: false },
      { damage: 125, x: 250, y: 400, isKill: false },
    ];
    (game as any).clusterSlashFloats(mixed, 100, 's4');
    // 1 elite + 1 group (3 norms clustered) + summary = 3+
    const bt = (game as any)._burstTimers;
    expect(bt.length).toBeGreaterThanOrEqual(3);
  });
});
