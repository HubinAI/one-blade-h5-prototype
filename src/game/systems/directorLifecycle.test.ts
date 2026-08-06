/**
 * 0807-11D-1 导演全生命周期模拟测试
 */
import { describe, it, expect } from 'vitest';
import { PostEdictDirector, PHASES } from './PostEdictDirector';

describe('导演全生命周期', () => {
  it('即时清场: 不无限循环 且 <3000帧 完成', () => {
    const d = new PostEdictDirector();
    d.start();
    let elapsedMs = 0;
    for (let i = 0; i < 3000; i++) {
      elapsedMs += 16;
      d.tick(0.016, 0, 0, 0, 0, elapsedMs);
      if (!d.active && d.allComplete) break;
    }
    expect(d.allComplete).toBe(true);
    expect(d.isRunning).toBe(false);
    expect(d.canSpawnElite()).toBe(true);
  });

  it('即时清场: 至少经过了 P1/P2/P3', () => {
    const d = new PostEdictDirector();
    d.start();
    let elapsedMs = 0;
    let hadP1 = false, hadP2 = false, hadP3 = false;
    for (let i = 0; i < 3000; i++) {
      elapsedMs += 16;
      d.tick(0.016, 0, 0, 0, 0, elapsedMs);
      const p = d.currentPhase;
      if (p === 'P1') hadP1 = true;
      if (p === 'P2') hadP2 = true;
      if (p === 'P3') hadP3 = true;
      if (!d.active && d.allComplete) break;
    }
    expect(hadP1 && hadP2 && hadP3).toBe(true);
  });
});

describe('节拍/阶段计数', () => {
  it('P1 不超过 48, P2 不超过 64, P3 不超过 80', () => {
    const counts = { P1: 0, P2: 0, P3: 0 };
    const d = new PostEdictDirector();
    d.start();
    let elapsedMs = 0;

    for (let i = 0; i < 2000; i++) {
      elapsedMs += 16;
      const phase = d.currentPhase;
      const reqs = d.tick(0.016, 0, 0, 0, 0, elapsedMs);
      for (const r of reqs) {
        if (phase) counts[phase] += r.items.length;
      }
      if (!d.active && d.allComplete) break;
    }

    expect(counts.P1).toBeLessThanOrEqual(PHASES.P1.totalEnemies);
    expect(counts.P2).toBeLessThanOrEqual(PHASES.P2.totalEnemies);
    expect(counts.P3).toBeLessThanOrEqual(PHASES.P3.totalEnemies);
    // 允许桥接导致的轻微偏差（±5 以内）
    const total = counts.P1 + counts.P2 + counts.P3;
    expect(total).toBeGreaterThanOrEqual(187);
    expect(total).toBeLessThanOrEqual(197);
  });
});

describe('reset 后状态', () => {
  it('reset → 全字段归零', () => {
    const d = new PostEdictDirector();
    d.start();
    for (let i = 0; i < 50; i++) d.tick(0.016, 0, 0, 0, 0, i * 16);

    d.reset();
    expect(d.active).toBe(false);
    expect(d.allComplete).toBe(false);
    expect(d.currentPhase).toBeNull();
    expect(d.currentBeatId).toBe('-');
    expect(d.canSpawnElite()).toBe(false);
    expect(d.isRunning).toBe(false);
  });

  it('reset → restart → 从头开始', () => {
    const d = new PostEdictDirector();
    d.start();
    for (let i = 0; i < 100; i++) d.tick(0.016, 0, 0, 0, 0, i * 16);
    d.reset();
    d.start();

    expect(d.currentPhase).toBe('P1');
    expect(d.currentBeatId).toBe('P1-1');
    const info = d.getDebugInfo(0, 0, 0, 0, 0, 0, 0, 0);
    expect(info.generated).toBe(0);
  });
});

describe('notBefore 时间门控', () => {
  it('P1-1 后不能立即到 P1-2 (notBefore=1800)', () => {
    const d = new PostEdictDirector();
    d.start();
    // 生成 P1-1 全部微批次
    for (let i = 0; i < 5; i++) d.tick(0.016, 0, 0, 0, 0, i * 16);
    // 当前应还在 P1-1，因为 notBefore 未到
    expect(d.currentBeatId).toBe('P1-1');
  });

  it('elapsedMs 超过 notBefore 后可以推进', () => {
    const d = new PostEdictDirector();
    d.start();
    // 运行到 2000ms (>1800)
    for (let i = 0; i < 200; i++) d.tick(0.016, 0, 0, 0, 0, i * 16);
    // 应已推进到 P1-2 或之后
    const id = d.currentBeatId;
    expect(id === 'P1-2' || id === 'P1-3' || id === 'P1-4').toBe(true);
  });
});

describe('afterglow → canSpawnElite', () => {
  it('完成流程后 canSpawnElite=true', () => {
    const d = new PostEdictDirector();
    d.start();
    let elapsedMs = 0;
    for (let i = 0; i < 2000; i++) {
      elapsedMs += 16;
      d.tick(0.016, 0, 0, 0, 0, elapsedMs);
      if (!d.active && d.allComplete) break;
    }
    expect(d.canSpawnElite()).toBe(true);
  });

  it('未完成 canSpawnElite=false', () => {
    const d = new PostEdictDirector();
    d.start();
    d.tick(0.1, 0, 0, 0, 0, 0);
    expect(d.canSpawnElite()).toBe(false);
  });
});
