import { describe, it, expect } from 'vitest';
import { calcFinalHp, resolveLevel1Node, getLevelBaseStats, getEnemyTypeHpMultiplier } from './stageConfig';

describe('关卡配置', () => {
  it('第一关基础HP=100', () => { expect(getLevelBaseStats(1).baseHp).toBe(100); });
  it('步兵HP倍率=0.75', () => { expect(getEnemyTypeHpMultiplier('infantry')).toBe(0.75); });
  it('tutorial→75', () => { expect(calcFinalHp(1,'infantry','tutorial')).toBe(75); });
  it('pre_edict_early→75', () => { expect(calcFinalHp(1,'infantry','pre_edict_early')).toBe(75); });
  it('pre_edict_late→79', () => { expect(calcFinalHp(1,'infantry','pre_edict_late')).toBe(79); });
  it('post_edict_release→75', () => { expect(calcFinalHp(1,'infantry','post_edict_release')).toBe(75); });
  it('post_edict_understand→83', () => { expect(calcFinalHp(1,'infantry','post_edict_understand')).toBe(83); });
  it('post_edict_adapt→86', () => { expect(calcFinalHp(1,'infantry','post_edict_adapt')).toBe(86); });
  it('4种HP<100', () => { [75,79,83,86].forEach(h=>expect(h).toBeLessThan(100)); });
  it('精英倍率=1.0', () => { expect(getEnemyTypeHpMultiplier('elite')).toBe(1.0); });

  // 主波阶段 (postChestWaveIndex=0)
  const m = (ws: number) => resolveLevel1Node('main_waves', ws, 0);
  it('ws=2→tutorial', () => { expect(m(2)).toBe('tutorial'); });
  it('ws=5→pre_edict_early', () => { expect(m(5)).toBe('pre_edict_early'); });
  it('ws=7→pre_edict_late', () => { expect(m(7)).toBe('pre_edict_late'); });
  it('ws=8→pre_edict_late', () => { expect(m(8)).toBe('pre_edict_late'); });

  // 军令后波次 (postChestWaveIndex>0)
  const p = (pci: number) => resolveLevel1Node('main_waves', 8, pci);
  it('pci=1→post_edict_release', () => { expect(p(1)).toBe('post_edict_release'); });
  it('pci=2→post_edict_understand', () => { expect(p(2)).toBe('post_edict_understand'); });
  it('pci=3→post_edict_adapt', () => { expect(p(3)).toBe('post_edict_adapt'); });

  it('elite→elite', () => { expect(resolveLevel1Node('elite',0,0)).toBe('elite'); });
});
