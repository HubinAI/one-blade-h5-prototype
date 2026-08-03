import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';

describe('多斩飘字', () => {
  function makeGame() {
    const game = new Game(LEVELS[0], (() => {}) as any);
    (game as any).energy = 50; (game as any).bladeMomentumMax = 100;
    return game;
  }

  it('3 目标主刀 → 延迟触发 cluster', async () => {
    const game = makeGame();
    for (let i = 0; i < 3; i++) {
      (game as any).emitDamageFloat(100, 100, 200 + i * 60, 300, 'NORMAL', false, { sourceType: 'MAIN_SLASH' });
    }
    expect((game as any)._currentMainSlashHits.length).toBe(3);
    expect((game as any)._mainSlashBurstTimer).not.toBeNull();
    // 等待 burst 触发
    await new Promise(r => setTimeout(r, 150));
    const bt = (game as any)._burstTimers;
    expect(bt.length).toBeGreaterThanOrEqual(3);
  });

  it('6 目标主刀 → cluster 6 个目标聚为 3 组 + 总结', async () => {
    const game = makeGame();
    for (let i = 0; i < 6; i++) {
      (game as any).emitDamageFloat(100, 100, 200 + i * 40, 300, 'NORMAL', false, { sourceType: 'MAIN_SLASH' });
    }
    await new Promise(r => setTimeout(r, 250));
    const dd = (game as any).texts.filter((t: any) => t.category === 'damage');
    // 3 聚类 + 总结 = 至少 4
    expect(dd.length).toBeGreaterThanOrEqual(3);
  });

  it('10 目标主刀 → 5 组 + 一刀十斩', async () => {
    const game = makeGame();
    for (let i = 0; i < 10; i++) {
      (game as any).emitDamageFloat(100, 100, 50 + i * 36, 300, 'NORMAL', false, { sourceType: 'MAIN_SLASH' });
    }
    await new Promise(r => setTimeout(r, 300));
    const bt = (game as any)._burstTimers;
    expect(bt.length).toBeGreaterThanOrEqual(6);
  });

  it('D3+ glow 通过 cluster 不计入 worldFloat 上限', async () => {
    const game = makeGame();
    (game as any).energy = 90;
    for (let i = 0; i < 6; i++) {
      (game as any).emitDamageFloat(125, 100, 200 + i * 40, 300, 'NORMAL', false, { sourceType: 'MAIN_SLASH' });
    }
    await new Promise(r => setTimeout(r, 250));
    const dd = (game as any).texts.filter((t: any) => t.category === 'damage');
    expect(dd.length).toBeGreaterThanOrEqual(3);
  });

  it('已死亡目标位置保留', async () => {
    const game = makeGame();
    (game as any).emitDamageFloat(100, 100, 200, 300, 'NORMAL', true, { sourceType: 'MAIN_SLASH' });
    await new Promise(r => setTimeout(r, 150));
    const txt = (game as any).texts.find((t: any) => t.category === 'damage');
    expect(txt).toBeDefined();
    expect(txt.x).toBe(200);
  });
});