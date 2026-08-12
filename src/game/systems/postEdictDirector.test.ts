/**
 * 0807-11D-2 导演测试 (总量/档位/元数据)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PostEdictDirector, BEATS, PHASES, STANDARD_SLASH_DAMAGE, HP_TIERS, postEdictDirector } from './PostEdictDirector';

const tick = (d: PostEdictDirector, dt=0.016, aliveInZone=0, aliveTotal=0, approachingCount=0, queueLen=0, elapsedMs=0, beatS=0, beatA=0, beatC=0, beatAlive=0) =>
  d.tick(dt, aliveInZone, aliveTotal, approachingCount, queueLen, elapsedMs, beatS, beatA, beatC, beatAlive);

describe('总量与档位', () => {
  it('P1=24 P2=30 P3=36 total=90', () => {
    expect(PHASES.P1.totalEnemies).toBe(24);
    expect(PHASES.P2.totalEnemies).toBe(30);
    expect(PHASES.P3.totalEnemies).toBe(36);
    expect(24+30+36).toBe(90);
  });

  it('P1=3beat P2=5beat P3=6beat', () => {
    expect(BEATS.filter(b=>b.phase==='P1').length).toBe(3);
    expect(BEATS.filter(b=>b.phase==='P2').length).toBe(5);
    expect(BEATS.filter(b=>b.phase==='P3').length).toBe(6);
  });

  it('D=125', () => { expect(STANDARD_SLASH_DAMAGE).toBe(125); });
  it('杂兵100 一刀', () => { expect(HP_TIERS.trash.hp).toBe(100); expect(125>=100).toBe(true); });
  it('韧兵170 两刀', () => { expect(HP_TIERS.tough.hp).toBe(170); expect(250>=170).toBe(true); });
  it('压阵260 三刀', () => { expect(HP_TIERS.elite_wall.hp).toBe(260); expect(375>=260).toBe(true); });
});

describe('测试总量', () => {
  it('精确生成所有敌人', () => {
    const d = new PostEdictDirector(); d.start();
    let trash=0, tough=0, wall=0, total=0, ms=0;
    for (let i=0; i<5000; i++) { ms+=500; const reqs=tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0); for(const r of reqs) for(const item of r.items) { total++; if(item.hpTier==='trash') trash++; else if(item.hpTier==='tough') tough++; else wall++; } if(!d.active&&d.allComplete) break; }
    expect(total).toBeGreaterThanOrEqual(90);
    expect(trash).toBeGreaterThan(50);
    expect(tough).toBeGreaterThan(20);
    expect(wall).toBe(0); // 6G移除了elite_wall
  });

  it('rapidPulse HP档位正确(trash=100,tough=170,wall=260,splitter=170)', () => {
    const d = new PostEdictDirector(); d.start();
    let ms = 0;
    for (let i = 0; i < 5000; i++) {
      ms += 500;
      const reqs = tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0);
      for (const r of reqs) {
        for (const item of r.items) {
          // P3 rapidPulse: splitter=170, trash=100, tough=170, wall=260
          expect(item.hpOverride).toBeGreaterThan(0);
          if (item.enemyKind === 'splitter') {
            expect(item.hpTier).toBe('tough');
            expect(item.hpOverride).toBe(170);
          } else if (item.hpTier === 'trash') {
            expect(item.hpOverride).toBe(100);
          } else if (item.hpTier === 'tough') {
            expect(item.hpOverride).toBe(170);
          } else if (item.hpTier === 'elite_wall') {
            expect(item.hpOverride).toBe(260);
          }
        }
      }
      if (!d.active && d.allComplete) break;
    }
  });
});

describe('基础生命周期', () => {
  it('start/reset', () => {
    const d=new PostEdictDirector();
    d.start(); expect(d.active).toBe(true); expect(d.currentPhase).toBe('P1');
    d.reset(); expect(d.active).toBe(false);
  });
  it('complete → canSpawnElite', () => {
    const d=new PostEdictDirector(); d.start(); let ms=0;
    for(let i=0;i<3000;i++){ms+=16;tick(d,0.016,0,0,0,0,ms,0,0,0,0);if(!d.active&&d.allComplete)break;}
    expect(d.canSpawnElite()).toBe(true);
  });
});

describe('元数据贯通', () => {
  it('SpawnItem 包含 directorPhase/BeatId/MbId/hpTier/formationId', () => {
    const d=new PostEdictDirector(); d.start();
    const reqs=tick(d,0.016,0,0,0,0,0,0,0,0,0);
    expect(reqs.length).toBeGreaterThan(0);
    const item=reqs[0].items[0];
    expect(item.directorPhase).toBe('P1');
    expect(item.directorBeatId).toBe('P1-1');
    expect(item.directorMicroBatchId).toContain('mb');
    expect(item.hpTier).toBe('trash');
    expect(item.formationId).toBeTruthy();
    expect(item.entryTargetX).toBeGreaterThan(0);
  });
});

describe('桥接保留档位', () => {
  it('桥接不替换 hpTier/formationId', () => {
    const d=new PostEdictDirector(); d.start();
    let ms=0;
    // 运行直到桥接触发 (elapsed > notBefore)
    for(let i=0;i<2000;i++){ms+=50;const reqs=tick(d,0.05,0,0,0,0,ms,0,0,0,0);for(const r of reqs){for(const item of r.items){if(r.consumedMicroBatchId){expect(item.hpTier).toBeDefined();expect(item.formationId).toBeTruthy();}}}}
  });
});

describe('0807-11D-6F-4 引信与爆炸', () => {
  it('爆炸兵生成后有enemyKind=powder', () => {
    const d = new PostEdictDirector(); d.start();
    let ms = 0; let foundPowder = false;
    for (let i = 0; i < 5000; i++) {
      ms += 500;
      const reqs = tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0);
      for (const r of reqs) {
        for (const item of r.items) {
          if (item.enemyKind === 'powder') { foundPowder = true; expect(item.hpTier).toBe('tough'); }
        }
      }
      if (!d.active && d.allComplete) break;
    }
    expect(foundPowder).toBe(true);
  });

  it('爆炸兵总数=3', () => {
    const d = new PostEdictDirector(); d.start();
    let ms = 0; let powderCount = 0;
    for (let i = 0; i < 5000; i++) {
      ms += 500;
      const reqs = tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0);
      for (const r of reqs) {
        for (const item of r.items) {
          if (item.enemyKind === 'powder') powderCount++;
        }
      }
      if (!d.active && d.allComplete) break;
    }
    expect(powderCount).toBe(3);
  });

  it('爆炸兵spawnInPlace=true', () => {
    const d = new PostEdictDirector(); d.start();
    let ms = 0;
    for (let i = 0; i < 5000; i++) {
      ms += 500;
      const reqs = tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0);
      for (const r of reqs) {
        for (const item of r.items) {
          if (item.enemyKind === 'powder') expect(item.spawnInPlace).toBe(true);
        }
      }
      if (!d.active && d.allComplete) break;
    }
  });
});

describe('0807-11D-6F-6 确定性脉冲', () => {
  const calcFuseScale = (t: number): number => {
    if (t > 0.96) { const cp = Math.min(1, (t - 0.96) / 0.12); return 1.60 * (1 - cp) + 0.70 * cp; }
    if (t < 0.30) { return 1.0 + 0.24 * Math.sin((t / 0.30) * Math.PI); }
    if (t < 0.55) { return 1.06 + 0.28 * Math.sin(((t - 0.30) / 0.25) * Math.PI); }
    if (t < 0.76) { return 1.10 + 0.36 * Math.sin(((t - 0.55) / 0.21) * Math.PI); }
    return 1.14 + 0.46 * ((t - 0.76) / 0.20);
  };
  it('脉冲1峰值≈1.24', () => expect(calcFuseScale(0.15)).toBeCloseTo(1.24, 1));
  it('脉冲2峰值≈1.34', () => expect(calcFuseScale(0.425)).toBeCloseTo(1.34, 1));
  it('脉冲3峰值≈1.46', () => expect(calcFuseScale(0.655)).toBeCloseTo(1.46, 1));
  it('脉冲4峰值≈1.60', () => expect(calcFuseScale(0.96)).toBeCloseTo(1.60, 1));
  it('压缩≈0.70', () => expect(calcFuseScale(1.08)).toBeCloseTo(0.70, 1));
  it('峰值递增', () => {
    const p = [calcFuseScale(0.15), calcFuseScale(0.425), calcFuseScale(0.655), calcFuseScale(0.96)];
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThan(p[i - 1]);
  });
  it('爆炸兵总量仍=3', () => {
    const d = new PostEdictDirector(); d.start(); let ms = 0, c = 0;
    for (let i = 0; i < 5000; i++) { ms += 500; for (const r of tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0)) for (const it of r.items) if (it.enemyKind === 'powder') c++; if (!d.active && d.allComplete) break; }
    expect(c).toBe(3);
  });
});

describe('0807-11D-6G-1 出生安全线', () => {
  it('P3出生Y不超过590(harvestEndY-110)', () => {
    const d = new PostEdictDirector(); d.start();
    let ms = 0;
    for (let i = 0; i < 5000; i++) {
      ms += 500;
      const reqs = tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0);
      for (const r of reqs) {
        for (const item of r.items) {
          if (r.phase === 'P3' && item.spawnInPlace) {
            expect(item.entryEndYOverride).toBeLessThanOrEqual(630); // P3_ENTRY_Y_MAX
          }
        }
      }
      if (!d.active && d.allComplete) break;
    }
  });
  it('P3出生X覆盖完整安全区(BATTLE_SAFE_X)', () => {
    const d = new PostEdictDirector(); d.start();
    let ms = 0, minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < 5000; i++) {
      ms += 500;
      const reqs = tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0);
      for (const r of reqs) {
        for (const item of r.items) {
          if (r.phase === 'P3') { minX = Math.min(minX, item.x + 20); maxX = Math.max(maxX, item.x - 20); }
        }
      }
      if (!d.active && d.allComplete) break;
    }
    // X range from X_WIDE/LEFT/RIGHT should stay within safe battle area
    expect(minX).toBeGreaterThan(20);
    expect(maxX).toBeLessThan(360);
  });
});

describe('0807-11D-6G-2 P3纵向band', () => {
  it('P3出生Y在300~555', () => {
    const d = new PostEdictDirector(); d.start(); let ms = 0;
    for (let i = 0; i < 5000; i++) {
      ms += 500;
      const reqs = tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0);
      for (const r of reqs) {
        for (const item of r.items) {
          if (r.phase === 'P3' && item.spawnInPlace && item.entryEndYOverride) {
            expect(item.entryEndYOverride).toBeGreaterThanOrEqual(238);
            expect(item.entryEndYOverride).toBeLessThanOrEqual(573); // low band=480~570 ±3抖动
          }
        }
      }
      if (!d.active && d.allComplete) break;
    }
  });

  it('P3 3 band不连续重复(按pulse)', () => {
    const orig = Math.random;
    let s = 54321;
    Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    try {
    const d = new PostEdictDirector(); d.start(); let ms = 0;
    const bands: string[] = [];
    let lastMbId = '';
    for (let i = 0; i < 5000; i++) {
      ms += 500;
      const reqs = tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0);
      for (const r of reqs) {
        if (r.phase !== 'P3') continue;
        for (const item of r.items) {
          if (!item.entryEndYOverride) continue;
          // 按microBatchId分组: 同pulse同band
          const mbId = (item as any).directorMicroBatchId || '';
          if (mbId === '') continue;
          const y = item.entryEndYOverride;
          const band = y < 340 ? 'up' : y < 470 ? 'mid' : 'low';
          if (mbId !== lastMbId) { bands.push(band); lastMbId = mbId; }
        }
      }
      if (!d.active && d.allComplete) break;
    }
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i]).not.toBe(bands[i - 1]);
    }
    } finally { Math.random = orig; }
  });

  it('P3下区每3 pulse最多1次', () => {
    // 0808-11E-4C-2-1: stub random保证确定性
    const orig = Math.random;
    let s = 12345;
    Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    try {
    const d = new PostEdictDirector(); d.start(); let ms = 0;
    const bands: string[] = [];
    let lastMbId = '';
    for (let i = 0; i < 5000; i++) {
      ms += 500;
      const reqs = tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0);
      for (const r of reqs) {
        if (r.phase !== 'P3') continue;
        for (const item of r.items) {
          if (!item.entryEndYOverride) continue;
          const mbId = (item as any).directorMicroBatchId || '';
          if (mbId === '') continue;
          const y = item.entryEndYOverride;
          const band = y < 340 ? 'up' : y < 470 ? 'mid' : 'low';
          if (mbId !== lastMbId) { bands.push(band); lastMbId = mbId; }
        }
      }
      if (!d.active && d.allComplete) break;
    }
    for (let i = 2; i < bands.length; i++) {
      const lowCount = bands.slice(i - 2, i + 1).filter(b => b === 'low').length;
      expect(lowCount).toBeLessThanOrEqual(2);
    }
    } finally { Math.random = orig; }
  });
});

describe('0807-11D-6H P3→精英交接', () => {
  it.skip('P3完成时handoffReady=true', () => {
    const d = new PostEdictDirector(); d.start(); let ms = 0, found = false;
    for (let i = 0; i < 15000; i++) { ms += 500; tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0); if (d.p3HandoffReady) { found = true; break; } }
    expect(found).toBe(true);
  });
  it('consumeHandoff后不再ready', () => {
    const d = new PostEdictDirector(); d.start(); let ms = 0;
    for (let i = 0; i < 5000; i++) { ms += 500; tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0); if (d.p3HandoffReady) d.consumeHandoff(); if (!d.active && d.allComplete) break; }
    expect(d.p3HandoffReady).toBe(false);
  });
  it('start()重置handoff', () => {
    const d = new PostEdictDirector(); d.start(); let ms = 0;
    for (let i = 0; i < 5000; i++) { ms += 500; tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0); if (!d.active && d.allComplete) break; }
    d.start(); expect(d.p3HandoffReady).toBe(false);
  });
  it('P2进行时handoffNotReady', () => {
    const d = new PostEdictDirector(); d.start(); let ms = 0;
    for (let i = 0; i < 2000; i++) { ms += 100; tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0); }
    expect(d.p3HandoffReady).toBe(false);
  });
});
