import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';

describe('爆发节奏', () => {
  const mk = () => new Game(LEVELS[0], (() => {}) as any);
  it('3 目标 → 3 组 + combo 3', () => {
    const g = mk();
    (g as any).clusterSlashFloats([{damage:125,x:50,y:400,isKill:false},{damage:125,x:150,y:400,isKill:false},{damage:125,x:250,y:400,isKill:false}],100,'s');
    expect((g as any)._burstTimers.length).toBe(3);
  });
  it('6 目标 → 2 组', () => {
    const g = mk();
    (g as any).clusterSlashFloats(Array.from({length:6},(_,i)=>({damage:125,x:50+i*30,y:400,isKill:false})),100,'s');
    expect((g as any)._burstTimers.length).toBe(2); // 2 groups only (no summary)
  });
});
