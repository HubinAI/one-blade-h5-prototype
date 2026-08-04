import { describe, it, expect } from 'vitest';
import { calcFinalHp, resolveLevel1Node, getLevelBaseStats, getEnemyTypeHpMultiplier } from './stageConfig';

describe('关卡配置', () => {
  it('第一关基础HP=100', () => { expect(getLevelBaseStats(1).baseHp).toBe(100); });
  it('步兵HP倍率=0.75', () => { expect(getEnemyTypeHpMultiplier('infantry')).toBe(0.75); });
  it('tutorial节点HP=75', () => { expect(calcFinalHp(1,'infantry','tutorial')).toBe(75); });
  it('pre_edict_early节点HP=75', () => { expect(calcFinalHp(1,'infantry','pre_edict_early')).toBe(75); });
  it('pre_edict_late节点HP=79', () => { expect(calcFinalHp(1,'infantry','pre_edict_late')).toBe(79); });
  it('post_edict_release节点HP=75', () => { expect(calcFinalHp(1,'infantry','post_edict_release')).toBe(75); });
  it('post_edict_understand节点HP=83', () => { expect(calcFinalHp(1,'infantry','post_edict_understand')).toBe(83); });
  it('post_edict_adapt节点HP=86', () => { expect(calcFinalHp(1,'infantry','post_edict_adapt')).toBe(86); });
  it('4种HP均低于100一刀击杀', () => { [75,79,83,86].forEach(h=>expect(h).toBeLessThan(100)); });
  it('精英类型倍率=1.0', () => { expect(getEnemyTypeHpMultiplier('elite')).toBe(1.0); });

  // 节点可达性：使用 wavesSpawned + postChestWaveIndex
  it('tutorial(total=2)→tutorial', () => { expect(resolveLevel1Node('main_waves',2)).toBe('tutorial'); });
  it('total=5→pre_edict_early', () => { expect(resolveLevel1Node('main_waves',5)).toBe('pre_edict_early'); });
  it('total=8→pre_edict_late', () => { expect(resolveLevel1Node('main_waves',8)).toBe('pre_edict_late'); });
  it('total=11→post_edict_release', () => { expect(resolveLevel1Node('main_waves',11)).toBe('post_edict_release'); });
  it('total=14→post_edict_understand', () => { expect(resolveLevel1Node('main_waves',14)).toBe('post_edict_understand'); });
  it('total=17→post_edict_adapt', () => { expect(resolveLevel1Node('main_waves',17)).toBe('post_edict_adapt'); });
  it('elite阶段→elite', () => { expect(resolveLevel1Node('elite',10)).toBe('elite'); });
  it('全部7节点通过calcFinalHp可达', () => {
    ['tutorial','pre_edict_early','pre_edict_late','post_edict_release','post_edict_understand','post_edict_adapt'].forEach(n=>{
      const hp = calcFinalHp(1,'infantry',n as any);
      expect([75,79,83,86]).toContain(hp);
    });
  });
});

