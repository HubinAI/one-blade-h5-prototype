/**
 * 0807-11B-2: 伤害分层测试
 */
import { describe, it, expect } from 'vitest';
import { resolveDamageTier, DAMAGE_TIERS } from './damageFloatSystem';

describe('D0～D6 伤害分层', () => {
  it('R<0.35 → D0', () => {
    const t = resolveDamageTier(0.20);
    expect(t.tier).toBe('D0');
    expect(t.fontSize).toBe(14);
    expect(t.baseColor).toBe('#c0c0c0');
  });

  it('R=0.35 → D1 (边界)', () => {
    expect(resolveDamageTier(0.35).tier).toBe('D1');
  });

  it('R=0.50 → D1', () => {
    expect(resolveDamageTier(0.50).tier).toBe('D1');
  });

  it('R=0.75 → D2 (边界)', () => {
    expect(resolveDamageTier(0.75).tier).toBe('D2');
  });

  it('R=1.00 → D2', () => {
    const t = resolveDamageTier(1.00);
    expect(t.tier).toBe('D2');
    expect(t.fontSize).toBe(20);
    expect(t.baseColor).toBe('#ffffff');
  });

  it('R=1.15 → D3 (边界)', () => {
    expect(resolveDamageTier(1.15).tier).toBe('D3');
  });

  it('R=1.25 → D3 (高刀势主刀 125/100)', () => {
    const t = resolveDamageTier(1.25);
    expect(t.tier).toBe('D3');
    expect(t.fontSize).toBe(23);
    expect(t.baseColor).toBe('#ffd35a');
    expect(t.bounce).toBe(true);
  });

  it('R=1.50 → D4 (边界)', () => {
    expect(resolveDamageTier(1.50).tier).toBe('D4');
  });

  it('R=2.00 → D5 (边界)', () => {
    expect(resolveDamageTier(2.00).tier).toBe('D5');
  });

  it('R=3.00 → D6 (边界)', () => {
    const t = resolveDamageTier(3.00);
    expect(t.tier).toBe('D6');
    expect(t.fontSize).toBe(38);
    expect(t.baseColor).toBe('#ff4500');
  });

  it('R=5.00 → D6 (极大值)', () => {
    expect(resolveDamageTier(5.00).tier).toBe('D6');
  });
});

describe('DAMAGE_TIERS 全覆盖', () => {
  it('7 个层级全部定义', () => {
    expect(DAMAGE_TIERS).toHaveLength(7);
    const tiers = DAMAGE_TIERS.map(t => t.tier);
    expect(tiers).toEqual(['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6']);
  });

  it('下一层 rMin === 上一层 rMax (无缝覆盖)', () => {
    for (let i = 0; i < DAMAGE_TIERS.length - 1; i++) {
      expect(DAMAGE_TIERS[i + 1].rMin).toBe(DAMAGE_TIERS[i].rMax);
    }
  });

  it('D6 rMax = Infinity', () => {
    expect(DAMAGE_TIERS[6].rMax).toBe(Infinity);
  });
});
