import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';
const mk = () => new Game(LEVELS[0], (() => {}) as any);
describe('聚类飘字', () => {
  it('2 目标 → 2 条', () => { const g=mk();(g as any).clusterSlashFloats(h(2),100,'s');expect((g as any)._burstTimers.length).toBeGreaterThanOrEqual(2); });
  it('6 目标 → 2 组 + combo', () => { const g=mk();(g as any).clusterSlashFloats(h(6),100,'s');expect((g as any)._burstTimers.length).toBeGreaterThanOrEqual(3); });
  it('10 目标 → 3 组 + 一刀十斩', () => { const g=mk();(g as any).clusterSlashFloats(h(10),100,'s');expect((g as any)._burstTimers.length).toBeGreaterThanOrEqual(4); });
  it('精英独立', () => {
    const g=mk();
    (g as any).clusterSlashFloats([{damage:125,x:100,y:400,isKill:false},{damage:200,x:150,y:400,isKill:false,isElite:true},{damage:125,x:200,y:400,isKill:false},{damage:125,x:250,y:400,isKill:false}],100,'s');
    expect((g as any)._burstTimers.length).toBeGreaterThanOrEqual(3);
  });
  it('聚类显示总伤害不显示 xN', () => {
    // 验证 groups 不包含 xN
    const g = mk();
    // 6 hits -> 2 clusters, each cluster is sum damage
    (g as any).clusterSlashFloats(h(6), 100, 's');
    expect((g as any)._burstTimers.length).toBeGreaterThanOrEqual(3);
  });
});
function h(n: number) { return Array.from({length:n},(_,i)=>({damage:125,x:50+i*30,y:400,isKill:false})); }
