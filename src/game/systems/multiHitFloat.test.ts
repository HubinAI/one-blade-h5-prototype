import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';

describe('多斩飘字', () => {
  function makeGame() {
    const game = new Game(LEVELS[0], (() => {}) as any);
    (game as any).energy = 50; (game as any).bladeMomentumMax = 100;
    return game;
  }

  it('3 目标主刀 → 生成 3 条 damage worldFloat', () => {
    const game = makeGame();
    for (let i = 0; i < 3; i++) {
      (game as any).emitDamageFloat(100, 100, 200 + i * 60, 300, 'NORMAL', false, { sourceType: 'MAIN_SLASH' });
    }
    const dd = (game as any).texts.filter((t: any) => t.category === 'damage');
    expect(dd.length).toBe(3);
  });

  it('6 目标主刀 → 全部生成，不丢', () => {
    const game = makeGame();
    for (let i = 0; i < 6; i++) {
      (game as any).emitDamageFloat(100, 100, 200 + i * 40, 300, 'NORMAL', false, { sourceType: 'MAIN_SLASH' });
    }
    const dd = (game as any).texts.filter((t: any) => t.category === 'damage');
    expect(dd.length).toBeGreaterThanOrEqual(6);
  });

  it('10 目标主刀 → 至少 8 条显示', () => {
    const game = makeGame();
    for (let i = 0; i < 10; i++) {
      (game as any).emitDamageFloat(100, 100, 50 + i * 36, 300, 'NORMAL', false, { sourceType: 'MAIN_SLASH' });
    }
    const dd = (game as any).texts.filter((t: any) => t.category === 'damage');
    expect(dd.length).toBeGreaterThanOrEqual(8);
  });

  it('D3+ glow 不计入 worldFloat 上限', () => {
    const game = makeGame();
    (game as any).energy = 90; // high ratio
    for (let i = 0; i < 6; i++) {
      (game as any).emitDamageFloat(125, 100, 200 + i * 40, 300, 'NORMAL', false, { sourceType: 'MAIN_SLASH' });
    }
    const dd = (game as any).texts.filter((t: any) => t.category === 'damage');
    expect(dd.length).toBeGreaterThanOrEqual(6);
    // glow 不计入
    const glow = (game as any).texts.filter((t: any) => t.category === undefined && t.priority === 'C');
    expect(glow.length).toBeGreaterThanOrEqual(3);
  });

  it('已死亡目标位置保留', () => {
    const game = makeGame();
    (game as any).emitDamageFloat(100, 100, 200, 300, 'NORMAL', true, { sourceType: 'MAIN_SLASH' });
    const txt = (game as any).texts.find((t: any) => t.category === 'damage');
    expect(txt).toBeDefined();
    expect(txt.x).toBe(200);
  });
});
