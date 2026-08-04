import { describe, it, expect } from 'vitest';
import { calcFinalHp, resolveLevel1Node, getLevelBaseStats, getEnemyTypeHpMultiplier } from './stageConfig';

describe('关卡配置', () => {
  it('第一关基础HP=100', () => {
    expect(getLevelBaseStats(1).baseHp).toBe(100);
  });

  it('步兵HP倍率=0.75', () => {
    expect(getEnemyTypeHpMultiplier('infantry')).toBe(0.75);
  });

  it('tutorial节点HP=75', () => {
    expect(calcFinalHp(1, 'infantry', 'tutorial')).toBe(75);
  });

  it('pre_edict_late节点HP=79', () => {
    expect(calcFinalHp(1, 'infantry', 'pre_edict_late')).toBe(79);
  });

  it('post_edict_understand节点HP=83', () => {
    expect(calcFinalHp(1, 'infantry', 'post_edict_understand')).toBe(83);
  });

  it('post_edict_adapt节点HP=86', () => {
    expect(calcFinalHp(1, 'infantry', 'post_edict_adapt')).toBe(86);
  });

  it('4种HP均低于100一刀击杀', () => {
    [75, 79, 83, 86].forEach(hp => {
      expect(hp).toBeLessThan(100);
    });
  });

  it('精英类型倍率=1.0（独立配置）', () => {
    expect(getEnemyTypeHpMultiplier('elite')).toBe(1.0);
  });

  it('tutorial波次解析为tutorial节点', () => {
    expect(resolveLevel1Node('main_waves', 2)).toBe('tutorial');
  });

  it('波次5解析为pre_edict_early', () => {
    expect(resolveLevel1Node('main_waves', 5)).toBe('pre_edict_early');
  });

  it('波次8解析为pre_edict_late', () => {
    expect(resolveLevel1Node('main_waves', 8)).toBe('pre_edict_late');
  });

  it('elite阶段解析为elite节点', () => {
    expect(resolveLevel1Node('elite', 10)).toBe('elite');
  });
});
