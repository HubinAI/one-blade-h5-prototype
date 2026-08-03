import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';

describe('爆发节奏', () => {
  function makeGame() {
    return new Game(LEVELS[0], (() => {}) as any);
  }

  it('3 目标 → 3 个主数字', () => {
    const game = makeGame();
    (game as any).burstSlashFloats([
      { damage: 125, x: 50, y: 400, isKill: false },
      { damage: 125, x: 150, y: 400, isKill: false },
      { damage: 125, x: 250, y: 400, isKill: false },
    ], 100, 's1');
    // 定时器已排队，验证无崩溃
    expect((game as any)._burstTimers.length).toBeGreaterThanOrEqual(3);
  });

  it('6 目标 → 6 个数字 + 连斩', () => {
    const game = makeGame();
    const hits = Array.from({ length: 6 }, (_, i) => ({ damage: 125, x: 50 + i * 30, y: 400, isKill: false }));
    (game as any).burstSlashFloats(hits, 100, 's2');
    // 6 floats + 1 summary = 7 timers
    expect((game as any)._burstTimers.length).toBeGreaterThanOrEqual(7);
  });

  it('10 目标 → 10 个数字 + 一刀十斩', () => {
    const game = makeGame();
    const hits = Array.from({ length: 10 }, (_, i) => ({ damage: 125, x: 50 + i * 25, y: 400, isKill: false }));
    (game as any).burstSlashFloats(hits, 100, 's3');
    expect((game as any)._burstTimers.length).toBeGreaterThanOrEqual(11);
  });
});
